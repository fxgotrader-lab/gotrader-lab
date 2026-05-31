import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";

export type TradingViewMcpChartFeedStatus =
  | "disconnected"
  | "connected_no_candles"
  | "connected_with_candles"
  | "error";

export type TradingViewMcpSymbolMatchState =
  | "exact_match"
  | "equivalent_symbol"
  | "symbol_mismatch"
  | "timeframe_mismatch"
  | "unavailable";

export type TradingViewMcpResearchEligibilityState =
  | "visual_only"
  | "eligible_for_analysis"
  | "eligible_for_research_cycle"
  | "ineligible_symbol_mismatch"
  | "ineligible_timeframe_mismatch"
  | "ineligible_low_candle_count"
  | "ineligible_disconnected";

export type TradingViewMcpFeedUsageMode = "chart_only" | "research_source";
export type TradingViewMcpFeedStorageBackend = "indexeddb" | "session" | "metadata_only";

export interface TradingViewMcpResearchEligibility {
  state: TradingViewMcpResearchEligibilityState;
  reasons: string[];
  visualEligible: boolean;
  quickAnalysisEligible: boolean;
  researchCycleEligible: boolean;
  symbolMatch: boolean;
  timeframeMatch: boolean;
  monotonicTimestamps: boolean;
  candleCount: number;
  minimumVisualCandles: number;
  minimumQuickAnalysisCandles: number;
  minimumResearchCycleCandles: number;
}

export interface TradingViewMcpFeedAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface TradingViewMcpFeedCandle {
  id: string;
  time: number;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  source: "tradingview_mcp";
  symbol: string;
  timeframe: string;
}

export interface TradingViewMcpQuoteResponse extends TradingViewMcpFeedAuthority {
  provider: "tradingview_mcp";
  symbol: string;
  requestedSymbol: string;
  chartSymbol?: string;
  chartResolution?: string;
  timeframe: string;
  latestPrice?: number;
  bid?: number;
  ask?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  timestamp?: string;
  connectionStatus: "connected" | "degraded" | "disconnected" | "error";
  sourceCommand?: string;
  warnings: string[];
  missingEvidence: string[];
  mode: "read_only_chart_data";
}

export interface TradingViewMcpCandlesResponse extends TradingViewMcpFeedAuthority {
  provider: "tradingview_mcp";
  symbol: string;
  requestedSymbol: string;
  chartSymbol?: string;
  chartResolution?: string;
  timeframe: string;
  requestedTimeframe: string;
  candles: TradingViewMcpFeedCandle[];
  candleCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  sourceCommand?: string;
  connectionStatus: TradingViewMcpChartFeedStatus;
  warnings: string[];
  missingEvidence: string[];
  mode: "read_only_chart_data";
}

export interface TradingViewMcpSnapshotResponse extends TradingViewMcpFeedAuthority {
  status?: string;
  quote: TradingViewMcpQuoteResponse;
  candles: TradingViewMcpCandlesResponse;
  evidence?: unknown;
  marketSnapshot?: unknown;
  mode: "read_only_chart_data";
}

export interface ActiveTradingViewMcpChartFeed extends TradingViewMcpFeedAuthority {
  feedId: string;
  provider: "tradingview_mcp";
  dataMode: "tradingview_mcp_chart";
  activeForChart: boolean;
  symbol: string;
  requestedSymbol: string;
  providerSymbol: string;
  chartSymbol?: string;
  timeframe: string;
  requestedTimeframe: string;
  chartResolution?: string;
  candles: TradingViewMcpFeedCandle[];
  candleCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  latestClose?: number;
  connectionStatus: TradingViewMcpChartFeedStatus;
  usageMode: TradingViewMcpFeedUsageMode;
  researchEligibility: TradingViewMcpResearchEligibility;
  activeForResearch: boolean;
  sourceLabel: string;
  sourceCommand?: string;
  matchState: TradingViewMcpSymbolMatchState;
  matchReason: string;
  firstClose?: number;
  lastClose?: number;
  fetchedAt: string;
  storageBackend: TradingViewMcpFeedStorageBackend;
  candlesPersisted: boolean;
  storageWarnings: string[];
  warnings: string[];
  missingEvidence: string[];
  storedAt: string;
}

export type TradingViewMcpChartFeedMetadata = Omit<ActiveTradingViewMcpChartFeed, "candles"> & {
  candles?: never;
};

export interface TradingViewMcpChartFeedRecord {
  feedId: string;
  metadata: TradingViewMcpChartFeedMetadata;
  candles: TradingViewMcpFeedCandle[];
  fetchedAt: string;
}

export interface TradingViewMcpFeedRequest {
  symbol: string;
  timeframe: string;
  limit?: number;
}

export type TradingViewCompatibleCandle = Candle & {
  sourceProvider?: "tradingview_mcp";
  providerSymbol?: string;
};

export const TRADINGVIEW_MCP_CHART_FEED_STORAGE_KEY = "gotrader-ai-lab-tradingview-mcp-chart-feed";
export const TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT = "gotrader-ai-lab-tradingview-mcp-chart-feed-updated";

export const tradingViewMcpFuturesFallbackSymbol: FuturesSymbol = "MNQ";
export const tradingViewMcpFallbackTimeframe: Timeframe = "5m";
