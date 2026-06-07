import type { IctApprovedCandidateStatus } from "./ictApprovedSetupProfileTypes";
import type {
  IctDetectedOpportunity,
  IctMarketCycleStage,
  IctOpportunityDirection,
  IctOpportunityLaneRecommendation,
  IctOpportunityModelFamily,
  IctOpportunityQuality,
  IctOpportunityStage,
  IctOpportunityType
} from "./ictOpportunityDetectionTypes";

export type IctResearchHypothesisStatus =
  | "new_hypothesis"
  | "queued_for_replay"
  | "replay_tested"
  | "paper_watchlist_candidate"
  | "discarded"
  | "needs_more_data";

export interface IctResearchHypothesisSourceOpportunity {
  opportunityId: string;
  type: IctOpportunityType;
  stage: IctOpportunityStage;
  quality: IctOpportunityQuality;
  direction: IctOpportunityDirection;
  modelName?: string;
  modelFamily?: IctOpportunityModelFamily;
  marketCycleStage: IctMarketCycleStage;
  laneRecommendation: IctOpportunityLaneRecommendation;
  nextAction: string;
}

export interface IctResearchHypothesis {
  researchOnly: true;
  hypothesisId: string;
  generatedAt: string;
  status: IctResearchHypothesisStatus;
  title: string;
  sourceOpportunity: IctResearchHypothesisSourceOpportunity;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  sourceFingerprint?: string;
  candleCount?: number;
  missingConfirmation: string[];
  proposedValidationRules: string[];
  blockers: string[];
  nextAction: string;
  autoPromoteAllowed: false;
  executionAllowed: false;
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

export interface IctResearchHypothesisBuildInput {
  opportunity?: IctDetectedOpportunity;
  approvedStatus?: IctApprovedCandidateStatus | string;
  modelQualityLane?: string;
  dataStatus?: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  sourceFingerprint?: string;
  candleCount?: number;
  topReasons?: string[];
  generatedAt?: string;
}

export interface IctResearchHypothesisEligibility {
  eligible: boolean;
  status: "eligible" | "not_eligible";
  reason: string;
  blockers: string[];
}

export type IctResearchHypothesisBuildResult =
  | {
      ok: true;
      hypothesis: IctResearchHypothesis;
      eligibility: IctResearchHypothesisEligibility;
    }
  | {
      ok: false;
      reason: string;
      eligibility: IctResearchHypothesisEligibility;
      authority: IctResearchHypothesis["authority"];
      safety: IctResearchHypothesis["safety"];
    };

export interface IctSelfImprovementQueue {
  updatedAt: string;
  researchOnly: true;
  latestHypothesisId?: string;
  hypotheses: IctResearchHypothesis[];
  authority: IctResearchHypothesis["authority"];
  safety: IctResearchHypothesis["safety"];
}

export interface IctResearchHypothesisJournalEvent {
  eventType: "ict_research_hypothesis_created";
  journalEventId: string;
  hypothesisId: string;
  generatedAt: string;
  status: IctResearchHypothesisStatus;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  sourceFingerprint?: string;
  opportunityType: IctOpportunityType;
  opportunityStage: IctOpportunityStage;
  opportunityQuality: IctOpportunityQuality;
  opportunityLaneRecommendation: IctOpportunityLaneRecommendation;
  missingConfirmation: string[];
  proposedValidationRules: string[];
  nextAction: string;
  autoPromoteAllowed: false;
  executionAllowed: false;
  researchOnly: true;
  authority: IctResearchHypothesis["authority"];
  safety: IctResearchHypothesis["safety"];
}

export type IctResearchHypothesisQueueResult =
  | {
      ok: true;
      storage: "memory" | "localStorage";
      hypothesis: IctResearchHypothesis;
      journalEvent: IctResearchHypothesisJournalEvent;
      totalHypotheses: number;
      reason: string;
    }
  | {
      ok: false;
      storage: "memory" | "localStorage_failed";
      hypothesis?: IctResearchHypothesis;
      journalEvent?: IctResearchHypothesisJournalEvent;
      reason: string;
      error?: string;
      authority: IctResearchHypothesis["authority"];
      safety: IctResearchHypothesis["safety"];
    };
