import type { BacktestSessionFilter, BacktestStopModel, ResolvedBacktestConfig } from "@/lib/backtesting";
import type { RuntimeDataPreset } from "@/lib/runtime/researchRuntimeTypes";
import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";

export type WalkForwardSplitLabel = "in_sample" | "validation" | "out_of_sample";
export type WalkForwardSplitRatioPreset = "60_20_20" | "70_15_15" | "50_25_25" | "custom";
export type WalkForwardMode = "safe" | "standard" | "advanced";
export type WalkForwardRunStatus = "idle" | "running" | "completed" | "completed_with_warnings" | "canceled" | "failed";
export type WalkForwardWindowVerdict = "pass" | "warning" | "fail";
export type WalkForwardOverfitRisk = "low" | "medium" | "high" | "not_applicable";
export type WalkForwardStabilityVerdict =
  | "insufficient_evidence"
  | "fail"
  | "promising"
  | "robust_research"
  | "paper_demo_review_candidate";
export type WalkForwardSuggestedSearchMode =
  | "quick"
  | "standard"
  | "deep"
  | "session_focus"
  | "stop_model_focus"
  | "long_short_focus"
  | "conservative_only"
  | "conservative"
  | "balanced"
  | "aggressive_research_only"
  | "session_focused"
  | "stop_model_focused"
  | "long_short_bias";
export type WalkForwardLikelyFailureCause =
  | "confidence_calibration"
  | "low_average_r"
  | "session_fragility"
  | "stop_model_fragility"
  | "target_model_fragility"
  | "sample_size_too_low"
  | "insufficient_evidence"
  | "overfit_risk"
  | "evidence_quality_weak";

export interface WalkForwardEvidenceRules {
  minimumWindows: number;
  preferredWindows: number;
  minimumOosTradesPerWindow: number;
  minimumTotalOosTrades: number;
}

export interface WalkForwardEvidenceSummary extends WalkForwardEvidenceRules {
  requestedMaxWindows: number;
  actualWindowsGenerated: number;
  totalOosTrades: number;
  windowsBelowMinimumOosTrades: number;
  enoughEvidence: boolean;
  insufficientEvidenceReasons: string[];
  windowGenerationNotes: string[];
}

export interface WalkForwardSplitRatio {
  preset: WalkForwardSplitRatioPreset;
  label: string;
  inSample: number;
  validation: number;
  outOfSample: number;
}

export interface WalkForwardSplitSummary {
  splitId: string;
  label: WalkForwardSplitLabel;
  displayLabel: string;
  startTimestamp?: string;
  endTimestamp?: string;
  rawCandleCount: number;
  processedCandleCount: number;
  aggregateTimeframe: Timeframe;
  dataSource: string;
  symbol: FuturesSymbol;
  contract?: string;
}

export interface WalkForwardSplitData extends WalkForwardSplitSummary {
  candles: Candle[];
}

export interface WalkForwardWindowDefinition {
  windowId: string;
  windowIndex: number;
  totalWindows: number;
  startTimestamp?: string;
  endTimestamp?: string;
  splits: WalkForwardSplitData[];
}

export interface WalkForwardWindowMetrics {
  totalTrades: number;
  winRate: number;
  averageR: number;
  maxDrawdownR: number;
  profitFactor: number | null;
  falsePositiveCount: number;
  skippedSignals: number;
  confidenceCalibration: number;
  readinessScore: number;
  evidenceQualityScore: number;
  pass: boolean;
  failReasons: string[];
}

export interface WalkForwardWindowResult {
  windowId: string;
  windowIndex: number;
  totalWindows: number;
  splitSummaries: WalkForwardSplitSummary[];
  metricsBySplit: Record<WalkForwardSplitLabel, WalkForwardWindowMetrics>;
  configUsed: Pick<
    ResolvedBacktestConfig,
    | "symbol"
    | "timeframe"
    | "minimumConfluenceThreshold"
    | "minimumConfidenceThreshold"
    | "sessionFilter"
    | "targetRMultiple"
    | "stopModel"
    | "allowLong"
    | "allowShort"
  >;
  calibrationId?: string;
  verdict: WalkForwardWindowVerdict;
  failReasons: string[];
  completedAt: string;
}

export interface WalkForwardFollowUpRecommendation {
  recommendationId: string;
  label: string;
  rationale: string;
  target: WalkForwardLikelyFailureCause;
  candidateConfigHints: string[];
  suggestedSearchMode: WalkForwardSuggestedSearchMode;
}

export interface WalkForwardFailureDiagnostics {
  failedWindowCount: number;
  worstWindowId?: string;
  worstOosWinRate: number;
  worstOosAverageR: number;
  worstOosDrawdown: number;
  repeatedFailureReasons: string[];
  likelyFailureCause: WalkForwardLikelyFailureCause;
  recommendations: WalkForwardFollowUpRecommendation[];
  summary: string;
}

export interface WalkForwardFollowUpSearchPlan {
  planId: string;
  timestamp: string;
  sourceRunId: string;
  planType: "walk_forward_failure_followup";
  likelyFailureCause: WalkForwardLikelyFailureCause;
  worstWindowId?: string;
  recommendedSearchMode: WalkForwardSuggestedSearchMode;
  maxCandidateCount: number;
  recommendations: WalkForwardFollowUpRecommendation[];
  status: "planned";
  safetyNotes: string[];
}

export interface WalkForwardStabilitySummary {
  windowCount: number;
  windowsPassed: number;
  outOfSampleWindowsPassed: number;
  averageWinRate: number;
  medianWinRate: number;
  worstWindowWinRate: number;
  averageRConsistency: number;
  worstWindowAverageR: number;
  worstWindowDrawdownR: number;
  tradeCountConsistency: number;
  falsePositiveConsistency: number;
  readinessConsistency: number;
  stabilityScore: number;
  overfitRisk: WalkForwardOverfitRisk;
  verdict: WalkForwardStabilityVerdict;
  bestWindowId?: string;
  worstWindowId?: string;
  recommendedNextAction: string;
  summary: string;
  failReasons: string[];
  evidenceSummary?: WalkForwardEvidenceSummary;
  diagnostics?: WalkForwardFailureDiagnostics;
  followUpPlan?: WalkForwardFollowUpSearchPlan;
}

export interface WalkForwardProgress {
  status: WalkForwardRunStatus;
  currentWindow: number;
  totalWindows: number;
  currentSplit?: WalkForwardSplitLabel;
  currentWindowId?: string;
  elapsedMs: number;
  message: string;
}

export interface WalkForwardRun {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: WalkForwardRunStatus;
  mode: WalkForwardMode;
  splitRatioPreset: WalkForwardSplitRatioPreset;
  splitRatio: WalkForwardSplitRatio;
  maxWindows: number;
  requestedMaxWindows: number;
  actualWindowsGenerated: number;
  windowGenerationNotes: string[];
  dataSource: string;
  dataSourceLabel: string;
  dataPreset: RuntimeDataPreset;
  symbol: FuturesSymbol;
  contract?: string;
  timeframe: Timeframe;
  rawCandleCount: number;
  processedCandleCount: number;
  candleWindow: string;
  activeCalibrationId?: string;
  configMergeStatus: string;
  proposalId?: string;
  windows: WalkForwardWindowResult[];
  stability?: WalkForwardStabilitySummary;
  failureDiagnostics?: WalkForwardFailureDiagnostics;
  followUpPlan?: WalkForwardFollowUpSearchPlan;
  progress?: WalkForwardProgress;
  warnings: string[];
  error?: string;
  safetyNotice: "Walk-forward validation is simulation-only. It cannot execute trades, enable demo/live mode, or override readiness.";
}

export interface WalkForwardState {
  latestRunId?: string;
  runs: WalkForwardRun[];
  activeProgress?: WalkForwardProgress;
  safetyNotice: WalkForwardRun["safetyNotice"];
}

export interface WalkForwardRunOptions {
  mode?: WalkForwardMode;
  splitRatioPreset?: WalkForwardSplitRatioPreset;
  customRatio?: Pick<WalkForwardSplitRatio, "inSample" | "validation" | "outOfSample">;
  maxWindows?: number;
  minimumWindows?: number;
  minimumOosTradesPerWindow?: number;
  minimumTotalOosTrades?: number;
  proposalId?: string;
  signal?: AbortSignal;
  onProgress?: (run: WalkForwardRun) => void;
}

export interface WalkForwardConfigSummary {
  confluenceThreshold: number;
  confidenceThreshold: number;
  sessionFilter: BacktestSessionFilter;
  stopModel: BacktestStopModel;
  targetRMultiple: number;
  allowLong: boolean;
  allowShort: boolean;
}
