import type { AgentBridgeCandle, AgentBridgeQuote } from "@/lib/agentBridge";
import type { CanonicalCandleSource } from "@/lib/candleSources";

export type Mt5ReadOnlyConnectionStatus = "disconnected" | "planned" | "connected" | "degraded" | "error";
export type Mt5ReadOnlyDepthStatus =
  | "full"
  | "partial"
  | "capped_by_provider"
  | "insufficient_history"
  | "disconnected"
  | "error";
export type Mt5ReadOnlyFeedUsageMode = "chart_only" | "research_source";
export type Mt5ReadOnlyFeedStorageBackend = "indexeddb" | "session" | "metadata_only";
export type Mt5ReadOnlyResearchEligibilityState =
  | "visual_only"
  | "eligible_for_analysis"
  | "eligible_for_research_cycle"
  | "ineligible_symbol_mismatch"
  | "ineligible_timeframe_mismatch"
  | "ineligible_low_candle_count"
  | "ineligible_disconnected"
  | "invalid_candles";

export interface Mt5ReadOnlyAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface Mt5ReadOnlyStatus extends Mt5ReadOnlyAuthority {
  provider: "mt5_read_only";
  connectionStatus: Mt5ReadOnlyConnectionStatus;
  endpoint?: string;
  message: string;
  warnings: string[];
  lastCheckedAt?: string;
}

export interface Mt5ReadOnlySettings {
  bridgeUrl: string;
  enabled: boolean;
  requestedSymbol?: string;
  brokerSymbolOverride?: string;
  displayLabel?: string;
  timeframe?: string;
  higherTimeframes?: string[];
  candleLimit?: number;
}

export interface Mt5ReadOnlySymbolInfo extends Mt5ReadOnlyAuthority {
  symbol: string;
  normalizedSymbol: string;
  digits?: number;
  point?: number;
  tradeMode?: "read_only" | "unknown";
  missingEvidence: string[];
}

export interface Mt5ReadOnlyQuote extends Mt5ReadOnlyAuthority {
  provider: "mt5_read_only";
  symbol: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  bid?: number;
  ask?: number;
  mid?: number;
  spread?: number;
  timestamp?: string;
  connectionStatus: Mt5ReadOnlyConnectionStatus;
  warnings: string[];
  missingEvidence: string[];
}

export interface Mt5ReadOnlyQuoteResult extends Mt5ReadOnlyAuthority {
  quote: AgentBridgeQuote | Mt5ReadOnlyQuote | null;
  status: Mt5ReadOnlyStatus;
}

export interface Mt5ReadOnlyCandle {
  id: string;
  time: number;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  tickVolume?: number;
  spread?: number;
  source: "mt5_read_only";
  symbol: string;
  timeframe: string;
}

export interface Mt5ReadOnlyCandlesResponse extends Mt5ReadOnlyAuthority {
  provider: "mt5_read_only";
  symbol: string;
  requestedSymbol: string;
  brokerSymbol?: string;
  timeframe: string;
  requestedTimeframe: string;
  requestedLimit: number;
  returnedCount: number;
  candles: Mt5ReadOnlyCandle[];
  firstTimestamp?: string;
  lastTimestamp?: string;
  sourceMethod?: string;
  connectionStatus: Mt5ReadOnlyConnectionStatus;
  depthStatus: Mt5ReadOnlyDepthStatus;
  warnings: string[];
  missingEvidence: string[];
}

export interface Mt5ReadOnlySnapshotResponse extends Mt5ReadOnlyAuthority {
  quote: Mt5ReadOnlyQuote;
  candles: Mt5ReadOnlyCandlesResponse;
  status?: Mt5ReadOnlyStatus;
}

export interface Mt5ReadOnlyResearchEligibility {
  state: Mt5ReadOnlyResearchEligibilityState;
  reasons: string[];
  visualEligible: boolean;
  quickAnalysisEligible: boolean;
  researchCycleEligible: boolean;
  walkForwardEligible: boolean;
  symbolMatch: boolean;
  timeframeMatch: boolean;
  monotonicTimestamps: boolean;
  candleCount: number;
  minimumVisualCandles: number;
  minimumQuickAnalysisCandles: number;
  minimumResearchCycleCandles: number;
  minimumWalkForwardCandles: number;
}

export interface ActiveMt5ReadOnlyCandleFeed extends Mt5ReadOnlyAuthority {
  feedId: string;
  provider: "mt5_read_only";
  dataMode: "mt5_read_only";
  activeForChart: boolean;
  activeForResearch: boolean;
  symbol: string;
  requestedSymbol: string;
  brokerSymbol?: string;
  timeframe: string;
  requestedTimeframe: string;
  candles: Mt5ReadOnlyCandle[];
  candleCount: number;
  requestedLimit: number;
  returnedCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  latestClose?: number;
  latestQuote?: Mt5ReadOnlyQuote;
  spread?: number;
  connectionStatus: Mt5ReadOnlyConnectionStatus;
  depthStatus: Mt5ReadOnlyDepthStatus;
  usageMode: Mt5ReadOnlyFeedUsageMode;
  researchEligibility: Mt5ReadOnlyResearchEligibility;
  sourceLabel: string;
  sourceMethod?: string;
  matchState: "exact_match" | "equivalent_symbol" | "symbol_mismatch" | "timeframe_mismatch" | "unavailable";
  matchReason: string;
  firstClose?: number;
  lastClose?: number;
  candleFingerprint?: string;
  fetchedAt: string;
  storedAt: string;
  storageBackend: Mt5ReadOnlyFeedStorageBackend;
  candlesPersisted: boolean;
  storageWarnings: string[];
  warnings: string[];
  missingEvidence: string[];
}

export type Mt5ReadOnlyCandleFeedMetadata = Omit<ActiveMt5ReadOnlyCandleFeed, "candles"> & {
  candles?: never;
};

export interface Mt5ReadOnlyCandleFeedRecord {
  feedId: string;
  metadata: Mt5ReadOnlyCandleFeedMetadata;
  candles: Mt5ReadOnlyCandle[];
  fetchedAt: string;
}

export interface Mt5ReadOnlyCandlesResult extends Mt5ReadOnlyAuthority {
  candles: AgentBridgeCandle[] | Mt5ReadOnlyCandle[];
  canonicalSource?: CanonicalCandleSource;
  status: Mt5ReadOnlyStatus;
}

export interface Mt5ReadOnlyRuntimeState extends Mt5ReadOnlyAuthority {
  bridgeUrl: string;
  connectionStatus: Mt5ReadOnlyConnectionStatus;
  wrapperRunning: boolean;
  message: string;
  latestQuote?: Mt5ReadOnlyQuote;
  latestQuoteTimestamp?: string;
  spread?: number;
  candleFeedAvailable: boolean;
  candleCount: number;
  requestedLimit?: number;
  returnedCount?: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  feedSymbol?: string;
  brokerSymbol?: string;
  timeframe?: string;
  latestPrice?: number;
  depthStatus?: Mt5ReadOnlyDepthStatus;
  storageBackend?: string;
  candlesPersisted: boolean;
  feedId?: string;
  usageMode: "none" | Mt5ReadOnlyFeedUsageMode;
  researchEligibility: Mt5ReadOnlyResearchEligibilityState | "ineligible_disconnected";
  eligibilityReasons: string[];
  displayLabel?: string;
  higherTimeframes?: string[];
  higherTimeframeSources?: Array<{
    provider: "mt5_read_only";
    requestedSymbol: string;
    brokerSymbol?: string;
    timeframe: string;
    candleCount: number;
    firstTimestamp?: string;
    lastTimestamp?: string;
    lastClose?: number;
    fingerprint?: string;
    eligibilityState: string;
    storageBackend?: string;
    fetchedAt?: string;
    warning?: string;
  }>;
  sourceWarnings: string[];
  symbolMatch: boolean;
  timeframeMatch: boolean;
  activeForChart: boolean;
  activeForResearch: boolean;
  lastCheckedAt?: string;
}

export interface Mt5ReadOnlyAdapter {
  getStatus: () => Promise<Mt5ReadOnlyStatus>;
  getQuote: (symbol: string) => Promise<Mt5ReadOnlyQuoteResult>;
  getCandles: (symbol: string, timeframe: string, limit: number) => Promise<Mt5ReadOnlyCandlesResult>;
  getSymbolInfo: (symbol: string) => Promise<Mt5ReadOnlySymbolInfo>;
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}
