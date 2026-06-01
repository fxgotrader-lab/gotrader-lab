import type { AutoResearchSearchMode } from "@/lib/autoResearch";
import type {
  AutonomousResearchBlocker,
  AutonomousScenarioFamily,
  ScenarioFamilyMapping,
  ScenarioSetEvaluation
} from "@/lib/autonomousResearch/autonomousResearchTypes";
import { safeArray } from "@/lib/utils";

export const scenarioFamilyMapping: ScenarioFamilyMapping = {
  session_focus: { searchMode: "session_focus", maxCandidateCount: 5 },
  stop_model_focus: { searchMode: "stop_model_focus", maxCandidateCount: 5 },
  target_model_focus: { searchMode: "standard", maxCandidateCount: 5 },
  confidence_calibration_focus: { searchMode: "conservative_only", maxCandidateCount: 5 },
  evidence_quality_focus: { searchMode: "conservative_only", maxCandidateCount: 3 },
  long_short_focus: { searchMode: "long_short_focus", maxCandidateCount: 5 },
  conservative_only: { searchMode: "conservative_only", maxCandidateCount: 5 },
  walk_forward_followup: { searchMode: "standard", maxCandidateCount: 5 },
  regime_specific_testing: { searchMode: "standard", maxCandidateCount: 5 }
};

const scenarioForBlockers = (blockers: AutonomousResearchBlocker[]): AutonomousScenarioFamily => {
  const set = new Set(blockers);
  if (
    set.has("regime_mismatch") ||
    set.has("regime_evidence_insufficient") ||
    set.has("regime_transition_pending") ||
    set.has("regime_specific_sample_too_small")
  ) return "regime_specific_testing";
  if (set.has("walk_forward_failed") || set.has("walk_forward_insufficient")) return "walk_forward_followup";
  if (set.has("evidence_quality_weak")) return "evidence_quality_focus";
  if (set.has("session_inconsistency")) return "session_focus";
  if (set.has("low_average_r")) return "target_model_focus";
  if (set.has("high_drawdown")) return "stop_model_focus";
  if (set.has("low_win_rate")) return "long_short_focus";
  if (set.has("confidence_calibration_weak")) return "confidence_calibration_focus";
  if (set.has("false_positives")) return "conservative_only";
  return "conservative_only";
};

export function selectNextScenarioSet(
  blockers: AutonomousResearchBlocker[],
  options: { safeImportedDataMode?: boolean; preferredSearchMode?: AutoResearchSearchMode } = {}
): ScenarioSetEvaluation {
  const scenarioFamily = scenarioForBlockers(blockers);
  const mapping = scenarioFamilyMapping[scenarioFamily];
  const safeCap = options.safeImportedDataMode ? 5 : mapping.maxCandidateCount;
  const searchMode = options.preferredSearchMode ?? mapping.searchMode;
  const keyBlockers = safeArray(blockers);

  return {
    scenarioFamily,
    searchMode,
    maxCandidateCount: Math.min(mapping.maxCandidateCount, safeCap),
    blockers: keyBlockers,
    reason: keyBlockers.length
      ? `Selected ${scenarioFamily.replace(/_/g, " ")} because ${keyBlockers.map((item) => item.replace(/_/g, " ")).join(", ")} appeared in the latest evidence.`
      : `Selected ${scenarioFamily.replace(/_/g, " ")} as a conservative default because no dominant blocker was available.`,
    safetyNotes: [
      "Scenario selection is research-only.",
      "No broker settings, execution permissions, readiness gates, API keys, contract size, or daily loss settings can be changed.",
      "Any calibration remains bounded by the autonomy safety policy."
    ]
  };
}
