import {inngest} from "@/lib/inngest/client";
import { NEWS_SUMMARY_EMAIL_PROMPT, PERSONALIZED_WELCOME_EMAIL_PROMPT } from "./prompt";
import { sendNewsSummaryEmail, sendWelcomeEmail } from "../nodemailer";
import { getAllUsersForNewsEmail } from "../actions/user.actions";
import { getWatchlistSymbolsByEmail } from "../actions/watchlist.actions";
import { getNews } from "../actions/finnhub.actions";
import { getFormattedTodayDate } from "@/lib/utils";

type NewsUser = {
    id: string;
    email: string;
    name: string;
};

type UserNewsPayload = {
    user: NewsUser;
    articles: MarketNewsArticle[];
};

type UserNewsSummary = UserNewsPayload & {
    newsContent: string;
};

const FALLBACK_NEWS_HTML =
    '<p class="mobile-text dark-text-secondary" style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #CCDADC;">Here is today\'s market update. Visit Signalist for the latest headlines.</p>';

const getGeminiText = (response: {
    candidates?: Array<{ content?: { parts?: unknown[] } }>;
}): string | null => {
    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
    }
    return null;
};

const toNewsStepId = (user: NewsUser): string =>
    `summarize-news-${(user.id || user.email).replace(/[^a-zA-Z0-9-]/g, "-")}`;

export const sendSignupEmail = inngest.createFunction(
    {id: 'sign-up-email', triggers: [{event: 'app/user.created'}]},
    async ({event, step}) => {
        const userProfile = `
            - Country: ${event.data.country}
            - Investment Goals: ${event.data.investmentGoals}
            - Risk Tolerance: ${event.data.riskTolerance}
            - Preffered industries: ${event.data.preferredIndustries}
        `

        const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace('{{userProfile}}', userProfile);

        const response = await step.ai.infer('generate-welcome-intro', {
            model: step.ai.models.gemini({ model: 'gemini-3.5-flash-lite' }),
            body: {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: prompt }
                        ]
                    }]
            }
        })

        await step.run('send-welcome-email', async () => {
            const part = response.candidates?.[0]?.content?.parts?.[0];
            const introText = (part && 'text' in part ? part.text : null) ||'Thanks for joining Signalist. You now have the tools to track markets and make smarter moves.'

            const { email, name } = event.data;
            return await sendWelcomeEmail({
                email, name, intro: introText

            })
        });

        return {
            success: true,
            message: 'Welcome email sent successfully'
        }


    }
)


export const sendDailyNewsSummary = inngest.createFunction(
    {
        id: 'daily-news-summary',
        triggers: [
            { event: 'app/send.daily.news' },
            { cron: '0 12 * * *' },
        ],
    },
    async ({step}) => {
        const users = await step.run('get-all-users', getAllUsersForNewsEmail);
        if (!users || users.length === 0) {
            return { success: false, message: 'No users found for news email' };
        }

        const userNews = await step.run('fetch-news-for-users', async (): Promise<UserNewsPayload[]> => {
            const results: UserNewsPayload[] = [];

            for (const user of users) {
                const symbols = await getWatchlistSymbolsByEmail(user.email);
                let articles: MarketNewsArticle[] = [];

                try {
                    articles = await getNews(symbols.length > 0 ? symbols : undefined);
                    if (articles.length === 0 && symbols.length > 0) {
                        articles = await getNews();
                    }
                } catch (e) {
                    console.error(`Failed to fetch news for ${user.email}:`, e);
                    articles = [];
                }

                results.push({
                    user,
                    articles: articles.slice(0, 6),
                });
            }

            return results;
        });

        const summarizedNews: UserNewsSummary[] = [];

        for (const item of userNews) {
            if (item.articles.length === 0) {
                summarizedNews.push({ ...item, newsContent: "" });
                continue;
            }

            const newsData = JSON.stringify(
                item.articles.map((article) => ({
                    headline: article.headline,
                    summary: article.summary,
                    source: article.source,
                    url: article.url,
                    datetime: article.datetime,
                    related: article.related,
                })),
                null,
                2
            );

            const prompt = NEWS_SUMMARY_EMAIL_PROMPT.replace("{{newsData}}", newsData);
            const response = await step.ai.infer(toNewsStepId(item.user), {
                model: step.ai.models.gemini({ model: "gemini-3.5-flash-lite" }),
                body: {
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: prompt }],
                        },
                    ],
                },
            });

            summarizedNews.push({
                ...item,
                newsContent: getGeminiText(response) || FALLBACK_NEWS_HTML,
            });
        }

        await step.run("send-summary-emails", async () => {
            const date = getFormattedTodayDate();
            const recipients = summarizedNews.filter((item) => item.newsContent);

            await Promise.all(
                recipients.map((item) =>
                    sendNewsSummaryEmail({
                        email: item.user.email,
                        date,
                        newsContent: item.newsContent,
                    })
                )
            );

            return { sent: recipients.length };
        });

        return { success: true , message: 'Daily news summary emails sent successfully'};
    },
)
