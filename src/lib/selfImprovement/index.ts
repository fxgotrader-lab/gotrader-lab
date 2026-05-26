export {
  ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT,
  applyApprovedResearchCalibration,
  applyAcceptedCalibrationToActiveBaseline,
  applyResearchCalibrationPatchToConfig,
  approveCalibrationProposal,
  canApproveProposal,
  clearActiveResearchCalibration,
  loadActiveResearchCalibration,
  loadActiveResearchCalibrationStorage,
  loadSelfImprovementState,
  rejectCalibrationProposal,
  resolveActiveBacktestConfig,
  resolveActiveResearchConfig,
  revertCalibrationProposal,
  saveApprovedResearchCalibration,
  saveSelfImprovementState,
  SELF_IMPROVEMENT_STORAGE_KEY,
  ACTIVE_RESEARCH_CALIBRATION_STORAGE_KEY,
  SELF_IMPROVEMENT_UPDATED_EVENT,
  upsertCalibrationProposal
} from "@/lib/selfImprovement/approveCalibrationProposal";
export { compareProposalToBaseline } from "@/lib/selfImprovement/compareProposalToBaseline";
export { createCalibrationProposal } from "@/lib/selfImprovement/createCalibrationProposal";
export {
  applyProposalChangesToConfig,
  evaluateCalibrationProposal,
  summarizeValidationMetrics
} from "@/lib/selfImprovement/evaluateCalibrationProposal";
export {
  attachProposalMetricsSnapshot,
  createProposalMetricsSnapshot,
  effectiveProposalComparison,
  hasMaterialImprovement,
  hasMaterialProposalMetricChange,
  isNoOpComparison,
  isNoOpProposalSnapshot,
  isProfitFactorOnlyImprovement,
  materialMetricsChanged,
  noMaterialMetricsChanged,
  proposalSnapshotMismatchReasons
} from "@/lib/selfImprovement/proposalMetricsSnapshot";
export type {
  ActiveResearchCalibration,
  ActiveBacktestConfigMergeStatus,
  ActiveBacktestConfigResolution,
  CalibrationComparisonRecommendation,
  CalibrationComparisonResult,
  CalibrationProposal,
  CalibrationProposalChanges,
  CalibrationProposalIntent,
  CalibrationProposalMetricsSnapshot,
  CalibrationProposalMetrics,
  CalibrationProposalSource,
  CalibrationProposalStatus,
  CalibrationTargetProblem,
  SelfImprovementAuditEntry,
  SelfImprovementState
} from "@/lib/selfImprovement/selfImprovementTypes";
