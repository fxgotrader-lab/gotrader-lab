import type { IctReplayResult } from "./ictReplayValidationTypes";

export type IctConfidenceBucket = "0-20" | "21-40" | "41-60" | "61-80" | "81-100";
export type IctRrBucket = "lt_1r" | "1r_to_1_5r" | "1_5r_to_2r" | "2r_to_3r" | "gt_3r";

export interface IctReplayBreakdownMetric {
  key: string;
  total: number;
  totalSignals: number;
  totalNoTrades: number;
  targetFirstCount: number;
  invalidationFirstCount: number;
  partialTargetCount: number;
  stalledCount: number;
  targetFirstRate: number;
  invalidationFirstRate: number;
  averageRrAchieved: number;
}

export interface IctReplayDiagnostics {
  researchOnly: true;
  generatedAt: string;
  totalResults: number;
  totalSignals: number;
  baseline: {
    targetFirstRate: number;
    invalidationFirstRate: number;
    averageRrAchieved: number;
  };
  byStrategyId: Record<string, IctReplayBreakdownMetric>;
  byPhase: Record<string, IctReplayBreakdownMetric>;
  bySetup: Record<string, IctReplayBreakdownMetric>;
  byPhase2Setup: Record<string, IctReplayBreakdownMetric>;
  byOrderBlockVariant: Record<string, IctReplayBreakdownMetric>;
  byApprovedProfileStatus: Record<string, IctReplayBreakdownMetric>;
  bySide: Record<string, IctReplayBreakdownMetric>;
  bySymbol: Record<string, IctReplayBreakdownMetric>;
  byPrimaryTimeframe: Record<string, IctReplayBreakdownMetric>;
  byHtfAlignment: Record<string, IctReplayBreakdownMetric>;
  bySession: Record<string, IctReplayBreakdownMetric>;
  byConfidenceBucket: Record<IctConfidenceBucket, IctReplayBreakdownMetric>;
  byRrBucket: Record<IctRrBucket, IctReplayBreakdownMetric>;
  byFvgStatus: Record<string, IctReplayBreakdownMetric>;
  byDealingRangeLocation: Record<string, IctReplayBreakdownMetric>;
  byLiquidityTargetType: Record<string, IctReplayBreakdownMetric>;
  bySmtDivergenceType: Record<string, IctReplayBreakdownMetric>;
  bySmtConfirmsCandidate: Record<string, IctReplayBreakdownMetric>;
  bySmtRejectsCandidate: Record<string, IctReplayBreakdownMetric>;
  byRelativeStrengthLeader: Record<string, IctReplayBreakdownMetric>;
  byRelativeWeaknessLeader: Record<string, IctReplayBreakdownMetric>;
  mostCommonNoTradeReasons: Array<{ reason: string; count: number }>;
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}

export interface IctReplayCalibrationFilter {
  id: string;
  label: string;
  enabled: boolean;
  minConfidence?: number;
  minRr?: number;
  requireHtfAlignment?: boolean;
  requireFvgPresent?: boolean;
  requireFvgRespected?: boolean;
  requireExternalLiquidityTarget?: boolean;
  allowedSessions?: string[];
  allowedSetups?: string[];
  allowedSides?: Array<"long" | "short">;
  rejectEquilibrium?: boolean;
  rejectTargetTooClose?: boolean;
  requireSmtConfirmationForIndex?: boolean;
  rejectSmtAgainstCandidate?: boolean;
  preferRelativeStrengthLeader?: boolean;
  rejectMixedIndexAlignment?: boolean;
}

export interface IctReplayCalibrationResult {
  filterId: string;
  label: string;
  researchOnly: true;
  before: {
    totalSignals: number;
    targetFirstRate: number;
    invalidationFirstRate: number;
    averageRrAchieved: number;
  };
  after: {
    totalSignals: number;
    rejectedSignals: number;
    targetFirstRate: number;
    invalidationFirstRate: number;
    averageRrAchieved: number;
  };
  delta: {
    signalReductionPct: number;
    targetFirstRateChange: number;
    averageRrChange: number;
  };
}

export interface IctReplayDiagnosticsJournalEvent {
  eventType: "ict_replay_diagnostics_summary";
  journalEventId: string;
  runId?: string;
  generatedAt: string;
  totalResults: number;
  totalSignals: number;
  baselineTargetFirstRate: number;
  baselineAverageRr: number;
  topStrategyByTargetFirstRate?: string;
  worstStrategyByInvalidationRate?: string;
  mostCommonNoTradeReasons: Array<{ reason: string; count: number }>;
  calibrationResults: Array<Pick<IctReplayCalibrationResult, "filterId" | "label" | "delta"> & {
    beforeSignals: number;
    afterSignals: number;
  }>;
  researchOnly: true;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
  safety: IctReplayDiagnostics["safety"];
}

export type IctReplayCalibrationCandidate = IctReplayResult & {
  session?: string;
};
