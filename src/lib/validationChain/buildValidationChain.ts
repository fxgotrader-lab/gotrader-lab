import {
  VALIDATION_CHAIN_AUTHORITY,
  VALIDATION_CHAIN_SAFETY,
  type ValidationChainCandidateFamily,
  type ValidationChainEntry,
  type ValidationChainEvidenceSummary,
  type ValidationChainQueueResult,
  type ValidationChainRecognitionType,
  type ValidationChainReplaySummary,
  type ValidationChainSourceStatus,
  type ValidationChainWalkForwardSummary
} from "./validationChainTypes";

/**
 * Pure recognition-to-validation chain transitions.
 * Principle: recognition is not evidence; replay validation creates
 * preliminary evidence; walk-forward/OOS creates stronger evidence.
 * Keep this file free of value imports outside the validationChain module so
 * scripts/test-validation-chain.mjs can transpile it standalone.
 */

const candidateFamilyFor = (type: ValidationChainRecognitionType): ValidationChainCandidateFamily => {
  switch (type) {
    case "full_model":
    case "forming_model":
      return type === "full_model" ? "known_model" : "forming_model";
    case "pd_array_setup":
      return "pd_array";
    case "scalp_setup":
      return "scalp";
    case "market_map_only":
      return "market_map";
    case "grinch_profile":
      return "grinch";
    default:
      return "unclassified";
  }
};

const requiredValidationFor = (type: ValidationChainRecognitionType): string =>
  type === "market_map_only" || type === "insufficient_data"
    ? "More structure required before replay validation can be meaningful."
    : "Replay validation, then walk-forward/OOS validation, before any evidence claim.";

export interface ValidationChainRecognitionInput {
  recognitionId: string;
  recognitionType: ValidationChainRecognitionType;
  setupLabel: string;
  symbol: string;
  brokerSymbol?: string;
  timeframe: string;
  htfContext?: string[];
  sourceFingerprint?: string;
  sourceStatus: ValidationChainSourceStatus;
  hypothesisId?: string;
  generatedAt?: string;
}

export const queueValidationChainEntry = (input: ValidationChainRecognitionInput): ValidationChainQueueResult => {
  const now = input.generatedAt ?? new Date().toISOString();
  const base: ValidationChainEntry = {
    researchOnly: true,
    recognitionId: input.recognitionId,
    recognitionType: input.recognitionType,
    setupLabel: input.setupLabel,
    candidateFamily: candidateFamilyFor(input.recognitionType),
    requiredValidation: requiredValidationFor(input.recognitionType),
    symbol: input.symbol,
    brokerSymbol: input.brokerSymbol,
    timeframe: input.timeframe,
    htfContext: input.htfContext ?? [],
    sourceFingerprint: input.sourceFingerprint ?? "no fingerprint",
    sourceStatus: input.sourceStatus,
    hypothesisStatus: "not_queued",
    hypothesisId: input.hypothesisId,
    paperDemoChecklistImpact: "Recognition alone does not affect the Paper-Demo checklist. It is not evidence.",
    nextAction: "Queue replay validation against the active MT5 read-only research source.",
    blockers: [],
    createdAt: now,
    updatedAt: now,
    executionIntent: "none",
    authority: VALIDATION_CHAIN_AUTHORITY,
    safety: VALIDATION_CHAIN_SAFETY
  };

  if (input.sourceStatus.isMockOrSample) {
    return {
      ok: false,
      reason:
        "Mock/sample recognition cannot create research evidence. Activate MT5 research mode before queueing validation.",
      entry: {
        ...base,
        hypothesisStatus: "not_queued",
        blockers: ["Source is mock/sample - sample-only, not research evidence."],
        nextAction: "Activate MT5 before validation."
      }
    };
  }

  return {
    ok: true,
    entry: {
      ...base,
      hypothesisStatus: "replay_required",
      nextAction: "Run replay validation for this recognition.",
      paperDemoChecklistImpact:
        "Blocked for Paper-Demo: replay validation and walk-forward/OOS validation have not run yet."
    }
  };
};

export const markValidationChainReplayRunning = (entry: ValidationChainEntry, at = new Date().toISOString()): ValidationChainEntry => ({
  ...entry,
  hypothesisStatus: "replay_running",
  nextAction: "Replay validation is running. Wait for the compact replay summary.",
  updatedAt: at
});

export const applyValidationChainReplayResult = (
  entry: ValidationChainEntry,
  replay: ValidationChainReplaySummary
): ValidationChainEntry => {
  const passed = replay.verdict === "passed";
  const failed = replay.verdict === "failed";
  return {
    ...entry,
    replayResult: replay,
    hypothesisStatus: passed ? "walk_forward_required" : failed ? "replay_failed" : "needs_more_data",
    nextAction: passed
      ? "Replay passed (preliminary evidence). Run walk-forward/OOS validation next."
      : failed
        ? "Replay failed. Revise or discard this hypothesis; walk-forward is blocked."
        : "Replay produced too little data. Collect more MT5 read-only history and re-run replay.",
    blockers: failed
      ? [...entry.blockers.filter((blocker) => !blocker.startsWith("Replay")), `Replay failed: ${replay.reason}`]
      : entry.blockers.filter((blocker) => !blocker.startsWith("Replay")),
    paperDemoChecklistImpact: passed
      ? "Preliminary evidence only: replay passed, but walk-forward/OOS validation is still required before Paper-Demo consideration."
      : "Blocked for Paper-Demo: replay validation has not passed.",
    updatedAt: replay.generatedAt
  };
};

export const markValidationChainWalkForwardRunning = (
  entry: ValidationChainEntry,
  at = new Date().toISOString()
): ValidationChainEntry => ({
  ...entry,
  hypothesisStatus: "walk_forward_running",
  nextAction: "Walk-forward validation is running.",
  updatedAt: at
});

export const applyValidationChainWalkForwardResult = (
  entry: ValidationChainEntry,
  walkForward: ValidationChainWalkForwardSummary
): ValidationChainEntry => {
  if (entry.hypothesisStatus === "replay_failed" || entry.hypothesisStatus === "rejected") {
    return {
      ...entry,
      blockers: [
        ...entry.blockers.filter((blocker) => !blocker.startsWith("Walk-forward ignored")),
        "Walk-forward ignored: replay validation has not passed for this recognition."
      ],
      updatedAt: walkForward.generatedAt
    };
  }
  const passed = walkForward.verdict === "passed";
  const failed = walkForward.verdict === "failed";
  return {
    ...entry,
    walkForwardResult: walkForward,
    hypothesisStatus: passed ? "walk_forward_passed" : failed ? "walk_forward_failed" : "needs_more_data",
    nextAction: passed
      ? "Walk-forward passed. Review evidence quality, maturity, and Paper-Demo checklist gates."
      : failed
        ? "Walk-forward failed out-of-sample. Treat this recognition as rejected research, not evidence."
        : "Walk-forward needs more data/windows. Extend history before drawing conclusions.",
    paperDemoChecklistImpact: passed
      ? "Stronger evidence recorded. Paper-Demo progression still requires deterministic evidence/maturity/readiness gates."
      : "Blocked for Paper-Demo: walk-forward/OOS validation has not passed.",
    updatedAt: walkForward.generatedAt
  };
};

export const applyValidationChainEvidenceUpdate = (
  entry: ValidationChainEntry,
  evidence: ValidationChainEvidenceSummary
): ValidationChainEntry => ({
  ...entry,
  evidenceQuality: evidence,
  hypothesisStatus:
    entry.hypothesisStatus === "walk_forward_passed" ? "evidence_updated" : entry.hypothesisStatus,
  nextAction:
    entry.hypothesisStatus === "walk_forward_passed"
      ? "Evidence/maturity updated. Deterministic readiness gates decide any further progression."
      : entry.nextAction,
  updatedAt: evidence.generatedAt
});

export const rejectValidationChainEntry = (
  entry: ValidationChainEntry,
  reason: string,
  at = new Date().toISOString()
): ValidationChainEntry => ({
  ...entry,
  hypothesisStatus: "rejected",
  blockers: [...entry.blockers, reason],
  nextAction: "Rejected. Form a new hypothesis from fresh recognition.",
  updatedAt: at
});

export const describeValidationChainStage = (entry: ValidationChainEntry): string => {
  switch (entry.hypothesisStatus) {
    case "not_queued":
      return "Recognition only - not evidence.";
    case "queued":
    case "replay_required":
      return "Queued - replay validation required. Recognition is not evidence.";
    case "replay_running":
      return "Replay validation running.";
    case "replay_passed":
    case "walk_forward_required":
      return "Replay passed - preliminary evidence. Walk-forward/OOS required.";
    case "replay_failed":
      return "Replay failed - hypothesis blocked.";
    case "walk_forward_running":
      return "Walk-forward validation running.";
    case "walk_forward_passed":
      return "Walk-forward passed - stronger research evidence.";
    case "walk_forward_failed":
      return "Walk-forward failed out-of-sample - rejected as evidence.";
    case "evidence_updated":
      return "Evidence and maturity updated from validated results.";
    case "rejected":
      return "Rejected research hypothesis.";
    default:
      return "Needs more data before any validation verdict.";
  }
};
