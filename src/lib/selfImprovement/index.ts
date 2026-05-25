export {
  approveCalibrationProposal,
  loadSelfImprovementState,
  rejectCalibrationProposal,
  revertCalibrationProposal,
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
  CalibrationComparisonRecommendation,
  CalibrationComparisonResult,
  CalibrationProposal,
  CalibrationProposalChanges,
  CalibrationProposalMetrics,
  CalibrationProposalSource,
  CalibrationProposalStatus,
  CalibrationTargetProblem,
  SelfImprovementAuditEntry,
  SelfImprovementState
} from "@/lib/selfImprovement/selfImprovementTypes";
