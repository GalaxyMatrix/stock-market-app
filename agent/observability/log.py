from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_LOCK = threading.Lock()

_SECRET_KEYS = {
    "openai_api_key",
    "api_key",
    "authorization",
    "agent_secret",
    "password",
    "token",
}

_LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
_LOG_FILE = Path(os.getenv("AGENT_LOG_FILE", str(_LOG_DIR / "runs.jsonl")))


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "***" if str(key).lower() in _SECRET_KEYS else _redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def log_event(run_id: str, stage: str, **fields: Any) -> None:
    """Append one structured event to agent/logs/runs.jsonl."""
    record = {
        "ts": _utcnow(),
        "run_id": run_id,
        "stage": stage,
        **_redact(fields),
    }
    _LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(record, default=str, ensure_ascii=False)
    with _LOCK:
        with _LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")


def new_run_id() -> str:
    return str(uuid.uuid4())
