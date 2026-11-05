from fastmcp import FastMCP

from safety.tool_guard import is_extracted_ticker

from .context import price_alerts, watchlist_tickers
from .market import clean_symbols, fetch_news, fetch_quote, fetch_risk

mcp = FastMCP(
    "WatchlistTools",
    instructions="Read-only watchlist tools. Never tell the user what to buy or sell.",
)


@mcp.tool
def get_watchlist_news(symbols: list[str] | None = None, days: int = 7) -> dict:
    """Latest Finnhub headlines for watchlist tickers (default last 7 days)."""
    tickers = clean_symbols(symbols, watchlist_tickers.get())
    if not tickers:
        return {"error": "No tickers found"}
    return {"articles": fetch_news(tickers, days=days)}


@mcp.tool
def get_quote(symbol: str) -> dict:
    """Last price, change, and session range for one ticker."""
    return fetch_quote(symbol)


@mcp.tool
def get_risk_metrics(symbols: list[str] | None = None) -> dict:
    """1-year vol, beta vs SPY, Sharpe, max drawdown, and risk score."""
    tickers = clean_symbols(symbols, watchlist_tickers.get())
    if not tickers:
        return {"error": "No tickers found"}
    return {"risk_metrics": fetch_risk(tickers)}


@mcp.tool
def list_price_alerts(symbol: str | None = None) -> dict:
    """Read-only list of this user's price alerts already loaded in the chat."""
    alerts = price_alerts.get()
    ticker = is_extracted_ticker(symbol) if symbol else None
    rows = [
        {
            "symbol": a.get("symbol"),
            "alertName": a.get("alertName"),
            "alertType": a.get("alertType"),
            "threshold": a.get("threshold"),
            "frequency": a.get("frequency"),
        }
        for a in alerts
        if not ticker or str(a.get("symbol", "")).upper() == ticker
    ]
    if not alerts:
        return {
            "alerts": [],
            "note": "No alerts in chat state. Open the watchlist sidebar after creating alerts.",
        }
    return {"alerts": rows}
