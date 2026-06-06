import {
  listCanonicalCandleSourceSummaries,
  loadCanonicalCandleSource,
  type CanonicalCandleSourceSummary
} from "../candleSources";
import type { ResearchRuntimeSnapshot } from "../runtime";
import type { Candle, FuturesSymbol, Timeframe } from "../types";
import { buildIctAdvisorSignals } from "./ictAdvisorEngine";
import type { IctAdvisorSignal } from "./ictAdvisorTypes";
import {
  evaluateApprovedSetupProfiles,
  sanitizeApprovedSetupDecision
} from "./ictApprovedSetupProfile";
import type { IctApprovedSetupDecision } from "./ictApprovedSetupProfileTypes";
import { ICT_INDEX_SMT_INSTRUMENTS } from "./ictIndexSmt";
import type { IctIndexComparisonCandles } from "./ictIndexSmtTypes";
import { buildIctSessionNarrative } from "./ictSessionNarrative";
import { normalizeCandles } from "./ictStrategySuiteHelpers";
import type {
  IctFvgReplayStatus,
  IctReplayInput,
  IctReplayJournalEvent,
  IctReplayResult,
  IctReplaySummary,
  IctReplayTradePath,
  IctReplayValidationReport
} from "./ictReplayValidationTypes";

const REPLAY_JOURNAL_STORAGE_KEY = "gotrader.ict-replay-validation.journal.v1";
const MAX_REPLAY_JOURNAL_EVENTS = 500;

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));
const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const approvalStatusWeight = (status?: string) =>
  status === "approved_research_candidate" ? 4 : status === "watchlist_candidate" ? 3 : status === "rejected_candidate" ? 2 : status === "no_trade" ? 1 : 0;

const coerceCandle = (value: unknown, index: number, input: Pick<IctReplayInput, "primaryTimeframe" | "requestedSymbol" | "symbol">): Candle | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<Candle> & { time?: number | string };
  const timestamp =
    typeof record.timestamp === "string"
      ? record.timestamp
      : typeof record.time === "number"
        ? new Date(record.time * 1000).toISOString()
        : typeof record.time === "string" && !Number.isNaN(Date.parse(record.time))
          ? new Date(record.time).toISOString()
          : undefined;
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) return undefined;
  const open = Number(record.open);
  const high = Number(record.high);
  const low = Number(record.low);
  const close = Number(record.close);
  if (![open, high, low, close].every(Number.isFinite)) return undefined;
  return {
    id: record.id ?? `ict_replay_${index}_${timestamp}`,
    symbol: (record.symbol ?? input.symbol ?? input.requestedSymbol) as FuturesSymbol,
    timeframe: (record.timeframe ?? input.primaryTimeframe) as Timeframe,
    timestamp,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(Number(record.volume)) ? Number(record.volume) : undefined
  };
};

const coerceCandles = (candles: unknown[] = [], input: Pick<IctReplayInput, "primaryTimeframe" | "requestedSymbol" | "symbol">) =>
  normalizeCandles(candles.map((value, index) => coerceCandle(value, index, input)).filter((candle): candle is Candle => Boolean(candle)));

const coerceHtfCandles = (input: IctReplayInput): Record<string, Candle[]> =>
  Object.fromEntries(
    Object.entries(input.htfCandles ?? {}).map(([timeframe, candles]) => [
      timeframe,
      coerceCandles(candles, { ...input, primaryTimeframe: timeframe })
    ])
  );

const coerceIndexComparisonCandles = (input: IctReplayInput): IctIndexComparisonCandles =>
  Object.fromEntries(
    Object.entries(input.indexComparisonCandles ?? {}).map(([brokerSymbol, candles]) => [
      brokerSymbol,
      coerceCandles(Array.isArray(candles) ? candles : [], {
        ...input,
        symbol: brokerSymbol,
        requestedSymbol: brokerSymbol
      })
    ])
  );

const sliceIndexComparisonForSignal = (
  comparisonCandles: IctIndexComparisonCandles,
  signalTimestamp: string,
  replayWindowSize: number
): IctIndexComparisonCandles => {
  const cutoff = Date.parse(signalTimestamp);
  return Object.fromEntries(
    Object.entries(comparisonCandles).map(([brokerSymbol, candles]) => [
      brokerSymbol,
      (candles ?? [])
        .filter((candle) => Date.parse(candle.timestamp) <= cutoff)
        .slice(-Math.max(8, replayWindowSize))
    ])
  );
};

export const sliceReplayWindows = (input: IctReplayInput) => {
  const candles = coerceCandles(input.candles, input);
  const windowSize = Math.max(3, Math.floor(input.replayWindowSize));
  const lookaheadCandles = Math.max(1, Math.floor(input.lookaheadCandles));
  const maxReplayWindows = Math.max(0, Math.floor(Number(input.maxReplayWindows ?? 0)));
  const windows: Array<{
    historicalCandles: Candle[];
    futureCandles: Candle[];
    signalCandle: Candle;
    windowIndex: number;
  }> = [];
  for (let endIndex = windowSize - 1; endIndex < candles.length; endIndex += 1) {
    const historicalCandles = candles.slice(endIndex - windowSize + 1, endIndex + 1);
    const futureCandles = candles.slice(endIndex + 1, endIndex + 1 + lookaheadCandles);
    const signalCandle = historicalCandles.at(-1);
    if (signalCandle) {
      windows.push({ historicalCandles, futureCandles, signalCandle, windowIndex: windows.length });
    }
  }
  return maxReplayWindows > 0 && windows.length > maxReplayWindows ? windows.slice(-maxReplayWindows) : windows;
};

export const calculateCandlesToTarget = (futureCandles: Candle[], side: IctAdvisorSignal["side"], target?: number) => {
  if (target === undefined || side === "flat") return undefined;
  const index = futureCandles.findIndex((candle) => (side === "long" ? candle.high >= target : candle.low <= target));
  return index >= 0 ? index + 1 : undefined;
};

export const calculateCandlesToInvalidation = (futureCandles: Candle[], side: IctAdvisorSignal["side"], invalidation?: number) => {
  if (invalidation === undefined || side === "flat") return undefined;
  const index = futureCandles.findIndex((candle) => (side === "long" ? candle.low <= invalidation : candle.high >= invalidation));
  return index >= 0 ? index + 1 : undefined;
};

export const calculateMfeMae = (futureCandles: Candle[], side: IctAdvisorSignal["side"], entryReference?: number) => {
  if (!futureCandles.length || entryReference === undefined || side === "flat") {
    return { maxFavorableExcursion: undefined, maxAdverseExcursion: undefined };
  }
  if (side === "long") {
    return {
      maxFavorableExcursion: round(Math.max(...futureCandles.map((candle) => candle.high)) - entryReference),
      maxAdverseExcursion: round(entryReference - Math.min(...futureCandles.map((candle) => candle.low)))
    };
  }
  return {
    maxFavorableExcursion: round(entryReference - Math.min(...futureCandles.map((candle) => candle.low))),
    maxAdverseExcursion: round(Math.max(...futureCandles.map((candle) => candle.high)) - entryReference)
  };
};

export const evaluateFvgReplayStatus = (signal: IctAdvisorSignal, futureCandles: Candle[]): IctFvgReplayStatus => {
  const fvg = signal.fairValueGap;
  if (!fvg) return "not_applicable";
  const touches = futureCandles
    .map((candle, index) => ({ candle, index }))
    .filter(({ candle }) => candle.low <= fvg.high && candle.high >= fvg.low);
  if (!touches.length) return "ignored";
  const fullMitigation = touches.some(({ candle }) =>
    fvg.direction === "bullish" ? candle.close < fvg.low : candle.close > fvg.high
  );
  if (fullMitigation) return "fully_mitigated";
  const firstTouchIndex = touches[0].index;
  const afterTouch = futureCandles.slice(firstTouchIndex);
  const movedTowardTarget =
    signal.target !== undefined
      ? afterTouch.some((candle) => (signal.side === "long" ? candle.high >= signal.target! : signal.side === "short" ? candle.low <= signal.target! : false))
      : afterTouch.some((candle) => (fvg.direction === "bullish" ? candle.close > fvg.high : candle.close < fvg.low));
  return movedTowardTarget ? "respected" : "partially_mitigated";
};

const entryReferenceFor = (signal: IctAdvisorSignal, signalCandle: Candle) =>
  signal.entryZone?.midpoint ?? signal.entryZone?.low ?? signal.entryZone?.high ?? signalCandle.close;

const selectReplayApprovalDecision = (decisions: IctApprovedSetupDecision[]) =>
  decisions
    .slice()
    .sort(
      (left, right) =>
        approvalStatusWeight(right.status) - approvalStatusWeight(left.status) ||
        right.approvalScore - left.approvalScore ||
        left.profileId.localeCompare(right.profileId)
    )[0];

export const evaluateSignalOutcome = ({
  brokerSymbol,
  futureCandles,
  htfTimeframes,
  lookaheadCandles,
  primaryTimeframe,
  requestedSymbol,
  signal,
  signalCandle,
  symbol
}: {
  brokerSymbol: string;
  futureCandles: Candle[];
  htfTimeframes: string[];
  lookaheadCandles: number;
  primaryTimeframe: string;
  requestedSymbol: string;
  signal: IctAdvisorSignal;
  signalCandle: Candle;
  symbol: string;
}): IctReplayResult => {
  const entryReference = entryReferenceFor(signal, signalCandle);
  const candlesToTarget = calculateCandlesToTarget(futureCandles, signal.side, signal.target);
  const candlesToInvalidation = calculateCandlesToInvalidation(futureCandles, signal.side, signal.invalidation);
  const { maxAdverseExcursion, maxFavorableExcursion } = calculateMfeMae(futureCandles, signal.side, entryReference);
  const risk = signal.invalidation !== undefined ? Math.abs(entryReference - signal.invalidation) : undefined;
  const rrAchieved = risk && risk > 0 && maxFavorableExcursion !== undefined ? round(maxFavorableExcursion / risk, 2) : undefined;
  const targetDistance = signal.target !== undefined ? Math.abs(signal.target - entryReference) : undefined;
  const partialTarget =
    targetDistance !== undefined &&
    targetDistance > 0 &&
    maxFavorableExcursion !== undefined &&
    maxFavorableExcursion >= targetDistance * 0.5;
  let outcome: IctReplayResult["outcome"];
  if (signal.decision === "no_trade") {
    outcome = "no_trade";
  } else if (futureCandles.length < lookaheadCandles) {
    outcome = "insufficient_future_candles";
  } else if (candlesToTarget !== undefined && (candlesToInvalidation === undefined || candlesToTarget < candlesToInvalidation)) {
    outcome = "target_first";
  } else if (candlesToInvalidation !== undefined && (candlesToTarget === undefined || candlesToInvalidation <= candlesToTarget)) {
    outcome = "invalidation_first";
  } else if (partialTarget) {
    outcome = "partial_target";
  } else {
    outcome = "stalled";
  }
  const tradePath: IctReplayTradePath = {
    signalTime: signalCandle.timestamp,
    entryReference,
    invalidation: signal.invalidation,
    target: signal.target,
    maxFavorableExcursion,
    maxAdverseExcursion,
    candlesToTarget,
    candlesToInvalidation,
    rrAchieved
  };
  const fvgStatus = evaluateFvgReplayStatus(signal, futureCandles);
  const baseResult: IctReplayResult = {
    strategyId: signal.strategyId,
    phase: signal.phase ?? "phase_1",
    symbol,
    requestedSymbol,
    brokerSymbol,
    primaryTimeframe,
    side: signal.side,
    setup: signal.setup,
    decision: signal.decision,
    confidence: signal.confidence,
    htfAligned: Object.values(signal.bias.htf ?? {}).length
      ? Object.values(signal.bias.htf).every((bias) => bias === signal.bias.composite || bias === "neutral")
      : undefined,
    dealingRangeLocation: signal.dealingRange?.currentLocation,
    liquidityTargetType: signal.drawOnLiquidity?.type,
    orderBlockVariant: signal.orderBlock?.variant,
    approvedProfileStatus: signal.approvedProfileDecision?.status,
    approvedProfileId: signal.approvedProfileDecision?.profileId,
    approvedProfileScore: signal.approvedProfileDecision?.approvalScore,
    approvedProfileReasons: signal.approvedProfileDecision
      ? [...signal.approvedProfileDecision.approvedReasons, ...signal.approvedProfileDecision.watchlistReasons, ...signal.approvedProfileDecision.rejectionReasons].slice(0, 6)
      : undefined,
    smtDivergenceType: signal.smt?.divergenceType,
    smtConfirmsCandidate: signal.smt?.confirmsCandidate,
    smtRejectsCandidate: signal.smt?.rejectsCandidate,
    relativeStrengthLeader: signal.smt?.relativeStrengthLeader,
    relativeWeaknessLeader: signal.smt?.relativeWeaknessLeader,
    smtConfidenceAdjustment: signal.smt?.confidenceAdjustment,
    smtReason: signal.smt?.reason,
    newsRiskLevel: signal.newsSessionRisk?.newsRiskLevel,
    sessionRiskState: signal.newsSessionRisk?.sessionRiskState,
    riskGovernorAction: signal.newsSessionRisk?.riskGovernorAction,
    riskGovernorConfidenceAdjustment: signal.newsSessionRisk?.riskGovernorConfidenceAdjustment,
    blockingEventsCount: signal.newsSessionRisk?.blockingEventsCount,
    cautionEventsCount: signal.newsSessionRisk?.cautionEventsCount,
    sessionName: signal.newsSessionRisk?.session.sessionName,
  newsSessionRiskNotes: signal.newsSessionRisk?.newsSessionRiskNotes,
    sessionNarrativeProfile: signal.sessionNarrativeProfile,
    sessionDirectionalRead: signal.sessionDirectionalRead,
    sessionNarrativeConfidence: signal.sessionNarrativeConfidence,
    sessionMitigationDetected: signal.sessionMitigationContext?.detected,
    fvgTargetDetected: signal.fvgTargetDetected,
    fvgTargetDirection: signal.fvgTargetDirection,
    dataDepthStatus: signal.dataDepthStatus,
    availableLookbackDays: signal.availableLookbackDays,
    requestedLookbackDays: signal.requestedLookbackDays,
    sessionNarrativeReasons: signal.sessionTopReasons,
    rrEstimate: signal.rrEstimate,
    outcome,
    fvgStatus,
    tradePath,
    noTradeReasons: signal.noTradeReasons,
    riskNotes: Array.from(new Set([...signal.riskNotes, "ICT replay validation is research-only; authority remains none."])),
    summary: `${signal.strategyId} replay marked ${outcome.replace(/_/g, " ")} over ${futureCandles.length}/${lookaheadCandles} future candles.`,
    researchOnly: true,
    provenance: {
      methodology: "ICT",
      sourceSet: "ICT Mentorship Core Content",
      replay: true,
      researchOnly: true,
      generatedAt: new Date().toISOString()
    }
  };
  const replayDecision = selectReplayApprovalDecision(evaluateApprovedSetupProfiles(baseResult).map(sanitizeApprovedSetupDecision));
  return replayDecision
    ? {
        ...baseResult,
        approvedProfileStatus: replayDecision.status,
        approvedProfileId: replayDecision.profileId,
        approvedProfileScore: replayDecision.approvalScore,
        approvedProfileReasons: [...replayDecision.approvedReasons, ...replayDecision.watchlistReasons, ...replayDecision.rejectionReasons].slice(0, 6)
      }
    : baseResult;
};

export const countNoTradeReasons = (results: IctReplayResult[]) => {
  const counts = new Map<string, number>();
  for (const reason of results.flatMap((result) => result.noTradeReasons)) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
};

const average = (values: number[]) => (values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 2) : 0);

export const groupReplayByStrategy = (results: IctReplayResult[]): IctReplaySummary["byStrategyId"] =>
  Object.fromEntries(
    [...new Set(results.map((result) => result.strategyId))].map((strategyId) => {
      const strategyResults = results.filter((result) => result.strategyId === strategyId);
      const targetFirstCount = strategyResults.filter((result) => result.outcome === "target_first").length;
      const invalidationFirstCount = strategyResults.filter((result) => result.outcome === "invalidation_first").length;
      return [
        strategyId,
        {
          totalSignals: strategyResults.length,
          targetFirstCount,
          invalidationFirstCount,
          targetFirstRate: strategyResults.length ? round(targetFirstCount / strategyResults.length, 4) : 0,
          averageRrAchieved: average(strategyResults.map((result) => result.tradePath.rrAchieved).filter((value): value is number => typeof value === "number"))
        }
      ];
    })
  );

export const summarizeReplayResults = (input: IctReplayInput, results: IctReplayResult[], totalWindows = 0): IctReplaySummary => {
  const totalSignals = results.length;
  const targetFirstCount = results.filter((result) => result.outcome === "target_first").length;
  const invalidationFirstCount = results.filter((result) => result.outcome === "invalidation_first").length;
  return {
    symbol: input.symbol,
    primaryTimeframe: input.primaryTimeframe,
    totalWindows,
    totalSignals,
    totalNoTrades: results.filter((result) => result.outcome === "no_trade").length,
    targetFirstCount,
    invalidationFirstCount,
    partialTargetCount: results.filter((result) => result.outcome === "partial_target").length,
    stalledCount: results.filter((result) => result.outcome === "stalled").length,
    insufficientFutureCandlesCount: results.filter((result) => result.outcome === "insufficient_future_candles").length,
    targetFirstRate: totalSignals ? round(targetFirstCount / totalSignals, 4) : 0,
    invalidationFirstRate: totalSignals ? round(invalidationFirstCount / totalSignals, 4) : 0,
    averageRrAchieved: average(results.map((result) => result.tradePath.rrAchieved).filter((value): value is number => typeof value === "number")),
    mostCommonNoTradeReasons: countNoTradeReasons(results).slice(0, 8),
    byStrategyId: groupReplayByStrategy(results),
    researchOnly: true
  };
};

export const buildIctReplayJournalEvent = (result: IctReplayResult, htfTimeframes: string[]): IctReplayJournalEvent => ({
  eventType: "ict_replay_result",
  journalEventId: createId("ict_replay_journal"),
  strategyId: result.strategyId,
  phase: result.phase,
  symbol: result.symbol,
  requestedSymbol: result.requestedSymbol,
  brokerSymbol: result.brokerSymbol,
  primaryTimeframe: result.primaryTimeframe,
  htfTimeframes,
  signalTime: result.tradePath.signalTime,
  side: result.side,
  setup: result.setup,
  decision: result.decision,
  confidence: result.confidence,
  outcome: result.outcome,
  fvgStatus: result.fvgStatus,
  orderBlockVariant: result.orderBlockVariant,
  approvedProfileStatus: result.approvedProfileStatus,
  approvedProfileId: result.approvedProfileId,
  approvedProfileScore: result.approvedProfileScore,
  smtDivergenceType: result.smtDivergenceType,
  smtConfirmsCandidate: result.smtConfirmsCandidate,
  smtRejectsCandidate: result.smtRejectsCandidate,
  relativeStrengthLeader: result.relativeStrengthLeader,
  relativeWeaknessLeader: result.relativeWeaknessLeader,
  smtConfidenceAdjustment: result.smtConfidenceAdjustment,
  smtReason: result.smtReason,
  newsRiskLevel: result.newsRiskLevel,
  sessionRiskState: result.sessionRiskState,
  riskGovernorAction: result.riskGovernorAction,
  riskGovernorConfidenceAdjustment: result.riskGovernorConfidenceAdjustment,
  blockingEventsCount: result.blockingEventsCount,
  cautionEventsCount: result.cautionEventsCount,
  sessionName: result.sessionName,
  newsSessionRiskNotes: result.newsSessionRiskNotes,
  sessionNarrativeProfile: result.sessionNarrativeProfile,
  sessionDirectionalRead: result.sessionDirectionalRead,
  sessionMitigationDetected: result.sessionMitigationDetected,
  fvgTargetDetected: result.fvgTargetDetected,
  fvgTargetDirection: result.fvgTargetDirection,
  dataDepthStatus: result.dataDepthStatus,
  entryReference: result.tradePath.entryReference,
  invalidation: result.tradePath.invalidation,
  target: result.tradePath.target,
  maxFavorableExcursion: result.tradePath.maxFavorableExcursion,
  maxAdverseExcursion: result.tradePath.maxAdverseExcursion,
  candlesToTarget: result.tradePath.candlesToTarget,
  candlesToInvalidation: result.tradePath.candlesToInvalidation,
  rrAchieved: result.tradePath.rrAchieved,
  noTradeReasons: result.noTradeReasons,
  riskNotes: result.riskNotes,
  researchOnly: true
});

export const appendIctReplayJournalEvents = (events: IctReplayJournalEvent[]) => {
  const sanitized = events.map((event) => ({ ...event, researchOnly: true as const }));
  if (!isBrowser()) {
    return { ok: true, storage: "memory_unavailable" as const, events: sanitized };
  }
  const current = readIctReplayJournalEvents();
  const next = [...current, ...sanitized].slice(-MAX_REPLAY_JOURNAL_EVENTS);
  window.localStorage.setItem(REPLAY_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, events: sanitized, totalEvents: next.length };
};

export const readIctReplayJournalEvents = (): IctReplayJournalEvent[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(REPLAY_JOURNAL_STORAGE_KEY) ?? "[]") as IctReplayJournalEvent[];
    return Array.isArray(parsed) ? parsed.filter((event) => event.eventType === "ict_replay_result" && event.researchOnly === true) : [];
  } catch {
    return [];
  }
};

const compactSourceSummary = (input: IctReplayInput, candleCount: number): CanonicalCandleSourceSummary => ({
  sourceId: `ict_replay:${input.requestedSymbol}:${input.brokerSymbol}:${input.primaryTimeframe}`,
  provider: "mt5_read_only",
  symbol: input.requestedSymbol,
  normalizedSymbol: input.requestedSymbol,
  timeframe: input.primaryTimeframe,
  candleCount,
  storageBackend: "memory",
  dataQuality: candleCount >= input.replayWindowSize ? "sufficient" : "insufficient",
  eligibility: { chartDisplay: false, quickAnalysis: true, researchCycle: true, walkForward: false },
  eligibilityReasons: [],
  warnings: ["ICT replay validation uses raw candles internally and returns compact research-only results."],
  provenance: {
    sourceLabel: `${input.brokerSymbol} replay validation`,
    providerSymbol: input.brokerSymbol,
    generatedAt: new Date().toISOString()
  },
  authority: { executionAuthority: "none", brokerAuthority: "none", readinessOverrideAuthority: "none" },
  fingerprint: `ict_replay|${input.requestedSymbol}|${input.brokerSymbol}|${input.primaryTimeframe}|${candleCount}`,
  roles: ["available"]
});

export const runIctReplayValidation = (input: IctReplayInput): IctReplayValidationReport => {
  const candles = coerceCandles(input.candles, input);
  const htfCandles = coerceHtfCandles(input);
  const indexComparisonCandles = coerceIndexComparisonCandles(input);
  const htfTimeframes = input.htfTimeframes.length ? input.htfTimeframes : Object.keys(htfCandles);
  const windows = sliceReplayWindows(input);
  const sourceSummary = compactSourceSummary(input, candles.length);
  const sessionNarrative = candles.length
    ? buildIctSessionNarrative(candles, {
        requestedSymbol: input.requestedSymbol,
        brokerSymbol: input.brokerSymbol,
        primaryTimeframe: input.primaryTimeframe,
        requestedLookbackDays: input.requestedLookbackDays ?? 90,
        availableLookbackDays: input.availableLookbackDays,
        depthSource: "current_window"
      })
    : undefined;
  const results = windows.flatMap(({ futureCandles, historicalCandles, signalCandle }) => {
    const comparisonWindow = sliceIndexComparisonForSignal(indexComparisonCandles, signalCandle.timestamp, input.replayWindowSize);
    const signals = buildIctAdvisorSignals({
      brokerSymbol: input.brokerSymbol,
      candles: historicalCandles,
      htfCandles,
      indexComparisonCandles: comparisonWindow,
      newsSessionRiskContext: input.newsSessionRiskContext ?? { syntheticNoRisk: true },
      primaryTimeframe: input.primaryTimeframe,
      requestedSymbol: input.requestedSymbol,
      sessionNarrative,
      sourceSummary,
      symbol: input.symbol
    });
    return signals.map((signal) =>
      evaluateSignalOutcome({
        brokerSymbol: input.brokerSymbol,
        futureCandles,
        htfTimeframes,
        lookaheadCandles: input.lookaheadCandles,
        primaryTimeframe: input.primaryTimeframe,
        requestedSymbol: input.requestedSymbol,
        signal,
        signalCandle,
        symbol: input.symbol
      })
    );
  });
  const journalEvents = results.map((result) => buildIctReplayJournalEvent(result, htfTimeframes));
  if (input.appendJournal !== false) {
    appendIctReplayJournalEvents(journalEvents);
  }
  return sanitizeReplayOutput({
    replayId: createId("ict_replay_validation"),
    generatedAt: new Date().toISOString(),
    input: {
      symbol: input.symbol,
      requestedSymbol: input.requestedSymbol,
      brokerSymbol: input.brokerSymbol,
      primaryTimeframe: input.primaryTimeframe,
      htfTimeframes,
      replayWindowSize: input.replayWindowSize,
      lookaheadCandles: input.lookaheadCandles,
      maxReplayWindows: input.maxReplayWindows,
      requestedLookbackDays: input.requestedLookbackDays,
      availableLookbackDays: input.availableLookbackDays,
      dataDepthStatus: input.dataDepthStatus,
      appendJournal: input.appendJournal,
      researchOnly: true,
      candleCount: candles.length,
      indexComparisonSourceCount: Object.values(indexComparisonCandles).filter((values) => values?.length).length,
      newsSessionRiskContextStatus: input.newsSessionRiskContext
        ? input.newsSessionRiskContext.syntheticNoRisk
          ? "synthetic_no_risk"
          : "provided"
        : "synthetic_no_risk"
    },
    summary: summarizeReplayResults(input, results, windows.length),
    results,
    journalEvents,
    safetyLocks: {
      rawCandlesIncluded: false,
      rawSnapshotsIncluded: false,
      secretsIncluded: false,
      accountDataIncluded: false,
      orderDataIncluded: false,
      positionDataIncluded: false
    },
    authority: {
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    },
    researchOnly: true
  });
};

export const sanitizeReplayOutput = (report: IctReplayValidationReport): IctReplayValidationReport => {
  const sanitized = JSON.parse(JSON.stringify(report)) as IctReplayValidationReport;
  sanitized.safetyLocks = {
    rawCandlesIncluded: false,
    rawSnapshotsIncluded: false,
    secretsIncluded: false,
    accountDataIncluded: false,
    orderDataIncluded: false,
    positionDataIncluded: false
  };
  sanitized.authority = {
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  };
  sanitized.researchOnly = true;
  return sanitized;
};

const resolveHtfSourcesForRuntime = async (snapshot: ResearchRuntimeSnapshot) => {
  const sourceSummaries = await listCanonicalCandleSourceSummaries();
  const htfSummaries = snapshot.mt5ReadOnly.higherTimeframeSources ?? [];
  const loaded: Record<string, Candle[]> = {};
  for (const htf of htfSummaries) {
    const matching = sourceSummaries.find(
      (source) =>
        source.provider === "mt5_read_only" &&
        source.symbol === htf.requestedSymbol &&
        source.timeframe === htf.timeframe &&
        (source.provenance.providerSymbol ?? htf.brokerSymbol) === htf.brokerSymbol
    );
    if (!matching) continue;
    const source = await loadCanonicalCandleSource(matching.sourceId);
    if (source?.candles?.length) loaded[source.timeframe] = source.candles;
  }
  return loaded;
};

export async function buildIctReplayValidationFromRuntime(
  snapshot: ResearchRuntimeSnapshot,
  options: Partial<Pick<IctReplayInput, "lookaheadCandles" | "replayWindowSize">> & { maxCandles?: number } = {}
) {
  const activeSource = await loadCanonicalCandleSource(snapshot.marketData.activeResearchSource.sourceId);
  const rawCandles = activeSource?.candles ?? [];
  const candles = options.maxCandles ? rawCandles.slice(-Math.max(options.maxCandles, 1)) : rawCandles;
  const htfCandles = await resolveHtfSourcesForRuntime(snapshot);
  const sourceSummaries = await listCanonicalCandleSourceSummaries();
  const indexComparisonCandles: IctIndexComparisonCandles = {};
  for (const instrument of ICT_INDEX_SMT_INSTRUMENTS) {
    const activeBrokerSymbol = activeSource?.provenance.providerSymbol ?? snapshot.marketData.activeResearchSource.provenance.providerSymbol;
    if (
      activeSource?.candles?.length &&
      (activeBrokerSymbol === instrument.brokerSymbol || activeSource.symbol === instrument.requestedSymbol) &&
      activeSource.timeframe === (snapshot.marketData.activeResearchSource.timeframe ?? snapshot.marketData.timeframe)
    ) {
      indexComparisonCandles[instrument.brokerSymbol] = activeSource.candles;
      continue;
    }
    const matching = sourceSummaries.find(
      (source) =>
        source.provider === "mt5_read_only" &&
        source.timeframe === (snapshot.marketData.activeResearchSource.timeframe ?? snapshot.marketData.timeframe) &&
        (source.symbol === instrument.requestedSymbol || source.provenance.providerSymbol === instrument.brokerSymbol)
    );
    if (!matching) continue;
    const source = await loadCanonicalCandleSource(matching.sourceId);
    if (source?.candles?.length) indexComparisonCandles[instrument.brokerSymbol] = source.candles;
  }
  return runIctReplayValidation({
    symbol: snapshot.marketData.symbol,
    requestedSymbol: snapshot.marketData.symbol,
    brokerSymbol: snapshot.mt5ReadOnly.brokerSymbol ?? snapshot.marketData.activeResearchSource.provenance.providerSymbol ?? snapshot.marketData.contract ?? snapshot.marketData.symbol,
    primaryTimeframe: snapshot.marketData.activeResearchSource.timeframe ?? snapshot.marketData.timeframe,
    htfTimeframes: Object.keys(htfCandles),
    candles,
    htfCandles,
    indexComparisonCandles,
    replayWindowSize: options.replayWindowSize ?? 80,
    lookaheadCandles: options.lookaheadCandles ?? 12,
    researchOnly: true
  });
}

export const assertIctReplayOutputIsCompact = (report: IctReplayValidationReport) => {
  const { safetyLocks: _safetyLocks, ...payloadWithoutSafetyLockLabels } = report;
  const serialized = JSON.stringify(payloadWithoutSafetyLockLabels);
  return {
    ok:
      report.researchOnly === true &&
      report.authority.executionAuthority === "none" &&
      report.authority.brokerAuthority === "none" &&
      report.authority.readinessOverrideAuthority === "none" &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
