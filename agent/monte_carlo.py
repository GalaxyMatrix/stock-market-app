from __future__ import annotations

import numpy as np
from pydantic import BaseModel, Field

MIN_CLOSES = 61
MAX_PATHS = 5000
MAX_HORIZON = 252


class MonteCarloRequest(BaseModel):
    symbol: str
    spot: float = Field(gt=0)
    closes: list[float] = Field(min_length=MIN_CLOSES)
    horizonDays: int = Field(default=252, ge=21, le=MAX_HORIZON)
    paths: int = Field(default=2000, ge=200, le=MAX_PATHS)


class MonteCarloResponse(BaseModel):
    symbol: str
    horizonDays: int
    paths: int
    p5: list[float]
    p50: list[float]
    p95: list[float]
    endPriceP5: float
    endPriceP50: float
    endPriceP95: float
    probabilityOfLoss: float


def run_monte_carlo(req: MonteCarloRequest) -> MonteCarloResponse:
    closes = np.asarray(req.closes, dtype=np.float64)
    closes = closes[np.isfinite(closes) & (closes > 0)]
    if closes.size < MIN_CLOSES:
        raise ValueError("Not enough valid closes for a simulation")

    log_returns = np.diff(np.log(closes))
    mu = float(log_returns.mean())
    sigma = float(log_returns.std(ddof=1))
    if not np.isfinite(sigma) or sigma <= 0:
        raise ValueError("Could not estimate volatility")

    rng = np.random.default_rng(42)
    shocks = rng.standard_normal((req.paths, req.horizonDays))
    prices = req.spot * np.exp(np.cumsum(mu + sigma * shocks, axis=1))

    p5, p50, p95 = np.percentile(prices, [5, 50, 95], axis=0)
    return MonteCarloResponse(
        symbol=req.symbol.upper(),
        horizonDays=req.horizonDays,
        paths=req.paths,
        p5=p5.round(4).tolist(),
        p50=p50.round(4).tolist(),
        p95=p95.round(4).tolist(),
        endPriceP5=float(p5[-1]),
        endPriceP50=float(p50[-1]),
        endPriceP95=float(p95[-1]),
        probabilityOfLoss=float((prices[:, -1] < req.spot).mean()),
    )
