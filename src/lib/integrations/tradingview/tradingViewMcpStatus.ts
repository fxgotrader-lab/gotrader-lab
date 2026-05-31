import { createReadOnlyAdapterStatus } from "@/lib/marketData";
import type { ReadOnlyMarketDataAdapterStatus } from "@/lib/marketData";
import { tradingViewMcpAdapterPlan } from "@/lib/integrations/tradingview/tradingViewAuthorityPolicy";

export interface TradingViewMcpStatus {
  adapterStatus: typeof tradingViewMcpAdapterPlan.status;
  analysisAvailable: boolean;
  liveFeedAvailable: boolean;
  readOnlyDataStatus: ReadOnlyMarketDataAdapterStatus;
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export const resolveTradingViewMcpStatus = (): TradingViewMcpStatus => ({
  adapterStatus: tradingViewMcpAdapterPlan.status,
  analysisAvailable: false,
  liveFeedAvailable: false,
  readOnlyDataStatus: createReadOnlyAdapterStatus({
    provider: "tradingview_mcp",
    warning: "TradingView MCP is not connected. It is currently a planned chart-analysis adapter, not a live feed."
  }),
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
});
