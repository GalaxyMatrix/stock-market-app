import { headers } from 'next/headers';
import { auth } from '@/lib/better-auth/auth';
import { getWatchlistSymbolsByEmail } from '@/lib/actions/watchlist.actions';
import WatchlistButton from "@/components/WatchlistButton";
import TradingViewWidget from "@/components/TradingViewWidget";
import {
  SYMBOL_INFO_WIDGET_CONFIG,
  CANDLE_CHART_WIDGET_CONFIG,
  BASELINE_WIDGET_CONFIG,
  TECHNICAL_ANALYSIS_WIDGET_CONFIG,
  COMPANY_PROFILE_WIDGET_CONFIG,
  COMPANY_FINANCIALS_WIDGET_CONFIG,
} from '@/lib/constants';

const WIDGET_BASE = 'https://s3.tradingview.com/external-embedding/embed-widget-';

const StockDetails = async ({ params }: StockDetailsPageProps) => {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  const session = await auth.api.getSession({ headers: await headers() });
  const email = session?.user?.email ?? '';

  const watchlistSymbols = email ? await getWatchlistSymbolsByEmail(email) : [];
  const isInWatchlist = watchlistSymbols.includes(upperSymbol);

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
            symbol={upperSymbol}
            company={upperSymbol}
            isInWatchlist={isInWatchlist}
          />
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
