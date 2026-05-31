import type { BrokerAccountMode } from "@/lib/brokers";
import { routeBrokerForSymbol } from "@/lib/brokers";
import { mt5ExecutionAdapterPlan, type Mt5RouteAdapterResult } from "@/lib/brokers/mt5/mt5Types";

export const createMt5RouteAdapterResult = ({
  accountMode = "research",
  symbol
}: {
  accountMode?: BrokerAccountMode;
  symbol: string;
}): Mt5RouteAdapterResult => {
  const route = routeBrokerForSymbol({ accountMode, symbol });
  return {
    route,
    adapterStatus: mt5ExecutionAdapterPlan.status,
    executionEnabled: false,
    warnings: [
      ...route.routingWarnings,
      route.broker === "mt5"
        ? "MT5 route is planned only. No MCP bridge, credentials, or orders are enabled."
        : "Symbol does not route to MT5."
    ]
  };
};
