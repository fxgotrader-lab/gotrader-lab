import type {
  BacktestAgentWeights,
  BacktestConfig,
  BacktestResult,
  TradeGenerationDiagnostic,
  TradeQualityDiagnostic,
  ResolvedBacktestConfig
} from "@/lib/backtesting";
import type { BacktestSessionFilter, BacktestStopModel } from "@/lib/backtesting/backtestTypes";
import type { ReadinessGateSnapshot } from "@/lib/readiness";
import type { ResearchQualityReview } from "@/lib/researchQuality";
import type {
  CalibrationProposal,
  CalibrationComparisonResult,
  CalibrationProposalMetrics
} from "@/lib/selfImprovement";
import type { ScenarioSelectionReasoning } from "@/lib/autonomousResearch";
import type { GrinchStrategyScore } from "@/lib/strategyLibrary";
import type { Candle, ICTScoringWeights } from "@/lib/types";
import type { ValidationSuiteReport } from "@/lib/validation";
import type { WalkForwardFollowUpSearchPlan } from "@/lib/walkForward/walkForwardTypes";

export type AutoResearchSearchMode =
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

export type AutoResearchResultCategory =
  | "rejected"
  | "no_safe_candidate_found"
  | "improved_but_not_ready"
  | "research_ready"
  | "research_ready_candidate"
  | "paper_demo_candidate"
  | "unsafe_overfit"
  | "max_passes_exhausted";

export type AutoResearchFailedGate =
  | "max_drawdown_too_high"
  | "false_positives_too_high"
  | "average_r_too_low"
  | "win_rate_too_low"
  | "trade_count_too_low"
  | "confidence_calibration_weak"
  | "session_consistency_weak"
  | "conservative_scenario_unstable"
  | "skipped_signal_imbalance"
  | "overfitting_risk"
  | "regime_mismatch"
  | "regime_shift_detected"
  | "regime_evidence_insufficient";

export type AutoResearchAdaptiveOutcome =
  | "no_safe_candidate_found"
  | "improved_but_not_ready"
  | "research_ready_candidate"
  | "paper_demo_candidate"
  | "unsafe_overfit"
  | "max_passes_exhausted";

export type AutoResearchCandidateFamily =
  | "baseline"
  | "grinch_model_balanced"
  | "grinch_model_strict"
  | "grinch_model_model1_only"
  | "grinch_model_reversal_only"
  | "grinch_model_consolidation_only"
  | "grinch_require_opening_price_alignment"
  | "grinch_require_pd_array_hierarchy_alignment"
  | "grinch_require_time_price_alignment"
  | "grinch_block_expired_timing"
  | "grinch_require_valid_profile"
  | "grinch_require_timing_acceptable"
  | "grinch_require_profile_plus_entry_confirmation"
  | "grinch_smt_unavailable_penalty"
  | "grinch_penalize_missing_smt"
  | "grinch_allow_smt_unavailable_but_discount_confidence";

export type AutoResearchCycleStatus =
  | "idle"
  | "running"
  | "completed"
  | "canceled"
  | "failed"
  | "proposal_created";

export interface AutoResearchCandidateConfig {
  candidateId: string;
  label: string;
  searchMode: AutoResearchSearchMode;
  rationale: string;
  config: ResolvedBacktestConfig;
  ictScoringWeights?: Partial<ICTScoringWeights>;
  changedParameters: string[];
  candidateFamily?: AutoResearchCandidateFamily;
}

export interface AutoResearchScoringCriteria {
  stabilityFirst: true;
  weights: {
    lowerMaxDrawdown: number;
    betterAverageR: number;
    acceptableWinRate: number;
    lowerFalsePositives: number;
    confidenceCalibration: number;
    sessionConsistency: number;
    sufficientTradeCount: number;
    skippedSignalBalance: number;
    profitFactor: number;
    robustnessAcrossScenarios: number;
    grinchModelSupport: number;
  };
}

export interface AutoResearchScoreBreakdown {
  totalScore: number;
  drawdownScore: number;
  averageRScore: number;
  winRateScore: number;
  falsePositiveScore: number;
  confidenceCalibrationScore: number;
  sessionConsistencyScore: number;
  tradeCountScore: number;
  skippedSignalBalanceScore: number;
  profitFactorScore: number;
  robustnessScore: number;
  grinchModelScore?: number;
  grinchFalsePositiveRisk?: number;
  grinchProfileValidity?: number;
  stabilityImproved: boolean;
  sufficientSample: boolean;
  rationale: string;
}

export interface AutoResearchCandidateResult {
  candidateId: string;
  label: string;
  rationale: string;
  config: ResolvedBacktestConfig;
  ictScoringWeights?: Partial<ICTScoringWeights>;
  changedParameters: string[];
  backtestResult?: BacktestResult;
  validationReport?: ValidationSuiteReport;
  researchQualityReview?: ResearchQualityReview;
  readinessEstimate: ReadinessGateSnapshot;
  metrics: CalibrationProposalMetrics;
  scoreBreakdown: AutoResearchScoreBreakdown;
  grinchScore?: GrinchStrategyScore;
  grinchComparison?: {
    baselineScore?: number;
    candidateScore: number;
    scoreDelta?: number;
    falsePositiveRiskDelta?: number;
    improved: boolean;
    source: string;
  };
  comparisonResult: CalibrationComparisonResult;
  resultCategory: AutoResearchResultCategory;
  promotionEligible: boolean;
  rejectionReasons: string[];
  candidateFamily?: AutoResearchCandidateFamily;
}

export interface AutoResearchCandidateScoreSummary {
  candidateId: string;
  label: string;
  totalScore: number;
  resultCategory: AutoResearchResultCategory;
  rejectionReasons: string[];
  candidateFamily?: AutoResearchCandidateFamily;
  grinchModelScore?: number;
}

export interface AutoResearchGrinchComparison {
  baseline?: {
    score?: number;
    activeProfile?: string;
    falsePositiveRisk?: number;
  };
  grinchFiltered?: AutoResearchCandidateScoreSummary;
  grinchStrict?: AutoResearchCandidateScoreSummary;
  grinchBalanced?: AutoResearchCandidateScoreSummary;
  notes: string[];
}

export interface AutoResearchProgressSnapshot {
  currentCandidate: number;
  totalCandidates: number;
  passNumber?: number;
  totalPasses?: number;
  passLabel?: string;
  failedGatesTargeted?: AutoResearchFailedGate[];
  candidateId: string;
  candidateLabel: string;
  candidateScore: number;
  bestCandidateId?: string;
  bestCandidateLabel?: string;
  bestCandidateScore?: number;
  bestCandidateCategory?: AutoResearchResultCategory;
}

export type AutoResearchCheckpointStatus = "running" | "canceled" | "completed" | "failed";

export interface AutoResearchExecutionCheckpoint {
  checkpointId: string;
  cycleId: string;
  updatedAt: string;
  startedAt: string;
  elapsedMs: number;
  phase: string;
  status: AutoResearchCheckpointStatus;
  currentCandidate: number;
  totalCandidates: number;
  currentPass?: number;
  totalPasses?: number;
  currentCandidateName?: string;
  bestCandidateId?: string;
  bestCandidateLabel?: string;
  bestCandidateScore?: number;
  bestCandidateCategory?: AutoResearchResultCategory;
  message?: string;
}

export interface AutoResearchAdaptivePass {
  passNumber: number;
  reasonForPass: string;
  failedGatesTargeted: AutoResearchFailedGate[];
  generatedCandidates: AutoResearchCandidateConfig[];
  bestCandidatePerPass?: AutoResearchCandidateResult;
  improvementOverPriorPass: boolean;
  finalOutcome: AutoResearchAdaptiveOutcome;
  targetedChanges: string[];
}

export interface AutoResearchRecoveryMetadata {
  recoveryCandidateId?: string;
  recoveryCandidateLabel?: string;
  recoveryConfluenceThreshold?: number;
  recoveryConfidenceThreshold?: number;
  recoverySessionFilter?: BacktestSessionFilter;
  recoveryStopModel?: BacktestStopModel;
  tradesProduced: number;
  observedICTConfluence?: number;
  activeConfluenceThreshold: number;
  proposedConfluenceThreshold: number;
  thresholdSource: "recovery_candidate" | "observed_confluence_buffer";
  calculation: string;
}

export interface AutoResearchCycle {
  cycleId: string;
  timestamp: string;
  searchMode: AutoResearchSearchMode;
  baselineConfig: ResolvedBacktestConfig;
  candidateConfigs: AutoResearchCandidateConfig[];
  candidateResults: AutoResearchCandidateResult[];
  bestCandidate?: AutoResearchCandidateResult;
  closestCandidates: AutoResearchCandidateResult[];
  rejectedCandidates: AutoResearchCandidateResult[];
  candidatesTested: number;
  candidateScores: AutoResearchCandidateScoreSummary[];
  selectedCandidateId?: string;
  finalResultCategory: AutoResearchResultCategory | "no_safe_paper_demo_candidate_found";
  noSafePaperDemoCandidateFound: boolean;
  adaptivePasses?: AutoResearchAdaptivePass[];
  failedGates?: AutoResearchFailedGate[];
  scenarioSelectionReasoning?: ScenarioSelectionReasoning;
  finalOutcome?: AutoResearchAdaptiveOutcome;
  tradeGenerationDiagnostics?: TradeGenerationDiagnostic[];
  tradeQualityDiagnostics?: TradeQualityDiagnostic[];
  tradeQualityCandidateConfigs?: AutoResearchCandidateConfig[];
  tradeQualityBestCandidate?: AutoResearchCandidateResult;
  tradeQualitySummary?: {
    topIssue?: string;
    recommendedNextTest?: string;
    testedStopModels: string[];
    testedTargetModels: string[];
    sessionDirectionFindings: string[];
  };
  grinchComparison?: AutoResearchGrinchComparison;
  recoveryAttempted?: boolean;
  recoveryCandidates?: AutoResearchCandidateConfig[];
  recoveryResult?: AutoResearchCandidateResult;
  recoveryMetadata?: AutoResearchRecoveryMetadata;
  tradesBeforeRecovery?: number;
  tradesAfterRecovery?: number;
  recoveryFailureReasons?: string[];
  scoringCriteria: AutoResearchScoringCriteria;
  safetyNotes: string[];
  createdProposalId?: string;
  createdProposal?: CalibrationProposal;
  status: AutoResearchCycleStatus;
  error?: string;
}

export interface AutoResearchRunOptions {
  searchMode: AutoResearchSearchMode;
  maxCandidateCount: number;
  maxAdaptivePasses?: number;
  createProposal?: boolean;
  candles?: Candle[];
  baselineConfig?: ResolvedBacktestConfig;
  dataSource?: string;
  candleWindow?: string;
  activeCalibrationIdUsed?: string;
  onCandidateEvaluated?: (progress: AutoResearchProgressSnapshot) => void;
  onCheckpoint?: (checkpoint: AutoResearchExecutionCheckpoint) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface AutoResearchState {
  cycles: AutoResearchCycle[];
  followUpSearchPlans?: WalkForwardFollowUpSearchPlan[];
  latestFollowUpSearchPlanId?: string;
  auditTrail: Array<{
    id: string;
    timestamp: string;
    cycleId: string;
    searchMode?: AutoResearchSearchMode;
    candidatesTested?: number;
    candidateScores?: AutoResearchCandidateScoreSummary[];
    selectedCandidateId?: string;
    finalResultCategory?: AutoResearchCycle["finalResultCategory"];
    action:
      | "cycle_started"
      | "candidate_tested"
      | "proposal_created"
      | "cycle_completed"
      | "cycle_failed"
      | "cycle_canceled"
      | "checkpoint"
      | "scenario_selection_logged"
      | "followup_plan_created";
    notes: string;
  }>;
  latestCycleId?: string;
  activeCheckpoint?: AutoResearchExecutionCheckpoint;
  recoveryCheckpoint?: AutoResearchExecutionCheckpoint;
  checkpointHistory?: AutoResearchExecutionCheckpoint[];
  cancelRequestedCycleId?: string;
  lastStoredBytes?: number;
  storageWarning?: string;
  storageEmergencyMode?: boolean;
  safetyNotice: "Auto Research is simulation-only and cannot execute trades or override readiness gates.";
}

export type AutoResearchSafeConfigPatch = BacktestConfig & {
  agentWeights?: Partial<BacktestAgentWeights>;
  ictScoringWeights?: Partial<ICTScoringWeights>;
};
