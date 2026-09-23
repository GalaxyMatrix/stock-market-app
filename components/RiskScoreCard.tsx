const COLORS: Record<string, string> = {
  Low: "#22c55e",
  Medium: "#eab308",
  High: "#ef4444",
};

const RiskScoreCard = ({ data }: { data: StockRiskAnalytics }) => {
  const score = data.riskScore ?? 0;
  const color = COLORS[data.riskLabel ?? ""] ?? "#6b7280";

  return (
    <div className="risk-card flex flex-col items-center justify-center text-center">
      <div
        className="risk-gauge"
        style={{
          background: `conic-gradient(${color} ${score * 3.6}deg, #374151 0deg)`,
        }}
      >
        <div className="risk-gauge-inner">
          <span className="text-3xl font-bold text-gray-100">
            {data.riskScore ?? "—"}
          </span>
          <span className="text-xs text-gray-500">/ 100</span>
        </div>
      </div>
      <p className="mt-4 text-xl font-semibold" style={{ color }}>
        {data.riskLabel ?? "Unscored"} risk
      </p>
      {data.limited && (
        <p className="text-sm text-gray-500 mt-2">
          Insufficient history for a full score
        </p>
      )}
    </div>
  );
};

export default RiskScoreCard;
