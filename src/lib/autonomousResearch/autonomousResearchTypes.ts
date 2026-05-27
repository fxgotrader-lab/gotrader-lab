import type { AutoResearchSearchMode } from "@/lib/autoResearch";
import type { AutonomyBlockerCategory, AutonomySafetyDiagnosis, AutonomyScenarioFamily } from "@/lib/autonomousResearch";
import type { CalibrationProposal, CalibrationProposalChanges } from "@/lib/selfImprovement";
import type { WalkForwardRun } from "@/lib/walkForward";

export type AutonomousResearchStatus =
  | "idle"
  | "running"
  | "completed"
  | "completed_with_warnings"
  | "canceled"
  | "failed"
  | "paused";

export type AutonomousResearchStopReason =
  | "max_iterations_reached"
  | "no_improvement_limit_reached"
  | "research_ready_stable"
  | "paper_demo_candidate_review_reached"
  | "evidence_quality_too_low"
  | "walk_forward_repeatedly_failed"
  | "regime_mismatch_detected"
  | "user_canceled"
  | "failed"
  | "completed";

export type AutonomousResearchBlocker =
  | "low_win_rate"
  | "low_average_r"
  | "high_drawdown"
  | "false_positives"
  | "session_inconsistency"
  | "confidence_calibration_weak"
  | "insufficient_trades"
  | "evidence_quality_weak"
  | "walk_forward_insufficient"
  | "walk_forward_failed"
  | "maturity_too_low"
  | "regime_mismatch";

export type AutonomousScenarioFamily =
  | "session_focus"
  | "stop_model_focus"
  | "target_model_focus"
  | "confidence_calibration_focus"
  | "evidence_quality_focus"
  | "long_short_focus"
  | "conservative_only"
  | "walk_forward_followup";

export interface AutonomousResearchSettings {
  maxIterations: number;
  noImprovementStop: number;
  safeImportedDataMode: boolean;
  advancedFullResearchMode: boolean;
  autoApplyPolicyEnabled: boolean;
}

export interface ScenarioSetEvaluation {
  scenarioFamily: AutonomousScenarioFamily;
  searchMode: AutoResearchSearchMode;
  maxCandidateCount: number;
  reason: string;
  blockers: AutonomousResearchBlocker[];
  safetyNotes: string[];
}

export interface AutoApplyEligibility {
  eligible: boolean;
  applied: boolean;
  status: "eligible" | "applied" | "blocked" | "no_candidate";
  proposalId?: string;
  reasons: string[];
  allowedChanges?: CalibrationProposalChanges;
  boundedChange: boolean;
  policyModeEnabled: boolean;
  walkForwardVerdict?: string;
  maturityScoreBefore?: number;
  maturityScoreAfter?: number;
}

export interface AutonomousCalibrationDriftEntry {
  id: string;
  timestamp: string;
  proposalId: string;
  appliedConfigPatch: CalibrationProposalChanges;
  maturityScoreBefore: number;
  maturityScoreAfter: number;
  evidenceQualityScore: number;
  walkForwardVerdict?: string;
}

export interface AutonomousLoopIteration {
  iteration: number;
  startedAt: string;
  completedAt?: string;
  cycleId?: string;
  blockerDiagnosis: AutonomousResearchBlocker[];
  safetyDiagnosis?: AutonomySafetyDiagnosis;
  selectedScenarioFamily?: AutonomousScenarioFamily;
  scenarioReason?: string;
  autoResearchCycleId?: string;
  bestCandidateLabel?: string;
  latestCandidateResult?: string;
  proposalId?: string;
  walkForwardRunId?: string;
  walkForwardVerdict?: string;
  autoApplyEligibility?: AutoApplyEligibility;
  autoAppliedCalibrationId?: string;
  readinessState?: string;
  maturityScore?: number;
  status: "running" | "completed" | "warning" | "failed" | "canceled";
  notes: string[];
}

export interface OpenClawFailureAnalysisMemory {
  memoryId?: string;
  summary?: string;
  executionAuthority: "none";
}

export interface OpenClawScenarioRecommendation {
  recommendedScenarioFamily?: AutonomousScenarioFamily;
  rationale?: string;
  executionAuthority: "none";
}

export interface OpenClawProposalReview {
  proposalId?: string;
  recommendation?: "approve_research_only" | "reject" | "needs_more_evidence";
  executionAuthority: "none";
}

export interface HermesNotificationEvent {
  eventId?: string;
  title?: string;
  summary?: string;
  executionAuthority: "none";
}

export interface AutonomousResearchRun {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: AutonomousResearchStatus;
  settings: AutonomousResearchSettings;
  currentIteration: number;
  iterations: AutonomousLoopIteration[];
  latestBlocker?: AutonomousResearchBlocker;
  latestScenarioFamily?: AutonomousScenarioFamily;
  latestScenarioReason?: string;
  latestCandidateResult?: string;
  latestAutoApplyEligibility?: AutoApplyEligibility;
  latestAutoAppliedCalibrationId?: string;
  stopReason?: AutonomousResearchStopReason;
  stopReasonDetail?: string;
  readinessTrend: string;
  maturityTrend: string;
  goTraderHandoffGate: {
    eligibleForReview: boolean;
    reasons: string[];
    brokerExecutionDisabled: true;
  };
  calibrationDriftHistory: AutonomousCalibrationDriftEntry[];
  openClawHooks: {
    failureAnalysisMemory?: OpenClawFailureAnalysisMemory;
    scenarioRecommendation?: OpenClawScenarioRecommendation;
    proposalReview?: OpenClawProposalReview;
  };
  hermesNotification?: HermesNotificationEvent;
  safetyNotice: "Autonomous research is simulation-only. It cannot execute trades, approve Paper-Demo Candidate, send go-trader handoffs, or override readiness.";
}

export interface AutonomousResearchState {
  latestRunId?: string;
  runs: AutonomousResearchRun[];
  activeRun?: AutonomousResearchRun;
  calibrationDriftHistory: AutonomousCalibrationDriftEntry[];
  safetyNotice: AutonomousResearchRun["safetyNotice"];
}

export interface RunAutonomousResearchLoopOptions {
  state: import("@/lib/types").LabState;
  settings?: Partial<AutonomousResearchSettings>;
  signal?: AbortSignal;
  onUpdate?: (run: AutonomousResearchRun) => void;
}

export type ScenarioFamilyMapping = Record<AutonomousScenarioFamily, Pick<ScenarioSetEvaluation, "searchMode" | "maxCandidateCount">>;

export const autonomousToSafetyBlockers: Record<AutonomousResearchBlocker, AutonomyBlockerCategory> = {
  low_win_rate: "win_rate_too_low",
  low_average_r: "average_r_too_low",
  high_drawdown: "max_drawdown_too_high",
  false_positives: "false_positives_too_high",
  session_inconsistency: "session_consistency_weak",
  confidence_calibration_weak: "confidence_calibration_weak",
  insufficient_trades: "trade_count_too_low",
  evidence_quality_weak: "evidence_quality_weak",
  walk_forward_insufficient: "insufficient_walk_forward_evidence",
  walk_forward_failed: "overfitting_risk",
  maturity_too_low: "weak_maturity_history",
  regime_mismatch: "regime_mismatch"
};
