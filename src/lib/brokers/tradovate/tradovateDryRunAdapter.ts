import type { BrokerRiskDecision, BrokerStrategyCandidate, ExecutionIntent, ExecutionResult } from "@/lib/brokers";
import { createBlockedExecutionIntent, createBlockedExecutionResult } from "@/lib/brokers";
import { createTradovateRouteAdapterResult } from "@/lib/brokers/tradovate/tradovateRouteAdapter";

export const createTradovateDryRunIntent = ({
  candidate,
  riskDecision
}: {
  candidate: BrokerStrategyCandidate;
  riskDecision: BrokerRiskDecision;
}): { intent: ExecutionIntent; result: ExecutionResult; warnings: string[] } => {
  const routeResult = createTradovateRouteAdapterResult({ accountMode: "research", symbol: candidate.symbol });
  const intent = createBlockedExecutionIntent({
    candidate,
    riskDecision,
    route: routeResult.route,
    reason: "Tradovate dry-run is planned but disabled in Phase 1 research mode."
  });
  return {
    intent,
    result: createBlockedExecutionResult({
      broker: "tradovate",
      intent,
      reason: "No Tradovate API or websocket call was made."
    }),
    warnings: routeResult.warnings
  };
};
