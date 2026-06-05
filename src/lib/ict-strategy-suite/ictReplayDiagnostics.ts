import type { IctReplayResult } from "./ictReplayValidationTypes";
import type {
  IctConfidenceBucket,
  IctReplayBreakdownMetric,
  IctReplayCalibrationFilter,
  IctReplayCalibrationResult,
  IctReplayDiagnostics,
  IctReplayDiagnosticsJournalEvent,
  IctRrBucket
} from "./ictReplayDiagnosticsTypes";

const DIAGNOSTICS_JOURNAL_STORAGE_KEY = "gotrader.ict-replay-diagnostics-summary.journal.v1";
const MAX_DIAGNOSTICS_JOURNAL_EVENTS = 100;

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

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));
const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const signalResults = (results: IctReplayResult[]) => results.filter((result) => result.decision === "research_only");
const average = (values: number[]) => (values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 4) : 0);
const rrFor = (result: IctReplayResult) => result.rrEstimate ?? result.tradePath.rrAchieved ?? 0;

const sessionForTimestamp = (timestamp?: string) => {
  if (!timestamp) return "unknown";
  const hour = new Date(timestamp).getUTCHours();
  if (hour >= 0 && hour < 7) return "Asia";
  if (hour >= 7 && hour < 13) return "London";
  if (hour >= 13 && hour < 21) return "New York";
  return "Off hours";
};

export const bucketConfidence = (confidence: number): IctConfidenceBucket => {
  const value = Math.max(0, Math.min(100, Math.round(confidence <= 1 ? confidence * 100 : confidence)));
  if (value <= 20) return "0-20";
  if (value <= 40) return "21-40";
  if (value <= 60) return "41-60";
  if (value <= 80) return "61-80";
  return "81-100";
};

export const bucketRr = (rr?: number): IctRrBucket => {
  const value = Number(rr ?? 0);
  if (value < 1) return "lt_1r";
  if (value < 1.5) return "1r_to_1_5r";
  if (value < 2) return "1_5r_to_2r";
  if (value <= 3) return "2r_to_3r";
  return "gt_3r";
};

const metricFor = (key: string, results: IctReplayResult[]): IctReplayBreakdownMetric => {
  const signals = signalResults(results);
  const totalSignals = signals.length;
  const targetFirstCount = results.filter((result) => result.outcome === "target_first").length;
  const invalidationFirstCount = results.filter((result) => result.outcome === "invalidation_first").length;
  return {
    key,
    total: results.length,
    totalSignals,
    totalNoTrades: results.filter((result) => result.outcome === "no_trade").length,
    targetFirstCount,
    invalidationFirstCount,
    partialTargetCount: results.filter((result) => result.outcome === "partial_target").length,
    stalledCount: results.filter((result) => result.outcome === "stalled").length,
    targetFirstRate: totalSignals ? round(targetFirstCount / totalSignals) : 0,
    invalidationFirstRate: totalSignals ? round(invalidationFirstCount / totalSignals) : 0,
    averageRrAchieved: average(signals.map((result) => result.tradePath.rrAchieved).filter((value): value is number => typeof value === "number"))
  };
};

export const buildBreakdown = (results: IctReplayResult[], keySelector: (result: IctReplayResult) => string | undefined) => {
  const groups = new Map<string, IctReplayResult[]>();
  for (const result of results) {
    const key = keySelector(result) || "unknown";
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return Object.fromEntries([...groups.entries()].map(([key, grouped]) => [key, metricFor(key, grouped)]));
};

export const countMostCommonNoTradeReasons = (results: IctReplayResult[]) => {
  const counts = new Map<string, number>();
  for (const reason of results.flatMap((result) => result.noTradeReasons)) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, 10);
};

const baselineFor = (results: IctReplayResult[]) => {
  const signals = signalResults(results);
  const totalSignals = signals.length;
  return {
    totalSignals,
    targetFirstRate: totalSignals ? round(signals.filter((result) => result.outcome === "target_first").length / totalSignals) : 0,
    invalidationFirstRate: totalSignals ? round(signals.filter((result) => result.outcome === "invalidation_first").length / totalSignals) : 0,
    averageRrAchieved: average(signals.map((result) => result.tradePath.rrAchieved).filter((value): value is number => typeof value === "number"))
  };
};

export const buildReplayDiagnostics = (results: IctReplayResult[]): IctReplayDiagnostics =>
  sanitizeDiagnosticsOutput({
    researchOnly: true,
    generatedAt: new Date().toISOString(),
    totalResults: results.length,
    totalSignals: signalResults(results).length,
    baseline: baselineFor(results),
    byStrategyId: buildBreakdown(results, (result) => result.strategyId),
    byPhase: buildBreakdown(results, (result) => result.phase ?? "phase_1"),
    bySetup: buildBreakdown(results, (result) => result.setup),
    byPhase2Setup: buildBreakdown(results.filter((result) => result.phase === "phase_2"), (result) => result.setup),
    byOrderBlockVariant: buildBreakdown(results, (result) => result.orderBlockVariant ?? "none"),
    byApprovedProfileStatus: buildBreakdown(results, (result) => result.approvedProfileStatus ?? "unknown"),
    bySide: buildBreakdown(results, (result) => result.side),
    bySymbol: buildBreakdown(results, (result) => result.requestedSymbol || result.symbol),
    byPrimaryTimeframe: buildBreakdown(results, (result) => result.primaryTimeframe),
    byHtfAlignment: buildBreakdown(results, (result) => (result.htfAligned === undefined ? "unknown" : result.htfAligned ? "aligned" : "conflict")),
    bySession: buildBreakdown(results, (result) => sessionForTimestamp(result.tradePath.signalTime)),
    byConfidenceBucket: buildBreakdown(results, (result) => bucketConfidence(result.confidence)) as Record<IctConfidenceBucket, IctReplayBreakdownMetric>,
    byRrBucket: buildBreakdown(results, (result) => bucketRr(rrFor(result))) as Record<IctRrBucket, IctReplayBreakdownMetric>,
    byFvgStatus: buildBreakdown(results, (result) => result.fvgStatus),
    byDealingRangeLocation: buildBreakdown(results, (result) => result.dealingRangeLocation ?? "unknown"),
    byLiquidityTargetType: buildBreakdown(results, (result) => result.liquidityTargetType ?? "none"),
    bySmtDivergenceType: buildBreakdown(results, (result) => result.smtDivergenceType ?? "not_evaluated"),
    bySmtConfirmsCandidate: buildBreakdown(results, (result) => (result.smtConfirmsCandidate === undefined ? "not_evaluated" : result.smtConfirmsCandidate ? "confirms" : "does_not_confirm")),
    bySmtRejectsCandidate: buildBreakdown(results, (result) => (result.smtRejectsCandidate === undefined ? "not_evaluated" : result.smtRejectsCandidate ? "rejects" : "does_not_reject")),
    byRelativeStrengthLeader: buildBreakdown(results, (result) => result.relativeStrengthLeader ?? "none"),
    byRelativeWeaknessLeader: buildBreakdown(results, (result) => result.relativeWeaknessLeader ?? "none"),
    byNewsRiskLevel: buildBreakdown(results, (result) => result.newsRiskLevel ?? "not_evaluated"),
    bySessionRiskState: buildBreakdown(results, (result) => result.sessionRiskState ?? "not_evaluated"),
    byRiskGovernorAction: buildBreakdown(results, (result) => result.riskGovernorAction ?? "not_evaluated"),
    mostCommonNoTradeReasons: countMostCommonNoTradeReasons(results),
    safety
  });

export const getDefaultReplayCalibrationFilters = (): IctReplayCalibrationFilter[] => [
  { id: "min_confidence_60", label: "Minimum confidence 60%", enabled: true, minConfidence: 0.6 },
  { id: "min_confidence_70", label: "Minimum confidence 70%", enabled: true, minConfidence: 0.7 },
  { id: "min_rr_2", label: "Minimum 2R estimate", enabled: true, minRr: 2 },
  { id: "min_rr_2_5", label: "Minimum 2.5R estimate", enabled: true, minRr: 2.5 },
  { id: "htf_alignment_required", label: "HTF alignment required", enabled: true, requireHtfAlignment: true },
  { id: "fvg_present_required", label: "FVG present required", enabled: true, requireFvgPresent: true },
  { id: "fvg_respected_required", label: "FVG respected required", enabled: true, requireFvgRespected: true },
  { id: "external_liquidity_target_required", label: "External liquidity target required", enabled: true, requireExternalLiquidityTarget: true },
  { id: "require_smt_confirmation_for_index", label: "Require SMT/RS confirmation for index candidates", enabled: true, requireSmtConfirmationForIndex: true },
  { id: "reject_smt_against_candidate", label: "Reject SMT/RS against candidate", enabled: true, rejectSmtAgainstCandidate: true },
  { id: "prefer_relative_strength_leader", label: "Prefer relative strength leader", enabled: true, preferRelativeStrengthLeader: true },
  { id: "reject_mixed_index_alignment", label: "Reject mixed index alignment", enabled: true, rejectMixedIndexAlignment: true },
  { id: "reject_high_news_risk", label: "Reject high or blocked news risk", enabled: true, rejectHighNewsRisk: true },
  { id: "reject_medium_news_risk", label: "Reject medium-or-worse news risk", enabled: true, rejectMediumNewsRisk: true },
  { id: "preferred_sessions_only", label: "Preferred sessions only", enabled: true, preferredSessionsOnly: true },
  { id: "reject_lunch_session", label: "Reject New York lunch candidates", enabled: true, rejectLunchSession: true },
  { id: "reject_opening_minutes", label: "Reject opening-minute caution candidates", enabled: true, rejectOpeningMinutes: true },
  { id: "reject_after_hours", label: "Reject after-hours / dead-zone candidates", enabled: true, rejectAfterHours: true },
  { id: "reject_equilibrium", label: "Reject equilibrium entries", enabled: true, rejectEquilibrium: true },
  { id: "ny_session_only", label: "New York session only", enabled: true, allowedSessions: ["New York"] },
  { id: "london_and_ny_only", label: "London and New York only", enabled: true, allowedSessions: ["London", "New York"] }
];

const passesFilter = (result: IctReplayResult, filter: IctReplayCalibrationFilter) => {
  if (!filter.enabled) return true;
  if (result.decision !== "research_only") return false;
  if (filter.minConfidence !== undefined && result.confidence < filter.minConfidence) return false;
  if (filter.minRr !== undefined && rrFor(result) < filter.minRr) return false;
  if (filter.requireHtfAlignment && result.htfAligned !== true) return false;
  if (filter.requireFvgPresent && result.fvgStatus === "not_applicable") return false;
  if (filter.requireFvgRespected && result.fvgStatus !== "respected") return false;
  if (filter.requireExternalLiquidityTarget && !result.liquidityTargetType) return false;
  if (filter.allowedSessions?.length && !filter.allowedSessions.includes(sessionForTimestamp(result.tradePath.signalTime))) return false;
  if (filter.allowedSetups?.length && !filter.allowedSetups.includes(result.setup)) return false;
  if (filter.allowedSides?.length && !filter.allowedSides.includes(result.side as "long" | "short")) return false;
  if (filter.rejectEquilibrium && result.dealingRangeLocation === "equilibrium") return false;
  if (filter.rejectTargetTooClose && (result.rrEstimate ?? 0) < 1.5) return false;
  if (filter.requireSmtConfirmationForIndex && result.smtConfirmsCandidate !== true) return false;
  if (filter.rejectSmtAgainstCandidate && result.smtRejectsCandidate === true) return false;
  if (filter.preferRelativeStrengthLeader && result.relativeStrengthLeader && result.brokerSymbol !== result.relativeStrengthLeader) return false;
  if (filter.rejectMixedIndexAlignment && result.smtDivergenceType === "no_smt" && (result.smtConfidenceAdjustment ?? 0) < 0) return false;
  if (filter.rejectHighNewsRisk && (result.newsRiskLevel === "blocked" || result.newsRiskLevel === "high")) return false;
  if (filter.rejectMediumNewsRisk && ["blocked", "high", "medium"].includes(result.newsRiskLevel ?? "")) return false;
  if (filter.preferredSessionsOnly && result.sessionRiskState !== "preferred") return false;
  if (filter.rejectLunchSession && result.sessionName === "new_york_lunch") return false;
  if (filter.rejectOpeningMinutes && result.sessionRiskState === "caution" && /open/i.test((result.newsSessionRiskNotes ?? []).join(" "))) return false;
  if (filter.rejectAfterHours && (result.sessionName === "after_hours" || result.sessionRiskState === "avoid")) return false;
  if (filter.allowedNewsRiskLevels?.length && !filter.allowedNewsRiskLevels.includes(result.newsRiskLevel ?? "unknown")) return false;
  if (filter.allowedSessionRiskStates?.length && !filter.allowedSessionRiskStates.includes(result.sessionRiskState ?? "unknown")) return false;
  if (filter.allowedRiskGovernorActions?.length && !filter.allowedRiskGovernorActions.includes(result.riskGovernorAction ?? "reject_candidate")) return false;
  return true;
};

export const applyReplayCalibrationFilter = (results: IctReplayResult[], filter: IctReplayCalibrationFilter) =>
  signalResults(results).filter((result) => passesFilter(result, filter));

export const runReplayCalibrationSuite = (
  results: IctReplayResult[],
  filters: IctReplayCalibrationFilter[] = getDefaultReplayCalibrationFilters()
): IctReplayCalibrationResult[] => {
  const before = baselineFor(results);
  return filters
    .filter((filter) => filter.enabled)
    .map((filter) => {
      const filtered = applyReplayCalibrationFilter(results, filter);
      const afterBase = baselineFor(filtered);
      return {
        filterId: filter.id,
        label: filter.label,
        researchOnly: true,
        before: {
          totalSignals: before.totalSignals,
          targetFirstRate: before.targetFirstRate,
          invalidationFirstRate: before.invalidationFirstRate,
          averageRrAchieved: before.averageRrAchieved
        },
        after: {
          totalSignals: afterBase.totalSignals,
          rejectedSignals: Math.max(0, before.totalSignals - afterBase.totalSignals),
          targetFirstRate: afterBase.targetFirstRate,
          invalidationFirstRate: afterBase.invalidationFirstRate,
          averageRrAchieved: afterBase.averageRrAchieved
        },
        delta: {
          signalReductionPct: before.totalSignals ? round((before.totalSignals - afterBase.totalSignals) / before.totalSignals) : 0,
          targetFirstRateChange: round(afterBase.targetFirstRate - before.targetFirstRate),
          averageRrChange: round(afterBase.averageRrAchieved - before.averageRrAchieved, 2)
        }
      };
    });
};

export const sanitizeDiagnosticsOutput = <T extends { researchOnly: true; safety?: unknown }>(output: T): T => {
  const sanitized = JSON.parse(JSON.stringify(output)) as T;
  return {
    ...sanitized,
    researchOnly: true,
    safety: safety as T["safety"]
  };
};

const bestBy = (breakdown: Record<string, IctReplayBreakdownMetric>, selector: (metric: IctReplayBreakdownMetric) => number) =>
  Object.values(breakdown)
    .filter((metric) => metric.totalSignals > 0)
    .sort((left, right) => selector(right) - selector(left) || right.totalSignals - left.totalSignals)[0]?.key;

export const buildIctReplayDiagnosticsJournalEvent = ({
  calibrationResults,
  diagnostics,
  runId
}: {
  calibrationResults: IctReplayCalibrationResult[];
  diagnostics: IctReplayDiagnostics;
  runId?: string;
}): IctReplayDiagnosticsJournalEvent => ({
  eventType: "ict_replay_diagnostics_summary",
  journalEventId: createId("ict_replay_diagnostics_journal"),
  runId,
  generatedAt: diagnostics.generatedAt,
  totalResults: diagnostics.totalResults,
  totalSignals: diagnostics.totalSignals,
  baselineTargetFirstRate: diagnostics.baseline.targetFirstRate,
  baselineAverageRr: diagnostics.baseline.averageRrAchieved,
  topStrategyByTargetFirstRate: bestBy(diagnostics.byStrategyId, (metric) => metric.targetFirstRate),
  worstStrategyByInvalidationRate: bestBy(diagnostics.byStrategyId, (metric) => metric.invalidationFirstRate),
  mostCommonNoTradeReasons: diagnostics.mostCommonNoTradeReasons,
  calibrationResults: calibrationResults.map((result) => ({
    filterId: result.filterId,
    label: result.label,
    beforeSignals: result.before.totalSignals,
    afterSignals: result.after.totalSignals,
    delta: result.delta
  })),
  researchOnly: true,
  authority,
  safety
});

export const readIctReplayDiagnosticsJournalEvents = (): IctReplayDiagnosticsJournalEvent[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DIAGNOSTICS_JOURNAL_STORAGE_KEY) ?? "[]") as IctReplayDiagnosticsJournalEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((event) => event.eventType === "ict_replay_diagnostics_summary" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const appendIctReplayDiagnosticsJournalEvent = (event: IctReplayDiagnosticsJournalEvent) => {
  const sanitized = { ...event, researchOnly: true as const, authority, safety };
  if (!isBrowser()) {
    return { ok: true, storage: "memory_unavailable" as const, event: sanitized };
  }
  const current = readIctReplayDiagnosticsJournalEvents();
  const next = [...current, sanitized].slice(-MAX_DIAGNOSTICS_JOURNAL_EVENTS);
  window.localStorage.setItem(DIAGNOSTICS_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
};

export const assertIctReplayDiagnosticsOutputIsCompact = (output: {
  diagnostics?: IctReplayDiagnostics;
  calibrationResults?: IctReplayCalibrationResult[];
  journalEvent?: IctReplayDiagnosticsJournalEvent;
}) => {
  const payload = {
    diagnostics: output.diagnostics ? { ...output.diagnostics, safety: undefined } : undefined,
    calibrationResults: output.calibrationResults,
    journalEvent: output.journalEvent ? { ...output.journalEvent, safety: undefined } : undefined
  };
  const serialized = JSON.stringify(payload);
  return {
    ok:
      !/"candles"\s*:/i.test(serialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized) &&
      (output.diagnostics?.researchOnly ?? true) === true,
    serializedBytes: new Blob([serialized]).size
  };
};
