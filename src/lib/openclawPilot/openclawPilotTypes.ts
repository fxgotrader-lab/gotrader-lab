export type OpenClawPilotPhase =
  | "phase_0_current_boundary"
  | "phase_1_program_file"
  | "phase_2_memory_audit_packets"
  | "phase_3_proposal_intent"
  | "phase_4_validation_pipeline"
  | "phase_5_self_improvement_integration"
  | "phase_6_future_execution_request_model";

export type OpenClawPilotPermission =
  | "read_program"
  | "receive_compact_advisory_packet"
  | "return_structured_advisory"
  | "create_draft_proposal_intent"
  | "create_memory_summary"
  | "create_audit_entry"
  | "request_deterministic_validation";

export type OpenClawPilotForbiddenField =
  | "rawCandles"
  | "candleArrays"
  | "rawRuntimeSnapshot"
  | "secrets"
  | "apiKeys"
  | "tokensPasswords"
  | "mt5Credentials"
  | "accountData"
  | "orderData"
  | "positionData"
  | "brokerMutation"
  | "executionRequest"
  | "readinessOverride"
  | "activeCalibrationMutation"
  | "applyCalibration"
  | "approveCalibrationProposal"
  | "autoApply"
  | "screenshotsBase64"
  | "importedOhlcvArrays";

export interface OpenClawPilotAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface OpenClawPilotSafetyBoundary {
  authority: OpenClawPilotAuthority;
  autoApplyAllowed: false;
  openClawCanApproveReadiness: false;
  openClawCanPlaceTrades: false;
  openClawCanCallMt5: false;
  openClawCanMutateBrokerState: false;
  forbiddenFields: OpenClawPilotForbiddenField[];
  notes: string[];
}

export interface OpenClawPilotProgram {
  programId: string;
  version: string;
  updatedAt: string;
  phase: OpenClawPilotPhase;
  name: string;
  summary: string;
  constraints: string[];
  optimizationPriorities: string[];
  allowedProposalFamilies: string[];
  permissions: OpenClawPilotPermission[];
  safetyBoundary: OpenClawPilotSafetyBoundary;
  requiredValidationGates: string[];
}

export interface OpenClawPilotProgramValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: string;
}

export interface OpenClawPilotProgramSummary {
  programId: string;
  version: string;
  phase: OpenClawPilotPhase;
  name: string;
  summary: string;
  allowedProposalFamilies: string[];
  requiredValidationGates: string[];
  authority: OpenClawPilotAuthority;
  autoApplyAllowed: false;
  forbiddenFieldCount: number;
}

export interface OpenClawPilotProposalIntent {
  intentId: string;
  createdAt: string;
  source: "openclaw";
  title: string;
  targetSubsystem: string;
  candidateFamilies: string[];
  rationale: string;
  status:
    | "draft_intent"
    | "queued_for_validation"
    | "testing"
    | "rejected"
    | "needs_more_data"
    | "ready_for_human_review";
  autoApplyAllowed: false;
  requiresWalkForward: true;
  requiredValidationGates: string[];
  authority: OpenClawPilotAuthority;
}

export interface OpenClawPilotValidationResult {
  valid: boolean;
  status: "passed" | "failed";
  blockedFields: string[];
  errors: string[];
  warnings: string[];
  authority: OpenClawPilotAuthority;
  autoApplyAllowed: false;
  programSummary: OpenClawPilotProgramSummary;
}

export interface OpenClawPilotAuditEntry {
  id: string;
  auditId: string;
  timestamp: string;
  eventType:
    | "program_loaded"
    | "program_validation_failed"
    | "advisory_packet_sent"
    | "advisory_response_received"
    | "unsafe_response_rejected"
    | "proposal_intent_created"
    | "proposal_intent_rejected"
    | "memory_packet_created"
    | "validation_required"
    | "dry_run_passed"
    | "dry_run_rejected";
  summary: string;
  compactSummary?: string;
  relatedPacketId?: string;
  relatedIntentId?: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  sourceProvider?: string;
  sourceFingerprint?: string;
  validationResult?: OpenClawPilotValidationResult;
  blockedFields?: string[];
  nextAction?: string;
  authority: OpenClawPilotAuthority;
  forbiddenFieldsAbsent: true;
  exclusions?: OpenClawPilotForbiddenField[];
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
    screenshotsBase64Excluded: true;
    importedOhlcvArraysExcluded: true;
  };
}

export interface OpenClawPilotMemoryEntry {
  memoryId: string;
  timestamp: string;
  memoryType:
    | "cycle_summary"
    | "walk_forward_summary"
    | "self_improvement_summary"
    | "gap_analysis"
    | "reflection";
  summary: string;
  sourceProvider?: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  sourceFingerprint?: string;
  blockers: string[];
  nextAction: string;
  exclusions: OpenClawPilotForbiddenField[];
  authority: OpenClawPilotAuthority;
}
