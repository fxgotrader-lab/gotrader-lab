import type { IctRealReplayRunOptions } from "./ictRealReplayRunner";
import {
  defaultIctRealReplayConfig,
  runIctRealReplay
} from "./ictRealReplayRunner";
import type { IctReplayBreakdownMetric } from "./ictReplayDiagnosticsTypes";
import type { IctRealReplayRunConfig, IctRealReplayRunResult } from "./ictRealReplayRunnerTypes";
import { extractMonteCarloOutcomesFromReplayResults } from "./ictMonteCarlo";
import type {
  IctManualReplayApprovedProfileComparison,
  IctManualReplayBreakdownRow,
  IctManualReplayCalibrationImprovement,
  IctManualReplayReviewJournalEvent,
  IctManualReplayReviewRequest,
  IctManualReplayReviewResult
} from "./ictManualReplayReviewTypes";

const MANUAL_REPLAY_REVIEW_JOURNAL_STORAGE_KEY = "gotrader.ict-manual-replay-review.journal.v1";
const MAX_MANUAL_REPLAY_REVIEW_JOURNAL_EVENTS = 100;
const MAX_MANUAL_REPLAY_MONTE_CARLO_OUTCOMES = 300;
const MAX_MANUAL_REPLAY_RESULT_ROWS = 300;

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
const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));

export const defaultIctManualReplayReviewRequest = (): IctManualReplayReviewRequest => {
  const defaults = defaultIctRealReplayConfig();
  return {
    requestedSymbol: defaults.requestedSymbols[0] ?? "MNQ",
    primaryTimeframe: defaults.primaryTimeframes[0] ?? "5m",
    htfTimeframes: defaults.htfTimeframes,
    candleLimit: defaults.candleLimit,
    replayWindowSize: defaults.replayWindowSize,
    lookaheadCandles: defaults.lookaheadCandles
  };
};

const compactRows = (source: Record<string, IctReplayBreakdownMetric> | undefined, limit = 6): IctManualReplayBreakdownRow[] =>
  Object.values(source ?? {})
    .map((metric) => ({
      key: metric.key,
      total: metric.total,
      totalSignals: metric.totalSignals,
      targetFirstRate: metric.targetFirstRate,
      invalidationFirstRate: metric.invalidationFirstRate,
      averageRrAchieved: metric.averageRrAchieved
    }))
    .sort((left, right) => right.totalSignals - left.totalSignals || right.total - left.total || left.key.localeCompare(right.key))
    .slice(0, limit);

const bestBy = (
  source: Record<string, IctReplayBreakdownMetric> | undefined,
  selector: (metric: IctReplayBreakdownMetric) => number
): IctManualReplayBreakdownRow | undefined => {
  const metric = Object.values(source ?? {})
    .filter((candidate) => candidate.totalSignals > 0)
    .sort((left, right) => selector(right) - selector(left) || right.totalSignals - left.totalSignals || left.key.localeCompare(right.key))[0];
  return metric
    ? {
        key: metric.key,
        total: metric.total,
        totalSignals: metric.totalSignals,
        targetFirstRate: metric.targetFirstRate,
        invalidationFirstRate: metric.invalidationFirstRate,
        averageRrAchieved: metric.averageRrAchieved
      }
    : undefined;
};

const sumApprovedProfiles = (profiles: IctManualReplayApprovedProfileComparison[]) => ({
  totalApproved: profiles.reduce((total, profile) => total + profile.totalApproved, 0),
  totalWatchlist: profiles.reduce((total, profile) => total + profile.totalWatchlist, 0),
  totalRejected: profiles.reduce((total, profile) => total + profile.totalRejected, 0),
  totalNoTrade: profiles.reduce((total, profile) => total + profile.totalNoTrade, 0)
});

const buildApprovedProfileComparison = (result: IctRealReplayRunResult): IctManualReplayApprovedProfileComparison[] =>
  (result.approvedProfileResults ?? []).map((profile) => ({
    profileId: profile.profileId,
    label: profile.label,
    totalSignalsBefore: profile.totalSignalsBefore,
    totalApproved: profile.totalApproved,
    totalWatchlist: profile.totalWatchlist,
    totalRejected: profile.totalRejected,
    totalNoTrade: profile.totalNoTrade,
    signalReductionPct: profile.signalReductionPct,
    approvedTargetFirstRate: profile.approvedTargetFirstRate,
    approvedAverageRr: profile.approvedAverageRr,
    topRejectionReasons: profile.topRejectionReasons
  }));

const buildCalibrationImprovements = (result: IctRealReplayRunResult): IctManualReplayCalibrationImprovement[] =>
  (result.calibrationResults ?? [])
    .map((item) => ({
      filterId: item.filterId,
      label: item.label,
      beforeSignals: item.before.totalSignals,
      afterSignals: item.after.totalSignals,
      targetFirstRateChange: item.delta.targetFirstRateChange,
      averageRrChange: item.delta.averageRrChange,
      signalReductionPct: item.delta.signalReductionPct
    }))
    .sort(
      (left, right) =>
        right.targetFirstRateChange - left.targetFirstRateChange ||
        right.averageRrChange - left.averageRrChange ||
        right.signalReductionPct - left.signalReductionPct
    )
    .slice(0, 6);

const firstReason = (result: IctRealReplayRunResult) =>
  result.symbols.find((symbol) => symbol.reason)?.reason ??
  (result.aggregateSummary.completedSymbols === 0 ? "mt5_unavailable_or_not_configured" : undefined);

export const buildIctManualReplayReviewResult = (
  result: IctRealReplayRunResult,
  request: Partial<IctManualReplayReviewRequest> = {}
): IctManualReplayReviewResult => {
  const firstSymbol = result.symbols[0];
  const approvedProfileComparison = buildApprovedProfileComparison(result);
  const bestApprovedProfile = approvedProfileComparison
    .filter((profile) => profile.totalApproved > 0)
    .sort(
      (left, right) =>
        right.approvedTargetFirstRate - left.approvedTargetFirstRate ||
        right.approvedAverageRr - left.approvedAverageRr ||
        right.totalApproved - left.totalApproved
    )[0];
  const status = result.aggregateSummary.completedSymbols > 0 ? "completed" : "unavailable";
  const errors = result.symbols.filter((symbol) => symbol.status === "failed").map((symbol) => symbol.reason ?? "replay_failed");
  const warnings = result.symbols.filter((symbol) => symbol.status === "skipped").map((symbol) => symbol.reason ?? "replay_skipped");

  return sanitizeIctManualReplayReviewResult({
    status,
    runId: result.runId,
    generatedAt: result.generatedAt,
    requestedSymbol: firstSymbol?.requestedSymbol ?? request.requestedSymbol ?? result.config.requestedSymbols[0] ?? "MNQ",
    brokerSymbol: firstSymbol?.brokerSymbol ?? "unknown",
    primaryTimeframe: firstSymbol?.primaryTimeframe ?? request.primaryTimeframe ?? result.config.primaryTimeframes[0] ?? "5m",
    htfTimeframes: firstSymbol?.htfTimeframes.length ? firstSymbol.htfTimeframes : request.htfTimeframes ?? result.config.htfTimeframes,
    candleLimit: result.config.candleLimit,
    replayWindowSize: result.config.replayWindowSize,
    lookaheadCandles: result.config.lookaheadCandles,
    totalWindows: result.aggregateSummary.totalWindows,
    totalSignals: result.aggregateSummary.totalSignals,
    totalNoTrades: result.aggregateSummary.totalNoTrades,
    targetFirstRate: result.aggregateSummary.targetFirstRate,
    invalidationFirstRate: result.aggregateSummary.invalidationFirstRate,
    averageRrAchieved: result.aggregateSummary.averageRrAchieved,
    approvedProfileCounts: sumApprovedProfiles(approvedProfileComparison),
    approvedTargetFirstRate: bestApprovedProfile?.approvedTargetFirstRate ?? 0,
    approvedAverageRr: bestApprovedProfile?.approvedAverageRr ?? 0,
    mostCommonNoTradeReasons: result.aggregateSummary.mostCommonNoTradeReasons,
    bestSetup: bestBy(result.diagnostics?.bySetup, (metric) => metric.targetFirstRate),
    worstSetup: bestBy(result.diagnostics?.bySetup, (metric) => metric.invalidationFirstRate),
    smtSummary: {
      divergenceTypes: compactRows(result.diagnostics?.bySmtDivergenceType),
      confirmation: compactRows(result.diagnostics?.bySmtConfirmsCandidate),
      rejection: compactRows(result.diagnostics?.bySmtRejectsCandidate)
    },
    newsSessionRiskSummary: {
      newsRiskLevels: compactRows(result.diagnostics?.byNewsRiskLevel),
      sessionRiskStates: compactRows(result.diagnostics?.bySessionRiskState),
      riskGovernorActions: compactRows(result.diagnostics?.byRiskGovernorAction)
    },
    topCalibrationFilterImprovements: buildCalibrationImprovements(result),
    approvedProfileComparison,
    monteCarloOutcomes: extractMonteCarloOutcomesFromReplayResults(result.replayResults ?? []).slice(0, MAX_MANUAL_REPLAY_MONTE_CARLO_OUTCOMES),
    // Audit B5: preserve compact replay rows so hypothesis validation can
    // match occurrences instead of dropping replay evidence.
    replayResults: (result.replayResults ?? []).slice(0, MAX_MANUAL_REPLAY_RESULT_ROWS),
    unavailableReason: status === "unavailable" ? firstReason(result) : undefined,
    errors,
    warnings,
    researchOnly: true,
    authority,
    safety
  });
};

export const buildFailedIctManualReplayReviewResult = (
  request: Partial<IctManualReplayReviewRequest>,
  error: unknown
): IctManualReplayReviewResult =>
  sanitizeIctManualReplayReviewResult({
    status: "failed",
    generatedAt: new Date().toISOString(),
    requestedSymbol: request.requestedSymbol ?? "MNQ",
    brokerSymbol: "unknown",
    primaryTimeframe: request.primaryTimeframe ?? "5m",
    htfTimeframes: request.htfTimeframes ?? ["15m", "1h"],
    candleLimit: request.candleLimit ?? defaultIctManualReplayReviewRequest().candleLimit,
    replayWindowSize: request.replayWindowSize ?? defaultIctManualReplayReviewRequest().replayWindowSize,
    lookaheadCandles: request.lookaheadCandles ?? defaultIctManualReplayReviewRequest().lookaheadCandles,
    totalWindows: 0,
    totalSignals: 0,
    totalNoTrades: 0,
    targetFirstRate: 0,
    invalidationFirstRate: 0,
    averageRrAchieved: 0,
    approvedProfileCounts: {
      totalApproved: 0,
      totalWatchlist: 0,
      totalRejected: 0,
      totalNoTrade: 0
    },
    approvedTargetFirstRate: 0,
    approvedAverageRr: 0,
    mostCommonNoTradeReasons: [],
    smtSummary: {
      divergenceTypes: [],
      confirmation: [],
      rejection: []
    },
    newsSessionRiskSummary: {
      newsRiskLevels: [],
      sessionRiskStates: [],
      riskGovernorActions: []
    },
    topCalibrationFilterImprovements: [],
    approvedProfileComparison: [],
    monteCarloOutcomes: [],
    unavailableReason: "manual_replay_review_failed",
    errors: [error instanceof Error ? error.message : String(error)],
    warnings: [],
    researchOnly: true,
    authority,
    safety
  });

export async function runManualIctReplayReview(
  requestInput: Partial<IctManualReplayReviewRequest> = {},
  options: IctRealReplayRunOptions = {}
) {
  const defaults = defaultIctManualReplayReviewRequest();
  const request: IctManualReplayReviewRequest = {
    requestedSymbol: requestInput.requestedSymbol ?? defaults.requestedSymbol,
    primaryTimeframe: requestInput.primaryTimeframe ?? defaults.primaryTimeframe,
    htfTimeframes: requestInput.htfTimeframes?.length ? requestInput.htfTimeframes : defaults.htfTimeframes,
    candleLimit: requestInput.candleLimit ?? defaults.candleLimit,
    replayWindowSize: requestInput.replayWindowSize ?? defaults.replayWindowSize,
    lookaheadCandles: requestInput.lookaheadCandles ?? defaults.lookaheadCandles
  };
  try {
    const config: Partial<IctRealReplayRunConfig> = {
      requestedSymbols: [request.requestedSymbol],
      primaryTimeframes: [request.primaryTimeframe],
      htfTimeframes: request.htfTimeframes,
      candleLimit: request.candleLimit,
      replayWindowSize: request.replayWindowSize,
      lookaheadCandles: request.lookaheadCandles,
      researchOnly: true
    };
    const result = await runIctRealReplay(config, {
      ...options,
      appendJournal: options.appendJournal ?? true,
      includeDiagnostics: options.includeDiagnostics ?? true,
      includeReplayResults: options.includeReplayResults ?? true
    });
    const review = buildIctManualReplayReviewResult(result, request);
    if (options.appendJournal !== false) {
      appendIctManualReplayReviewJournalEvent(buildIctManualReplayReviewJournalEvent(review));
    }
    return review;
  } catch (error) {
    return buildFailedIctManualReplayReviewResult(request, error);
  }
}

export const buildIctManualReplayReviewJournalEvent = (
  result: IctManualReplayReviewResult
): IctManualReplayReviewJournalEvent => ({
  eventType: "ict_manual_replay_review",
  journalEventId: createId("ict_manual_replay_review_journal"),
  runId: result.runId,
  generatedAt: result.generatedAt,
  requestedSymbol: result.requestedSymbol,
  brokerSymbol: result.brokerSymbol,
  primaryTimeframe: result.primaryTimeframe,
  htfTimeframes: result.htfTimeframes,
  totalSignals: result.totalSignals,
  targetFirstRate: result.targetFirstRate,
  approvedTargetFirstRate: result.approvedTargetFirstRate,
  averageRrAchieved: result.averageRrAchieved,
  approvedAverageRr: result.approvedAverageRr,
  status: result.status,
  researchOnly: true,
  authority,
  safety
});

export const readIctManualReplayReviewJournalEvents = (): IctManualReplayReviewJournalEvent[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MANUAL_REPLAY_REVIEW_JOURNAL_STORAGE_KEY) ?? "[]") as IctManualReplayReviewJournalEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((event) => event.eventType === "ict_manual_replay_review" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const appendIctManualReplayReviewJournalEvent = (event: IctManualReplayReviewJournalEvent) => {
  const sanitized = { ...event, researchOnly: true as const, authority, safety };
  if (!isBrowser()) {
    return { ok: true, storage: "memory_unavailable" as const, event: sanitized };
  }
  const current = readIctManualReplayReviewJournalEvents();
  const next = [...current, sanitized].slice(-MAX_MANUAL_REPLAY_REVIEW_JOURNAL_EVENTS);
  window.localStorage.setItem(MANUAL_REPLAY_REVIEW_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
};

export const sanitizeIctManualReplayReviewResult = (
  result: IctManualReplayReviewResult
): IctManualReplayReviewResult => {
  const sanitized = JSON.parse(JSON.stringify(result)) as IctManualReplayReviewResult;
  sanitized.researchOnly = true;
  sanitized.authority = authority;
  sanitized.safety = safety;
  sanitized.monteCarloOutcomes = sanitized.monteCarloOutcomes?.slice(0, MAX_MANUAL_REPLAY_MONTE_CARLO_OUTCOMES);
  sanitized.replayResults = sanitized.replayResults?.slice(0, MAX_MANUAL_REPLAY_RESULT_ROWS);
  sanitized.targetFirstRate = round(sanitized.targetFirstRate);
  sanitized.invalidationFirstRate = round(sanitized.invalidationFirstRate);
  sanitized.averageRrAchieved = round(sanitized.averageRrAchieved, 2);
  sanitized.approvedTargetFirstRate = round(sanitized.approvedTargetFirstRate);
  sanitized.approvedAverageRr = round(sanitized.approvedAverageRr, 2);
  return sanitized;
};

export const assertIctManualReplayReviewOutputIsCompact = (output: {
  result?: IctManualReplayReviewResult;
  journalEvent?: IctManualReplayReviewJournalEvent;
}) => {
  const withoutSafety = {
    result: output.result ? { ...output.result, safety: undefined } : undefined,
    journalEvent: output.journalEvent ? { ...output.journalEvent, safety: undefined } : undefined
  };
  const serialized = JSON.stringify(withoutSafety);
  return {
    ok:
      (output.result?.researchOnly ?? true) === true &&
      (output.journalEvent?.researchOnly ?? true) === true &&
      (output.result?.authority.executionAuthority ?? "none") === "none" &&
      (output.result?.authority.brokerAuthority ?? "none") === "none" &&
      (output.result?.authority.readinessOverrideAuthority ?? "none") === "none" &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
