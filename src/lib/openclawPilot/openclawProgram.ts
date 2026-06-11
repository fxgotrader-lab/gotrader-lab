import type {
  OpenClawPilotAuthority,
  OpenClawPilotForbiddenField,
  OpenClawPilotPermission,
  OpenClawPilotProgram,
  OpenClawPilotSafetyBoundary
} from "@/lib/openclawPilot/openclawPilotTypes";

export const openClawPilotAuthorityNone: OpenClawPilotAuthority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

export const openClawPilotForbiddenFields: OpenClawPilotForbiddenField[] = [
  "rawCandles",
  "candleArrays",
  "rawRuntimeSnapshot",
  "secrets",
  "mt5Credentials",
  "accountData",
  "orderData",
  "positionData",
  "brokerMutation",
  "executionRequest",
  "readinessOverride",
  "activeCalibrationMutation",
  "autoApply"
];

export const openClawPilotPermissions: OpenClawPilotPermission[] = [
  "read_program",
  "receive_compact_advisory_packet",
  "return_structured_advisory",
  "create_draft_proposal_intent",
  "create_memory_summary",
  "create_audit_entry",
  "request_deterministic_validation"
];

export const openClawPilotSafetyBoundary: OpenClawPilotSafetyBoundary = {
  authority: openClawPilotAuthorityNone,
  autoApplyAllowed: false,
  openClawCanApproveReadiness: false,
  openClawCanPlaceTrades: false,
  openClawCanCallMt5: false,
  openClawCanMutateBrokerState: false,
  forbiddenFields: openClawPilotForbiddenFields,
  notes: [
    "OpenClaw is advisory and calibration-context only.",
    "GoTrader deterministic gates own readiness, evidence, maturity, walk-forward, and proposal status.",
    "OpenClaw proposal intents are draft-only and cannot mutate active calibration storage."
  ]
};

export const openClawPilotRequiredValidationGates = [
  "AI Research Cycle",
  "Backtest",
  "Replay snapshot",
  "Walk-forward",
  "Evidence quality",
  "Research maturity",
  "Readiness gate",
  "Research Committee",
  "Paper-Demo Candidate checklist",
  "Safety authority check"
];

export const openClawPilotProgram: OpenClawPilotProgram = {
  programId: "gotrader_openclaw_pilot",
  version: "0.1.0",
  updatedAt: "2026-06-11",
  phase: "phase_1_program_file",
  name: "GoTrader OpenClaw Pilot",
  summary:
    "Research-only OpenClaw pilot for advisory review, memory summaries, reflection, and draft proposal intent around deterministic GoTrader outputs.",
  constraints: [
    "No broker execution.",
    "No live trading.",
    "No order placement.",
    "No MT5 execution or MT5 tool calls by OpenClaw.",
    "No account, order, or position data.",
    "No readiness override.",
    "No auto-apply.",
    "No active calibration mutation.",
    "No raw candle arrays, raw runtime snapshots, screenshots, secrets, or MT5 credentials."
  ],
  optimizationPriorities: [
    "Explain deterministic GoTrader research clearly.",
    "Identify recurring blockers and evidence gaps.",
    "Suggest research-only candidate families.",
    "Preserve MT5 read-only CFD/proxy source labeling.",
    "Require walk-forward, evidence, maturity, readiness, and Paper-Demo checklist review before proposal progression."
  ],
  allowedProposalFamilies: [
    "model_1_timing_recheck",
    "reversal_expansion_confirmation",
    "consolidation_range_tightness",
    "liquidity_raid_detection",
    "timing_window_sensitivity",
    "pd_array_alignment_review",
    "cmd_paper_watchlist_tracking_review",
    "ict_hypothesis_validation"
  ],
  permissions: openClawPilotPermissions,
  safetyBoundary: openClawPilotSafetyBoundary,
  requiredValidationGates: openClawPilotRequiredValidationGates
};

export function assertOpenClawPilotAuthorityNone(authority: OpenClawPilotAuthority): boolean {
  return (
    authority.executionAuthority === "none" &&
    authority.brokerAuthority === "none" &&
    authority.readinessOverrideAuthority === "none"
  );
}

