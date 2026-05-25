export {
  ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT,
  applyApprovedResearchCalibration,
  applyResearchCalibrationPatchToConfig,
  approveCalibrationProposal,
  canApproveProposal,
  clearActiveResearchCalibration,
  loadActiveResearchCalibration,
  loadSelfImprovementState,
  rejectCalibrationProposal,
  resolveActiveResearchConfig,
  revertCalibrationProposal,
  saveApprovedResearchCalibration,
  saveSelfImprovementState,
  SELF_IMPROVEMENT_STORAGE_KEY,
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
export type {
  ActiveResearchCalibration,
  CalibrationComparisonRecommendation,
  CalibrationComparisonResult,
  CalibrationProposal,
  CalibrationProposalChanges,
  CalibrationProposalIntent,
  CalibrationProposalMetrics,
  CalibrationProposalSource,
  CalibrationProposalStatus,
  CalibrationTargetProblem,
  SelfImprovementAuditEntry,
  SelfImprovementState
} from "@/lib/selfImprovement/selfImprovementTypes";
