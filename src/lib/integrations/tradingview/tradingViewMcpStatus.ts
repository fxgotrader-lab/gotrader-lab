import { createReadOnlyAdapterStatus } from "@/lib/marketData";
import type { ReadOnlyMarketDataAdapterStatus } from "@/lib/marketData";
import { tradingViewMcpAdapterPlan } from "@/lib/integrations/tradingview/tradingViewAuthorityPolicy";
import { resolveTradingViewMcpRuntimeState } from "@/lib/integrations/tradingview/tradingViewMcpRuntimeState";
import type { TradingViewMcpStatusCheck } from "@/lib/integrations/tradingview/tradingViewMcpBridgeTypes";
import type { TradingViewEvidence, TradingViewMcpConnectionStatus } from "@/lib/integrations/tradingview/tradingViewMcpTypes";

export interface TradingViewMcpStatus {
  adapterStatus: TradingViewMcpConnectionStatus;
  analysisAvailable: boolean;
  liveFeedAvailable: boolean;
  readOnlyDataStatus: ReadOnlyMarketDataAdapterStatus;
  bridgeUrl: string;
  bridgeStatus: TradingViewMcpStatusCheck;
  latestEvidence?: TradingViewEvidence;
  latestEvidenceTimestamp?: string;
  evidenceAvailable: boolean;
  chartFeedAvailable: boolean;
  chartFeedCandleCount: number;
  chartFeedStatus: string;
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export const resolveTradingViewMcpStatus = (): TradingViewMcpStatus => {
  const runtime = resolveTradingViewMcpRuntimeState();
  const connected = runtime.bridgeStatus === "connected_analysis_only";
  const adapterStatus: TradingViewMcpConnectionStatus = connected
    ? "connected_analysis_only"
    : runtime.bridgeStatus === "error"
      ? "error"
      : tradingViewMcpAdapterPlan.status;
  return {
    adapterStatus,
    analysisAvailable: connected,
    liveFeedAvailable: false,
    readOnlyDataStatus: createReadOnlyAdapterStatus({
      provider: "tradingview_mcp",
      warning: connected
        ? "TradingView MCP is connected for read-only chart evidence. It is not a live broker feed."
        : "TradingView MCP is not connected. It is currently a planned chart-analysis adapter, not a live feed."
    }),
    bridgeUrl: runtime.bridgeUrl,
    bridgeStatus: runtime.bridgeStatusCheck,
    latestEvidence: runtime.latestEvidence,
    latestEvidenceTimestamp: runtime.latestEvidenceTimestamp,
    evidenceAvailable: runtime.evidenceAvailable,
    chartFeedAvailable: runtime.chartFeedAvailable,
    chartFeedCandleCount: runtime.chartFeedCandleCount,
    chartFeedStatus: runtime.chartFeedStatus,
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  };
};
