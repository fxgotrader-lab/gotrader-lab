import type {
  BacktestAgentWeights,
  BacktestSessionFilter,
  BacktestStopModel,
  ResolvedBacktestConfig
} from "@/lib/backtesting/backtestTypes";
import type { ICTScoringWeights } from "@/lib/types";
import type { ValidationReadinessStatus } from "@/lib/validation";

export type CalibrationProposalSource = "openclaw" | "hermes" | "internal";
export type CalibrationProposalStatus = "proposed" | "testing" | "accepted" | "rejected" | "reverted";
export type CalibrationProposalIntent =
  | "research_calibration_candidate"
  | "paper_demo_candidate_review"
  | "grinch_profile_calibration_intent";

export type CalibrationProposalValidationRequirementId =
  | "ai_research_cycle"
  | "walk_forward"
  | "evidence_quality"
  | "maturity_check"
  | "regime_consistency";

export interface CalibrationProposalValidationRequirement {
  requirementId: CalibrationProposalValidationRequirementId;
  label: string;
  status: "required";
  detail: string;
}

export interface CalibrationProposalIntentDetails {
  title: string;
  targetSubsystem: string;
  candidateFamily: string;
  generatedAt: string;
  reportFingerprint: string;
  sourceFingerprint?: string;
  reason: string;
  draftOnly: true;
  autoApplyAllowed: false;
  nearMissScore?: number;
  sourceProfile?: string;
  firstFailedGate?: string;
  executableStatus: "executable" | "planned_not_implemented" | "diagnostic_only";
  executableStatusLabel: string;
  executableAutoResearchFamilies: string[];
  closestAutoResearchFamilies: string[];
  executableStatusReason: string;
  nextImplementationStep: string;
  sourceReportTitle?: string;
  sourceReportFinding?: string;
  sourceContext?: {
    provider?: string;
    dataSourceLabel?: string;
    requestedSymbol?: string;
    brokerSymbol?: string;
    timeframe?: string;
    candleCount?: number;
    sourceFingerprint?: string;
    regimeLabel?: string;
    regimeDataQuality?: string;
  };
  requiredValidationSteps: CalibrationProposalValidationRequirement[];
}

export type CalibrationTargetProblem =
  | "high_drawdown"
  | "low_win_rate"
  | "weak_average_r"
  | "false_positives"
  | "poor_session_performance"
  | "poor_confidence_calibration"
  | "unstable_agent_weight"
  | "overfitting_risk"
  | "trade_generation_issue"
  | "trade_generation_blocked";

export type CalibrationComparisonRecommendation = "accept" | "reject" | "keep_testing";
export type CalibrationPromotionVerdict =
  | "no_material_change"
  | "reject"
  | "needs_follow_up"
  | "research_candidate"
  | "strong_research_candidate"
  | "paper_demo_review_candidate";

export interface CalibrationProposalChanges {
  confluenceThreshold?: number;
  confidenceThreshold?: number;
  sessionFilter?: BacktestSessionFilter;
  stopModel?: BacktestStopModel;
  targetRMultiple?: number;
  allowLong?: boolean;
  allowShort?: boolean;
  agentWeights?: Partial<BacktestAgentWeights>;
  ictScoringWeights?: Partial<ICTScoringWeights>;
  confidencePenaltyRules?: string[];
  evidenceQualityPenaltyRules?: string[];
}

export interface CalibrationProposalMetrics {
  validationId?: string;
  validationTimestamp?: string;
  totalTrades: number;
  winRate: number;
  averageR: number;
  maxDrawdown: number;
  profitFactor: number | null;
  skippedSignals: number;
  falsePositiveCount: number;
  confidenceCalibration: number;
  readinessScore: number;
  readinessStatus: ValidationReadinessStatus;
  stabilityScore: number;
  conservativeScenarioStable: boolean;
  strongestScenario?: string;
  weakestScenario?: string;
}

export interface CalibrationComparisonResult {
  improved: boolean;
  stabilityImproved: boolean;
  recommendation: CalibrationComparisonRecommendation;
  summary: string;
  positiveChanges: string[];
  negativeChanges: string[];
  neutralChanges: string[];
  improvedMetrics: string[];
  worsenedMetrics: string[];
  criticalRegressions: string[];
  sanityWarnings: string[];
  promotionVerdict: CalibrationPromotionVerdict;
  followUpSearchDirection?: string;
}

export interface CalibrationProposalMetricsSnapshot {
  proposalId: string;
  sourceCycleId?: string;
  sourceCandidateId?: string;
  beforeMetricsSource?: string;
  afterMetricsSource?: string;
  beforeSourceCycleId?: string;
  afterSourceCandidateId?: string;
  beforeMetrics: CalibrationProposalMetrics;
  afterMetrics?: CalibrationProposalMetrics;
  comparisonResult?: CalibrationComparisonResult;
  generatedAt: string;
  dataSource?: string;
  candleWindow?: string;
  searchMode?: string;
  activeCalibrationIdUsed?: string;
}

export interface CalibrationProposal {
  proposalId: string;
  timestamp: string;
  source: CalibrationProposalSource;
  status: CalibrationProposalStatus;
  proposalIntent?: CalibrationProposalIntent;
  mode: "simulation";
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
  reason: string;
  targetProblem: CalibrationTargetProblem;
  proposedChanges: CalibrationProposalChanges;
  expectedImprovement: string;
  safetyNotes: string[];
  beforeMetrics: CalibrationProposalMetrics;
  afterMetrics?: CalibrationProposalMetrics;
  comparisonResult?: CalibrationComparisonResult;
  metricsSnapshot?: CalibrationProposalMetricsSnapshot;
  baselineConfig: ResolvedBacktestConfig;
  proposedConfig: ResolvedBacktestConfig;
  testedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  revertedAt?: string;
  approvalRequired: true;
  approvalNotes?: string;
  tradesBeforeRecovery?: number;
  tradesAfterRecovery?: number;
  observedICTConfluence?: number;
  activeConfluenceThreshold?: number;
  proposedConfluenceThreshold?: number;
  recoveryCandidateId?: string;
  recoveryConfluenceThreshold?: number;
  recoveryConfidenceThreshold?: number;
  recoverySessionFilter?: BacktestSessionFilter;
  recoveryStopModel?: BacktestStopModel;
  recoveryTradesProduced?: number;
  thresholdCalculation?: string;
  qualityGatesPassed?: string[];
  sourceCandidateId?: string;
  sourceCandidateLabel?: string;
  proposalIntentDetails?: CalibrationProposalIntentDetails;
  sourceAdaptivePassNumber?: number;
  improvementSummary?: string[];
  notReadyReasons?: string[];
  nextValidationRequirement?: string;
  baselineStabilityScore?: number;
  candidateStabilityScore?: number;
  autoApplyStatus?: "not_evaluated" | "eligible" | "blocked" | "auto_applied";
  autoApplyBlockedReasons?: string[];
  autoAppliedAt?: string;
  autoAppliedBy?: "autonomous_research_supervisor";
  autoApplyRunId?: string;
}

export interface ActiveResearchCalibration {
  approvedCalibrationId: string;
  sourceProposalId: string;
  approvedAt: string;
  appliedConfigPatch: CalibrationProposalChanges;
  baselineConfigBefore: ResolvedBacktestConfig;
  activeConfigAfter: ResolvedBacktestConfig;
}

export type ActiveBacktestConfigMergeStatus =
  | "no_active_calibration"
  | "active_calibration_applied"
  | "active_calibration_missing_patch"
  | "active_calibration_merge_failed";

export interface ActiveBacktestConfigResolution {
  config: ResolvedBacktestConfig;
  defaultConfig: ResolvedBacktestConfig;
  savedConfig: ResolvedBacktestConfig;
  preCalibrationConfig: ResolvedBacktestConfig;
  activeResearchCalibration?: ActiveResearchCalibration;
  activeCalibrationId?: string;
  activeCalibrationStorageFound: boolean;
  activeCalibrationStorageSource: "dedicated_storage" | "self_improvement_state" | "missing";
  activeCalibrationApplied: boolean;
  activeConfluenceThreshold: number;
  defaultConfluenceThreshold: number;
  savedConfluenceThreshold: number;
  finalBacktestConfluenceThreshold: number;
  appliedPatch?: CalibrationProposalChanges;
  mergeStatus: ActiveBacktestConfigMergeStatus;
  mergeStatusLabel: string;
  mergeError?: string;
  sourceTrace: string[];
}

export interface SelfImprovementAuditEntry {
  id: string;
  timestamp: string;
  proposalId: string;
  action: "created" | "tested" | "accepted" | "rejected" | "reverted";
  reviewerName?: string;
  notes: string;
}

export interface SelfImprovementState {
  proposals: CalibrationProposal[];
  auditTrail: SelfImprovementAuditEntry[];
  latestProposalId?: string;
  lastAcceptedProposalId?: string;
  activeResearchCalibration?: ActiveResearchCalibration;
  safetyNotice: "Simulation self-improvement only. Broker execution remains disabled.";
}
