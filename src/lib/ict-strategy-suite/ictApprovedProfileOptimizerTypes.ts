import type { IctRealReplayRunResult } from "./ictRealReplayRunnerTypes";
import type { IctBrowserResearchStatus } from "./ictBrowserResearchLimits";

export type IctProfileOptimizationObjective =
  | "maximize_target_first_rate"
  | "maximize_average_rr"
  | "balanced_quality"
  | "reduce_noise";

export interface IctProfileOptimizationCandidate {
  id: string;
  label: string;
  researchOnly: true;
  minConfidence: number;
  minRr: number;
  requireHtfAlignment: boolean;
  requireFvgPresent: boolean;
  requireExternalLiquidityTarget: boolean;
  rejectEquilibrium: boolean;
  rejectTargetTooClose: boolean;
  requireSmtConfirmationForIndex?: boolean;
  rejectSmtAgainstCandidate?: boolean;
  rejectHighNewsRisk?: boolean;
  rejectMediumNewsRisk?: boolean;
  preferredSessionsOnly?: boolean;
  results: {
    totalSignalsBefore: number;
    totalSignalsAfter: number;
    signalReductionPct: number;
    targetFirstRate: number;
    averageRrAchieved: number;
    invalidationFirstRate: number;
    approvedCount: number;
    watchlistCount: number;
    rejectedCount: number;
  };
  score: number;
  strengths: string[];
  weaknesses: string[];
}

export interface IctApprovedProfileOptimizationResult {
  generatedAt: string;
  researchOnly: true;
  status?: IctBrowserResearchStatus;
  browserSafe?: boolean;
  evaluatedCandidateCount?: number;
  totalCandidateCount?: number;
  omittedCandidateCount?: number;
  serializedBytes?: number;
  warnings?: string[];
  objective: IctProfileOptimizationObjective;
  baseline: {
    totalSignals: number;
    targetFirstRate: number;
    averageRrAchieved: number;
  };
  recommendedProfile: IctProfileOptimizationCandidate;
  candidates: IctProfileOptimizationCandidate[];
  recommendationSummary: string;
  nextTestSuggestion: string;
  authority: IctRealReplayRunResult["authority"];
  safety: IctRealReplayRunResult["safety"];
}

export interface IctApprovedProfileOptimizationJournalEvent {
  eventType: "ict_profile_optimization_summary";
  journalEventId: string;
  generatedAt: string;
  objective: IctProfileOptimizationObjective;
  baselineTargetFirstRate: number;
  baselineAverageRr: number;
  recommendedProfileId: string;
  recommendedMinConfidence: number;
  recommendedMinRr: number;
  recommendedSignalReductionPct: number;
  recommendedTargetFirstRate: number;
  recommendedAverageRr: number;
  nextTestSuggestion: string;
  researchOnly: true;
  authority: IctRealReplayRunResult["authority"];
  safety: IctRealReplayRunResult["safety"];
}
