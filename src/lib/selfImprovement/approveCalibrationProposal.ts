import {
  loadBacktestConfig,
  saveBacktestConfig
} from "@/lib/backtesting";
import {
  loadICTScoringWeights,
  saveICTScoringWeights
} from "@/lib/ict";
import type {
  CalibrationProposal,
  SelfImprovementAuditEntry,
  SelfImprovementState
} from "@/lib/selfImprovement/selfImprovementTypes";
import { uid } from "@/lib/utils";

export const SELF_IMPROVEMENT_STORAGE_KEY = "gotrader_ai_lab_self_improvement_state";
export const SELF_IMPROVEMENT_UPDATED_EVENT = "gotrader-ai-lab-self-improvement-updated";

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
      auditTrail: parsed.auditTrail ?? []
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

export function approveCalibrationProposal(proposalId: string, reviewerName = "local user", notes = "") {
  return updateProposal(
    proposalId,
    (proposal) => {
      if (
        proposal.mode !== "simulation" ||
        proposal.executionAuthority !== "none" ||
        proposal.brokerAuthority !== "none" ||
        proposal.readinessOverrideAuthority !== "none" ||
        !proposal.comparisonResult?.improved ||
        !proposal.comparisonResult.stabilityImproved ||
        !proposal.afterMetrics
      ) {
        return proposal;
      }

      saveBacktestConfig(proposal.proposedConfig);

      if (proposal.proposedChanges.ictScoringWeights) {
        saveICTScoringWeights({
          ...loadICTScoringWeights(),
          ...proposal.proposedChanges.ictScoringWeights
        });
      }

      return {
        ...proposal,
        status: "accepted",
        approvedAt: new Date().toISOString(),
        approvalNotes: notes || "Accepted after simulation comparison improved stability."
      };
    },
    "accepted",
    notes || "User approved simulation calibration proposal. Broker execution remains disabled.",
    reviewerName
  );
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
  return updateProposal(
    proposalId,
    (proposal) => {
      if (proposal.status === "accepted") {
        saveBacktestConfig(proposal.baselineConfig ?? loadBacktestConfig());
      }
      return {
        ...proposal,
        status: "reverted",
        revertedAt: new Date().toISOString(),
        approvalNotes: notes || "Reverted to the proposal baseline simulation settings."
      };
    },
    "reverted",
    notes || "User reverted accepted simulation calibration settings.",
    reviewerName
  );
}
