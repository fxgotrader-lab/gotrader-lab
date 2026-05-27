import type { RunFingerprint } from "@/lib/runtime/researchRuntimeTypes";

export type AdvisoryHookAuthority = "none";
export type AdvisoryHookConnectionStatus = "not_connected";
export type AdvisoryHookPlanningStatus = "planned";

export interface AdvisoryHookAuthorityEnvelope {
  executionAuthority: AdvisoryHookAuthority;
  brokerAuthority: AdvisoryHookAuthority;
  readinessOverrideAuthority: AdvisoryHookAuthority;
}

export interface AdvisoryHookSafetyLocks extends AdvisoryHookAuthorityEnvelope {
  brokerExecutionDisabled: true;
  liveTradingDisabled: true;
  goTraderHandoffAuthority: AdvisoryHookAuthority;
  paperDemoApprovalAuthority: AdvisoryHookAuthority;
}

export type OpenClawMemoryHookType =
  | "failure_analysis_memory"
  | "scenario_recommendation"
  | "proposal_review"
  | "calibration_drift_note"
  | "post_cycle_summary";

export interface AdvisoryCandidateSummary {
  candidateId?: string;
  label?: string;
  score?: number;
  resultCategory?: string;
  readinessEstimate?: string;
}

export interface AdvisoryWalkForwardSummary {
  runId?: string;
  verdict?: string;
  overfitRisk?: string;
  windowsTested?: number;
  outOfSampleWindowsPassed?: number;
  stabilityScore?: number;
}

export interface AdvisoryProposalSummary {
  proposalId?: string;
  status?: string;
  category?: string;
  sourceCycleId?: string;
  approvalRequired?: boolean;
}

export interface OpenClawMemoryHookPacket extends AdvisoryHookAuthorityEnvelope {
  eventId: string;
  eventType: OpenClawMemoryHookType;
  timestamp: string;
  cycleId?: string;
  runtimeFingerprint?: RunFingerprint;
  dataSource: string;
  evidenceQuality: number;
  maturityScore: number;
  readinessState: string;
  blockers: string[];
  scenarioFamily?: string;
  candidateSummary?: AdvisoryCandidateSummary;
  walkForwardSummary?: AdvisoryWalkForwardSummary;
  proposalSummary?: AdvisoryProposalSummary;
  safetyLocks: AdvisoryHookSafetyLocks;
}

export type OpenClawRecommendationType =
  | "remember_failure_pattern"
  | "recommend_scenario_family"
  | "review_proposal"
  | "record_calibration_drift"
  | "summarize_cycle";

export interface OpenClawMemoryHookResponse {
  mode: "advisory_memory_only";
  recommendationType: OpenClawRecommendationType;
  memoryNote: string;
  suggestedNextScenario?: string;
  riskWarnings: string[];
  missingEvidence: string[];
  confidence: number;
  authority: AdvisoryHookAuthorityEnvelope;
}

export interface OpenClawMemoryHookState {
  status: AdvisoryHookPlanningStatus;
  openClawMemory: AdvisoryHookConnectionStatus;
  packets: Partial<Record<OpenClawMemoryHookType, OpenClawMemoryHookPacket>>;
  latestResponse?: OpenClawMemoryHookResponse;
  safetyLocks: AdvisoryHookSafetyLocks;
}

export type HermesNotificationType =
  | "autonomous_loop_started"
  | "cycle_completed"
  | "calibration_auto_applied"
  | "auto_apply_blocked"
  | "walk_forward_failed"
  | "walk_forward_insufficient"
  | "maturity_improved"
  | "readiness_changed"
  | "action_required";

export interface HermesNotificationPayload {
  notificationId: string;
  eventType: HermesNotificationType;
  title: string;
  summary: string;
  severity: "info" | "warning" | "critical" | "action_required";
  routeToOpen: string;
  timestamp: string;
  authority: AdvisoryHookAuthorityEnvelope;
}

export interface HermesNotificationHookState {
  status: AdvisoryHookPlanningStatus;
  hermesNotifications: AdvisoryHookConnectionStatus;
  latestPayload?: HermesNotificationPayload;
  safetyLocks: AdvisoryHookSafetyLocks;
}
