from __future__ import annotations
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
MAX_TICKERS = 10
MIN_AMOUNT = 100.0
MAX_AMOUNT = 100_000.0
MAX_LOOKBACK_YEARS = 4
_TICKER_RE = re.compile(r"^[A-Z][A-Z0-9.]{0,9}$")
_MAX_EXTRACTED_TICKER_LEN = 5
_ALLOWED_INTERVALS = {
    "1d", "5d", "7d", "1mo", "3mo", "6mo",
    "1y", "2y", "3y", "4y", "5y", "single_shot",
}
TICKER_STOP = {
    "A", "ABOUT", "ADD", "ADDED", "AGO", "ALL", "AM", "AN", "AND", "ANALYZE",
    "ANALYSE", "ANALYSIS", "ARE", "AS", "AT", "AVERAGING", "BE", "BEAR", "BULL",
    "BUY", "BY", "CAN", "CASE", "CASES", "CASH", "COMPARE", "COST", "DAILY",
    "DCA", "DID", "DO", "DOLLAR", "DOLLARS", "DONE", "EACH", "EVERY", "FOR",
    "FROM", "FUND", "FUNDS", "GET", "GOT", "HAD", "HAS", "HAVE", "I", "IF",
    "IN", "INTO", "INVEST", "INVESTED", "INVESTING", "INVESTMENT", "INVESTMENTS",
    "IS", "IT", "ITS", "JAN", "JANUARY", "FEB", "FEBRUARY", "MAR", "MARCH",
    "APR", "APRIL", "MAY", "JUN", "JUNE", "JUL", "JULY", "AUG", "AUGUST",
    "SEP", "SEPT", "SEPTEMBER", "OCT", "OCTOBER", "NOV", "NOVEMBER", "DEC",
    "DECEMBER", "JUST", "LAST", "LUMP", "ME", "MONTH", "MONTHLY", "MY", "NO",
    "NOT", "OF", "OK", "ON", "ONLY", "OR", "PAST", "PER", "PLEASE", "PORTFOLIO",
    "PUT", "QUARTER", "QUARTERLY", "SELL", "SHOW", "SHOT", "SIMULATE",
    "SIMULATION", "SINCE", "SINGLE", "SO", "STOCK", "STOCKS", "SUM", "THANKS",
    "THAT", "THE", "THESE", "THIS", "THOSE", "TO", "TRY", "UP", "USD", "USING",
    "VS", "WATCHLIST", "WE", "WEEK", "WEEKLY", "WHAT", "WILL", "WITH", "WOULD",
    "YEAR", "YEARLY", "YEARS", "YES", "YOU", "YOUR",
}


@dataclass
class ToolGuardResult:
    ok: bool
    arguments: dict[str, Any]
    reason: str = ""


def _normalize_ticker(raw: Any) -> str | None:
    ticker = str(raw or "").strip().upper().replace(" ", "")
    if not _TICKER_RE.match(ticker):
        return None
    return ticker


def is_extracted_ticker(raw: Any) -> str | None:
    ticker = _normalize_ticker(raw)
    if not ticker or ticker in TICKER_STOP:
        return None
    letters = ticker.replace(".", "")
    if not (1 <= len(letters) <= _MAX_EXTRACTED_TICKER_LEN):
        return None
    return ticker


def _normalize_amount(raw: Any) -> float | None:
    try:
        amount = float(raw)
    except (TypeError, ValueError):
        return None
    if not (MIN_AMOUNT <= amount <= MAX_AMOUNT):
        return None
    return round(amount, 2)
def _normalize_date(raw: Any) -> str | None:
    text = str(raw or "").strip()[:10]
    try:
        parsed = datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        return None
    today = date.today()
    earliest = date(today.year - MAX_LOOKBACK_YEARS, 1, 1)
    if parsed > today:
        parsed = today - timedelta(days=1)
    if parsed < earliest:
        parsed = earliest
    return parsed.isoformat()
def sanitize_extract_args(raw: Any) -> ToolGuardResult:
    if not isinstance(raw, dict):
        return ToolGuardResult(ok=False, arguments={}, reason="not_object")
    tickers: list[str] = []
    seen: set[str] = set()
    for item in raw.get("ticker_symbols") or []:
        ticker = is_extracted_ticker(item)
        if ticker and ticker not in seen:
            seen.add(ticker)
            tickers.append(ticker)
        if len(tickers) >= MAX_TICKERS:
            break
    if not tickers:
        return ToolGuardResult(ok=False, arguments={}, reason="no_valid_tickers")
    amounts_in = raw.get("amount_of_dollars_to_be_invested") or []
    amounts: list[float] = []
    for item in amounts_in:
        amount = _normalize_amount(item)
        if amount is not None:
            amounts.append(amount)
    if len(amounts) == 1 and len(tickers) > 1:
        amounts = [amounts[0]] * len(tickers)
    if len(amounts) != len(tickers):
        amounts = [10_000.0] * len(tickers)
    investment_date = _normalize_date(raw.get("investment_date"))
    if investment_date is None:
        today = date.today()
        investment_date = date(today.year - 1, today.month, today.day).isoformat()
    interval = str(raw.get("interval_of_investment") or "single_shot").strip()
    if interval not in _ALLOWED_INTERVALS:
        interval = "single_shot"
    return ToolGuardResult(
        ok=True,
        arguments={
            "ticker_symbols": tickers,
            "investment_date": investment_date,
            "amount_of_dollars_to_be_invested": amounts,
            "interval_of_investment": interval,
            "to_be_added_in_portfolio": bool(raw.get("to_be_added_in_portfolio", True)),
        },
    )



