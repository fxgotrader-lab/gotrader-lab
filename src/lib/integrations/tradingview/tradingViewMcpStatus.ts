import { createReadOnlyAdapterStatus } from "@/lib/marketData";
import type { ReadOnlyMarketDataAdapterStatus } from "@/lib/marketData";
import { tradingViewMcpAdapterPlan } from "@/lib/integrations/tradingview/tradingViewAuthorityPolicy";
import {
  loadLatestTradingViewEvidence,
  loadTradingViewMcpBridgeStatus
} from "@/lib/integrations/tradingview/tradingViewEvidenceService";
import { loadTradingViewMcpSettings } from "@/lib/integrations/tradingview/tradingViewMcpSettings";
import { loadActiveTradingViewMcpChartFeed } from "@/lib/integrations/tradingview/tradingViewMcpFeedClient";
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
  const settings = loadTradingViewMcpSettings();
  const bridgeStatus = loadTradingViewMcpBridgeStatus();
  const latestEvidence = loadLatestTradingViewEvidence();
  const chartFeed = loadActiveTradingViewMcpChartFeed();
  const connected = bridgeStatus.connectionStatus === "connected_analysis_only";
  return {
    adapterStatus: connected ? "connected_analysis_only" : tradingViewMcpAdapterPlan.status,
    analysisAvailable: connected,
    liveFeedAvailable: false,
    readOnlyDataStatus: createReadOnlyAdapterStatus({
      provider: "tradingview_mcp",
      warning: connected
        ? "TradingView MCP is connected for read-only chart evidence. It is not a live broker feed."
        : "TradingView MCP is not connected. It is currently a planned chart-analysis adapter, not a live feed."
    }),
    bridgeUrl: settings.bridgeUrl,
    bridgeStatus,
    latestEvidence,
    latestEvidenceTimestamp: latestEvidence?.timestamp,
    evidenceAvailable: Boolean(latestEvidence) && connected,
    chartFeedAvailable: Boolean(chartFeed?.activeForChart && chartFeed.candleCount > 0),
    chartFeedCandleCount: chartFeed?.candleCount ?? 0,
    chartFeedStatus: chartFeed?.connectionStatus ?? "not_active",
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  };
};
