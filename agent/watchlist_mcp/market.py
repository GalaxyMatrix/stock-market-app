from __future__ import annotations

import math
import os
from datetime import date, timedelta
from pathlib import Path

import httpx
import numpy as np
import yfinance as yf
from dotenv import load_dotenv

from safety.tool_guard import MAX_TICKERS, is_extracted_ticker

load_dotenv()
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / ".env")




FINNHUB_BASE = "https://finnhub.io/api/v1"
TRADING_DAYS = 252
RISK_FREE = 0.04
MIN_RETURNS = 60
MAX_NEWS = 6 




def finnhub_token() -> str:
    return (os.getenv("FINNHUB_API_KEY") or os.getenv("NEXT_PUBLIC_FINNHUB_API_KEY") or "").strip()



def clean_symbols(raw: list[str] | None, fallback: list[str]) -> list[str]:
    source = raw if raw else fallback
    out: list[str] = []
    for item in source:
        ticker = is_extracted_ticker(item)
        if ticker and ticker not in out:
            out.append(ticker)
        if len(out) >= MAX_TICKERS:
            break
    return out


def _get_json(url: str) -> dict | list:
    with httpx.Client(timeout=20.0) as client:
        res = client.get(url)
        res.raise_for_status()
        return res.json()



def fetch_news(symbols: list[str], days: int = 7) -> list[dict]:
    token = finnhub_token()
    if not token:
        return [{"error": "FINNHUB_API_KEY is not set on the agent"}]
    end = date.today()
    start = end - timedelta(days=max(1, min(days, 14)))
    collected: list[dict] = []
    for symbol in symbols:
        url = (
            f"{FINNHUB_BASE}/company-news?symbol={symbol}"
            f"&from={start.isoformat()}&to={end.isoformat()}&token={token}"

        )
        try:
            articles = _get_json(url)
        except Exception as exc:
            collected.append({"symbol": symbol, "error": str(exc)[:200]})
            continue
        if not isinstance(articles, list):
            continue
        for article in articles:
            if not isinstance(article, dict):
                continue
            if not (article.get("headline") and article.get("url") and article.get("datetime")):
                continue
            collected.append(
                {
                    "symbol": symbol,
                    "headline": str(article["headline"])[:180],
                    "source": article.get("source") or "",
                    "datetime": article.get("datetime"),
                    "url": article.get("url"),
                }
            )
    collected.sort(key=lambda row: row.get("datetime") or 0, reverse=True)
    return collected[:MAX_NEWS]




def fetch_quote(symbol: str) -> dict:
    token = finnhub_token()
    ticker = is_extracted_ticker(symbol)
    if not ticker:
        return {"error": "invalid ticker"}
    if token:
        try:
            data = _get_json(f"{FINNHUB_BASE}/quote?symbol={ticker}&token={token}")
            if isinstance(data, dict) and data.get("c"):
                return {
                    "symbol": ticker,
                    "last": data.get("c"),
                    "change": data.get("d"),
                    "changePercent": data.get("dp"),
                    "open": data.get("o"),
                    "high": data.get("h"),
                    "low": data.get("l"),
                    "previousClose": data.get("pc"),
                }
        except Exception:
            pass
    hist = yf.Ticker(ticker).history(period="5d")
    if hist is None or hist.empty:
        return {"error": f"no quote for {ticker}"}
    last = float(hist["Close"].dropna().iloc[-1])
    prev = float(hist["Close"].dropna().iloc[-2]) if len(hist) > 1 else last
    change = last - prev
    return {
        "symbol": ticker,
        "last": round(last, 4),
        "change": round(change, 4),
        "changePercent": round(change / prev * 100, 2) if prev else None,
        "source": "yahoo",
    }



def _log_returns(closes: np.ndarray) -> np.ndarray:
    prev, curr = closes[:-1], closes[1:]
    ok = (prev > 0) & (curr > 0)
    return np.log(curr[ok] / prev[ok])


def _max_drawdown(closes: np.ndarray) -> float:
    peak = np.maximum.accumulate(closes)
    dd = closes / peak - 1 
    return float(dd.min()) if dd.size else float("nan")



def _risk_score(vol, beta, max_dd) -> int | None:
    parts = [] 
    caps = [] 
    if vol is not None:
        parts.append(min(vol / 0.2, 2) * 30)
        caps.append(30)
    if beta is not None:
        parts.append(min(abs(beta) / 1, 2) * 20)
        caps.append(20)
    if max_dd is not None:
        parts.append(min(abs(max_dd) / 0.3, 2) * 30)
        caps.append(30)
    if not parts:
        return None
    return round(min(100, sum(parts) / sum(caps) * 100))



def fetch_risk(symbols: list[str]) -> list[dict]:
    spy = yf.Ticker("SPY").history(period="1y", auto_adjust=True)["Close"].dropna()
    rows = []
    for symbol in symbols:
        hist = yf.Ticker(symbol).history(period="1y", auto_adjust=True)["Close"].dropna()
        aligned = hist.align(spy, join="inner")
        stock = aligned[0].to_numpy(dtype=float)
        market = aligned[1].to_numpy(dtype=float)
        if stock.size < 2:
            rows.append({"symbol": symbol, "error": "not enough history"})
            continue
        rets = _log_returns(stock)
        mkt = _log_returns(market[: stock.size])
        limited = rets.size < MIN_RETURNS
        vol = float(rets.std(ddof=1) * math.sqrt(TRADING_DAYS)) if rets.size > 1 else None
        mean_ann = float(rets.mean() * TRADING_DAYS) if rets.size else None
        sharpe = (
            (mean_ann - RISK_FREE) / vol
            if vol and vol > 0 and mean_ann is not None
            else None
        )
        beta = None
        if mkt.size == rets.size and mkt.size > 1:
            mvar = float(mkt.var(ddof=1))
            if mvar > 0:
                beta = float(np.cov(rets, mkt, ddof=1)[0, 1] / mvar)
        max_dd = _max_drawdown(stock)
        score = _risk_score(vol, beta, max_dd)
        label = None if score is None else ("Low" if score < 35 else "Medium" if score < 65 else "High")
        rows.append(
            {
                "symbol": symbol,
                "annualizedVolatility": None if vol is None else round(vol, 4),
                "betaVsSpy": None if beta is None else round(beta, 3),
                "sharpe": None if sharpe is None else round(sharpe, 3),
                "maxDrawdown": None if math.isnan(max_dd) else round(float(max_dd), 4),
                "riskScore": score,
                "riskLabel": label,
                "limitedHistory": limited,
                "disclaimer": "Educational only. Same family of metrics as /analytics.",
            }
        )
    return rows