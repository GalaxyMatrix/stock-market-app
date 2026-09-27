"use client";

import {
  CopilotKit,
  useCoAgent,
  useCopilotAction,
  useCopilotReadable,
} from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import InvestmentAnalysisCard, {
  parseInvestmentSummary,
} from "@/components/InvestmentAnalysisCard";

function ChatInner({ symbols }: { symbols: string[] }) {
  useCoAgent({
    name: "crewaiAgent",
    initialState: {
      available_cash: 10_000 * Math.max(symbols.length, 1),
      investment_summary: {},
      investment_portfolio: symbols.map((ticker) => ({
        ticker,
        amount: 10_000,
      })),
    },
  });

  useCopilotReadable({
    description: "Stocks on the user's watchlist",
    value: symbols.join(", "),
  });

  useCopilotAction({
    name: "render_standard_charts_and_table",
    description: "Display portfolio performance charts and a holdings table.",
    followUp: false,
    parameters: [
      {
        name: "investment_summary",
        type: "object",
        description: "Holdings, returns, cash, and performance series.",
      },
    ],
    handler: async () => "Rendered investment summary",
    render: ({ args }) => {
      const summary = parseInvestmentSummary(args.investment_summary);
      if (!summary) {
        return (
          <p className="text-sm text-muted-foreground">Building analysis…</p>
        );
      }
      return <InvestmentAnalysisCard summary={summary} />;
    },
  });

  return (
    <CopilotSidebar
      defaultOpen={false}
      labels={{
        title: "Portfolio agent",
        initial: `I can analyze your watchlist: ${symbols.join(", ")}. Try "Analyze my watchlist with $10k each since last year".`,
      }}
    />
  );
}

export default function WatchlistChat({ symbols }: { symbols: string[] }) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="crewaiAgent"
      useSingleEndpoint
      showDevConsole={false}
    >
      <ChatInner symbols={symbols} />
    </CopilotKit>
  );
}