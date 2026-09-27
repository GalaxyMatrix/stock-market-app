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


def _item_ok(item: Any) -> dict[str, str] | None:
    if not isinstance(item, dict):
        return None
    cleaned = {
        "title": _clean_text(item.get("title"), MAX_TITLE),
        "description": _clean_text(item.get("description"), MAX_DESCRIPTION),
        "emoji": _clean_text(item.get("emoji"), 8) or "•",
    }
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

