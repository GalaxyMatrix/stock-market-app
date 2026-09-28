FROM python:3.12-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.7.12 /uv /bin/uv

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY agent ./agent

RUN useradd --create-home --uid 1000 agent \
    && mkdir -p /app/agent/logs \
    && chown -R agent:agent /app/agent/logs

USER agent

WORKDIR /app/agent
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    CREWAI_DISABLE_TELEMETRY=true \
    OTEL_SDK_DISABLED=true

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]