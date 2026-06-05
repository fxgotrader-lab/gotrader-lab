import type { IctApprovedSetupProfileRunSummary } from "./ictApprovedSetupProfileTypes";
import type { IctMonteCarloTradeOutcome } from "./ictMonteCarloTypes";
import type { IctReplayBreakdownMetric, IctReplayCalibrationResult } from "./ictReplayDiagnosticsTypes";
import type { IctRealReplayRunConfig, IctRealReplayRunResult } from "./ictRealReplayRunnerTypes";

export type IctManualReplayReviewStatus = "idle" | "running" | "completed" | "unavailable" | "failed";

export interface IctManualReplayReviewRequest {
  requestedSymbol: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  candleLimit: number;
  replayWindowSize: number;
  lookaheadCandles: number;
}

export interface IctManualReplayBreakdownRow {
  key: string;
  total: number;
  totalSignals: number;
  targetFirstRate: number;
  invalidationFirstRate: number;
  averageRrAchieved: number;
}

export interface IctManualReplayCalibrationImprovement {
  filterId: string;
  label: string;
  beforeSignals: number;
  afterSignals: number;
  targetFirstRateChange: number;
  averageRrChange: number;
  signalReductionPct: number;
}

export interface IctManualReplayApprovedProfileComparison {
  profileId: string;
  label: string;
  totalSignalsBefore: number;
  totalApproved: number;
  totalWatchlist: number;
  totalRejected: number;
  totalNoTrade: number;
  signalReductionPct: number;
  approvedTargetFirstRate: number;
  approvedAverageRr: number;
  topRejectionReasons: Array<{ reason: string; count: number }>;
}

export interface IctManualReplayReviewResult {
  status: Exclude<IctManualReplayReviewStatus, "idle" | "running">;
  runId?: string;
  generatedAt: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
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
  approvedProfileCounts: {
    totalApproved: number;
    totalWatchlist: number;
    totalRejected: number;
    totalNoTrade: number;
  };
  approvedTargetFirstRate: number;
  approvedAverageRr: number;
  mostCommonNoTradeReasons: Array<{ reason: string; count: number }>;
  bestSetup?: IctManualReplayBreakdownRow;
  worstSetup?: IctManualReplayBreakdownRow;
  smtSummary: {
    divergenceTypes: IctManualReplayBreakdownRow[];
    confirmation: IctManualReplayBreakdownRow[];
    rejection: IctManualReplayBreakdownRow[];
  };
  newsSessionRiskSummary: {
    newsRiskLevels: IctManualReplayBreakdownRow[];
    sessionRiskStates: IctManualReplayBreakdownRow[];
    riskGovernorActions: IctManualReplayBreakdownRow[];
  };
  topCalibrationFilterImprovements: IctManualReplayCalibrationImprovement[];
  approvedProfileComparison: IctManualReplayApprovedProfileComparison[];
  monteCarloOutcomes?: IctMonteCarloTradeOutcome[];
  unavailableReason?: string;
  errors: string[];
  warnings: string[];
  researchOnly: true;
  authority: IctRealReplayRunResult["authority"];
  safety: IctRealReplayRunResult["safety"];
}

export interface IctManualReplayReviewJournalEvent {
  eventType: "ict_manual_replay_review";
  journalEventId: string;
  runId?: string;
  generatedAt: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  totalSignals: number;
  targetFirstRate: number;
  approvedTargetFirstRate: number;
  averageRrAchieved: number;
  approvedAverageRr: number;
  status: IctManualReplayReviewResult["status"];
  researchOnly: true;
  authority: IctRealReplayRunResult["authority"];
  safety: IctRealReplayRunResult["safety"];
}

export type IctManualReplayReviewRunConfig = Partial<IctRealReplayRunConfig> & IctManualReplayReviewRequest;

export type IctManualReplayMetricSource =
  | Record<string, IctReplayBreakdownMetric>
  | undefined;

export type IctManualReplayCalibrationSource = IctReplayCalibrationResult[] | undefined;

export type IctManualReplayApprovedProfileSource = IctApprovedSetupProfileRunSummary[] | undefined;
