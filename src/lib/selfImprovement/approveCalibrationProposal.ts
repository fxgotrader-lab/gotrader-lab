import {
  defaultBacktestConfig,
  type BacktestConfig,
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
  ActiveBacktestConfigResolution,
  CalibrationProposal,
  CalibrationProposalChanges,
  SelfImprovementAuditEntry,
  SelfImprovementState
} from "@/lib/selfImprovement/selfImprovementTypes";
import { safeArray, uid } from "@/lib/utils";

export const SELF_IMPROVEMENT_STORAGE_KEY = "gotrader_ai_lab_self_improvement_state";
export const ACTIVE_RESEARCH_CALIBRATION_STORAGE_KEY = "gotrader_ai_lab_active_research_calibration";
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

const compactAllowedConfigPatch = (changes: CalibrationProposalChanges = {}): CalibrationProposalChanges => ({
  confluenceThreshold: changes.confluenceThreshold,
  confidenceThreshold: changes.confidenceThreshold,
  sessionFilter: changes.sessionFilter,
  stopModel: changes.stopModel,
  targetRMultiple: changes.targetRMultiple,
  agentWeights: changes.agentWeights,
  ictScoringWeights: changes.ictScoringWeights
});

const hasKeys = (value: object | undefined) => Boolean(value && Object.keys(value).length);

const hasConfigPatch = (changes: CalibrationProposalChanges | undefined) =>
  Boolean(
    changes &&
      (changes.confluenceThreshold !== undefined ||
        changes.confidenceThreshold !== undefined ||
        changes.sessionFilter !== undefined ||
        changes.stopModel !== undefined ||
        changes.targetRMultiple !== undefined ||
        hasKeys(changes.agentWeights) ||
        hasKeys(changes.ictScoringWeights))
  );

const diffAgentWeights = (
  before: ResolvedBacktestConfig,
  after: ResolvedBacktestConfig
): CalibrationProposalChanges["agentWeights"] => {
  const changes = Object.fromEntries(
    Object.entries(after.agentWeights).filter(
      ([agentId, value]) => before.agentWeights[agentId as keyof typeof before.agentWeights] !== value
    )
  );
  return Object.keys(changes).length ? changes : undefined;
};

const inferPatchFromConfigs = (
  before: ResolvedBacktestConfig,
  after: ResolvedBacktestConfig
): CalibrationProposalChanges =>
  compactAllowedConfigPatch({
    confluenceThreshold:
      before.minimumConfluenceThreshold !== after.minimumConfluenceThreshold
        ? after.minimumConfluenceThreshold
        : undefined,
    confidenceThreshold:
      before.minimumConfidenceThreshold !== after.minimumConfidenceThreshold
        ? after.minimumConfidenceThreshold
        : undefined,
    sessionFilter: before.sessionFilter !== after.sessionFilter ? after.sessionFilter : undefined,
    stopModel: before.stopModel !== after.stopModel ? after.stopModel : undefined,
    targetRMultiple: before.targetRMultiple !== after.targetRMultiple ? after.targetRMultiple : undefined,
    agentWeights: diffAgentWeights(before, after)
  });

const normalizeActiveResearchCalibration = (
  calibration?: Partial<ActiveResearchCalibration>
): ActiveResearchCalibration | undefined => {
  if (!calibration?.approvedCalibrationId || !calibration.approvedAt) {
    return undefined;
  }

  const baselineConfigBefore = sanitizeBacktestConfig(calibration.baselineConfigBefore ?? defaultBacktestConfig);
  const activeConfigAfter = sanitizeBacktestConfig(calibration.activeConfigAfter ?? baselineConfigBefore);
  const storedPatch = compactAllowedConfigPatch(calibration.appliedConfigPatch);
  const inferredPatch = inferPatchFromConfigs(baselineConfigBefore, activeConfigAfter);

  return {
    approvedCalibrationId: calibration.approvedCalibrationId,
    sourceProposalId: calibration.sourceProposalId ?? calibration.approvedCalibrationId,
    approvedAt: calibration.approvedAt,
    appliedConfigPatch: hasConfigPatch(storedPatch) ? storedPatch : inferredPatch,
    baselineConfigBefore,
    activeConfigAfter
  };
};

const readActiveCalibrationStorage = (): ActiveResearchCalibration | undefined => {
  if (!isBrowser()) {
    return undefined;
  }
  const raw = window.localStorage.getItem(ACTIVE_RESEARCH_CALIBRATION_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    return normalizeActiveResearchCalibration(JSON.parse(raw) as Partial<ActiveResearchCalibration>);
  } catch {
    return undefined;
  }
};

export function loadActiveResearchCalibrationStorage(): ActiveResearchCalibration | undefined {
  return readActiveCalibrationStorage();
}

const readSelfImprovementActiveCalibration = (): ActiveResearchCalibration | undefined => {
  if (!isBrowser()) {
    return undefined;
  }
  const raw = window.localStorage.getItem(SELF_IMPROVEMENT_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SelfImprovementState>;
    return normalizeActiveResearchCalibration(parsed.activeResearchCalibration);
  } catch {
    return undefined;
  }
};

const writeActiveCalibrationStorage = (calibration: ActiveResearchCalibration) => {
  if (isBrowser()) {
    const normalized = normalizeActiveResearchCalibration(calibration);
    if (normalized) {
      window.localStorage.setItem(ACTIVE_RESEARCH_CALIBRATION_STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, { detail: normalized }));
    }
  }
};

const removeActiveCalibrationStorage = () => {
  if (isBrowser()) {
    window.localStorage.removeItem(ACTIVE_RESEARCH_CALIBRATION_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, { detail: undefined }));
  }
};

const publish = (state: SelfImprovementState) => {
  if (isBrowser()) {
    const normalizedActive = normalizeActiveResearchCalibration(state.activeResearchCalibration);
    const nextState = {
      ...state,
      activeResearchCalibration: normalizedActive
    };
    if (normalizedActive) {
      writeActiveCalibrationStorage(normalizedActive);
    }
    window.localStorage.setItem(SELF_IMPROVEMENT_STORAGE_KEY, JSON.stringify(nextState));
    window.dispatchEvent(new CustomEvent(SELF_IMPROVEMENT_UPDATED_EVENT, { detail: nextState }));
    return nextState;
  }
  return state;
};

export function loadSelfImprovementState(): SelfImprovementState {
  if (!isBrowser()) {
    return initialState();
  }

  const activeFromDedicatedStorage = readActiveCalibrationStorage();
  const raw = window.localStorage.getItem(SELF_IMPROVEMENT_STORAGE_KEY);
  if (!raw) {
    return publish({
      ...initialState(),
      activeResearchCalibration: activeFromDedicatedStorage
    });
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SelfImprovementState>;
    const activeResearchCalibration = normalizeActiveResearchCalibration(
      parsed.activeResearchCalibration ?? activeFromDedicatedStorage
    );
    return {
      ...initialState(),
      ...parsed,
      proposals: parsed.proposals ?? [],
      auditTrail: parsed.auditTrail ?? [],
      activeResearchCalibration
    };
  } catch {
    return publish({
      ...initialState(),
      activeResearchCalibration: activeFromDedicatedStorage
    });
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
  if (safeArray(proposal.comparisonResult?.criticalRegressions).length) {
    reasons.push("Proposal has critical metric regressions; run a targeted follow-up before approval.");
  }
  if (
    proposal.comparisonResult?.promotionVerdict === "needs_follow_up" ||
    proposal.comparisonResult?.promotionVerdict === "reject"
  ) {
    reasons.push(`Promotion verdict is ${proposal.comparisonResult.promotionVerdict.replace(/_/g, " ")}.`);
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
    sourceProposalId: proposal.proposalId,
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

  writeActiveCalibrationStorage(activeCalibration);
  return activeCalibration;
}

export function loadActiveResearchCalibration(): ActiveResearchCalibration | undefined {
  return readActiveCalibrationStorage() ?? readSelfImprovementActiveCalibration();
}

const mergeStatusLabel = (status: ActiveBacktestConfigResolution["mergeStatus"]) => {
  switch (status) {
    case "active_calibration_applied":
      return "active calibration applied";
    case "active_calibration_missing_patch":
      return "approved calibration exists but was not merged";
    case "active_calibration_merge_failed":
      return "active calibration merge failed";
    case "no_active_calibration":
    default:
      return "default baseline";
  }
};

export function resolveActiveBacktestConfig(overrideConfig?: BacktestConfig): ActiveBacktestConfigResolution {
  const defaultConfig = sanitizeBacktestConfig(defaultBacktestConfig);
  const savedConfig = loadBacktestConfig();
  const preCalibrationConfig = sanitizeBacktestConfig(
    overrideConfig
      ? {
          ...savedConfig,
          ...overrideConfig,
          agentWeights: {
            ...savedConfig.agentWeights,
            ...overrideConfig.agentWeights
          }
        }
      : savedConfig
  );
  const activeResearchCalibration = loadActiveResearchCalibration();
  const dedicatedStorageCalibration = readActiveCalibrationStorage();
  const activeCalibrationStorageFound = Boolean(dedicatedStorageCalibration);
  const activeCalibrationStorageSource = dedicatedStorageCalibration
    ? "dedicated_storage"
    : activeResearchCalibration
      ? "self_improvement_state"
      : "missing";
  const sourceTrace = ["default baseline", "saved local backtest config"];
  if (overrideConfig) {
    sourceTrace.push("runtime override");
  }

  if (!activeResearchCalibration) {
    return {
      config: preCalibrationConfig,
      defaultConfig,
      savedConfig,
      preCalibrationConfig,
      activeResearchCalibration: undefined,
      activeCalibrationStorageFound,
      activeCalibrationStorageSource,
      activeCalibrationApplied: false,
      activeConfluenceThreshold: preCalibrationConfig.minimumConfluenceThreshold,
      defaultConfluenceThreshold: defaultConfig.minimumConfluenceThreshold,
      savedConfluenceThreshold: savedConfig.minimumConfluenceThreshold,
      finalBacktestConfluenceThreshold: preCalibrationConfig.minimumConfluenceThreshold,
      mergeStatus: "no_active_calibration",
      mergeStatusLabel: mergeStatusLabel("no_active_calibration"),
      sourceTrace
    };
  }

  const appliedPatch = compactAllowedConfigPatch(activeResearchCalibration.appliedConfigPatch);
  if (!hasConfigPatch(appliedPatch)) {
    return {
      config: preCalibrationConfig,
      defaultConfig,
      savedConfig,
      preCalibrationConfig,
      activeResearchCalibration,
      activeCalibrationId: activeResearchCalibration.approvedCalibrationId,
      activeCalibrationStorageFound,
      activeCalibrationStorageSource,
      activeCalibrationApplied: false,
      activeConfluenceThreshold: preCalibrationConfig.minimumConfluenceThreshold,
      defaultConfluenceThreshold: defaultConfig.minimumConfluenceThreshold,
      savedConfluenceThreshold: savedConfig.minimumConfluenceThreshold,
      finalBacktestConfluenceThreshold: preCalibrationConfig.minimumConfluenceThreshold,
      appliedPatch,
      mergeStatus: "active_calibration_missing_patch",
      mergeStatusLabel: mergeStatusLabel("active_calibration_missing_patch"),
      mergeError: "Approved calibration exists but has no allowed research config patch.",
      sourceTrace: [...sourceTrace, "approved calibration found", "missing patch"]
    };
  }

  try {
    const config = applyResearchCalibrationPatchToConfig(preCalibrationConfig, appliedPatch);
    return {
      config,
      defaultConfig,
      savedConfig,
      preCalibrationConfig,
      activeResearchCalibration,
      activeCalibrationId: activeResearchCalibration.approvedCalibrationId,
      activeCalibrationStorageFound,
      activeCalibrationStorageSource,
      activeCalibrationApplied: true,
      activeConfluenceThreshold: config.minimumConfluenceThreshold,
      defaultConfluenceThreshold: defaultConfig.minimumConfluenceThreshold,
      savedConfluenceThreshold: savedConfig.minimumConfluenceThreshold,
      finalBacktestConfluenceThreshold: config.minimumConfluenceThreshold,
      appliedPatch,
      mergeStatus: "active_calibration_applied",
      mergeStatusLabel: mergeStatusLabel("active_calibration_applied"),
      sourceTrace: [...sourceTrace, "approved calibration patch"]
    };
  } catch (error) {
    return {
      config: preCalibrationConfig,
      defaultConfig,
      savedConfig,
      preCalibrationConfig,
      activeResearchCalibration,
      activeCalibrationId: activeResearchCalibration.approvedCalibrationId,
      activeCalibrationStorageFound,
      activeCalibrationStorageSource,
      activeCalibrationApplied: false,
      activeConfluenceThreshold: preCalibrationConfig.minimumConfluenceThreshold,
      defaultConfluenceThreshold: defaultConfig.minimumConfluenceThreshold,
      savedConfluenceThreshold: savedConfig.minimumConfluenceThreshold,
      finalBacktestConfluenceThreshold: preCalibrationConfig.minimumConfluenceThreshold,
      appliedPatch,
      mergeStatus: "active_calibration_merge_failed",
      mergeStatusLabel: mergeStatusLabel("active_calibration_merge_failed"),
      mergeError: error instanceof Error ? error.message : "Approved calibration exists but could not be merged.",
      sourceTrace: [...sourceTrace, "approved calibration found", "merge failed"]
    };
  }
}

export function resolveActiveResearchConfig(config: ResolvedBacktestConfig = loadBacktestConfig()) {
  const resolution = resolveActiveBacktestConfig(config);
  return {
    config: resolution.config,
    activeResearchCalibration: resolution.activeResearchCalibration,
    activeCalibrationApplied: resolution.activeCalibrationApplied,
    mergeStatus: resolution.mergeStatus,
    mergeStatusLabel: resolution.mergeStatusLabel,
    sourceTrace: resolution.sourceTrace,
    activeConfluenceThreshold: resolution.activeConfluenceThreshold,
    appliedPatch: resolution.appliedPatch,
    mergeError: resolution.mergeError
  };
}

export function clearActiveResearchCalibration(notes = "Active research calibration cleared."): SelfImprovementState {
  const state = loadSelfImprovementState();
  const activeId = state.activeResearchCalibration?.approvedCalibrationId ?? "active_calibration";
  removeActiveCalibrationStorage();
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

  const baselineConfigBefore = resolveActiveBacktestConfig().config;
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

export function applyAcceptedCalibrationToActiveBaseline(
  proposalId: string,
  reviewerName = "local user",
  notes = ""
) {
  const state = loadSelfImprovementState();
  const target = state.proposals.find((proposal) => proposal.proposalId === proposalId);
  if (!target || target.status !== "accepted") {
    return state;
  }

  const baselineConfigBefore = sanitizeBacktestConfig(target.baselineConfig ?? loadBacktestConfig());
  const activeResearchCalibration = saveApprovedResearchCalibration(target, baselineConfigBefore);
  const updated: CalibrationProposal = {
    ...target,
    proposedConfig: activeResearchCalibration.activeConfigAfter,
    approvalNotes:
      notes ||
      `Active calibration stored. Next AI Research Cycle will use threshold ${Math.round(activeResearchCalibration.activeConfigAfter.minimumConfluenceThreshold * 100)}%.`
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
        notes || "Re-applied accepted research calibration to the active baseline storage key.",
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
  if (state.activeResearchCalibration?.approvedCalibrationId === proposalId) {
    removeActiveCalibrationStorage();
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
