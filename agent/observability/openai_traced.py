from __future__ import annotations

import os
import time
from typing import Any

from openai import OpenAI

from observability.log import log_event

_DEFAULT_MODEL = "gpt-4o-mini"


def _usage(response: Any) -> dict[str, int | None]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return {"tokens_in": None, "tokens_out": None, "tokens": None}
    prompt = getattr(usage, "prompt_tokens", None)
    completion = getattr(usage, "completion_tokens", None)
    total = getattr(usage, "total_tokens", None)
    return {
        "tokens_in": prompt,
        "tokens_out": completion,
        "tokens": total,
    }


def _tool_names(kwargs: dict[str, Any]) -> list[str]:
    tools = kwargs.get("tools") or []
    names: list[str] = []
    for tool in tools:
        if isinstance(tool, dict):
            name = tool.get("function", {}).get("name") or tool.get("name")
            if name:
                names.append(name)
    return names


def traced_chat_completion(
    run_id: str,
    stage: str,
    *,
    api_key: str | None = None,
    **kwargs: Any,
):
    """Same as OpenAI().chat.completions.create, plus a jsonl trace line."""
    kwargs.setdefault("model", _DEFAULT_MODEL)
    client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))

    started = time.perf_counter()
    try:
        response = client.chat.completions.create(**kwargs)
    except Exception as exc:
        log_event(
            run_id,
            stage,
            ok=False,
            ms=round((time.perf_counter() - started) * 1000),
            model=kwargs.get("model"),
            tools=_tool_names(kwargs),
            error_type=type(exc).__name__,
            error=str(exc)[:300],
        )
        raise

    choice = response.choices[0] if response.choices else None
    log_event(
        run_id,
        stage,
        ok=True,
        ms=round((time.perf_counter() - started) * 1000),
        model=kwargs.get("model") or getattr(response, "model", None),
        finish_reason=getattr(choice, "finish_reason", None),
        tools=_tool_names(kwargs),
        **_usage(response),
    )
    return response
