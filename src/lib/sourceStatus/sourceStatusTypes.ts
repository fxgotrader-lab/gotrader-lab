export type SourceStatusLevel =
  | "mt5_research_active"
  | "mt5_visual_only"
  | "imported_research"
  | "tradingview_chart"
  | "mock_sample"
  | "unavailable";

export interface SourceStatusAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface SourceStatusHigherTimeframe {
  timeframe: string;
  candleCount: number;
}

/**
 * Shared page-level source status snapshot. Every major page reads this model
 * so source provenance, mock/sample state, and proxy warnings stay consistent.
 */
export interface SourceStatusSnapshot {
  sourceProvider: string;
  sourceStatus: SourceStatusLevel;
  requestedSymbol: string;
  brokerSymbol?: string;
  displayLabel: string;
  primaryTimeframe: string;
  higherTimeframes: string[];
  candleCount: number;
  sourceFingerprint: string;
  lastUpdated?: string;
  isResearchActive: boolean;
  isMockOrSample: boolean;
  isProxyInstrument: boolean;
  warningLabel?: string;
  authority: SourceStatusAuthority;
}

export interface SourceStatusInputs {
  provider: string;
  researchEligible: boolean;
  sourceLabel: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  primaryTimeframe?: string;
  higherTimeframes?: SourceStatusHigherTimeframe[];
  candleCount: number;
  fingerprint?: string;
  lastUpdated?: string;
  warnings?: string[];
}

export const SOURCE_STATUS_AUTHORITY: SourceStatusAuthority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

export const sourceStatusLabel = (status: SourceStatusLevel): string => {
  switch (status) {
    case "mt5_research_active":
      return "MT5 read-only research active";
    case "mt5_visual_only":
      return "MT5 read-only visual only";
    case "imported_research":
      return "Imported historical data active";
    case "tradingview_chart":
      return "TradingView MCP chart feed active";
    case "mock_sample":
      return "Mock/sample data";
    default:
      return "Source unavailable";
  }
};
