import { getStrategyDefinition, STRATEGY_LIBRARY_AUTHORITY } from "./strategyRegistry";
import type { StrategyEligibilityResult, StrategyEvidenceSummary, StrategyIntakeRecord, StrategyStatus } from "./strategyLibraryTypes";

export const STRATEGY_CMD_INDEPENDENT_DATE_BLOCKER =
  "CMD lane is promising but date-concentrated; needs independent-date validation.";

const hasReplayPassed = (record: StrategyIntakeRecord) =>
  /replay_passed|walk_forward_required|walk_forward_passed|evidence_updated/i.test(record.validationStatus ?? "");

const hasWalkForwardPassed = (record: StrategyIntakeRecord) =>
  /walk_forward_passed|evidence_updated/i.test(record.validationStatus ?? "");

const hasCondition = (record: StrategyIntakeRecord, conditionId: string) =>
  (record.recognition.presentConditions ?? []).includes(conditionId);

const evidenceNumber = (summary: StrategyEvidenceSummary | undefined, key: keyof StrategyEvidenceSummary) => {
  const value = summary?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const makeResult = (
  record: StrategyIntakeRecord,
  status: StrategyStatus,
  blockers: string[],
  warnings: string[],
  nextAction: string
): StrategyEligibilityResult => ({
  strategyId: record.strategyId,
  eligible: blockers.length === 0,
  status,
  blockers,
  warnings,
  nextAction,
  evidenceSummary: record.evidenceSummary,
  authority: STRATEGY_LIBRARY_AUTHORITY
});

export function evaluateStrategyEligibility(record: StrategyIntakeRecord): StrategyEligibilityResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const definition = getStrategyDefinition(record.strategyId);

  if (!definition) {
    return makeResult(record, "draft", ["Unknown strategy requires human strategy definition first."], warnings, "Create or review a StrategyDefinition before deterministic validation.");
  }
  if (record.blockedFields.length) {
    blockers.push(`Unsafe intake fields blocked: ${record.blockedFields.slice(0, 4).join(", ")}.`);
  }
  if (record.sourceIsMockOrSample || !definition.sourceRequirements.allowMockOrSample && /mock|sample/i.test(record.sourceProvider ?? "")) {
    blockers.push("Mock/sample source cannot create strategy evidence or Paper-Demo eligibility.");
  }
  if (definition.sourceRequirements.requiresFingerprint && (!record.sourceFingerprint || record.sourceFingerprint === "missing" || record.sourceFingerprint === "no fingerprint")) {
    blockers.push("Source fingerprint is missing.");
  }
  if (definition.sourceRequirements.allowedProviders.length && record.sourceProvider && !definition.sourceRequirements.allowedProviders.includes(record.sourceProvider)) {
    warnings.push(`Source provider ${record.sourceProvider} is outside preferred providers for this strategy.`);
  }
  if (definition.id === "market_map_only_diagnostic_v1") {
    blockers.push("Market-map-only diagnostic cannot become evidence or Paper-Demo.");
    return makeResult(record, "paper_demo_blocked", blockers, warnings, "Use market-map-only output as context; select a validated strategy before replay.");
  }
  if (definition.status === "research_only" || definition.status === "draft") {
    warnings.push("Strategy is research-only and cannot become Paper-Demo eligible yet.");
  }

  const missingRequiredConditions = definition.requiredConditions
    .filter((condition) => condition.requiredFor.includes("paper_watchlist") || condition.requiredFor.includes("paper_demo"))
    .filter((condition) => !hasCondition(record, condition.id))
    .map((condition) => condition.label);
  if (missingRequiredConditions.length) {
    blockers.push(`Required conditions missing: ${missingRequiredConditions.slice(0, 5).join(", ")}.`);
  }

  if (!hasReplayPassed(record)) {
    return makeResult(record, "replay_required", blockers.length ? blockers : ["Replay validation is required."], warnings, "Run replay validation before strategy progression.");
  }
  if (!hasWalkForwardPassed(record)) {
    return makeResult(record, "walk_forward_required", blockers.length ? blockers : ["Walk-forward/OOS validation is required."], warnings, "Run walk-forward/OOS validation before evidence progression.");
  }

  const evidenceScore = evidenceNumber(record.evidenceSummary, "evidenceScore");
  const maturityScore = evidenceNumber(record.evidenceSummary, "maturityScore");
  if (typeof evidenceScore === "number" && evidenceScore < 50) blockers.push(`Evidence score ${evidenceScore} is below strategy-library minimum 50.`);
  if (typeof maturityScore === "number" && maturityScore < 50) blockers.push(`Maturity score ${maturityScore} is below strategy-library minimum 50.`);

  if (definition.id === "ict_cmd_short_paper_watchlist_v1") {
    const sampleCount = evidenceNumber(record.evidenceSummary, "sampleCount") ?? 0;
    const uniqueTradingDates = evidenceNumber(record.evidenceSummary, "uniqueTradingDates") ?? 0;
    const activeRollingWindows = evidenceNumber(record.evidenceSummary, "activeRollingWindows") ?? 0;
    const robustness = record.evidenceSummary?.robustnessClassification ?? "";
    const oosVerdict = record.evidenceSummary?.oosVerdict ?? "";
    if (/overfit_risk/i.test(robustness) || uniqueTradingDates < 3) blockers.push(STRATEGY_CMD_INDEPENDENT_DATE_BLOCKER);
    if (activeRollingWindows < 2) blockers.push("CMD needs at least two active rolling validation windows.");
    if (sampleCount < 20) blockers.push("CMD needs at least 20 candidates before promotion beyond watchlist.");
    if (/fail|degrad|unstable/i.test(oosVerdict) || /unstable/i.test(robustness)) blockers.push("CMD OOS verdict degraded or failed.");
  }

  if (blockers.length) {
    return makeResult(
      record,
      "paper_demo_blocked",
      [...new Set(blockers)],
      warnings,
      blockers.some((blocker) => blocker.includes("independent-date") || blocker.includes("rolling"))
        ? "Run independent-date CMD validation over 90-day history."
        : blockers[0] ?? "Resolve strategy blockers."
    );
  }

  if (definition.status === "research_only" || definition.status === "draft") {
    return makeResult(record, "evidence_building", [], warnings, "Keep collecting evidence; this strategy definition is not Paper-Demo eligible.");
  }

  return makeResult(
    record,
    definition.id === "ict_cmd_short_paper_watchlist_v1" ? "paper_watchlist_candidate" : "evidence_building",
    [],
    warnings,
    definition.id === "ict_cmd_short_paper_watchlist_v1"
      ? "Keep CMD in paper-watchlist evidence building; Paper-Demo still requires the normal checklist."
      : "Continue deterministic validation and evidence review."
  );
}
