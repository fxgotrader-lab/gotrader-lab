import {
  canApproveProposal,
  effectiveProposalComparison,
  hasMaterialProposalMetricChange,
  isNoOpProposalSnapshot,
  loadSelfImprovementState,
  proposalSnapshotMismatchReasons,
  saveApprovedResearchCalibration,
  saveSelfImprovementState,
  type CalibrationProposal,
  type CalibrationProposalChanges
} from "@/lib/selfImprovement";
import {
  checkMinorCalibrationChange,
  defaultAutonomySafetyPolicy,
  diagnoseAutonomySafety,
  type AutonomySafetyDiagnosis,
  type AutonomySafetyPolicy
} from "@/lib/autonomousResearch";
import type { AutoApplyEligibility, AutonomousCalibrationDriftEntry } from "@/lib/autonomousResearch/autonomousResearchTypes";
import type { ResearchRuntimeSnapshot } from "@/lib/runtime";
import { safeArray, uid } from "@/lib/utils";
import type { WalkForwardRun } from "@/lib/walkForward";

const allowedChangeKeys = new Set([
  "confluenceThreshold",
  "confidenceThreshold",
  "sessionFilter",
  "stopModel",
  "targetRMultiple",
  "allowLong",
  "allowShort",
  "ictScoringWeights",
  "agentWeights",
  "confidencePenaltyRules",
  "evidenceQualityPenaltyRules"
]);

const changeDelta = (a?: number, b?: number) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) : 0;

const hasOnlyAllowedChanges = (changes: CalibrationProposalChanges) =>
  Object.keys(changes).every((key) => allowedChangeKeys.has(key));

const boundedChangeReasons = (
  proposal: CalibrationProposal,
  snapshot: ResearchRuntimeSnapshot,
  policy: AutonomySafetyPolicy
) => {
  const changes = proposal.proposedChanges;
  const config = snapshot.activeConfig.resolvedBacktestConfig;
  const reasons: string[] = [];
  if (!hasOnlyAllowedChanges(changes)) {
    reasons.push("Proposal contains changes outside allowed research calibration fields.");
  }
  if (changeDelta(changes.confluenceThreshold, config.minimumConfluenceThreshold) > 0.12) {
    reasons.push("Confluence threshold change is too large for autonomous research auto-apply.");
  }
  if (changeDelta(changes.confidenceThreshold, config.minimumConfidenceThreshold) > 0.12) {
    reasons.push("Confidence threshold change is too large for autonomous research auto-apply.");
  }
  if (changeDelta(changes.targetRMultiple, config.targetRMultiple) > 0.75) {
    reasons.push("Target R multiple change is too large for autonomous research auto-apply.");
  }
  if (changes.agentWeights) {
    Object.entries(changes.agentWeights).forEach(([agentId, next]) => {
      const current = config.agentWeights[agentId as keyof typeof config.agentWeights];
      if (typeof next === "number" && typeof current === "number" && Math.abs(next - current) > 0.2) {
        reasons.push(`${agentId} agent weight change is too large for autonomous auto-apply.`);
      }
    });
  }
  if (snapshot.walkForward.verdict === "insufficient_evidence" && !policy.allowMinorInsufficientEvidenceException) {
    reasons.push("Walk-forward insufficient evidence blocks auto-apply by default.");
  }
  if (snapshot.walkForward.verdict === "insufficient_evidence" && policy.allowMinorInsufficientEvidenceException) {
    const minorCheck = checkMinorCalibrationChange(changes, config, policy);
    if (!minorCheck.isMinor) {
      reasons.push(...minorCheck.reasons);
    }
  }
  return reasons;
};

export function evaluateAutoApplyEligibility({
  autoApplyPolicyEnabled,
  previousAppliedPatch,
  proposal,
  snapshot,
  safetyDiagnosis = diagnoseAutonomySafety(snapshot),
  walkForwardRun,
  policy = defaultAutonomySafetyPolicy
}: {
  autoApplyPolicyEnabled: boolean;
  previousAppliedPatch?: CalibrationProposalChanges;
  proposal?: CalibrationProposal;
  snapshot: ResearchRuntimeSnapshot;
  safetyDiagnosis?: AutonomySafetyDiagnosis;
  walkForwardRun?: WalkForwardRun;
  policy?: AutonomySafetyPolicy;
}): AutoApplyEligibility {
  if (!proposal) {
    return {
      eligible: false,
      applied: false,
      status: "no_candidate",
      reasons: ["No research calibration proposal available."],
      boundedChange: false,
      policyModeEnabled: autoApplyPolicyEnabled
    };
  }

  const reasons: string[] = [];
  const approvalCheck = canApproveProposal(proposal);
  const comparison = effectiveProposalComparison(proposal);
  const afterMetrics = proposal.metricsSnapshot?.afterMetrics ?? proposal.afterMetrics;
  const boundedReasons = boundedChangeReasons(proposal, snapshot, policy);
  const priorPatchMatches =
    previousAppliedPatch && JSON.stringify(previousAppliedPatch) === JSON.stringify(proposal.proposedChanges);

  if (!autoApplyPolicyEnabled) reasons.push("Autonomous auto-apply policy mode is disabled.");
  if (proposal.proposalIntent !== "research_calibration_candidate") {
    reasons.push("Only research calibration candidates can be auto-applied.");
  }
  if (proposal.status !== "proposed" && proposal.status !== "testing") {
    reasons.push(`Proposal status ${proposal.status} is not eligible for auto-apply.`);
  }
  if (!approvalCheck.canApprove) reasons.push(...approvalCheck.reasons);
  if (!hasMaterialProposalMetricChange(proposal) || isNoOpProposalSnapshot(proposal)) {
    reasons.push("Proposal has no material positive baseline change.");
  }
  if (proposalSnapshotMismatchReasons(proposal).length) {
    reasons.push(...proposalSnapshotMismatchReasons(proposal));
  }
  if (safeArray(comparison?.criticalRegressions).length) {
    reasons.push("Proposal has critical metric regressions.");
  }
  if ((afterMetrics?.totalTrades ?? 0) < policy.minimumSampleSize) {
    reasons.push(`Sample size ${afterMetrics?.totalTrades ?? 0} is below minimum ${policy.minimumSampleSize}.`);
  }
  if (snapshot.evidence.evidenceQualityScore < policy.minimumEvidenceQualityScore) {
    reasons.push(`Evidence quality ${snapshot.evidence.evidenceQualityScore}/100 is below ${policy.minimumEvidenceQualityScore}/100.`);
  }
  if (snapshot.walkForward.verdict === "fail") reasons.push("Walk-forward failed.");
  if (snapshot.walkForward.verdict === "insufficient_evidence") {
    reasons.push("Walk-forward insufficient evidence blocks auto-apply.");
  }
  if (walkForwardRun?.stability?.verdict === "fail") reasons.push("Latest candidate walk-forward failed.");
  if (safetyDiagnosis.regimeMismatchPaused) reasons.push("Regime mismatch paused the autonomous loop.");
  if (safetyDiagnosis.maturityDropBlocked) reasons.push("Maturity drop guard blocked auto-apply.");
  if (snapshot.llm.providerConfigured && !snapshot.llm.advisoryPassed) {
    reasons.push("Configured LLM advisory review has not passed.");
  }
  if (priorPatchMatches) reasons.push("Cooldown/oscillation guard blocked repeated identical patch.");
  reasons.push(...boundedReasons);

  return {
    eligible: reasons.length === 0,
    applied: false,
    status: reasons.length === 0 ? "eligible" : "blocked",
    proposalId: proposal.proposalId,
    reasons,
    allowedChanges: proposal.proposedChanges,
    boundedChange: boundedReasons.length === 0,
    policyModeEnabled: autoApplyPolicyEnabled,
    walkForwardVerdict: walkForwardRun?.stability?.verdict ?? snapshot.walkForward.verdict,
    maturityScoreBefore: snapshot.maturity.maturityScore,
    maturityScoreAfter: snapshot.maturity.maturityScore
  };
}

export function autoApplyResearchCalibration({
  eligibility,
  proposal,
  runId,
  snapshot
}: {
  eligibility: AutoApplyEligibility;
  proposal?: CalibrationProposal;
  runId: string;
  snapshot: ResearchRuntimeSnapshot;
}) {
  if (!proposal || !eligibility.eligible) {
    return {
      eligibility,
      driftEntry: undefined
    };
  }

  const baselineConfig = snapshot.activeConfig.resolvedBacktestConfig;
  const activeCalibration = saveApprovedResearchCalibration(proposal, baselineConfig);
  const state = loadSelfImprovementState();
  const updated: CalibrationProposal = {
    ...proposal,
    status: "accepted",
    approvedAt: activeCalibration.approvedAt,
    autoApplyStatus: "auto_applied",
    autoAppliedAt: activeCalibration.approvedAt,
    autoAppliedBy: "autonomous_research_supervisor",
    autoApplyRunId: runId,
    approvalNotes: "Auto-applied by autonomous research supervisor as a research-only calibration. Rerun validation and readiness; broker execution remains disabled.",
    proposedConfig: activeCalibration.activeConfigAfter
  };
  saveSelfImprovementState({
    ...state,
    proposals: state.proposals.map((item) => (item.proposalId === proposal.proposalId ? updated : item)),
    latestProposalId: updated.proposalId,
    lastAcceptedProposalId: updated.proposalId,
    activeResearchCalibration: activeCalibration,
    auditTrail: [
      {
        id: uid("self_improvement_audit"),
        timestamp: activeCalibration.approvedAt,
        proposalId: proposal.proposalId,
        action: "accepted",
        reviewerName: "autonomous research supervisor",
        notes: "Auto-applied safe research calibration only. Broker/demo/live/readiness authority remained none."
      },
      ...state.auditTrail
    ]
  });

  const driftEntry: AutonomousCalibrationDriftEntry = {
    id: uid("autonomy_drift"),
    timestamp: activeCalibration.approvedAt,
    proposalId: proposal.proposalId,
    appliedConfigPatch: activeCalibration.appliedConfigPatch,
    maturityScoreBefore: snapshot.maturity.maturityScore,
    maturityScoreAfter: snapshot.maturity.maturityScore,
    evidenceQualityScore: snapshot.evidence.evidenceQualityScore,
    walkForwardVerdict: eligibility.walkForwardVerdict
  };

  return {
    eligibility: {
      ...eligibility,
      applied: true,
      status: "applied" as const,
      reasons: ["Auto-applied research-only calibration under autonomy safety policy."]
    },
    driftEntry
  };
}

export function markProposalAutoApplyBlocked(proposal: CalibrationProposal | undefined, eligibility: AutoApplyEligibility) {
  if (!proposal || eligibility.eligible) {
    return;
  }
  const state = loadSelfImprovementState();
  const updated: CalibrationProposal = {
    ...proposal,
    autoApplyStatus: "blocked",
    autoApplyBlockedReasons: eligibility.reasons
  };
  saveSelfImprovementState({
    ...state,
    proposals: state.proposals.map((item) => (item.proposalId === proposal.proposalId ? updated : item)),
    latestProposalId: updated.proposalId
  });
}
