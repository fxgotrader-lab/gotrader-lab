import type { CalibrationProposalChanges } from "@/lib/selfImprovement";

export type AutonomyBlockerCategory =
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
  | "insufficient_walk_forward_evidence"
  | "weak_maturity_history"
  | "evidence_quality_weak"
  | "maturity_degradation"
  | "regime_mismatch"
  | "regime_shift_detected"
  | "regime_evidence_insufficient"
  | "regime_transition_pending"
  | "regime_specific_sample_too_small";

export type AutonomyScenarioFamily =
  | "trade_quality"
  | "session_focus"
  | "stop_model_focus"
  | "long_short_focus"
  | "conservative_only"
  | "walk_forward_evidence"
  | "confidence_calibration"
  | "regime_specific_testing";

export interface AutonomySafetyPolicy {
  autoApplyEnabled: false;
  maxMaturityDropPerAutoApply: number;
  allowMinorInsufficientEvidenceException: boolean;
  minorChangeLimits: {
    confluenceThresholdDelta: number;
    confidenceThresholdDelta: number;
    targetRMultipleDelta: number;
    agentWeightDelta: number;
    allowSessionOrDirectionLockout: false;
    allowStopModelChange: false;
  };
  minimumEvidenceQualityScore: number;
  minimumSampleSize: number;
  minimumCalibrationSurvivalCount: number;
  trendBasicCycleMinimum: number;
  trendReliableCycleMinimum: number;
}

export interface MaturityTrendAvailability {
  cyclesObserved: number;
  basicTrendMinimum: number;
  reliableTrendMinimum: number;
  basicTrendAvailable: boolean;
  reliableTrendAvailable: boolean;
  message: string;
}

export interface ScenarioSelectionReasoning {
  reasoningId: string;
  timestamp: string;
  selectedScenarioFamily: AutonomyScenarioFamily;
  blockers: AutonomyBlockerCategory[];
  consecutiveCount: number;
  evidenceUsed: string[];
  rejectedScenarioFamilies: Array<{
    scenarioFamily: AutonomyScenarioFamily;
    reason: string;
  }>;
  reasoningSummary: string;
}

export interface AutonomySafetyDiagnosis {
  diagnosisId: string;
  generatedAt: string;
  policy: AutonomySafetyPolicy;
  blockerCategories: AutonomyBlockerCategory[];
  autoApplyAllowed: boolean;
  autoApplyBlocked: boolean;
  blockReasons: string[];
  regimeMismatchPaused: boolean;
  walkForwardEvidenceSufficient: boolean;
  walkForwardEvidenceStatus: string;
  maturityDropBlocked: boolean;
  maturityDrop?: number;
  maturityScore: number;
  maturityGrade: string;
  evidenceQualityScore: number;
  trendStatus: MaturityTrendAvailability;
  scenarioSelection: ScenarioSelectionReasoning;
  safetyNotice: "Autonomous research is research-only. It cannot execute trades, approve trades, or override readiness gates.";
}

export interface MinorCalibrationChangeCheck {
  isMinor: boolean;
  reasons: string[];
  changes: CalibrationProposalChanges;
}

export interface AutonomySafetyState {
  latestDiagnosisId?: string;
  diagnoses: AutonomySafetyDiagnosis[];
  scenarioSelectionHistory: ScenarioSelectionReasoning[];
  safetyNotice: AutonomySafetyDiagnosis["safetyNotice"];
}
