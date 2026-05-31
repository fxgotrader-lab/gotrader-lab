import type { BrokerRiskDecision, BrokerStrategyCandidate, ExecutionIntent, ExecutionResult } from "@/lib/brokers";
import { createBlockedExecutionIntent, createBlockedExecutionResult } from "@/lib/brokers";
import { createMt5RouteAdapterResult } from "@/lib/brokers/mt5/mt5RouteAdapter";

export const createMt5DryRunIntent = ({
  candidate,
  riskDecision
}: {
  candidate: BrokerStrategyCandidate;
  riskDecision: BrokerRiskDecision;
}): { intent: ExecutionIntent; result: ExecutionResult; warnings: string[] } => {
  const routeResult = createMt5RouteAdapterResult({ accountMode: "research", symbol: candidate.symbol });
  const intent = createBlockedExecutionIntent({
    candidate,
    riskDecision,
    route: routeResult.route,
    reason: "MT5 dry-run is planned but disabled in Phase 1 research mode."
  });
  return {
    intent,
    result: createBlockedExecutionResult({
      broker: "mt5",
      intent,
      reason: "No MT5 MCP/local bridge call was made."
    }),
    warnings: routeResult.warnings
  };
};
