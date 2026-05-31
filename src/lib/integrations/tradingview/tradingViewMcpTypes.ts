export type TradingViewMcpConnectionStatus = "planned_not_connected" | "connected_analysis_only" | "error";
export type TradingViewBias = "bullish" | "bearish" | "neutral" | "mixed" | "unknown";

export interface TradingViewDetectedLevel {
  levelId: string;
  label: string;
  price: number;
  kind: "support" | "resistance" | "liquidity" | "trendline" | "unknown";
  confidence: number;
}

export interface TradingViewIndicatorSnapshot {
  indicatorId: string;
  name: string;
  value: number | string | null;
  interpretation: string;
}

export interface TradingViewPatternSnapshot {
  patternId: string;
  name: string;
  direction: TradingViewBias;
  confidence: number;
}

export interface TradingViewEvidence {
  evidenceId: string;
  symbol: string;
  timeframe: string;
  chartUrl?: string;
  source: "tradingview_mcp";
  technicalSummary: string;
  detectedLevels: TradingViewDetectedLevel[];
  trendState: "uptrend" | "downtrend" | "range" | "unclear";
  supportResistance: TradingViewDetectedLevel[];
  indicators: TradingViewIndicatorSnapshot[];
  patterns: TradingViewPatternSnapshot[];
  bias: TradingViewBias;
  confidence: number;
  warnings: string[];
  missingEvidence: string[];
  timestamp: string;
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface RawTradingViewMcpEvidence {
  symbol?: string;
  timeframe?: string;
  chartUrl?: string;
  technicalSummary?: string;
  levels?: TradingViewDetectedLevel[];
  supportResistance?: TradingViewDetectedLevel[];
  indicators?: TradingViewIndicatorSnapshot[];
  patterns?: TradingViewPatternSnapshot[];
  trendState?: TradingViewEvidence["trendState"];
  bias?: TradingViewBias | "buy" | "sell";
  confidence?: number;
  warnings?: string[];
  missingEvidence?: string[];
  executionAuthority?: unknown;
  brokerAuthority?: unknown;
  readinessOverrideAuthority?: unknown;
  rawProviderPayloadIncluded?: unknown;
}

export interface TradingViewMcpAdapterPlan {
  status: TradingViewMcpConnectionStatus;
  role: "chart_analysis_only";
  allowedUses: string[];
  forbiddenUses: string[];
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}
