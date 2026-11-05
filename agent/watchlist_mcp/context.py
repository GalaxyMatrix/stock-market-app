from __future__ import annotations

from contextvars import ContextVar

watchlist_tickers: ContextVar[list[str]] = ContextVar("watchlist_tickers", default=[])
price_alerts: ContextVar[list[dict]] = ContextVar("price_alerts", default=[])


def set_chat_context(*, tickers: list[str], alerts: list[dict] | None = None) -> None:
    watchlist_tickers.set([t for t in tickers if t])
    price_alerts.set(list(alerts or []))