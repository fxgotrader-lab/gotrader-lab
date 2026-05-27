import type { BacktestSessionFilter, BacktestStopModel, ResolvedBacktestConfig } from "@/lib/backtesting";
import type { RuntimeDataPreset } from "@/lib/runtime/researchRuntimeTypes";
import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";

export type WalkForwardSplitLabel = "in_sample" | "validation" | "out_of_sample";
export type WalkForwardSplitRatioPreset = "60_20_20" | "70_15_15" | "50_25_25" | "custom";
export type WalkForwardMode = "safe" | "standard" | "advanced";
export type WalkForwardRunStatus = "idle" | "running" | "completed" | "completed_with_warnings" | "canceled" | "failed";
export type WalkForwardWindowVerdict = "pass" | "warning" | "fail";
export type WalkForwardOverfitRisk = "low" | "medium" | "high";
export type WalkForwardStabilityVerdict = "fail" | "promising" | "robust_research" | "paper_demo_review_candidate";

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
