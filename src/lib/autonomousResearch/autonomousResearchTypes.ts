import type { AutoResearchSearchMode } from "@/lib/autoResearch";
import type { AutonomyBlockerCategory, AutonomySafetyDiagnosis, AutonomyScenarioFamily } from "@/lib/autonomousResearch";
import type { HermesNotificationHookState, OpenClawMemoryHookState } from "@/lib/integrations/advisoryMemoryTypes";
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
  | "active_research_source_ineligible"
  | "evidence_quality_too_low"
  | "walk_forward_repeatedly_failed"
  | "regime_mismatch_detected"
  | "llm_advisory_offline"
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
  | "regime_mismatch"
  | "regime_evidence_insufficient"
  | "regime_transition_pending"
  | "regime_specific_sample_too_small";

export type AutonomousScenarioFamily =
  | "session_focus"
  | "stop_model_focus"
  | "target_model_focus"
  | "confidence_calibration_focus"
  | "evidence_quality_focus"
  | "long_short_focus"
  | "conservative_only"
  | "walk_forward_followup"
  | "regime_specific_testing";

export type AutonomousLoopStage =
  | "idle"
  | "resolving_runtime"
  | "thesis_generation"
  | "backtest"
  | "llm_advisory"
  | "auto_research"
  | "walk_forward"
  | "self_improvement"
  | "readiness_maturity"
  | "audit_communications"
  | "completed"
  | "paused"
  | "canceled"
  | "failed";

export interface AutonomousLoopProgressEvent {
  eventId: string;
  timestamp: string;
  stage: AutonomousLoopStage;
  title: string;
  detail: string;
}

export interface AutonomousLoopProgressState {
  status: AutonomousResearchStatus;
  activeStage: AutonomousLoopStage;
  activeStageLabel: string;
  currentIteration: number;
  maxIterations: number;
  progressPercent: number;
  startedAt: string;
  updatedAt: string;
  currentTask: string;
  lastCompletedStage?: AutonomousLoopStage;
  lastCompletedStageLabel?: string;
  stopReason?: AutonomousResearchStopReason;
  stopReasonDetail?: string;
  events: AutonomousLoopProgressEvent[];
}

export interface AutonomousResearchSettings {
  maxIterations: number;
  noImprovementStop: number;
  safeImportedDataMode: boolean;
  advancedFullResearchMode: boolean;
  autoApplyPolicyEnabled: boolean;
}

export interface AutonomousPerformancePhaseTiming {
  phase: string;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  detail?: string;
  skipped?: boolean;
}

export interface AutonomousPerformanceDiagnostics {
  lastLoopDurationMs: number;
  slowestPhase?: AutonomousPerformancePhaseTiming;
  currentPhase: string;
  cancellationStatus: "idle" | "running" | "stopping" | "stopped" | "canceled";
  yieldedStepsCount: number;
  skippedHeavyDiagnostics: string[];
  lastBlocker?: string;
  sourceProvider?: string;
  sourceFingerprint?: string;
  phaseTimings: AutonomousPerformancePhaseTiming[];
  throttledUpdateCount: number;
  storageWriteCount: number;
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

export interface AutonomousResearchSourceDiagnostics {
  provider: string;
  sourceLabel: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  timeframe?: string;
  candleCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  sourceFingerprint?: string;
  eligibility: string;
  eligibilityReasons: string[];
  fallbackReason?: string;
  blocker?: string;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
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
  llmAdvisoryUnavailable?: boolean;
  llmAdvisoryUnavailableReason?: string;
  walkForwardRunId?: string;
  walkForwardVerdict?: string;
  autoApplyEligibility?: AutoApplyEligibility;
  sourceDiagnostics?: AutonomousResearchSourceDiagnostics;
  autoAppliedCalibrationId?: string;
  readinessState?: string;
  maturityScore?: number;
  status: "running" | "completed" | "warning" | "failed" | "canceled";
  notes: string[];
}

export interface AutonomousResearchRun {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: AutonomousResearchStatus;
  settings: AutonomousResearchSettings;
  currentIteration: number;
  progress: AutonomousLoopProgressState;
  iterations: AutonomousLoopIteration[];
  latestBlocker?: AutonomousResearchBlocker;
  latestScenarioFamily?: AutonomousScenarioFamily;
  latestScenarioReason?: string;
  latestCandidateResult?: string;
  latestAutoApplyEligibility?: AutoApplyEligibility;
  sourceDiagnostics?: AutonomousResearchSourceDiagnostics;
  performanceDiagnostics?: AutonomousPerformanceDiagnostics;
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
  openClawHooks: OpenClawMemoryHookState;
  hermesNotifications: HermesNotificationHookState;
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
  regime_mismatch: "regime_mismatch",
  regime_evidence_insufficient: "regime_evidence_insufficient",
  regime_transition_pending: "regime_transition_pending",
  regime_specific_sample_too_small: "regime_specific_sample_too_small"
};
