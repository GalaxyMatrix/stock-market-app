"use client";

import Link from "next/link";
import { formatTimeAgo } from "@/lib/utils";

const WatchlistNews = ({ news = [] }: WatchlistNewsProps) => {
  if (news.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h3 className="watchlist-title">News</h3>
        <p className="text-gray-500 text-sm">
          No recent news for your watchlist symbols. Check back later.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h3 className="watchlist-title">News</h3>
      <div className="watchlist-news">
        {news.map((article) => (
          <Link
            key={`${article.id}-${article.url}`}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="news-item flex flex-col"
          >
            {article.related ? (
              <span className="news-tag">{article.related}</span>
            ) : (
              <span className="news-tag">{article.category || "Market"}</span>
            )}
            <h4 className="news-title">{article.headline}</h4>
            <div className="news-meta">
              <span>{article.source}</span>
              {article.datetime ? (
                <span className="ml-2">· {formatTimeAgo(article.datetime)}</span>
              ) : null}
            </div>
            <p className="news-summary">{article.summary}</p>
            <span className="news-cta">Read more →</span>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default WatchlistNews;
