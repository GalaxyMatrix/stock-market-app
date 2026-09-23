import WatchlistButton from "@/components/WatchlistButton";
import TradingViewWidget from "@/components/TradingViewWidget";
import { WatchlistItem } from "@/database/models/watchlist.model";
import { getStocksDetails } from "@/lib/actions/finnhub.actions";
import { getUserWatchlist } from "@/lib/actions/watchlist.actions";
import Link from "next/link";
import {
  SYMBOL_INFO_WIDGET_CONFIG,
  CANDLE_CHART_WIDGET_CONFIG,
  BASELINE_WIDGET_CONFIG,
  TECHNICAL_ANALYSIS_WIDGET_CONFIG,
  COMPANY_PROFILE_WIDGET_CONFIG,
  COMPANY_FINANCIALS_WIDGET_CONFIG,
} from "@/lib/constants";
import { notFound } from "next/navigation";

const WIDGET_BASE = "https://s3.tradingview.com/external-embedding/embed-widget-";

const StockDetails = async ({ params }: StockDetailsPageProps) => {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  const [stockData, watchlist] = await Promise.all([
    getStocksDetails(upperSymbol),
    getUserWatchlist(),
  ]);

  if (!stockData) notFound();

  const isInWatchlist = watchlist.some(
    (item: WatchlistItem) => item.symbol === upperSymbol
  );

  return (
    <div className="stock-details-wrapper">
      <div className="stock-details-grid">
        <section className="stock-details-left">
          <TradingViewWidget
            title=""
            scriptUrl={`${WIDGET_BASE}symbol-info.js`}
            config={SYMBOL_INFO_WIDGET_CONFIG(upperSymbol)}
            height={170}
            className=""
          />
          <TradingViewWidget
            title=""
            scriptUrl={`${WIDGET_BASE}advanced-chart.js`}
            config={CANDLE_CHART_WIDGET_CONFIG(upperSymbol)}
            height={600}
            className=""
          />
          <TradingViewWidget
            title=""
            scriptUrl={`${WIDGET_BASE}advanced-chart.js`}
            config={BASELINE_WIDGET_CONFIG(upperSymbol)}
            height={600}
            className=""
          />
        </section>

        <section className="stock-details-right">
          <WatchlistButton
            symbol={stockData.symbol}
            company={stockData.company}
            isInWatchlist={isInWatchlist}
          />
          <Link
            href={`/analytics/${upperSymbol}`}
            className="watchlist-btn mt-3 flex items-center justify-center"
          >
            View risk analytics
          </Link>
          <TradingViewWidget
            title=""
            scriptUrl={`${WIDGET_BASE}technical-analysis.js`}
            config={TECHNICAL_ANALYSIS_WIDGET_CONFIG(upperSymbol)}
            height={400}
            className=""
          />
          <TradingViewWidget
            title=""
            scriptUrl={`${WIDGET_BASE}symbol-profile.js`}
            config={COMPANY_PROFILE_WIDGET_CONFIG(upperSymbol)}
            height={440}
            className=""
          />
          <TradingViewWidget
            title=""
            scriptUrl={`${WIDGET_BASE}financials.js`}
            config={COMPANY_FINANCIALS_WIDGET_CONFIG(upperSymbol)}
            height={464}
            className=""
          />
        </section>
      </div>
    </div>
  );
};

export default StockDetails;
