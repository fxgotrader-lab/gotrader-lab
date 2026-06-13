import type {
  IctCmdIndependentDateEvidence,
  IctCmdIndependentDateGateOptions,
  IctCmdIndependentDateGateResult,
  IctCmdPaperWatchlistNarrowProfile
} from "./ictCmdIndependentDateGateTypes";

export const CMD_INDEPENDENT_DATE_BLOCKER =
  "CMD lane is promising but date-concentrated; needs independent-date validation.";

export const CMD_INDEPENDENT_DATE_NEXT_ACTION =
  "Run independent-date CMD validation over 90-day history.";

export const DEFAULT_CMD_INDEPENDENT_DATE_GATE_OPTIONS: IctCmdIndependentDateGateOptions = {
  minUniqueTradingDates: 3,
  minActiveRollingWindows: 2,
  minCandidateCount: 20,
  minTargetFirstRate: 0.55,
  maxInvalidationFirstRate: 0.25,
  minAverageRr: 1.2
};

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safety = {
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const safeNumber = (value: unknown, fallback = 0) => (finite(value) ? value : fallback);
const compactPct = (value?: number) => (finite(value) ? `${Math.round(value * 100)}%` : "n/a");

export const isCmdPaperWatchlistModel = (modelName?: string, side?: string) =>
  modelName === "consolidation_manipulation_distribution" && (!side || side === "short");

export const isCmdPaperWatchlistLabel = (value?: string) =>
  /(^|[^a-z])(cmd|consolidation[\s_-]*manipulation[\s_-]*distribution)([^a-z]|$)/i.test(value ?? "");

export const buildCmdPaperWatchlistNarrowProfile = (input: {
  sourceProvider?: string;
  sourceFingerprint?: string;
  timeframe?: string;
  minimumRr?: number;
}): IctCmdPaperWatchlistNarrowProfile => ({
  profileId: "cmd_strict_paper_watchlist_independent_date_v1",
  researchOnly: true,
  modelName: "consolidation_manipulation_distribution",
  side: "short",
  requiredConditions: [
    "consolidation_manipulation_distribution",
    "short_side_only",
    "clear_consolidation_range",
    "manipulation_or_liquidity_sweep_event",
    "distribution_or_expansion_away",
    "external_liquidity_target",
    "valid_structural_invalidation",
    "minimum_rr",
    "session_alignment",
    "source_fingerprint_present",
    "no_mock_or_sample_source"
  ],
  minimumRr: input.minimumRr ?? DEFAULT_CMD_INDEPENDENT_DATE_GATE_OPTIONS.minAverageRr,
  sourceProvider: input.sourceProvider ?? "unknown",
  sourceFingerprint: input.sourceFingerprint ?? "missing",
  timeframe: input.timeframe ?? "5m",
  mockSourceAllowed: false,
  promotionRequiresIndependentDates: true,
  authority
});

const block = (
  status: IctCmdIndependentDateGateResult["status"],
  evidence: IctCmdIndependentDateEvidence,
  options: IctCmdIndependentDateGateOptions,
  reason: string,
  nextAction = CMD_INDEPENDENT_DATE_NEXT_ACTION
): IctCmdIndependentDateGateResult => {
  const candidateCount = Math.max(0, Math.round(safeNumber(evidence.candidateCount)));
  const uniqueTradingDates = Math.max(
    0,
    Math.round(safeNumber(evidence.uniqueTradingDates, evidence.tradingDates?.length ?? 0))
  );
  const activeRollingWindows = Math.max(0, Math.round(safeNumber(evidence.activeRollingWindows)));
  return {
    gateId: "cmd_independent_date_gate_v1",
    researchOnly: true,
    status,
    passed: false,
    paperDemoEligible: false,
    blockerReason: reason,
    nextAction,
    evidenceSummary: [
      `CMD independent-date gate ${status.replace(/_/g, " ")}`,
      `${candidateCount}/${options.minCandidateCount} candidates`,
      `${uniqueTradingDates}/${options.minUniqueTradingDates} dates`,
      `${activeRollingWindows}/${options.minActiveRollingWindows} rolling windows`,
      `target-first ${compactPct(evidence.targetFirstRate)}`,
      `invalidation-first ${compactPct(evidence.invalidationFirstRate)}`
    ].join("; "),
    options,
    metrics: {
      candidateCount,
      uniqueTradingDates,
      activeRollingWindows,
      targetFirstRate: evidence.targetFirstRate,
      invalidationFirstRate: evidence.invalidationFirstRate,
      averageRr: evidence.averageRr,
      robustnessClassification: evidence.robustnessClassification ?? "unknown",
      oosVerdict: evidence.oosVerdict
    },
    source: {
      provider: evidence.sourceProvider ?? "unknown",
      sourceFingerprint: evidence.sourceFingerprint ?? "missing",
      timeframe: evidence.timeframe ?? "5m",
      mockOrSample: evidence.isMockOrSample === true || /mock|sample/i.test(evidence.sourceProvider ?? "")
    },
    authority,
    safety
  };
};

export const evaluateCmdIndependentDateGate = (
  evidence: IctCmdIndependentDateEvidence,
  partialOptions: Partial<IctCmdIndependentDateGateOptions> = {}
): IctCmdIndependentDateGateResult => {
  const options = { ...DEFAULT_CMD_INDEPENDENT_DATE_GATE_OPTIONS, ...partialOptions };
  const modelName = evidence.modelName ?? "consolidation_manipulation_distribution";
  const side = evidence.side ?? "short";
  const sourceBlocked =
    evidence.isMockOrSample === true ||
    /mock|sample/i.test(evidence.sourceProvider ?? "") ||
    !evidence.sourceFingerprint ||
    evidence.sourceFingerprint === "no fingerprint" ||
    evidence.sourceFingerprint === "missing";

  if (!isCmdPaperWatchlistModel(modelName, side)) {
    return block("not_cmd", evidence, options, "Independent-date gate applies only to strict short CMD paper-watchlist candidates.", "Use the normal deterministic validation chain for this model.");
  }
  if (sourceBlocked) {
    return block("source_blocked", evidence, options, "CMD independent-date gate requires a non-mock MT5/source fingerprint.");
  }

  const candidateCount = Math.max(0, Math.round(safeNumber(evidence.candidateCount)));
  const uniqueTradingDates = Math.max(
    0,
    Math.round(safeNumber(evidence.uniqueTradingDates, evidence.tradingDates?.length ?? 0))
  );
  const activeRollingWindows = Math.max(0, Math.round(safeNumber(evidence.activeRollingWindows)));
  const classification = (evidence.robustnessClassification ?? "unknown").toString();
  const oosVerdict = (evidence.oosVerdict ?? "").toString();

  if (/fail|degrad|unstable/i.test(oosVerdict) || classification === "unstable") {
    return block("oos_degraded", evidence, options, "CMD OOS/rolling validation degraded or failed.");
  }
  if (classification === "overfit_risk" || uniqueTradingDates < options.minUniqueTradingDates) {
    return block("overfit_risk", evidence, options, CMD_INDEPENDENT_DATE_BLOCKER);
  }
  if (activeRollingWindows < options.minActiveRollingWindows) {
    return block("needs_more_independent_dates", evidence, options, CMD_INDEPENDENT_DATE_BLOCKER);
  }
  if (candidateCount < options.minCandidateCount) {
    return block("insufficient_sample", evidence, options, `CMD lane needs at least ${options.minCandidateCount} candidates before Paper-Demo promotion.`);
  }
  if (
    (finite(evidence.targetFirstRate) && evidence.targetFirstRate < options.minTargetFirstRate) ||
    (finite(evidence.invalidationFirstRate) && evidence.invalidationFirstRate > options.maxInvalidationFirstRate) ||
    (finite(evidence.averageRr) && evidence.averageRr < options.minAverageRr)
  ) {
    return block("oos_degraded", evidence, options, "CMD metrics failed target-first, invalidation-first, or RR requirements.");
  }

  return {
    ...block(
      "passed",
      evidence,
      options,
      "",
      "CMD independent-date gate passed; continue normal deterministic Paper-Demo checklist review."
    ),
    passed: true,
    paperDemoEligible: true,
    blockerReason: undefined
  };
};

export const buildMissingCmdIndependentDateGate = (input: {
  sourceProvider?: string;
  sourceFingerprint?: string;
  timeframe?: string;
}): IctCmdIndependentDateGateResult =>
  evaluateCmdIndependentDateGate({
    modelName: "consolidation_manipulation_distribution",
    side: "short",
    sourceProvider: input.sourceProvider,
    sourceFingerprint: input.sourceFingerprint,
    timeframe: input.timeframe,
    candidateCount: 0,
    uniqueTradingDates: 0,
    activeRollingWindows: 0,
    robustnessClassification: "overfit_risk"
  });

export const summarizeCmdIndependentDateGate = (result?: IctCmdIndependentDateGateResult) =>
  result
    ? result.passed
      ? `CMD independent-date gate passed: ${result.evidenceSummary}.`
      : `${result.blockerReason ?? CMD_INDEPENDENT_DATE_BLOCKER} ${result.evidenceSummary}.`
    : `${CMD_INDEPENDENT_DATE_BLOCKER} ${CMD_INDEPENDENT_DATE_NEXT_ACTION}`;

export const assertCmdIndependentDateGateIsCompact = (result: IctCmdIndependentDateGateResult) => {
  const serialized = JSON.stringify(result);
  return {
    ok:
      result.researchOnly === true &&
      result.authority.executionAuthority === "none" &&
      result.authority.brokerAuthority === "none" &&
      result.authority.readinessOverrideAuthority === "none" &&
      result.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
