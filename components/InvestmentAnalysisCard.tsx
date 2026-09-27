"use client";

type PerformancePoint = {
  date?: string;
  portfolio?: number | null;
  spy?: number | null;
};

type Insight = {
  title?: string;
  description?: string;
  emoji?: string;
};

export type InvestmentSummary = {
  cash?: number | null;
  total_value?: number | null;
  holdings?: Record<string, number | null>;
  returns?: Record<string, number | null>;
  percent_return_per_stock?: Record<string, number | null>;
  percent_allocation_per_stock?: Record<string, number | null>;
  total_invested_per_stock?: Record<string, number | null>;
  performanceData?: PerformancePoint[];
  insights?: {
    bullInsights?: Insight[];
    bearInsights?: Insight[];
  };
};

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function percent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function parseInvestmentSummary(raw: unknown): InvestmentSummary | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return parseInvestmentSummary(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object") return null;
  return raw as InvestmentSummary;
}

function linePath(
  points: PerformancePoint[],
  key: "portfolio" | "spy",
  width: number,
  height: number,
  min: number,
  span: number
) {
  const pad = 8;
  const usable = points.length - 1 || 1;
  let started = false;
  let d = "";
  points.forEach((point, index) => {
    const value = asNumber(point[key]);
    if (value == null) return;
    const x = pad + (index / usable) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    d += `${started ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    started = true;
  });
  return d.trim();
}

function PerformanceChart({ points }: { points: PerformancePoint[] }) {
  const width = 320;
  const height = 140;
  const values = points.flatMap((point) =>
    [asNumber(point.portfolio), asNumber(point.spy)].filter(
      (value): value is number => value != null
    )
  );
  if (values.length < 2) {
    return (
      <p className="text-xs text-muted-foreground">
        Not enough price history to chart.
      </p>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const portfolio = linePath(points, "portfolio", width, height, min, span);
  const spy = linePath(points, "spy", width, height, min, span);

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-36 w-full"
        role="img"
        aria-label="Portfolio versus SPY"
      >
        {spy ? (
          <path d={spy} fill="none" stroke="#94a3b8" strokeWidth="2" />
        ) : null}
        {portfolio ? (
          <path d={portfolio} fill="none" stroke="#22c55e" strokeWidth="2.5" />
        ) : null}
      </svg>
      <div className="flex gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-3 rounded-full bg-green-500" /> Portfolio
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-3 rounded-full bg-slate-400" /> SPY
        </span>
      </div>
    </div>
  );
}

export default function InvestmentAnalysisCard({
  summary,
}: {
  summary: InvestmentSummary;
}) {
  const tickers = Object.keys(summary.holdings ?? summary.returns ?? {});
  const bull = summary.insights?.bullInsights ?? [];
  const bear = summary.insights?.bearInsights ?? [];

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-border bg-card p-3 text-card-foreground">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Portfolio value</p>
          <p className="font-semibold">{money(asNumber(summary.total_value))}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Cash left</p>
          <p className="font-semibold">{money(asNumber(summary.cash))}</p>
        </div>
      </div>

      <PerformanceChart points={summary.performanceData ?? []} />

      {tickers.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pb-1 font-medium">Ticker</th>
                <th className="pb-1 font-medium">Invested</th>
                <th className="pb-1 font-medium">Return</th>
                <th className="pb-1 font-medium">Alloc</th>
              </tr>
            </thead>
            <tbody>
              {tickers.map((ticker) => {
                const ret = asNumber(summary.percent_return_per_stock?.[ticker]);
                return (
                  <tr key={ticker} className="border-t border-border/60">
                    <td className="py-1 font-medium">{ticker}</td>
                    <td className="py-1">
                      {money(asNumber(summary.total_invested_per_stock?.[ticker]))}
                    </td>
                    <td
                      className={`py-1 ${
                        ret != null && ret < 0 ? "text-red-500" : "text-green-500"
                      }`}
                    >
                      {percent(ret)}
                    </td>
                    <td className="py-1">
                      {percent(asNumber(summary.percent_allocation_per_stock?.[ticker]))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {bull.length || bear.length ? (
        <div className="grid gap-2 text-xs md:grid-cols-2">
          {bull.length ? (
            <div>
              <p className="mb-1 font-medium text-green-500">Bull</p>
              {bull.map((item, index) => (
                <p key={`bull-${index}`}>
                  {item.emoji} <span className="font-medium">{item.title}</span>
                  {item.description ? ` — ${item.description}` : ""}
                </p>
              ))}
            </div>
          ) : null}
          {bear.length ? (
            <div>
              <p className="mb-1 font-medium text-red-500">Bear</p>
              {bear.map((item, index) => (
                <p key={`bear-${index}`}>
                  {item.emoji} <span className="font-medium">{item.title}</span>
                  {item.description ? ` — ${item.description}` : ""}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
