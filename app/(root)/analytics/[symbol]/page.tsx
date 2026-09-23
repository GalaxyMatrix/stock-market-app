import Link from "next/link";
import { notFound } from "next/navigation";
import TradingViewWidget from "@/components/TradingViewWidget";
import { CANDLE_CHART_WIDGET_CONFIG } from "@/lib/constants";
import { getStockRiskAnalytics } from "@/lib/actions/finnhub.actions";
import { getChangeColorClass } from "@/lib/utils";
import RiskScoreCard from "@/components/RiskScoreCard";
import RiskMetricGrid from "@/components/RiskMetricGrid";

const WIDGET_BASE = "https://s3.tradingview.com/external-embedding/embed-widget-";

const RiskAnalyticsPage = async ({ params }: StockDetailsPageProps) => {
  const { symbol } = await params;
  const data = await getStockRiskAnalytics(symbol.toUpperCase());
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">{data.symbol}</p>
          <h1 className="watchlist-title">{data.company}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-2xl font-bold text-gray-100">
              {data.priceFormatted}
            </span>
            <span className={getChangeColorClass(data.changePercent)}>
              {data.changeFormatted}
            </span>
          </div>
        </div>
        <Link
          href={`/stocks/${data.symbol}`}
          className="text-yellow-500 hover:text-gray-400"
        >
          View stock details →
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <RiskScoreCard data={data} />
        <div className="xl:col-span-2 risk-card">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">
            What this means
          </h2>
          <p className="text-gray-400 leading-relaxed">{data.summary}</p>
          <p className="text-sm text-gray-500 mt-4">
            Based on {data.sampleDays} daily log returns. Educational only — not
            investment advice.
          </p>
        </div>
      </div>

      <RiskMetricGrid data={data} />

      <TradingViewWidget
        title="Price history"
        scriptUrl={`${WIDGET_BASE}advanced-chart.js`}
        config={CANDLE_CHART_WIDGET_CONFIG(data.symbol)}
        height={520}
        className=""
      />
    </div>
  );
};

export default RiskAnalyticsPage;
