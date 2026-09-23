import Link from "next/link";
import { redirect } from "next/navigation";
import { POPULAR_STOCK_SYMBOLS } from "@/lib/constants";

async function goToSymbol(formData: FormData) {
  "use server";
  const symbol = String(formData.get("symbol") || "").trim().toUpperCase();
  if (!symbol) return;
  redirect(`/analytics/${encodeURIComponent(symbol)}`);
}

const AnalyticsLanding = () => {
  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="watchlist-title">Risk Analytics</h1>
        <p className="text-gray-500 mt-2 max-w-xl">
          Enter a ticker to score volatility, beta, drawdown, and tail risk from
          the last year of daily prices.
        </p>
      </div>

      <form action={goToSymbol} className="flex gap-3 max-w-md">
        <input
          name="symbol"
          placeholder="AAPL"
          className="flex-1 rounded-lg bg-gray-800 border border-gray-600 px-4 h-11 text-gray-100"
        />
        <button type="submit" className="watchlist-btn !w-auto px-6">
          Analyze
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {POPULAR_STOCK_SYMBOLS.slice(0, 12).map((symbol) => (
          <Link
            key={symbol}
            href={`/analytics/${symbol}`}
            className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-600 text-gray-300 hover:text-yellow-500"
          >
            {symbol}
          </Link>
        ))}
      </div>
    </section>
  );
};

export default AnalyticsLanding;
