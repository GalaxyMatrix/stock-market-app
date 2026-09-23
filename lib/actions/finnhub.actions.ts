'use server';

import { getDateRange, validateArticle, formatArticle, formatPrice, formatChangePercent, formatMarketCapValue } from '@/lib/utils';
import { POPULAR_STOCK_SYMBOLS } from '@/lib/constants';
import { cache } from 'react';
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/better-auth/auth";
import { getWatchlistSymbolsByEmail } from "@/lib/actions/watchlist.actions"
import { alignClosesByTimestamp, buildRiskSummary, computeRiskMetrics } from '@/lib/analytics/risk';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const NEXT_PUBLIC_FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';

async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
  const options: RequestInit & { next?: { revalidate?: number } } = revalidateSeconds
    ? { cache: 'force-cache', next: { revalidate: revalidateSeconds } }
    : { cache: 'no-store' };

  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fetch failed ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export { fetchJSON };

async function fetchYahooDailyCloses(symbol: string): Promise<CandleSeries> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return { s: 'no_data' };

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const timestamps: number[] | undefined = result?.timestamp;
    const closes: Array<number | null> | undefined = result?.indicators?.quote?.[0]?.close;
    if (!timestamps || !closes) return { s: 'no_data' };

    const t: number[] = [];
    const c: number[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        t.push(timestamps[i]);
        c.push(closes[i] as number);
      }
    }

    return t.length ? { s: 'ok', t, c } : { s: 'no_data' };
  } catch (error) {
    console.error(`Error fetching Yahoo daily closes for ${symbol}:`, error);
    return { s: 'no_data' };
  }
}

export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
  try {
    const range = getDateRange(5);
    const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!token) {
      throw new Error('FINNHUB API key is not configured');
    }
    const cleanSymbols = (symbols || [])
      .map((s) => s?.trim().toUpperCase())
      .filter((s): s is string => Boolean(s));

    const maxArticles = 6;

    // If we have symbols, try to fetch company news per symbol and round-robin select
    if (cleanSymbols.length > 0) {
      const perSymbolArticles: Record<string, RawNewsArticle[]> = {};

      await Promise.all(
        cleanSymbols.map(async (sym) => {
          try {
            const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(sym)}&from=${range.from}&to=${range.to}&token=${token}`;
            const articles = await fetchJSON<RawNewsArticle[]>(url, 300);
            perSymbolArticles[sym] = (articles || []).filter(validateArticle);
          } catch (e) {
            console.error('Error fetching company news for', sym, e);
            perSymbolArticles[sym] = [];
          }
        })
      );

      const collected: MarketNewsArticle[] = [];
      // Round-robin up to 6 picks
      for (let round = 0; round < maxArticles; round++) {
        for (let i = 0; i < cleanSymbols.length; i++) {
          const sym = cleanSymbols[i];
          const list = perSymbolArticles[sym] || [];
          if (list.length === 0) continue;
          const article = list.shift();
          if (!article || !validateArticle(article)) continue;
          collected.push(formatArticle(article, true, sym, round));
          if (collected.length >= maxArticles) break;
        }
        if (collected.length >= maxArticles) break;
      }

      if (collected.length > 0) {
        // Sort by datetime desc
        collected.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
        return collected.slice(0, maxArticles);
      }
      // If none collected, fall through to general news
    }

    // General market news fallback or when no symbols provided
    const generalUrl = `${FINNHUB_BASE_URL}/news?category=general&token=${token}`;
    const general = await fetchJSON<RawNewsArticle[]>(generalUrl, 300);

    const seen = new Set<string>();
    const unique: RawNewsArticle[] = [];
    for (const art of general || []) {
      if (!validateArticle(art)) continue;
      const key = `${art.id}-${art.url}-${art.headline}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(art);
      if (unique.length >= 20) break; // cap early before final slicing
    }

    const formatted = unique.slice(0, maxArticles).map((a, idx) => formatArticle(a, false, undefined, idx));
    return formatted;
  } catch (err) {
    console.error('getNews error:', err);
    throw new Error('Failed to fetch news');
  }
}

export const searchStocks = cache(async (query?: string): Promise<StockWithWatchlistStatus[]> => {
  try {
    if (!auth) redirect("/sign-in");

    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) redirect("/sign-in");

    const userWatchlistSymbols = await getWatchlistSymbolsByEmail(
      session.user.email
    );

    const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!token) {
      // If no token, log and return empty to avoid throwing per requirements
      console.error('Error in stock search:', new Error('FINNHUB API key is not configured'));
      return [];
    }

    const trimmed = typeof query === 'string' ? query.trim() : '';

    let results: FinnhubSearchResult[] = [];

    if (!trimmed) {
      // Fetch top 10 popular symbols' profiles
      const top = POPULAR_STOCK_SYMBOLS.slice(0, 10);
      const profiles = await Promise.all(
        top.map(async (sym) => {
          try {
            const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${token}`;
            // Revalidate every hour
            const profile = await fetchJSON<any>(url, 3600);
            return { sym, profile } as { sym: string; profile: any };
          } catch (e) {
            console.error('Error fetching profile2 for', sym, e);
            return { sym, profile: null } as { sym: string; profile: any };
          }
        })
      );

      results = profiles
        .map(({ sym, profile }) => {
          const symbol = sym.toUpperCase();
          const name: string | undefined = profile?.name || profile?.ticker || undefined;
          const exchange: string | undefined = profile?.exchange || undefined;
          if (!name) return undefined;
          const r: FinnhubSearchResult = {
            symbol,
            description: name,
            displaySymbol: symbol,
            type: 'Common Stock',
          };
          // We don't include exchange in FinnhubSearchResult type, so carry via mapping later using profile
          // To keep pipeline simple, attach exchange via closure map stage
          // We'll reconstruct exchange when mapping to final type
          (r as any).__exchange = exchange; // internal only
          return r;
        })
        .filter((x): x is FinnhubSearchResult => Boolean(x));
    } else {
      const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(trimmed)}&token=${token}`;
      const data = await fetchJSON<FinnhubSearchResponse>(url, 1800);
      results = Array.isArray(data?.result) ? data.result : [];
    }

    const mapped: StockWithWatchlistStatus[] = results
      .map((r) => {
        const upper = (r.symbol || '').toUpperCase();
        const name = r.description || upper;
        const exchangeFromDisplay = (r.displaySymbol as string | undefined) || undefined;
        const exchangeFromProfile = (r as any).__exchange as string | undefined;
        const exchange = exchangeFromDisplay || exchangeFromProfile || 'US';
        const type = r.type || 'Stock';
        const item: StockWithWatchlistStatus = {
          symbol: upper,
          name,
          exchange,
          type,
          isInWatchlist: userWatchlistSymbols.includes(upper),
        };
        return item;
      })
      .slice(0, 15);

    return mapped;
  } catch (err) {
    console.error('Error in stock search:', err);
    return [];
  }
});

export const getStockVolumeData = cache(async (symbol: string) => {
  const cleanSymbol = symbol.trim().toUpperCase();
  const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;

  if (!token) {
    throw new Error('FINNHUB API key is not configured');
  }

  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 60 * 60 * 24 * 5; // last 5 days, in case today's candle isn't published yet

    const [candles, financials] = await Promise.all([
      fetchJSON<{ v?: number[]; s?: string }>(
        `${FINNHUB_BASE_URL}/stock/candle?symbol=${cleanSymbol}&resolution=D&from=${from}&to=${to}&token=${token}`
      ),
      fetchJSON(
        `${FINNHUB_BASE_URL}/stock/metric?symbol=${cleanSymbol}&metric=all&token=${token}`,
        1800
      ),
    ]);

    const financialsData = financials as FinancialsData;
    const averageVolume = financialsData?.metric?.['10DayAverageTradingVolume'];
    const volumes = candles?.s === 'ok' ? candles.v : undefined;
    const currentVolume = volumes && volumes.length > 0 ? volumes[volumes.length - 1] / 1_000_000 : undefined;

    if (currentVolume == null || averageVolume == null) return null;

    return { symbol: cleanSymbol, currentVolume, averageVolume };
  } catch (error) {
    console.error(`Error fetching volume data for ${cleanSymbol}:`, error);
    return null;
  }
});

export const getStocksDetails = cache(async (symbol: string) => {
  const cleanSymbol = symbol.trim().toUpperCase();
  const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;

  if (!token) {
    throw new Error('FINNHUB API key is not configured');
  }

  try {
    const [quote, profile, financials] = await Promise.all([
      fetchJSON(`${FINNHUB_BASE_URL}/quote?symbol=${cleanSymbol}&token=${token}`),
      fetchJSON(
        `${FINNHUB_BASE_URL}/stock/profile2?symbol=${cleanSymbol}&token=${token}`,
        3600
      ),
      fetchJSON(
        `${FINNHUB_BASE_URL}/stock/metric?symbol=${cleanSymbol}&metric=all&token=${token}`,
        1800
      ),
    ]);

    const quoteData = quote as QuoteData;
    const profileData = profile as ProfileData;
    const financialsData = financials as FinancialsData;

    if (!quoteData?.c || !profileData?.name) {
      throw new Error('Invalid stock data received from API');
    }

    const changePercent = quoteData.dp || 0;
    const peRatio = financialsData?.metric?.peNormalizedAnnual || null;

    return {
      symbol: cleanSymbol,
      company: profileData.name,
      currentPrice: quoteData.c,
      changePercent,
      priceFormatted: formatPrice(quoteData.c),
      changeFormatted: formatChangePercent(changePercent),
      peRatio: peRatio?.toFixed(1) || '—',
      marketCapFormatted: formatMarketCapValue(
        profileData.marketCapitalization || 0
      ),
    };
  } catch (error) {
    console.error(`Error fetching details for ${cleanSymbol}:`, error);
    throw new Error('Failed to fetch stock details');
  }
});

export const getStockRiskAnalytics = cache(async (symbol: string): Promise<StockRiskAnalytics | null> => {
  const cleanSymbol = symbol.trim().toUpperCase();
  const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;

  if (!token) {
    throw new Error('FINNHUB API key is not configured');
  }

  const to = Math.floor(Date.now() / 1000);
  const from = to - 60 * 60 * 24 * 400;

  try {
    const fetchCandles = async (ticker: string): Promise<CandleSeries> => {
      try {
        const candles = await fetchJSON<CandleSeries>(
          `${FINNHUB_BASE_URL}/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}&token=${token}`,
          1800
        );
        if (candles?.s === 'ok' && candles.c?.length) return candles;
      } catch (error) {
        console.error(`Error fetching Finnhub candles for ${ticker}:`, error);
      }
      return fetchYahooDailyCloses(ticker);
    };

    const [quote, profile, financials, stockCandles, spyCandles] = await Promise.all([
      fetchJSON(`${FINNHUB_BASE_URL}/quote?symbol=${cleanSymbol}&token=${token}`),
      fetchJSON(
        `${FINNHUB_BASE_URL}/stock/profile2?symbol=${cleanSymbol}&token=${token}`,
        3600
      ),
      fetchJSON(
        `${FINNHUB_BASE_URL}/stock/metric?symbol=${cleanSymbol}&metric=all&token=${token}`,
        1800
      ),
      fetchCandles(cleanSymbol),
      fetchCandles('SPY'),
    ]);

    const quoteData = quote as QuoteData;
    const profileData = profile as ProfileData;
    const financialsData = financials as FinancialsData;

    if (!quoteData?.c || !profileData?.name) return null;

    const closes = stockCandles?.s === 'ok' ? stockCandles.c ?? [] : [];
    const stockTs = stockCandles?.s === 'ok' ? stockCandles.t ?? [] : [];
    const spyCloses = spyCandles?.s === 'ok' ? spyCandles.c ?? [] : [];
    const spyTs = spyCandles?.s === 'ok' ? spyCandles.t ?? [] : [];

    let alignedStock = closes;
    let alignedMarket: number[] | undefined;

    if (closes.length && spyCloses.length) {
      const aligned = alignClosesByTimestamp(
        { t: stockTs, c: closes },
        { t: spyTs, c: spyCloses }
      );
      alignedStock = aligned.stockCloses;
      alignedMarket = aligned.marketCloses;
    }

    const week52High =
      financialsData?.metric?.['52WeekHigh'] ??
      (closes.length ? Math.max(...closes) : undefined);

    const metrics = computeRiskMetrics({
      closes: alignedStock.length ? alignedStock : closes,
      marketCloses: alignedMarket,
      currentPrice: quoteData.c,
      week52High,
    });

    const finnhubBeta = financialsData?.metric?.beta ?? null;
    const changePercent = quoteData.dp || 0;

    return {
      symbol: cleanSymbol,
      company: profileData.name,
      currentPrice: quoteData.c,
      priceFormatted: formatPrice(quoteData.c),
      changePercent,
      changeFormatted: formatChangePercent(changePercent),
      finnhubBeta,
      week52High: week52High ?? null,
      ...metrics,
      summary: buildRiskSummary({
        symbol: cleanSymbol,
        label: metrics.riskLabel,
        vol: metrics.annualizedVolatility,
        beta: metrics.computedBeta ?? finnhubBeta,
        maxDd: metrics.maxDrawdown,
        limited: metrics.limited,
      }),
    };
  } catch (error) {
    console.error(`Error fetching risk analytics for ${cleanSymbol}:`, error);
    return null;
  }
});


