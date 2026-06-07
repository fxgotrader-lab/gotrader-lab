import type { Candle } from "../types";
import type { Mt5ReadOnlyDepthSummary } from "../integrations/mt5/mt5ReadOnlyDepth";

export type IctAnalysisTimeframe = "W1" | "D1" | "H4" | "H1" | "M15" | "M5" | "M1";

export type IctAnalysisTimeframeRole =
  | "weekly_bias"
  | "daily_bias"
  | "htf_bias"
  | "bias_and_dealing_range"
  | "session_model"
  | "confirmation_refinement"
  | "entry_refinement";

export type IctAnalysisDepthStatus = "sufficient" | "limited" | "insufficient" | "unavailable";

export interface IctAnalysisTimeframeContext {
  timeframe: IctAnalysisTimeframe;
  requestedLookbackDays: number;
  availableLookbackDays: number;
  candleCount: number;
  dataDepthStatus: IctAnalysisDepthStatus;
  sourceMethod: string;
  role: IctAnalysisTimeframeRole;
  firstTimestamp?: string;
  lastTimestamp?: string;
  chunkCount?: number;
  warning?: string;
}

export interface IctMarketAnalysisContext {
  researchOnly: true;
  requestedSymbol: string;
  brokerSymbol: string;
  displayTimeframe: string;
  displayTimeframeRole: "chart_display_reference_only";
  analysisTimeframes: IctAnalysisTimeframeContext[];
  chartDisplayCandleCount: number;
  analysisDepthStatus: IctAnalysisDepthStatus;
  analysisTimeframesUsed: IctAnalysisTimeframe[];
  missingTimeframes: IctAnalysisTimeframe[];
  htfBiasSource: IctAnalysisTimeframe[];
  sessionModelSourceTimeframe?: IctAnalysisTimeframe;
  confirmationSourceTimeframe?: IctAnalysisTimeframe;
  warnings: string[];
  generatedAt: string;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}

export interface IctMarketAnalysisContextBundle {
  context: IctMarketAnalysisContext;
  displayCandles: Candle[];
  analysisCandlesByTimeframe: Partial<Record<IctAnalysisTimeframe, Candle[]>>;
  depthSummariesByTimeframe: Partial<Record<IctAnalysisTimeframe, Mt5ReadOnlyDepthSummary>>;
}
