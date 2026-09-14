"use server";

import { formatArticle, getDateRange, validateArticle } from "@/lib/utils";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
const NEXT_PUBLIC_FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? "";

type NextFetchInit = RequestInit & {
  next?: { revalidate?: number };
};

const getArticleKey = (article: RawNewsArticle): string =>
  String(article.id ?? article.url ?? article.headline ?? "");

async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
  const options: NextFetchInit =
    revalidateSeconds !== undefined
      ? { cache: "force-cache", next: { revalidate: revalidateSeconds } }
      : { cache: "no-store" };

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

const getGeneralNews = async (token: string): Promise<MarketNewsArticle[]> => {
  const url = `${FINNHUB_BASE_URL}/news?category=general&token=${token}`;
  const news = await fetchJSON<RawNewsArticle[]>(url, 300);
  const seen = new Set<string>();

  return (Array.isArray(news) ? news : [])
    .filter((article) => {
      if (!validateArticle(article)) return false;
      const key = getArticleKey(article);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
    .slice(0, 6)
    .map((article, index) => formatArticle(article, false, undefined, index));
};

export const getNews = async (symbols?: string[]): Promise<MarketNewsArticle[]> => {
  try {
    const token = NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!token) {
      throw new Error("FINNHUB API key is not configured");
    }

    const { from, to } = getDateRange(5);
    const cleanSymbols = Array.from(
      new Set(
        (symbols ?? [])
          .map((symbol) => symbol.trim().toUpperCase())
          .filter((symbol) => symbol.length > 0)
      )
    );

    if (cleanSymbols.length === 0) {
      return await getGeneralNews(token);
    }

    const newsBySymbol = new Map<string, RawNewsArticle[]>();
    const collected: MarketNewsArticle[] = [];
    const usedKeys = new Set<string>();

    for (let round = 0; round < 6 && collected.length < 6; round++) {
      const symbol = cleanSymbols[round % cleanSymbols.length];

      if (!newsBySymbol.has(symbol)) {
        const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${token}`;
        const companyNews = await fetchJSON<RawNewsArticle[]>(url, 300);
        newsBySymbol.set(
          symbol,
          (Array.isArray(companyNews) ? companyNews : []).filter(validateArticle)
        );
      }

      const articles = newsBySymbol.get(symbol) ?? [];
      const unused = articles.find((article) => {
        const key = getArticleKey(article);
        return Boolean(key) && !usedKeys.has(key);
      });

      if (!unused) continue;

      const key = getArticleKey(unused);
      usedKeys.add(key);
      collected.push(formatArticle(unused, true, symbol, collected.length));
    }

    if (collected.length === 0) {
      return await getGeneralNews(token);
    }

    return collected.sort((a, b) => b.datetime - a.datetime);
  } catch (e) {
    console.error("Error fetching news:", e);
    throw new Error("Failed to fetch news");
  }
};
