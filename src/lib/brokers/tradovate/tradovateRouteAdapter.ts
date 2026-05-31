import type { BrokerAccountMode } from "@/lib/brokers";
import { routeBrokerForSymbol } from "@/lib/brokers";
import {
  tradovateExecutionAdapterPlan,
  type TradovateRouteAdapterResult
} from "@/lib/brokers/tradovate/tradovateTypes";

export const createTradovateRouteAdapterResult = ({
  accountMode = "research",
  symbol
}: {
  accountMode?: BrokerAccountMode;
  symbol: string;
}): TradovateRouteAdapterResult => {
  const route = routeBrokerForSymbol({ accountMode, symbol });
  return {
    route,
    adapterStatus: tradovateExecutionAdapterPlan.status,
    executionEnabled: false,
    warnings: [
      ...route.routingWarnings,
      route.broker === "tradovate"
        ? "Tradovate route is planned only. No credentials, websocket feed, or orders are enabled."
        : "Symbol does not route to Tradovate."
    ]
  };
};
