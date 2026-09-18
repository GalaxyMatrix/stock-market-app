import { Star } from "lucide-react";
import { getNews, searchStocks } from "@/lib/actions/finnhub.actions";
import SearchCommand from "@/components/SearchCommand";
import { getWatchlistWithData } from "@/lib/actions/watchlist.actions";
import { getUserAlerts } from "@/lib/actions/alert.actions";
import { WatchlistTable } from "@/components/WatchlistTable";
import WatchlistNews from "@/components/WatchlistNews";
import AlertsList from "@/components/AlertsList";

const Watchlist = async () => {
  const watchlist: StockWithData[] = await getWatchlistWithData();
  const initialStocks = await searchStocks();

  if (watchlist.length === 0) {
    return (
      <section className="flex watchlist-empty-container">
        <div className="watchlist-empty">
          <Star className="watchlist-star" />
          <h2 className="empty-title">Your watchlist is empty</h2>
          <p className="empty-description">
            Start building your watchlist by searching for stocks and clicking the
            star icon to add them.
          </p>
        </div>
        <SearchCommand initialStocks={initialStocks} />
      </section>
    );
  }

  const symbols = watchlist.map((stock) => stock.symbol);
  let news: MarketNewsArticle[] = [];
  try {
    news = await getNews(symbols);
  } catch (e) {
    console.error("Failed to load watchlist news:", e);
  }

  const alerts = await getUserAlerts();

  return (
    <div className="flex flex-col gap-8">
      <div className="watchlist-container">
        <section className="watchlist">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="watchlist-title">Watchlist</h2>
              <SearchCommand initialStocks={initialStocks} />
            </div>
            <WatchlistTable watchlist={watchlist} />
          </div>
        </section>
        <AlertsList
          alertData={alerts}
          watchlist={watchlist.map((s) => ({ symbol: s.symbol, company: s.company }))}
        />
      </div>
      <WatchlistNews news={news} />
    </div>
  );
};

export default Watchlist;
