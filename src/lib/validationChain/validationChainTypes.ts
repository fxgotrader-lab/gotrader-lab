export type ValidationChainHypothesisStatus =
  | "not_queued"
  | "queued"
  | "replay_required"
  | "replay_running"
  | "replay_passed"
  | "replay_failed"
  | "walk_forward_required"
  | "walk_forward_running"
  | "walk_forward_passed"
  | "walk_forward_failed"
  | "evidence_updated"
  | "rejected"
  | "needs_more_data";

export type ValidationChainRecognitionType =
  | "full_model"
  | "forming_model"
  | "pd_array_setup"
  | "scalp_setup"
  | "unknown_structured_opportunity"
  | "market_map_only"
  | "insufficient_data"
  | "grinch_profile";

export type ValidationChainCandidateFamily =
  | "known_model"
  | "forming_model"
  | "pd_array"
  | "scalp"
  | "market_map"
  | "grinch"
  | "unclassified";

export type ValidationChainStepVerdict = "passed" | "failed" | "needs_more_data";

export interface ValidationChainAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface ValidationChainSourceStatus {
  sourceProvider: string;
  isMockOrSample: boolean;
  isResearchActive: boolean;
  statusLabel: string;
}

export interface ValidationChainReplaySummary {
  runId?: string;
  generatedAt: string;
  verdict: ValidationChainStepVerdict;
  totalWindows?: number;
  totalSignals?: number;
  targetFirstRate?: number;
  averageRr?: number;
  usableOutcomes?: number;
  reason: string;
}

export interface ValidationChainWalkForwardSummary {
  runId?: string;
  generatedAt: string;
  verdict: ValidationChainStepVerdict;
  grade?: number;
  oosVerdict?: string;
  tradeCount?: number;
  windowsTested?: number;
  oosWindowsPassed?: number;
  warningFlags: string[];
  reason: string;
}

export interface ValidationChainEvidenceSummary {
  generatedAt: string;
  evidenceQualityScore?: number;
  maturityScore?: number;
  maturityGrade?: string;
  selfImprovementStatus?: string;
  detail: string;
}

/**
 * Compact recognition-to-validation chain record. Recognition is not
 * evidence; replay validation creates preliminary evidence; walk-forward/OOS
 * creates stronger evidence. Never stores raw candles.
 */
export interface ValidationChainEntry {
  researchOnly: true;
  recognitionId: string;
  recognitionType: ValidationChainRecognitionType;
  setupLabel: string;
  candidateFamily: ValidationChainCandidateFamily;
  requiredValidation: string;
  symbol: string;
  brokerSymbol?: string;
  timeframe: string;
  htfContext: string[];
  sourceFingerprint: string;
  sourceStatus: ValidationChainSourceStatus;
  hypothesisStatus: ValidationChainHypothesisStatus;
  hypothesisId?: string;
  replayResult?: ValidationChainReplaySummary;
  walkForwardResult?: ValidationChainWalkForwardSummary;
  evidenceQuality?: ValidationChainEvidenceSummary;
  paperDemoChecklistImpact: string;
  nextAction: string;
  blockers: string[];
  createdAt: string;
  updatedAt: string;
  executionIntent: "none";
  authority: ValidationChainAuthority;
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}

export interface ValidationChainState {
  updatedAt: string;
  researchOnly: true;
  latestRecognitionId?: string;
  entries: ValidationChainEntry[];
  authority: ValidationChainAuthority;
}

export type ValidationChainQueueResult =
  | { ok: true; entry: ValidationChainEntry }
  | { ok: false; reason: string; entry?: ValidationChainEntry };

export const VALIDATION_CHAIN_AUTHORITY: ValidationChainAuthority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

export const VALIDATION_CHAIN_SAFETY: ValidationChainEntry["safety"] = {
  rawCandlesExcluded: true,
  rawSnapshotsExcluded: true,
  accountDataExcluded: true,
  orderDataExcluded: true,
  positionDataExcluded: true,
  secretsExcluded: true
};

export const validationChainStatusLabel = (status: ValidationChainHypothesisStatus): string =>
  status.replace(/_/g, " ");
