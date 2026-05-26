export {
  AUTO_RESEARCH_STORAGE_KEY,
  AUTO_RESEARCH_UPDATED_EVENT,
  clearAutoResearchHistory,
  compactAutoResearchCycle,
  estimateAutoResearchStateSize,
  latestAutoResearchCycle,
  loadAutoResearchState,
  pruneAutoResearchHistory,
  runAutoResearchCycle,
  saveAutoResearchCycle
} from "@/lib/autoResearch/runAutoResearchCycle";
export {
  autoResearchSafetyNotes,
  autoResearchSearchModeDefaults,
  autoResearchSearchModes,
  defaultAutoResearchScoringCriteria,
  safeAutoResearchSearchSpace
} from "@/lib/autoResearch/configSearchSpace";
export { createSelfImprovementFromCandidate } from "@/lib/autoResearch/createSelfImprovementFromCandidate";
export {
  generateAdaptiveCandidateConfigs,
  generateCandidateConfigs,
  generateTradeRecoveryCandidateConfigs
} from "@/lib/autoResearch/generateCandidateConfigs";
export { scoreCandidateConfig } from "@/lib/autoResearch/scoreCandidateConfig";
export { selectBestCandidate } from "@/lib/autoResearch/selectBestCandidate";
export { generateTradeQualityCandidateConfigs } from "@/lib/autoResearch/tradeQualityOptimizer";
export type {
  AutoResearchCandidateConfig,
  AutoResearchCandidateResult,
  AutoResearchAdaptiveOutcome,
  AutoResearchAdaptivePass,
  AutoResearchCycle,
  AutoResearchCycleStatus,
  AutoResearchFailedGate,
  AutoResearchProgressSnapshot,
  AutoResearchResultCategory,
  AutoResearchRunOptions,
  AutoResearchSafeConfigPatch,
  AutoResearchScoreBreakdown,
  AutoResearchScoringCriteria,
  AutoResearchSearchMode,
  AutoResearchState
} from "@/lib/autoResearch/autoResearchTypes";
