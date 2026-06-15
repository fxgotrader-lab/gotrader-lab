import type {
  OpenClawPilotAuthority,
  OpenClawPilotForbiddenField,
  OpenClawPilotPermission,
  OpenClawPilotProgram,
  OpenClawPilotProgramSummary,
  OpenClawPilotProgramValidationResult,
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
  "apiKeys",
  "tokensPasswords",
  "mt5Credentials",
  "accountData",
  "orderData",
  "positionData",
  "brokerMutation",
  "executionRequest",
  "readinessOverride",
  "activeCalibrationMutation",
  "applyCalibration",
  "approveCalibrationProposal",
  "autoApply",
  "screenshotsBase64",
  "importedOhlcvArrays"
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
    "No applyCalibration or approveCalibrationProposal.",
    "No raw candle arrays, raw runtime snapshots, screenshots/base64, imported OHLCV arrays, secrets, API keys, tokens, passwords, or MT5 credentials.",
    "OpenClaw cannot edit docs/openclaw/program.md."
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
    "ict_hypothesis_validation",
    "silver_bullet_v2_refined_research",
    "turtle_soup_v1",
    "cisd_v1",
    "ifvg_v1",
    "ifvg_filtered_v2_research"
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

/**
 * Browser-safe program loader. The app cannot read docs/openclaw/program.md at
 * runtime, so the embedded program mirrors the human-editable docs file.
 */
export function loadOpenClawPilotProgram(program?: Partial<OpenClawPilotProgram>): OpenClawPilotProgram {
  if (!program) {
    return openClawPilotProgram;
  }
  return {
    ...openClawPilotProgram,
    ...program,
    safetyBoundary: program.safetyBoundary ?? openClawPilotProgram.safetyBoundary,
    constraints: program.constraints ?? openClawPilotProgram.constraints,
    optimizationPriorities: program.optimizationPriorities ?? openClawPilotProgram.optimizationPriorities,
    allowedProposalFamilies: program.allowedProposalFamilies ?? openClawPilotProgram.allowedProposalFamilies,
    permissions: program.permissions ?? openClawPilotProgram.permissions,
    requiredValidationGates: program.requiredValidationGates ?? openClawPilotProgram.requiredValidationGates
  };
}

export function summarizeOpenClawPilotProgram(program: OpenClawPilotProgram = openClawPilotProgram): OpenClawPilotProgramSummary {
  return {
    programId: program.programId,
    version: program.version,
    phase: program.phase,
    name: program.name,
    summary: program.summary,
    allowedProposalFamilies: [...program.allowedProposalFamilies],
    requiredValidationGates: [...program.requiredValidationGates],
    authority: openClawPilotAuthorityNone,
    autoApplyAllowed: false,
    forbiddenFieldCount: program.safetyBoundary.forbiddenFields.length
  };
}

export function validateOpenClawPilotProgram(
  program: OpenClawPilotProgram = openClawPilotProgram
): OpenClawPilotProgramValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!program.programId.trim()) errors.push("programId is required.");
  if (!program.version.trim()) errors.push("version is required.");
  if (program.phase !== "phase_1_program_file") {
    warnings.push(`Program phase is ${program.phase}; Phase 1 dry-run expects phase_1_program_file.`);
  }
  if (!program.constraints.length) errors.push("constraints are required.");
  if (!program.optimizationPriorities.length) errors.push("optimization priorities are required.");
  if (!program.allowedProposalFamilies.length) errors.push("allowed proposal families are required.");
  if (!program.requiredValidationGates.length) errors.push("required validation gates are required.");
  if (!assertOpenClawPilotAuthorityNone(program.safetyBoundary.authority)) {
    errors.push("authority must remain none/none/none.");
  }
  if (program.safetyBoundary.autoApplyAllowed !== false) {
    errors.push("autoApplyAllowed must be false.");
  }
  if (program.safetyBoundary.openClawCanApproveReadiness !== false) {
    errors.push("OpenClaw cannot approve readiness.");
  }
  if (program.safetyBoundary.openClawCanPlaceTrades !== false) {
    errors.push("OpenClaw cannot place trades.");
  }
  if (program.safetyBoundary.openClawCanCallMt5 !== false) {
    errors.push("OpenClaw cannot call MT5.");
  }
  if (program.safetyBoundary.openClawCanMutateBrokerState !== false) {
    errors.push("OpenClaw cannot mutate broker state.");
  }
  const missingForbiddenFields = openClawPilotForbiddenFields.filter(
    (field) => !program.safetyBoundary.forbiddenFields.includes(field)
  );
  if (missingForbiddenFields.length) {
    errors.push(`forbidden fields missing: ${missingForbiddenFields.join(", ")}`);
  }
  const summary = `${program.name} v${program.version}: ${program.summary}`;
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary
  };
}
