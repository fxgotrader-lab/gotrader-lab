import type { BrokerRoute } from "@/lib/brokers";

export type Mt5AdapterStatus = "planned_disabled";

export interface Mt5ExecutionAdapterPlan {
  adapterId: "mt5_execution_adapter_plan";
  status: Mt5AdapterStatus;
  supportedAssetClasses: Array<"forex" | "cfd">;
  supportedTransportLater: Array<"mcp" | "local_bridge" | "rest" | "websocket_quotes">;
  credentialsLocation: "server_side_only";
  frontendCredentialsAllowed: false;
  liveTradingAllowed: false;
  orderPlacementAllowed: false;
  authorityNotice: string;
}

export interface Mt5RouteAdapterResult {
  route: BrokerRoute;
  adapterStatus: Mt5AdapterStatus;
  executionEnabled: false;
  warnings: string[];
}

export const mt5ExecutionAdapterPlan: Mt5ExecutionAdapterPlan = {
  adapterId: "mt5_execution_adapter_plan",
  status: "planned_disabled",
  supportedAssetClasses: ["forex", "cfd"],
  supportedTransportLater: ["mcp", "local_bridge", "rest", "websocket_quotes"],
  credentialsLocation: "server_side_only",
  frontendCredentialsAllowed: false,
  liveTradingAllowed: false,
  orderPlacementAllowed: false,
  authorityNotice: "MT5 is a future forex/CFD execution adapter only. It cannot bypass GoTrader risk or execute in Phase 1."
};
