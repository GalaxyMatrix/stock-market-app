from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Any
MAX_TITLE = 80
MAX_DESCRIPTION = 400
MAX_ITEMS = 5
_REQUIRED_KEYS = ("title", "description", "emoji")
_ADVICE = [
    r"\byou should (buy|sell|invest)\b",
    r"\bguaranteed (returns|profit|gains)\b",
    r"\bcan't lose\b",
    r"\bthis is a (sure|can't-miss) (buy|bet)\b",
    r"\bbuy now\b",
    r"\bsell everything\b",
]
_PROMPT_LEAK = [
    r"system prompt",
    r"ignore previous",
    r"OPENAI_API_KEY",
    r"sk-[a-zA-Z0-9]{10,}",
]



@dataclass
class OutputGuardResult:
    ok: bool
    insights: dict[str, Any]
    reason : str = ""



def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else [] 


def _clean_text(value, limit: int) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit]


def _first_text(item: dict, keys: tuple[str, ...]) -> str:
    for key in keys:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return ""


def _named_list(payload: dict, keys: tuple[str, ...]) -> list:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, list) and value:
            return value
    return []


def _flatten_insight_payload(raw: Any) -> Any:
    if not isinstance(raw, dict):
        return raw
    bull_keys = ("bullInsights", "bull_insights", "bulls", "positiveInsights")
    bear_keys = ("bearInsights", "bear_insights", "bears", "negativeInsights")
    bulls = _named_list(raw, bull_keys)
    bears = _named_list(raw, bear_keys)
    if not bulls and not bears:
        for value in raw.values():
            if not isinstance(value, dict):
                continue
            bulls.extend(_named_list(value, bull_keys))
            bears.extend(_named_list(value, bear_keys))
    if bulls or bears:
        return {"bullInsights": bulls, "bearInsights": bears}
    return raw


def _item_ok(item: Any) -> dict[str, str] | None:
    if isinstance(item, str):
        text = _clean_text(item, MAX_DESCRIPTION)
        if not text:
            return None
        item = {"title": text, "description": text}
    if not isinstance(item, dict):
        return None
    cleaned = {
        "title": _clean_text(_first_text(item, ("title", "heading", "name")), MAX_TITLE),
        "description": _clean_text(
            _first_text(item, ("description", "text", "insight", "summary")),
            MAX_DESCRIPTION,
        ),
        "emoji": _clean_text(item.get("emoji"), 8) or "•",
    }
    if cleaned["title"] and not cleaned["description"]:
        cleaned["description"] = cleaned["title"]
    if cleaned["description"] and not cleaned["title"]:
        cleaned["title"] = _clean_text(cleaned["description"], MAX_TITLE)
    if not cleaned["title"] or not cleaned["description"]:
        return None
    blob = f"{cleaned['title']} {cleaned['description']}".lower()
    for pattern in _PROMPT_LEAK:
        if re.search(pattern, blob, flags=re.IGNORECASE):
            return None
    for pattern in _ADVICE:
        if re.search(pattern, blob, flags=re.IGNORECASE):
            cleaned["description"] = (
                cleaned["description"].rstrip(".")
                + ". Educational context only — not a recommendation to buy or sell."
            )
            break
    return cleaned


def sanitize_insights(raw) -> OutputGuardResult:
    raw = _flatten_insight_payload(raw)
    if not isinstance(raw, dict):
        return OutputGuardResult(ok=False, insights={}, reason="not_object")

    bulls = [_item_ok(item) for item in _as_list(raw.get("bullInsights"))]
    bears = [_item_ok(item) for item in _as_list(raw.get("bearInsights"))]
    bulls = [item for item in bulls if item][:MAX_ITEMS]
    bears = [item for item in bears if item][:MAX_ITEMS]
    if not bulls and not bears:
        return OutputGuardResult(ok=False, insights={}, reason="empty_or_invalid")
    return OutputGuardResult(
        ok=True,
        insights={"bullInsights": bulls, "bearInsights": bears},
    )
DISCLAIMER = (
    "Educational simulation only. Not investment advice. "
    "Past performance does not predict future results."
)

