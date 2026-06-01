import type { Candle } from "@/lib/types";

export type CanonicalCandleProvider =
  | "imported_historical"
  | "tradingview_mcp"
  | "mt5_read_only"
  | "tradovate_read_only"
  | "mock"
  | "replay";

export type CanonicalCandleStorageBackend = "indexeddb" | "session" | "memory" | "local_file" | "mock";
export type CanonicalCandleDataQuality = "sufficient" | "limited" | "insufficient" | "invalid";
export type CanonicalCandleSourceRole = "chart_display" | "research" | "walk_forward" | "available";

export interface CanonicalCandleAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface CanonicalCandleEligibility {
  chartDisplay: boolean;
  quickAnalysis: boolean;
  researchCycle: boolean;
  walkForward: boolean;
}

export interface CanonicalCandleProvenance {
  sourceLabel: string;
  providerSymbol?: string;
  importedAt?: string;
  fetchedAt?: string;
  generatedAt: string;
  sourceCommand?: string;
  sourceVersion?: string;
}

export interface CanonicalCandleSource {
  sourceId: string;
  provider: CanonicalCandleProvider;
  symbol: string;
  normalizedSymbol: string;
  timeframe: string;
  candles: Candle[];
  candleCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  firstClose?: number;
  lastClose?: number;
  storageBackend: CanonicalCandleStorageBackend;
  dataQuality: CanonicalCandleDataQuality;
  eligibility: CanonicalCandleEligibility;
  eligibilityReasons: string[];
  warnings: string[];
  provenance: CanonicalCandleProvenance;
  authority: CanonicalCandleAuthority;
  fingerprint: string;
  roles: CanonicalCandleSourceRole[];
  lastUpdatedAt?: string;
}

export type CanonicalCandleSourceSummary = Omit<CanonicalCandleSource, "candles"> & {
  candles?: never;
};

export interface CanonicalCandleSourceManagerState {
  activeChartSource: CanonicalCandleSourceSummary;
  activeResearchSource: CanonicalCandleSourceSummary;
  activeWalkForwardSource: CanonicalCandleSourceSummary;
  allAvailableSources: CanonicalCandleSourceSummary[];
  warnings: string[];
  generatedAt: string;
}

export const canonicalNoAuthority: CanonicalCandleAuthority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};
