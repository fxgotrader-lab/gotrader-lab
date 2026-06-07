import type { IctMonteCarloRobustnessRating, IctMonteCarloTradeOutcome } from "./ictMonteCarloTypes";
import type { IctReplayResult } from "./ictReplayValidationTypes";
import type { IctResearchHypothesis, IctResearchHypothesisStatus } from "./ictSelfImprovementTypes";

export type IctHypothesisValidationStatus =
  | "not_tested"
  | "testing"
  | "promising"
  | "weak"
  | "needs_more_data"
  | "discarded"
  | "paper_watchlist_recommended";

export type IctHypothesisValidationSource =
  | "queued_hypothesis"
  | "manual_review"
  | "scheduled_research"
  | "synthetic_fixture";

export interface IctHypothesisValidationThresholds {
  minimumOccurrences: number;
  promisingTargetFirstRate: number;
  paperWatchlistTargetFirstRate: number;
  maxAcceptableInvalidationFirstRate: number;
  minimumAverageRr: number;
  monteCarloRequiredUsableOutcomes: number;
}

export interface IctHypothesisReplayCriteria {
  hypothesisId: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  opportunityType: string;
  opportunityStage: string;
  opportunityModelName?: string;
  opportunityDirection?: string;
  sourceFingerprint?: string;
  missingConfirmation: string[];
  proposedValidationRules: string[];
}

export interface IctHypothesisValidationInput {
  hypothesis: IctResearchHypothesis;
  source?: IctHypothesisValidationSource;
  replayResults?: IctReplayResult[];
  replayOutcomes?: IctMonteCarloTradeOutcome[];
  testedWindows?: number;
  generatedAt?: string;
  thresholds?: Partial<IctHypothesisValidationThresholds>;
  runMonteCarlo?: boolean;
}

export interface IctHypothesisScoredOutcomes {
  totalOccurrences: number;
  usableOutcomes: number;
  targetFirstRate?: number;
  invalidationFirstRate?: number;
  averageRr?: number;
  medianRr?: number;
  replayOutcomes: IctMonteCarloTradeOutcome[];
  evidence: string[];
  blockers: string[];
}

export interface IctHypothesisValidationResult {
  researchOnly: true;
  hypothesisId: string;
  generatedAt: string;
  source: IctHypothesisValidationSource;
  status: IctHypothesisValidationStatus;
  testedWindows: number;
  totalOccurrences: number;
  usableOutcomes: number;
  targetFirstRate?: number;
  invalidationFirstRate?: number;
  averageRr?: number;
  medianRr?: number;
  monteCarlo?: {
    attempted: boolean;
    robustnessRating?: IctMonteCarloRobustnessRating;
    riskOfRuinPct?: number;
    recommendedMaxRiskPerTradePct?: number;
    reason: string;
  };
  classificationReason: string;
  recommendation: string;
  evidence: string[];
  blockers: string[];
  nextResearchAction: string;
  autoPromoteAllowed: false;
  executionAllowed: false;
  approvedProfileMutated: false;
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

export interface IctResearchHypothesisValidationJournalEvent {
  eventType: "ict_research_hypothesis_validated";
  journalEventId: string;
  hypothesisId: string;
  generatedAt: string;
  status: IctHypothesisValidationStatus;
  hypothesisStatusAfterValidation: IctResearchHypothesisStatus;
  totalOccurrences: number;
  usableOutcomes: number;
  targetFirstRate?: number;
  invalidationFirstRate?: number;
  averageRr?: number;
  monteCarloRobustnessRating?: IctMonteCarloRobustnessRating;
  recommendation: string;
  researchOnly: true;
  autoPromoteAllowed: false;
  executionAllowed: false;
  approvedProfileMutated: false;
  authority: IctHypothesisValidationResult["authority"];
  safety: IctHypothesisValidationResult["safety"];
}
