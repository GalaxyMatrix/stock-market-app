# Signalist

A deployed stock platform: live market dashboards, a personal watchlist, email alerts, risk scores, and an AI analyst that talks about the symbols you follow.

**[Open the live app](https://signalist-zeta-kohl.vercel.app/)** · [signalist-zeta-kohl.vercel.app](https://signalist-zeta-kohl.vercel.app/)

Sign up, search a ticker, star it, and set an alert. The dashboard, watchlist, and risk pages are the fastest way to see the product.

## What this shows

- **A full product, shipped.** Next.js app on Vercel with accounts, a database, scheduled jobs, and a separate Python agent. Users sign in, save symbols, and get email when prices or volume move.
- **Risk calculated in the app.** A year of daily closes is turned into volatility, beta versus the market, max drawdown, historical VaR and CVaR, Sharpe, and Sortino. The analytics page scores a ticker from those numbers.
- **Jobs that run without a user sitting on the page.** Inngest checks price and volume alerts every minute and sends a daily news digest. Gemini writes the welcome email from the profile collected at sign-up (goals, risk tolerance, industries).
- **An AI analyst with guardrails.** The watchlist chat goes from the React UI through CopilotKit to a FastAPI CrewAI flow. The agent extracts tickers, pulls market data, and returns charts. Input, tool, and output checks block prompt injection, secret leakage, and requests that push for guaranteed trades.

## Product

| | |
| --- | --- |
| Dashboard | TradingView market overview, S&P 500 heatmap, headlines, and quotes |
| Search & symbol pages | Company lookup, candle chart, profile, and financials |
| Watchlist | Saved symbols, live quotes, related news, and the AI chat |
| Alerts | Upper price, lower price, and volume spike, emailed on a chosen frequency |
| Risk analytics | One-year risk score and the metrics behind it |
| Accounts | Email and password auth, protected routes, personalized welcome email |

## How it is built

```
Browser
  Next.js (App Router) + Better Auth
        │
        ├── MongoDB          users, watchlists, alerts
        ├── Finnhub          quotes, news, candle history
        ├── TradingView      embedded charts and heatmaps
        ├── Inngest          alert checks + daily news email
        │     └── Gemini     welcome copy and news summaries
        └── CopilotKit
              └── FastAPI / CrewAI agent
                    market data, charts, safety checks
```

Auth cookies gate the app in middleware. Market widgets stay on the client. Quotes, news, risk math, and email stay on the server so keys and user data do not leak into the browser bundle.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS · Better Auth · MongoDB · Finnhub · TradingView · Inngest · Nodemailer · Gemini · CopilotKit · OpenAI · FastAPI · CrewAI

```
app/          pages and API routes
components/   UI, charts, watchlist, alerts, chat
lib/          auth, market data, alerts, risk math, jobs, email
database/     Mongoose models
agent/        CrewAI stock-analysis service
```

Signalist is a market tracker for demonstration. It is not financial advice. Prices, news, and risk scores can be delayed or incomplete.
