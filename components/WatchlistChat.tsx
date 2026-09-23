"use client";

import { CopilotKit, useCoAgent, useCopilotReadable } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

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
    <CopilotKit runtimeUrl="/api/copilotkit" agent="crewaiAgent">
      <ChatInner symbols={symbols} />
    </CopilotKit>
  );
}