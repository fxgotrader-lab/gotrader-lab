import {
  loadLatestTradingViewEvidence,
  loadTradingViewMcpBridgeStatus
} from "@/lib/integrations/tradingview/tradingViewEvidenceService";
import { loadTradingViewMcpSettings } from "@/lib/integrations/tradingview/tradingViewMcpSettings";
import { loadActiveTradingViewMcpChartFeed } from "@/lib/integrations/tradingview/tradingViewMcpFeedClient";
import type {
  TradingViewMcpChartFeedStatus,
  TradingViewMcpFeedUsageMode,
  TradingViewMcpResearchEligibilityState
} from "@/lib/integrations/tradingview/tradingViewCandleFeedTypes";
import type { TradingViewMcpStatusCheck } from "@/lib/integrations/tradingview/tradingViewMcpBridgeTypes";
import type { TradingViewEvidence } from "@/lib/integrations/tradingview/tradingViewMcpTypes";

export type TradingViewMcpRuntimeBridgeStatus =
  | "disconnected"
  | "connected_analysis_only"
  | "error"
  | "unknown";

export type TradingViewMcpRuntimeUsageMode = "none" | TradingViewMcpFeedUsageMode;

export interface TradingViewMcpRuntimeState {
  bridgeUrl: string;
  bridgeStatus: TradingViewMcpRuntimeBridgeStatus;
  bridgeStatusCheck: TradingViewMcpStatusCheck;
  evidenceAvailable: boolean;
  latestEvidence?: TradingViewEvidence;
  latestEvidenceTimestamp?: string;
  chartBias: TradingViewEvidence["chartBias"] | "unavailable";
  confidence: number;
  chartFeedStatus: TradingViewMcpChartFeedStatus;
  chartFeedAvailable: boolean;
  chartFeedCandleCount: number;
  chartFeedFirstTimestamp?: string;
  chartFeedLastTimestamp?: string;
  chartFeedSymbol?: string;
  chartFeedTimeframe?: string;
  chartFeedLatestPrice?: number;
  usageMode: TradingViewMcpRuntimeUsageMode;
  researchEligibility: TradingViewMcpResearchEligibilityState | "ineligible_disconnected";
  eligibilityReasons: string[];
  sourceWarnings: string[];
  symbolMatch: boolean;
  timeframeMatch: boolean;
  activeForChart: boolean;
  activeForResearch: boolean;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
}

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const feedImpliesConnected = (status?: TradingViewMcpChartFeedStatus) =>
  status === "connected_with_candles" || status === "connected_no_candles";

const resolveBridgeStatus = ({
  evidence,
  statusCheck,
  chartFeedConnected
}: {
  evidence?: TradingViewEvidence;
  statusCheck: TradingViewMcpStatusCheck;
  chartFeedConnected: boolean;
}): TradingViewMcpRuntimeBridgeStatus => {
  if (
    statusCheck.connectionStatus === "connected_analysis_only" ||
    evidence?.connectionStatus === "connected_analysis_only" ||
    chartFeedConnected
  ) {
    return "connected_analysis_only";
  }
  if (statusCheck.connectionStatus === "error") {
    return "error";
  }
  if (!statusCheck.checkedAt) {
    return "unknown";
  }
  return "disconnected";
};

const bridgeStatusCheckFor = (
  statusCheck: TradingViewMcpStatusCheck,
  bridgeStatus: TradingViewMcpRuntimeBridgeStatus,
  evidenceAvailable: boolean,
  chartFeedAvailable: boolean
): TradingViewMcpStatusCheck => {
  if (bridgeStatus === "connected_analysis_only" && statusCheck.connectionStatus !== "connected_analysis_only") {
    return {
      ...statusCheck,
      connectionStatus: "connected_analysis_only",
      analysisAvailable: true,
      evidenceAvailable,
      message: chartFeedAvailable
        ? "TradingView MCP bridge is connected through the read-only candle feed. Evidence may still need to be fetched."
        : "TradingView MCP bridge is connected for read-only chart evidence.",
      warnings: [
        "TradingView MCP is analysis-only and not broker truth.",
        ...statusCheck.warnings.filter((warning) => !warning.toLowerCase().includes("not connected"))
      ],
      ...authority
    };
  }

  return {
    ...statusCheck,
    evidenceAvailable,
    ...authority
  };
};

export const resolveTradingViewMcpRuntimeState = (): TradingViewMcpRuntimeState => {
  const settings = loadTradingViewMcpSettings();
  const statusCheck = loadTradingViewMcpBridgeStatus();
  const latestEvidence = loadLatestTradingViewEvidence();
  const chartFeed = loadActiveTradingViewMcpChartFeed();
  const chartFeedCandleCount = chartFeed?.candleCount ?? 0;
  const chartFeedConnected = Boolean(
    chartFeed?.activeForChart || chartFeedCandleCount > 0 || feedImpliesConnected(chartFeed?.connectionStatus)
  );
  const bridgeStatus = resolveBridgeStatus({
    evidence: latestEvidence,
    statusCheck,
    chartFeedConnected
  });
  const evidenceAvailable = Boolean(latestEvidence) && bridgeStatus === "connected_analysis_only";
  const chartFeedAvailable = Boolean(chartFeed?.activeForChart && chartFeedCandleCount > 0);
  const bridgeStatusCheck = bridgeStatusCheckFor(statusCheck, bridgeStatus, evidenceAvailable, chartFeedAvailable);
  const eligibility = chartFeed?.researchEligibility;
  const sourceWarnings = [
    ...bridgeStatusCheck.warnings,
    ...(latestEvidence?.warnings ?? []),
    ...(chartFeed?.warnings ?? []),
    ...(chartFeedAvailable && !chartFeed?.activeForResearch
      ? ["TradingView MCP candles are visual-only and not used for research."]
      : []),
    ...(bridgeStatus === "connected_analysis_only" && !latestEvidence
      ? ["TradingView MCP bridge/feed is connected, but chart evidence has not been fetched in this browser session."]
      : [])
  ].filter((warning, index, warnings): warning is string => Boolean(warning) && warnings.indexOf(warning) === index);

  return {
    bridgeUrl: settings.bridgeUrl,
    bridgeStatus,
    bridgeStatusCheck,
    evidenceAvailable,
    latestEvidence,
    latestEvidenceTimestamp: latestEvidence?.timestamp,
    chartBias: latestEvidence?.chartBias ?? "unavailable",
    confidence: latestEvidence?.confidence ?? 0,
    chartFeedStatus: chartFeed?.connectionStatus ?? "disconnected",
    chartFeedAvailable,
    chartFeedCandleCount,
    chartFeedFirstTimestamp: chartFeed?.firstTimestamp,
    chartFeedLastTimestamp: chartFeed?.lastTimestamp,
    chartFeedSymbol: chartFeed?.providerSymbol ?? chartFeed?.symbol,
    chartFeedTimeframe: chartFeed?.timeframe,
    chartFeedLatestPrice: chartFeed?.latestClose,
    usageMode: chartFeed?.usageMode ?? "none",
    researchEligibility: eligibility?.state ?? "ineligible_disconnected",
    eligibilityReasons: eligibility?.reasons ?? ["TradingView MCP chart feed is not active."],
    sourceWarnings,
    symbolMatch: Boolean(eligibility?.symbolMatch),
    timeframeMatch: Boolean(eligibility?.timeframeMatch),
    activeForChart: Boolean(chartFeed?.activeForChart),
    activeForResearch: Boolean(chartFeed?.activeForResearch),
    authority
  };
};
