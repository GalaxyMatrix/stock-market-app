from __future__ import annotations
import re
from dataclasses import dataclass
MAX_CHARS = 2000
_INJECTION = [
    r"ignore (all|any|previous|prior|above) (instructions|prompts|rules)",
    r"you are now",
    r"reveal (your )?(system )?prompt",
    r"print (your )?(api key|secret|instructions)",
    r"disregard (the|your) (system|developer)",
    r"jailbreak",
    r"do not follow (your|the) (rules|guidelines)",
]
_SECRETS = [
    r"sk-[a-zA-Z0-9]{10,}",
    r"OPENAI_API_KEY",
    r"AGENT_SECRET",
]
_OFF_TOPIC = [
    r"\b(bomb|explosive|weapon|malware|ransomware)\b",
    r"\b(how to hack|sql injection payload)\b",
]
_ADVICE_PRESSURE = [
    r"guarantee(d)? (returns|profit|gains)",
    r"can't lose",
    r"tell me (exactly )?what to buy",
    r"this is (not )?financial advice.? wait.? (just )?tell me what to buy",
]


@dataclass 
class GuardResult: 
    allowed: bool
    reason: str = ""
    refusal : str = ""


def _last_user_text(messages: list) -> str:
    for message in reversed(messages or []):
        role = getattr(message, "role", None) or (
            message.get("role") if isinstance(message, dict) else None
        )
        if role != "user":
            continue
        content = getattr(message, "content", None)
        if content is None and isinstance(message, dict):
            content = message.get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    parts.append(part.get("text") or "")
                elif isinstance(part, str):
                    parts.append(part)
            return " ".join(parts).strip()
    return ""
def _blocked(reason: str, refusal: str) -> GuardResult:
    return GuardResult(allowed=False, reason=reason, refusal=refusal)
def check_input(text: str) -> GuardResult:
    cleaned = (text or "").strip()
    if not cleaned:
        return _blocked(
            "empty",
            "Please ask about a stock or your watchlist, for example: "
            "Analyze AAPL and MSFT with $10k each since last year.",
        )
    if len(cleaned) > MAX_CHARS:
        return _blocked(
            "too_long",
            f"That message is too long. Please keep it under {MAX_CHARS} characters.",
        )
    lowered = cleaned.lower()
    for pattern in _INJECTION:
        if re.search(pattern, lowered):
            return _blocked(
                "injection",
                "I can only help with portfolio analysis. I won't ignore my instructions.",
            )
    for pattern in _SECRETS:
        if re.search(pattern, cleaned, flags=re.IGNORECASE):
            return _blocked(
                "secret",
                "Don't paste API keys or secrets here. Ask about tickers or allocations instead.",
            )
    for pattern in _OFF_TOPIC:
        if re.search(pattern, lowered):
            return _blocked(
                "off_topic",
                "This agent only analyzes public stocks and watchlists.",
            )
    for pattern in _ADVICE_PRESSURE:
        if re.search(pattern, lowered):
            return _blocked(
                "advice_pressure",
                "I can simulate historical allocations and summarize bull/bear cases. "
                "I can't tell you what to buy or promise returns. Educational only.",
            )
    return GuardResult(allowed=True)
def check_messages(messages: list) -> GuardResult:
    return check_input(_last_user_text(messages))