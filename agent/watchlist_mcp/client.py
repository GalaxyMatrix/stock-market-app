from __future__ import annotations

import json

from fastmcp import Client

from .server import mcp

ALLOWED_TOOLS = {
    "get_watchlist_news",
    "get_quote",
    "get_risk_metrics",
    "list_price_alerts",
}
MAX_TOOL_CHARS = 8_000


def _as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value[:MAX_TOOL_CHARS]
    return json.dumps(value, default=str)[:MAX_TOOL_CHARS]


async def openai_tools() -> list[dict]:
    async with Client(mcp) as client:
        listed = await client.list_tools()
    tools = []
    for tool in listed:
        if tool.name not in ALLOWED_TOOLS:
            continue
        schema = (
            getattr(tool, "inputSchema", None)
            or getattr(tool, "input_schema", None)
            or {"type": "object", "properties": {}}
        )
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description or tool.name,
                    "parameters": schema,
                },
            }
        )
    return tools


async def call_tool(name: str, arguments: dict) -> str:
    if name not in ALLOWED_TOOLS:
        return json.dumps({"error": f"tool not allowed: {name}"})
    args = arguments if isinstance(arguments, dict) else {}
    try:
        async with Client(mcp) as client:
            result = await client.call_tool(name, args)
    except Exception as exc:
        return json.dumps({"error": str(exc)[:300]})
    data = getattr(result, "data", None)
    if data is not None:
        return _as_text(data)
    parts = []
    for block in getattr(result, "content", None) or []:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    return _as_text("\n".join(parts) or {"error": "empty mcp result"})
