import type { IctReplaySummary } from "./ictReplayValidationTypes";
import type { IctApprovedSetupProfileRunSummary } from "./ictApprovedSetupProfileTypes";
import type { IctReplayCalibrationResult, IctReplayDiagnostics } from "./ictReplayDiagnosticsTypes";

export interface IctRealReplayRunConfig {
  requestedSymbols: string[];
  primaryTimeframes: string[];
  htfTimeframes: string[];
  candleLimit: number;
  replayWindowSize: number;
  lookaheadCandles: number;
  minRequiredCandles: number;
  researchOnly: true;
}

export interface IctRealReplayBucketSummary {
  totalSignals: number;
  targetFirstRate: number;
  invalidationFirstRate: number;
  averageRrAchieved: number;
}

export interface IctRealReplaySymbolResult {
  requestedSymbol: string;
  brokerSymbol: string;
  displayLabel: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  status: "completed" | "skipped" | "failed";
  reason?: string;
  summary?: IctReplaySummary;
}

export interface IctRealReplayAggregateSummary {
  totalSymbols: number;
  completedSymbols: number;
  failedSymbols: number;
  totalWindows: number;
  totalSignals: number;
  totalNoTrades: number;
  targetFirstRate: number;
  invalidationFirstRate: number;
  partialTargetRate: number;
  stalledRate: number;
  insufficientFutureCandlesCount: number;
  averageRrAchieved: number;
  mostCommonNoTradeReasons: Array<{ reason: string; count: number }>;
  bySymbol: Record<string, IctRealReplayBucketSummary>;
  byTimeframe: Record<string, IctRealReplayBucketSummary>;
  bySession: Record<string, IctRealReplayBucketSummary>;
}

export interface IctRealReplayRunResult {
  runId: string;
  generatedAt: string;
  researchOnly: true;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
  config: Omit<IctRealReplayRunConfig, "researchOnly"> & { researchOnly: true };
  symbols: IctRealReplaySymbolResult[];
  aggregateSummary: IctRealReplayAggregateSummary;
  diagnostics?: IctReplayDiagnostics;
  calibrationResults?: IctReplayCalibrationResult[];
  approvedProfileResults?: IctApprovedSetupProfileRunSummary[];
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}

export interface IctRealReplayRunJournalEvent {
  eventType: "ict_real_replay_run_summary";
  journalEventId: string;
  runId: string;
  generatedAt: string;
  requestedSymbols: string[];
  brokerSymbols: string[];
  primaryTimeframes: string[];
  htfTimeframes: string[];
  candleLimit: number;
  replayWindowSize: number;
  lookaheadCandles: number;
  totalWindows: number;
  totalSignals: number;
  totalNoTrades: number;
  targetFirstRate: number;
  invalidationFirstRate: number;
  averageRrAchieved: number;
  mostCommonNoTradeReasons: Array<{ reason: string; count: number }>;
  bySymbol: IctRealReplayAggregateSummary["bySymbol"];
  researchOnly: true;
  authority: IctRealReplayRunResult["authority"];
  safety: IctRealReplayRunResult["safety"];
}
