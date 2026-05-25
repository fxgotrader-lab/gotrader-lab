import {
  loadBacktestConfig,
  sanitizeBacktestConfig,
  saveBacktestConfig
} from "@/lib/backtesting";
import type { ResolvedBacktestConfig } from "@/lib/backtesting";
import {
  loadICTScoringWeights,
  saveICTScoringWeights
} from "@/lib/ict";
import type {
  ActiveResearchCalibration,
  CalibrationProposal,
  CalibrationProposalChanges,
  SelfImprovementAuditEntry,
  SelfImprovementState
} from "@/lib/selfImprovement/selfImprovementTypes";
import { uid } from "@/lib/utils";

export const SELF_IMPROVEMENT_STORAGE_KEY = "gotrader_ai_lab_self_improvement_state";
export const SELF_IMPROVEMENT_UPDATED_EVENT = "gotrader-ai-lab-self-improvement-updated";
export const ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT = "gotrader-ai-lab-active-research-calibration-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const initialState = (): SelfImprovementState => ({
  proposals: [],
  auditTrail: [],
  safetyNotice: "Simulation self-improvement only. Broker execution remains disabled."
});

const auditEntry = (
  proposalId: string,
  action: SelfImprovementAuditEntry["action"],
  notes: string,
  reviewerName?: string
): SelfImprovementAuditEntry => ({
  id: uid("self_improvement_audit"),
  timestamp: new Date().toISOString(),
  proposalId,
  action,
  reviewerName,
  notes
});

const publish = (state: SelfImprovementState) => {
  if (isBrowser()) {
    window.localStorage.setItem(SELF_IMPROVEMENT_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(SELF_IMPROVEMENT_UPDATED_EVENT, { detail: state }));
    window.dispatchEvent(new CustomEvent(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, { detail: state.activeResearchCalibration }));
  }
  return state;
};

export function loadSelfImprovementState(): SelfImprovementState {
  if (!isBrowser()) {
    return initialState();
  }

  const raw = window.localStorage.getItem(SELF_IMPROVEMENT_STORAGE_KEY);
  if (!raw) {
    return publish(initialState());
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SelfImprovementState>;
    return {
      ...initialState(),
      ...parsed,
      proposals: parsed.proposals ?? [],
      auditTrail: parsed.auditTrail ?? [],
      activeResearchCalibration: parsed.activeResearchCalibration
    };
  } catch {
    return publish(initialState());
  }
}

export function saveSelfImprovementState(state: SelfImprovementState): SelfImprovementState {
  return publish({
    ...initialState(),
    ...state,
    safetyNotice: "Simulation self-improvement only. Broker execution remains disabled."
  });
}

export function upsertCalibrationProposal(
  proposal: CalibrationProposal,
  action: SelfImprovementAuditEntry["action"] = "created",
  notes = "Calibration proposal saved locally."
): SelfImprovementState {
  const state = loadSelfImprovementState();
  const existing = state.proposals.some((item) => item.proposalId === proposal.proposalId);
  const proposals = existing
    ? state.proposals.map((item) => (item.proposalId === proposal.proposalId ? proposal : item))
    : [proposal, ...state.proposals];

  return saveSelfImprovementState({
    ...state,
    proposals,
    latestProposalId: proposal.proposalId,
    auditTrail: [auditEntry(proposal.proposalId, action, notes), ...state.auditTrail]
  });
}

const updateProposal = (
  proposalId: string,
  updater: (proposal: CalibrationProposal) => CalibrationProposal,
  action: SelfImprovementAuditEntry["action"],
  notes: string,
  reviewerName?: string
) => {
  const state = loadSelfImprovementState();
  const target = state.proposals.find((proposal) => proposal.proposalId === proposalId);
  if (!target) {
    return state;
  }
  const updated = updater(target);
  return saveSelfImprovementState({
    ...state,
    proposals: state.proposals.map((proposal) => (proposal.proposalId === proposalId ? updated : proposal)),
    latestProposalId: updated.proposalId,
    lastAcceptedProposalId: action === "accepted" ? updated.proposalId : state.lastAcceptedProposalId,
    auditTrail: [auditEntry(proposalId, action, notes, reviewerName), ...state.auditTrail]
  });
};

const hasKeys = (value: object | undefined) => Boolean(value && Object.keys(value).length);

const hasAllowedProposedChanges = (proposal: CalibrationProposal) => {
  const changes = proposal.proposedChanges;
  return Boolean(
    changes.confluenceThreshold !== undefined ||
      changes.confidenceThreshold !== undefined ||
      changes.sessionFilter !== undefined ||
      changes.stopModel !== undefined ||
      changes.targetRMultiple !== undefined ||
      hasKeys(changes.agentWeights) ||
      hasKeys(changes.ictScoringWeights)
  );
};

const compactAllowedConfigPatch = (changes: CalibrationProposalChanges): CalibrationProposalChanges => ({
  confluenceThreshold: changes.confluenceThreshold,
  confidenceThreshold: changes.confidenceThreshold,
  sessionFilter: changes.sessionFilter,
  stopModel: changes.stopModel,
  targetRMultiple: changes.targetRMultiple,
  agentWeights: changes.agentWeights,
  ictScoringWeights: changes.ictScoringWeights
});

const hasResearchImprovement = (proposal: CalibrationProposal) => {
  const tradeGenerationImproved =
    typeof proposal.tradesBeforeRecovery === "number" &&
    typeof proposal.tradesAfterRecovery === "number" &&
    proposal.tradesAfterRecovery > proposal.tradesBeforeRecovery;
  const stabilityImproved =
    Boolean(proposal.comparisonResult?.stabilityImproved) ||
    Boolean(proposal.afterMetrics && proposal.afterMetrics.stabilityScore >= proposal.beforeMetrics.stabilityScore);

  return Boolean(proposal.comparisonResult?.improved || stabilityImproved || tradeGenerationImproved);
};

export interface ProposalApprovalCheck {
  canApprove: boolean;
  reason?: string;
  reasons: string[];
}

export function canApproveProposal(proposal?: CalibrationProposal): ProposalApprovalCheck {
  const reasons: string[] = [];

  if (!proposal) {
    return {
      canApprove: false,
      reason: "No proposal selected.",
      reasons: ["No proposal selected."]
    };
  }

  if (proposal.status === "accepted") {
    reasons.push("Proposal already accepted.");
  }
  if (proposal.status === "rejected") {
    reasons.push("Proposal already rejected.");
  }
  if (proposal.status === "reverted") {
    reasons.push("Proposal was reverted.");
  }
  if (proposal.mode !== "simulation") {
    reasons.push("Proposal mode is not simulation.");
  }
  if (
    proposal.executionAuthority !== "none" ||
    proposal.brokerAuthority !== "none" ||
    proposal.readinessOverrideAuthority !== "none"
  ) {
    reasons.push("Proposal contains unsafe authority changes.");
  }
  if (!hasAllowedProposedChanges(proposal)) {
    reasons.push("Proposal missing proposedChanges.");
  }
  if (!proposal.afterMetrics) {
    reasons.push("Proposal needs simulation metrics before approval.");
  }
  if (!hasResearchImprovement(proposal)) {
    reasons.push("Proposal does not show trade-generation or stability improvement.");
  }

  return {
    canApprove: reasons.length === 0,
    reason: reasons[0],
    reasons
  };
}

export function applyApprovedResearchCalibration(
  proposal: CalibrationProposal,
  currentConfig: ResolvedBacktestConfig = loadBacktestConfig()
): ResolvedBacktestConfig {
  return applyResearchCalibrationPatchToConfig(currentConfig, proposal.proposedChanges);
}

export function applyResearchCalibrationPatchToConfig(
  currentConfig: ResolvedBacktestConfig,
  changes: CalibrationProposalChanges
): ResolvedBacktestConfig {
  return sanitizeBacktestConfig({
    ...currentConfig,
    minimumConfluenceThreshold: changes.confluenceThreshold ?? currentConfig.minimumConfluenceThreshold,
    minimumConfidenceThreshold: changes.confidenceThreshold ?? currentConfig.minimumConfidenceThreshold,
    sessionFilter: changes.sessionFilter ?? currentConfig.sessionFilter,
    stopModel: changes.stopModel ?? currentConfig.stopModel,
    targetRMultiple: changes.targetRMultiple ?? currentConfig.targetRMultiple,
    agentWeights: changes.agentWeights
      ? {
          ...currentConfig.agentWeights,
          ...changes.agentWeights
        }
      : currentConfig.agentWeights
  });

}

export function saveApprovedResearchCalibration(
  proposal: CalibrationProposal,
  currentConfig: ResolvedBacktestConfig = loadBacktestConfig()
) {
  const activeConfigAfter = applyResearchCalibrationPatchToConfig(currentConfig, proposal.proposedChanges);
  const savedConfig = saveBacktestConfig(activeConfigAfter);
  const activeCalibration: ActiveResearchCalibration = {
    approvedCalibrationId: proposal.proposalId,
    approvedAt: new Date().toISOString(),
    appliedConfigPatch: compactAllowedConfigPatch(proposal.proposedChanges),
    baselineConfigBefore: currentConfig,
    activeConfigAfter: savedConfig
  };
  const changes = proposal.proposedChanges;
  if (changes.ictScoringWeights) {
    saveICTScoringWeights({
      ...loadICTScoringWeights(),
      ...changes.ictScoringWeights
    });
  }

  return activeCalibration;
}

export function loadActiveResearchCalibration(): ActiveResearchCalibration | undefined {
  return loadSelfImprovementState().activeResearchCalibration;
}

export function resolveActiveResearchConfig(config: ResolvedBacktestConfig = loadBacktestConfig()) {
  const activeResearchCalibration = loadActiveResearchCalibration();
  if (!activeResearchCalibration) {
    return {
      config,
      activeResearchCalibration: undefined,
      activeCalibrationApplied: false
    };
  }

  return {
    config: applyResearchCalibrationPatchToConfig(config, activeResearchCalibration.appliedConfigPatch),
    activeResearchCalibration,
    activeCalibrationApplied: true
  };
}

export function clearActiveResearchCalibration(notes = "Active research calibration cleared."): SelfImprovementState {
  const state = loadSelfImprovementState();
  const activeId = state.activeResearchCalibration?.approvedCalibrationId ?? "active_calibration";
  return saveSelfImprovementState({
    ...state,
    activeResearchCalibration: undefined,
    auditTrail: [auditEntry(activeId, "reverted", notes), ...state.auditTrail]
  });
}

export function approveCalibrationProposal(proposalId: string, reviewerName = "local user", notes = "") {
  const state = loadSelfImprovementState();
  const target = state.proposals.find((proposal) => proposal.proposalId === proposalId);
  const approvalCheck = canApproveProposal(target);
  if (!target || !approvalCheck.canApprove) {
    return state;
  }

  const baselineConfigBefore = loadBacktestConfig();
  const activeResearchCalibration = saveApprovedResearchCalibration(target, baselineConfigBefore);
  const updated: CalibrationProposal = {
    ...target,
    status: "accepted",
    approvedAt: activeResearchCalibration.approvedAt,
    approvalNotes: notes || "Research calibration applied. Next AI Research Cycle will use the updated baseline.",
    proposedConfig: activeResearchCalibration.activeConfigAfter
  };

  return saveSelfImprovementState({
    ...state,
    proposals: state.proposals.map((proposal) => (proposal.proposalId === proposalId ? updated : proposal)),
    latestProposalId: updated.proposalId,
    lastAcceptedProposalId: updated.proposalId,
    activeResearchCalibration,
    auditTrail: [
      auditEntry(
        proposalId,
        "accepted",
        notes || "Research calibration applied. Next AI Research Cycle will use the updated baseline.",
        reviewerName
      ),
      ...state.auditTrail
    ]
  });
}

export function rejectCalibrationProposal(proposalId: string, reviewerName = "local user", notes = "") {
  return updateProposal(
    proposalId,
    (proposal) => ({
      ...proposal,
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      approvalNotes: notes || "Rejected by user."
    }),
    "rejected",
    notes || "User rejected simulation calibration proposal.",
    reviewerName
  );
}

export function revertCalibrationProposal(proposalId: string, reviewerName = "local user", notes = "") {
  const state = loadSelfImprovementState();
  const target = state.proposals.find((proposal) => proposal.proposalId === proposalId);
  if (!target) {
    return state;
  }
  if (target.status === "accepted") {
    saveBacktestConfig(state.activeResearchCalibration?.baselineConfigBefore ?? target.baselineConfig ?? loadBacktestConfig());
  }
  const updated: CalibrationProposal = {
    ...target,
    status: "reverted",
    revertedAt: new Date().toISOString(),
    approvalNotes: notes || "Reverted to the proposal baseline simulation settings."
  };
  return saveSelfImprovementState({
    ...state,
    activeResearchCalibration:
      state.activeResearchCalibration?.approvedCalibrationId === proposalId
        ? undefined
        : state.activeResearchCalibration,
    proposals: state.proposals.map((proposal) => (proposal.proposalId === proposalId ? updated : proposal)),
    latestProposalId: updated.proposalId,
    auditTrail: [auditEntry(proposalId, "reverted", notes || "User reverted accepted simulation calibration settings.", reviewerName), ...state.auditTrail]
  });
}
