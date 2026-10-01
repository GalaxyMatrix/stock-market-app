import { APP_URL, unsubscribeFromNews } from "@/lib/news-email";

export const dynamic = "force-dynamic";

const UnsubscribePage = async ({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) => {
    const { token } = await searchParams;
    const status = token ? await unsubscribeFromNews(token) : "invalid";
    const unsubscribed = status === "unsubscribed";

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-[#CCDADC]">
            <div className="w-full max-w-md rounded-lg border border-[#30333A] bg-[#141414] p-8 text-center">
                <h1 className="text-2xl font-semibold text-[#FDD458]">
                    {unsubscribed ? "You're unsubscribed" : "Link not valid"}
                </h1>
                <p className="mt-4 text-base leading-relaxed">
                    {unsubscribed
                        ? "You will no longer receive the daily market news email from Signalist."
                        : "This unsubscribe link is missing or no longer matches an account."}
                </p>
                <a href={APP_URL} className="mt-8 inline-block text-sm underline">
                    Visit Signalist
                </a>
            </div>
        </main>
    );
};

export default UnsubscribePage;
