import type { BrokerRoute } from "@/lib/brokers";

export type TradovateAdapterStatus = "planned_disabled";

export interface TradovateExecutionAdapterPlan {
  adapterId: "tradovate_execution_adapter_plan";
  status: TradovateAdapterStatus;
  supportedAssetClasses: Array<"futures">;
  supportedTransportLater: Array<"rest" | "websocket" | "local_bridge">;
  credentialsLocation: "server_side_only";
  frontendCredentialsAllowed: false;
  liveTradingAllowed: false;
  orderPlacementAllowed: false;
  authorityNotice: string;
}

export interface TradovateRouteAdapterResult {
  route: BrokerRoute;
  adapterStatus: TradovateAdapterStatus;
  executionEnabled: false;
  warnings: string[];
}

export const tradovateExecutionAdapterPlan: TradovateExecutionAdapterPlan = {
  adapterId: "tradovate_execution_adapter_plan",
  status: "planned_disabled",
  supportedAssetClasses: ["futures"],
  supportedTransportLater: ["rest", "websocket", "local_bridge"],
  credentialsLocation: "server_side_only",
  frontendCredentialsAllowed: false,
  liveTradingAllowed: false,
  orderPlacementAllowed: false,
  authorityNotice:
    "Tradovate is a future futures execution adapter only. It cannot bypass GoTrader risk or execute in Phase 1."
};
