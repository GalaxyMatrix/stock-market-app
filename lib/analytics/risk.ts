const TRADING_DAYS = 252;
const RISK_FREE_RATE = 0.04;
const MIN_RETURNS = 60; 


export function logReturns(closes: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      const prev = closes[i - 1];
      const curr = closes[i];
      if (prev > 0 && curr > 0) {
        returns.push(Math.log(curr / prev));
      }
    }
    return returns;
  }


export function mean(values: number[]): number{
    if (values.length === 0) return NaN;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}


export function sampleStdev(values: number[]): number{
    if (values.length < 2) return NaN;
    const m = mean(values); 
    const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
}



export function annualizedVolatility(returns: number[]): number {
    return sampleStdev(returns) * Math.sqrt(TRADING_DAYS);
}


export function covariance(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length); 
    if (n < 2) return NaN;
    const mx = mean(x.slice(0, n));
    const my = mean(y.slice(0, n));
    let cov = 0; 
    for (let i = 0; i < n; i ++) {
        cov += (x[i] - mx) * (y[i] - my);
    }
    return cov / (n - 1);
}

export function beta(stockReturns: number[], marketReturns: number[]): number {
    const marketVar = sampleStdev(marketReturns) ** 2;
    if (!Number.isFinite(marketVar) || marketVar === 0) return NaN;
    return covariance(stockReturns, marketReturns) / marketVar;
}


export function maxDrawdown(closes: number[]): number {
    if (closes.length === 0) return NaN;
    let peak = closes[0]; 
    let worst = 0;
    for (const price of closes) {
        peak = Math.max(peak, price);
        if (peak > 0) worst = Math.min(worst, price / peak -1);
    }
    return worst;

}


function percentile(sortedAsc: number[], p: number): number {
    if (sortedAsc.length === 0) return NaN;
    const idx = (sortedAsc.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sortedAsc[lo];
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
  }


  export function historicalVaR(returns: number[], confidence = 0.95): number {
    const sorted = [...returns].sort((a, b) => a - b);
    return percentile(sorted, 1 - confidence);
  }
  export function historicalCVaR(returns: number[], confidence = 0.95): number {
    const cutoff = historicalVaR(returns, confidence);
    const tail = returns.filter((r) => r <= cutoff);
    return mean(tail);
  }
  export function sharpeRatio(returns: number[], rf = RISK_FREE_RATE): number {
    const vol = annualizedVolatility(returns);
    if (!Number.isFinite(vol) || vol === 0) return NaN;
    return (mean(returns) * TRADING_DAYS - rf) / vol;
  }
  export function sortinoRatio(returns: number[], rf = RISK_FREE_RATE): number {
    if (returns.length === 0) return NaN;
    const downsideSq =
      returns.reduce((sum, r) => sum + Math.min(r, 0) ** 2, 0) / returns.length;
    const downsideDev = Math.sqrt(downsideSq) * Math.sqrt(TRADING_DAYS);
    if (!Number.isFinite(downsideDev) || downsideDev === 0) return NaN;
    return (mean(returns) * TRADING_DAYS - rf) / downsideDev;
  }
  export function distanceFromHigh(price: number, high: number): number {
    if (!Number.isFinite(price) || !Number.isFinite(high) || high <= 0) return NaN;
    return (high - price) / high;
  }
  export function alignClosesByTimestamp(
    stock: { t: number[]; c: number[] },
    market: { t: number[]; c: number[] }
  ) {
    const marketByTs = new Map<number, number>();
    market.t.forEach((ts, i) => {
      if (market.c[i] != null) marketByTs.set(ts, market.c[i]);
    });
    const stockCloses: number[] = [];
    const marketCloses: number[] = [];
    stock.t.forEach((ts, i) => {
      const m = marketByTs.get(ts);
      if (m != null && stock.c[i] != null) {
        stockCloses.push(stock.c[i]);
        marketCloses.push(m);
      }
    });
    return { stockCloses, marketCloses };
  }
  export function riskScore(input: {
    vol: number | null;
    beta: number | null;
    maxDd: number | null;
    var95: number | null;
  }): number | null {
    const parts: number[] = [];
    if (input.vol != null) parts.push(Math.min(input.vol / 0.2, 2) * 30);
    if (input.beta != null) parts.push(Math.min(Math.abs(input.beta) / 1, 2) * 20);
    if (input.maxDd != null) parts.push(Math.min(Math.abs(input.maxDd) / 0.3, 2) * 30);
    if (input.var95 != null) parts.push(Math.min(Math.abs(input.var95) / 0.03, 2) * 20);
    if (parts.length === 0) return null;
    const raw = parts.reduce((a, b) => a + b, 0);
    const max = [30, 20, 30, 20].slice(0, parts.length).reduce((a, b) => a + b, 0);
    return Math.round(Math.min(100, (raw / max) * 100));
  }
  export function riskLabel(score: number | null): RiskLabel | null {
    if (score == null) return null;
    if (score < 35) return "Low";
    if (score < 65) return "Medium";
    return "High";
  }
  export function buildRiskSummary(input: {
    symbol: string;
    label: RiskLabel | null;
    vol: number | null;
    beta: number | null;
    maxDd: number | null;
    limited: boolean;
  }): string {
    if (input.limited) {
      return `Not enough daily history to score ${input.symbol} reliably. Showing available Finnhub metrics only.`;
    }
    const vol = input.vol != null ? `${(input.vol * 100).toFixed(0)}%` : "n/a";
    const beta = input.beta != null ? input.beta.toFixed(2) : "n/a";
    const dd = input.maxDd != null ? `${(input.maxDd * 100).toFixed(0)}%` : "n/a";
    return `${input.symbol} screens as ${input.label ?? "unscored"} risk: 1-year vol ${vol}, beta ${beta}, max drawdown ${dd}.`;
  }
  function finiteOrNull(n: number): number | null {
    return Number.isFinite(n) ? n : null;
  }
  export function computeRiskMetrics(input: {
    closes: number[];
    marketCloses?: number[];
    currentPrice: number;
    week52High?: number;
  }) {
    const returns = logReturns(input.closes);
    const limited = returns.length < MIN_RETURNS;
    const vol = finiteOrNull(annualizedVolatility(returns));
    const dd = finiteOrNull(maxDrawdown(input.closes));
    const var95 = finiteOrNull(historicalVaR(returns));
    const cvar95 = finiteOrNull(historicalCVaR(returns));
    const sharpe = finiteOrNull(sharpeRatio(returns));
    const sortino = finiteOrNull(sortinoRatio(returns));
    let computedBeta: number | null = null;
    if (input.marketCloses && input.marketCloses.length === input.closes.length) {
      computedBeta = finiteOrNull(beta(returns, logReturns(input.marketCloses)));
    }
    const highFromCloses = input.closes.length > 0 ? Math.max(...input.closes) : NaN;
    const high = input.week52High ?? highFromCloses;
    const distance = finiteOrNull(distanceFromHigh(input.currentPrice, high));
    const score = limited
      ? null
      : riskScore({ vol, beta: computedBeta, maxDd: dd, var95 });
    return {
      sampleDays: returns.length,
      annualizedVolatility: vol,
      computedBeta,
      maxDrawdown: dd,
      var95,
      cvar95,
      sharpe,
      sortino,
      distanceFrom52wHigh: distance,
      riskScore: score,
      riskLabel: riskLabel(score),
      limited,
    };
  }
  