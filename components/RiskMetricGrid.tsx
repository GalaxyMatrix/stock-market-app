const fmtPct = (n: number | null, digits = 1) =>
  n == null ? "—" : `${(n * 100).toFixed(digits)}%`;

const fmtNum = (n: number | null, digits = 2) =>
  n == null ? "—" : n.toFixed(digits);

const METRICS = (data: StockRiskAnalytics) => [
  {
    label: "Annualized volatility",
    value: fmtPct(data.annualizedVolatility, 1),
    hint: "How violently the price moves",
  },
  {
    label: "Beta vs SPY",
    value: fmtNum(data.computedBeta),
    hint:
      data.finnhubBeta != null
        ? `Finnhub beta ${data.finnhubBeta.toFixed(2)}`
        : "Sensitivity vs the market",
  },
  {
    label: "Max drawdown",
    value: fmtPct(data.maxDrawdown, 1),
    hint: "Worst peak-to-trough loss",
  },
  {
    label: "VaR 95% (1 day)",
    value: fmtPct(data.var95, 2),
    hint: "Typical bad day",
  },
  {
    label: "CVaR 95%",
    value: fmtPct(data.cvar95, 2),
    hint: "Average of days worse than VaR",
  },
  {
    label: "Sharpe",
    value: fmtNum(data.sharpe),
    hint: "Return per unit of total risk (rf 4%)",
  },
  {
    label: "Sortino",
    value: fmtNum(data.sortino),
    hint: "Return per unit of downside risk",
  },
  {
    label: "Distance from 52w high",
    value: fmtPct(data.distanceFrom52wHigh, 1),
    hint: "How much already given back",
  },
];

const RiskMetricGrid = ({ data }: { data: StockRiskAnalytics }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    {METRICS(data).map((m) => (
      <div key={m.label} className="risk-card">
        <p className="text-sm text-gray-500">{m.label}</p>
        <p className="text-2xl font-bold text-gray-100 mt-2">{m.value}</p>
        <p className="text-sm text-gray-500 mt-2">{m.hint}</p>
      </div>
    ))}
  </div>
);

export default RiskMetricGrid;
