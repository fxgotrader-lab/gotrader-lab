import type { ResearchRuntimeSnapshot } from "@/lib/runtime";
import type { AutonomousResearchBlocker } from "@/lib/autonomousResearch/autonomousResearchTypes";
import { safeArray } from "@/lib/utils";

export function diagnoseAutonomousResearchBlockers(snapshot: ResearchRuntimeSnapshot): AutonomousResearchBlocker[] {
  const metrics = snapshot.performance.canonicalPerformanceMetrics;
  const readiness = snapshot.readiness;
  const walkForward = snapshot.walkForward;
  const maturity = snapshot.maturity.maturitySummary;
  const blockers: AutonomousResearchBlocker[] = [];

  if ((metrics?.winRate ?? 1) < 0.38) blockers.push("low_win_rate");
  if ((metrics?.averageR ?? 1) < 0.1) blockers.push("low_average_r");
  if ((metrics?.maxDrawdownR ?? 0) > 5) blockers.push("high_drawdown");
  if ((metrics?.falsePositiveCount ?? 0) > 12) blockers.push("false_positives");
  if ((metrics?.totalTrades ?? 0) < 20) blockers.push("insufficient_trades");
  if ((metrics?.confidenceCalibration ?? 1) < 0.6) blockers.push("confidence_calibration_weak");
  if (snapshot.evidence.evidenceQualityScore < 60) blockers.push("evidence_quality_weak");
  if (snapshot.maturity.maturityScore < 52) blockers.push("maturity_too_low");
  if (walkForward.verdict === "insufficient_evidence" || !walkForward.latestRun) blockers.push("walk_forward_insufficient");
  if (walkForward.verdict === "fail") blockers.push("walk_forward_failed");

  const failedText = [
    ...readiness.actualBlockers,
    ...safeArray(snapshot.latestResearchCycle.latestRun?.blockers)
  ].join(" ").toLowerCase();
  if (failedText.includes("session")) blockers.push("session_inconsistency");
  if (failedText.includes("regime") || snapshot.walkForward.failureDiagnostics?.likelyFailureCause === "session_fragility") {
    blockers.push("regime_mismatch");
  }
  if (
    walkForward.stability &&
    walkForward.stability.verdict !== "insufficient_evidence" &&
    walkForward.stability.outOfSampleWindowsPassed > 0 &&
    walkForward.stability.outOfSampleWindowsPassed < walkForward.stability.windowCount &&
    walkForward.overfitRisk !== "low"
  ) {
    blockers.push("regime_mismatch");
  }
  if (maturity.latestWalkForwardOverfitRisk === "high") {
    blockers.push("regime_mismatch");
  }

  return [...new Set(blockers)];
}

export function summarizeScenarioEvaluation(snapshot: ResearchRuntimeSnapshot, blockers = diagnoseAutonomousResearchBlockers(snapshot)) {
  const topBlocker = blockers[0] ?? "maturity_too_low";
  return {
    blockers,
    topBlocker,
    summary: blockers.length
      ? `Latest autonomous diagnosis found ${blockers.map((item) => item.replace(/_/g, " ")).join(", ")}.`
      : "No dominant blocker was found; use conservative follow-up testing."
  };
}
