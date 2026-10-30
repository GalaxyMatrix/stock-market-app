const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const toPath = (series: number[], toX: (i: number) => number, toY: (p: number) => number) =>
  series
    .map((price, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(price)}`)
    .join(" ");

const MonteCarloCard = ({ data }: { data: StockRiskAnalytics }) => {
  const mc = data.monteCarlo;
  if (!mc || mc.p5.length === 0) {
    return (
      <div className="risk-card">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">
          1-year Monte Carlo
        </h2>
        <p className="text-gray-400">
          Not enough history, or the simulation service is unavailable.
        </p>
      </div>
    );
  }

  const width = 640;
  const height = 200;
  const pad = 12;
  const max = Math.max(...mc.p95);
  const min = Math.min(...mc.p5);
  const span = max - min || 1;
  const last = Math.max(mc.p50.length - 1, 1);
  const toX = (i: number) => pad + (i / last) * (width - pad * 2);
  const toY = (price: number) =>
    height - pad - ((price - min) / span) * (height - pad * 2);
  const band =
    `${toPath(mc.p95, toX, toY)} ` +
    [...mc.p5]
      .reverse()
      .map((price, i) => `L ${toX(mc.p5.length - 1 - i)} ${toY(price)}`)
      .join(" ") +
    " Z";

  return (
    <div className="risk-card">
      <h2 className="text-lg font-semibold text-gray-100 mb-2">
        1-year Monte Carlo
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        {mc.paths.toLocaleString()} paths of {mc.horizonDays} trading days from
        past daily moves. Not a forecast.
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-52">
        <path d={band} fill="#FDD458" fillOpacity="0.15" />
        <path
          d={toPath(mc.p50, toX, toY)}
          fill="none"
          stroke="#FDD458"
          strokeWidth="2"
        />
      </svg>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <div>
          <p className="text-sm text-gray-500">5th percentile</p>
          <p className="text-xl font-bold text-gray-100">
            {fmtMoney(mc.endPriceP5)}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Median</p>
          <p className="text-xl font-bold text-gray-100">
            {fmtMoney(mc.endPriceP50)}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500">95th percentile</p>
          <p className="text-xl font-bold text-gray-100">
            {fmtMoney(mc.endPriceP95)}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Chance of a loss</p>
          <p className="text-xl font-bold text-gray-100">
            {(mc.probabilityOfLoss * 100).toFixed(0)}%
          </p>
        </div>
      </div>
    </div>
  );
};

export default MonteCarloCard;
