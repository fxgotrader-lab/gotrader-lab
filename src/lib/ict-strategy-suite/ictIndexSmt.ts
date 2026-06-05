import type { Candle } from "../types";
import type { IctApprovedSetupDecision } from "./ictApprovedSetupProfileTypes";
import type { IctSide } from "./ictAdvisorTypes";
import { normalizeCandles } from "./ictStrategySuiteHelpers";
import type {
  IctIndexInstrumentContext,
  IctIndexInstrumentDefinition,
  IctIndexSmtEvaluationInput,
  IctIndexSmtJournalEvent,
  IctRelativeStrengthState,
  IctSmtDivergenceType,
  IctSmtSignal
} from "./ictIndexSmtTypes";

export const ICT_INDEX_SMT_JOURNAL_STORAGE_KEY = "gotrader.ict-index-smt-summary.journal.v1";
const MAX_ICT_INDEX_SMT_JOURNAL_EVENTS = 300;

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

export const ICT_INDEX_SMT_INSTRUMENTS: IctIndexInstrumentDefinition[] = [
  {
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    displayLabel: "USTECH / NQ / MNQ",
    role: "tech_leader"
  },
  {
    requestedSymbol: "ES",
    brokerSymbol: "US500",
    displayLabel: "US500 / ES",
    role: "broad_market"
  },
  {
    requestedSymbol: "YM",
    brokerSymbol: "US30",
    displayLabel: "US30 / YM",
    role: "industrial_leader"
  }
];

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const canonical = (value?: string) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const highOf = (candles: Candle[]) => Math.max(...candles.map((candle) => candle.high).filter(finite));
const lowOf = (candles: Candle[]) => Math.min(...candles.map((candle) => candle.low).filter(finite));

const displacementFor = (first?: Candle, last?: Candle): "bullish" | "bearish" | undefined => {
  if (!first || !last) return undefined;
  const range = Math.max(Math.abs(highOf([first, last]) - lowOf([first, last])), 0.01);
  const change = last.close - first.open;
  if (change > range * 0.15) return "bullish";
  if (change < -range * 0.15) return "bearish";
  return undefined;
};

export const buildIndexInstrumentContext = ({
  candles = [],
  definition,
  htfTimeframes = [],
  lookbackCandles = 24,
  primaryTimeframe
}: {
  candles?: Candle[];
  definition: IctIndexInstrumentDefinition;
  htfTimeframes?: string[];
  lookbackCandles?: number;
  primaryTimeframe: string;
}): IctIndexInstrumentContext => {
  const normalized = normalizeCandles(candles).slice(-Math.max(8, Math.floor(lookbackCandles)));
  if (!candles?.length) {
    return {
      requestedSymbol: definition.requestedSymbol,
      brokerSymbol: definition.brokerSymbol,
      displayLabel: definition.displayLabel,
      role: definition.role,
      primaryTimeframe,
      htfTimeframes,
      sweptBuySide: false,
      sweptSellSide: false,
      dataStatus: "missing"
    };
  }
  if (normalized.length < 6) {
    return {
      requestedSymbol: definition.requestedSymbol,
      brokerSymbol: definition.brokerSymbol,
      displayLabel: definition.displayLabel,
      role: definition.role,
      primaryTimeframe,
      htfTimeframes,
      latestClose: normalized.at(-1)?.close,
      sweptBuySide: false,
      sweptSellSide: false,
      dataStatus: "failed"
    };
  }
  const splitIndex = Math.max(2, Math.floor(normalized.length / 2));
  const previous = normalized.slice(0, splitIndex);
  const recent = normalized.slice(splitIndex);
  const previousHigh = highOf(previous);
  const previousLow = lowOf(previous);
  const recentHigh = highOf(recent);
  const recentLow = lowOf(recent);
  const first = normalized[0];
  const last = normalized.at(-1);
  const relativeChangePct =
    first && last && first.open !== 0
      ? round(((last.close - first.open) / Math.max(Math.abs(first.open), 0.01)) * 100, 4)
      : undefined;
  return {
    requestedSymbol: definition.requestedSymbol,
    brokerSymbol: definition.brokerSymbol,
    displayLabel: definition.displayLabel,
    role: definition.role,
    primaryTimeframe,
    htfTimeframes,
    latestClose: last?.close,
    recentHigh,
    recentLow,
    previousHigh,
    previousLow,
    sweptBuySide: finite(recentHigh) && finite(previousHigh) ? recentHigh > previousHigh : false,
    sweptSellSide: finite(recentLow) && finite(previousLow) ? recentLow < previousLow : false,
    displacementDirection: displacementFor(first, last),
    relativeChangePct,
    dataStatus: "available"
  };
};

export const detectIndexLiquiditySweeps = (instruments: IctIndexInstrumentContext[]) => ({
  buySideSweepers: instruments.filter((instrument) => instrument.dataStatus === "available" && instrument.sweptBuySide).map((instrument) => instrument.brokerSymbol),
  buySideNonConfirmers: instruments.filter((instrument) => instrument.dataStatus === "available" && !instrument.sweptBuySide).map((instrument) => instrument.brokerSymbol),
  sellSideSweepers: instruments.filter((instrument) => instrument.dataStatus === "available" && instrument.sweptSellSide).map((instrument) => instrument.brokerSymbol),
  sellSideNonConfirmers: instruments.filter((instrument) => instrument.dataStatus === "available" && !instrument.sweptSellSide).map((instrument) => instrument.brokerSymbol)
});

export const compareRelativeStrength = (instruments: IctIndexInstrumentContext[]) => {
  const available = instruments.filter((instrument) => instrument.dataStatus === "available" && finite(instrument.relativeChangePct));
  if (available.length < 2) {
    return {
      state: "insufficient_data" as IctRelativeStrengthState,
      leader: undefined,
      weakness: undefined,
      mixed: false
    };
  }
  const sorted = available.slice().sort((left, right) => (right.relativeChangePct ?? 0) - (left.relativeChangePct ?? 0));
  const positives = available.filter((instrument) => (instrument.relativeChangePct ?? 0) > 0).length;
  const negatives = available.filter((instrument) => (instrument.relativeChangePct ?? 0) < 0).length;
  return {
    state: positives && negatives ? ("mixed" as const) : ("neutral" as const),
    leader: sorted[0]?.brokerSymbol,
    weakness: sorted.at(-1)?.brokerSymbol,
    mixed: Boolean(positives && negatives)
  };
};

export const detectBullishSmt = (instruments: IctIndexInstrumentContext[]) => {
  const sweeps = detectIndexLiquiditySweeps(instruments);
  return {
    detected: sweeps.sellSideSweepers.length > 0 && sweeps.sellSideNonConfirmers.length > 0,
    sweepers: sweeps.sellSideSweepers,
    nonConfirmers: sweeps.sellSideNonConfirmers
  };
};

export const detectBearishSmt = (instruments: IctIndexInstrumentContext[]) => {
  const sweeps = detectIndexLiquiditySweeps(instruments);
  return {
    detected: sweeps.buySideSweepers.length > 0 && sweeps.buySideNonConfirmers.length > 0,
    sweepers: sweeps.buySideSweepers,
    nonConfirmers: sweeps.buySideNonConfirmers
  };
};

const buildSignal = ({
  candidateSide,
  confidenceAdjustment,
  confirmsCandidate,
  divergenceType,
  instruments,
  notes,
  primarySymbol,
  reason,
  rejectsCandidate,
  relativeStrengthLeader,
  relativeWeaknessLeader
}: {
  candidateSide?: IctSide;
  confidenceAdjustment: number;
  confirmsCandidate: boolean;
  divergenceType: IctSmtDivergenceType;
  instruments: IctIndexInstrumentContext[];
  notes: string[];
  primarySymbol: string;
  reason: string;
  rejectsCandidate: boolean;
  relativeStrengthLeader?: string;
  relativeWeaknessLeader?: string;
}): IctSmtSignal =>
  sanitizeSmtSignal({
    researchOnly: true,
    group: "us_index_futures",
    primarySymbol,
    comparedSymbols: instruments.map((instrument) => instrument.brokerSymbol),
    divergenceType,
    relativeStrengthLeader,
    relativeWeaknessLeader,
    confirmsCandidate: candidateSide === "flat" ? false : confirmsCandidate,
    rejectsCandidate: candidateSide === "flat" ? false : rejectsCandidate,
    confidenceAdjustment: candidateSide === "flat" ? 0 : round(confidenceAdjustment, 4),
    reason,
    notes,
    instruments,
    authority,
    safety,
    provenance: {
      methodology: "ICT",
      model: "index_futures_smt_relative_strength",
      sourceSet: "ICT Mentorship Core Content",
      researchOnly: true,
      generatedAt: new Date().toISOString()
    }
  });

const contextsFromInput = (input: IctIndexSmtEvaluationInput) => {
  if (input.instruments?.length) return input.instruments;
  return ICT_INDEX_SMT_INSTRUMENTS.map((definition) =>
    buildIndexInstrumentContext({
      candles: input.candlesByBrokerSymbol?.[definition.brokerSymbol] ?? [],
      definition,
      htfTimeframes: input.htfTimeframes ?? [],
      lookbackCandles: input.lookbackCandles,
      primaryTimeframe: input.primaryTimeframe
    })
  );
};

const coherentAlignmentFor = (candidateSide: IctSide | undefined, instruments: IctIndexInstrumentContext[]) => {
  const available = instruments.filter((instrument) => instrument.dataStatus === "available" && finite(instrument.relativeChangePct));
  if (!candidateSide || candidateSide === "flat" || available.length < 2) return undefined;
  const allPositive = available.every((instrument) => (instrument.relativeChangePct ?? 0) >= 0);
  const allNegative = available.every((instrument) => (instrument.relativeChangePct ?? 0) <= 0);
  if (candidateSide === "long" && allPositive) return "risk_on_confirms_long";
  if (candidateSide === "short" && allNegative) return "risk_off_confirms_short";
  return undefined;
};

export const evaluateIndexSmt = (input: IctIndexSmtEvaluationInput): IctSmtSignal => {
  const instruments = contextsFromInput(input);
  const available = instruments.filter((instrument) => instrument.dataStatus === "available");
  const relativeStrength = compareRelativeStrength(instruments);
  const notes = instruments.map((instrument) => {
    if (instrument.dataStatus !== "available") return `${instrument.brokerSymbol}: ${instrument.dataStatus}`;
    return `${instrument.brokerSymbol}: ${instrument.relativeChangePct ?? 0}% / buy sweep ${instrument.sweptBuySide ? "yes" : "no"} / sell sweep ${instrument.sweptSellSide ? "yes" : "no"}`;
  });
  if (available.length < 2) {
    return buildSignal({
      candidateSide: input.candidateSide,
      confidenceAdjustment: 0,
      confirmsCandidate: false,
      divergenceType: "insufficient_data",
      instruments,
      notes: ["At least two index futures contexts are required for SMT/relative strength confirmation.", ...notes],
      primarySymbol: input.primarySymbol,
      reason: "Insufficient index comparison data for USTECH/US500/US30 SMT confirmation.",
      rejectsCandidate: false,
      relativeStrengthLeader: relativeStrength.leader,
      relativeWeaknessLeader: relativeStrength.weakness
    });
  }

  const bullish = detectBullishSmt(instruments);
  const bearish = detectBearishSmt(instruments);
  const candidateSide = input.candidateSide;
  let divergenceType: IctSmtDivergenceType = "no_smt";
  let confirmsCandidate = false;
  let rejectsCandidate = false;
  let confidenceAdjustment = 0;
  let reason = "No actionable SMT divergence detected across USTECH/US500/US30.";

  if (bullish.detected && (!bearish.detected || candidateSide === "long")) {
    divergenceType = "bullish_smt";
    confirmsCandidate = candidateSide === "long";
    rejectsCandidate = candidateSide === "short";
    confidenceAdjustment = confirmsCandidate ? 0.05 : rejectsCandidate ? -0.1 : 0;
    reason = `Bullish SMT: ${bullish.sweepers.join(", ")} swept sell-side while ${bullish.nonConfirmers.join(", ")} did not confirm the low.`;
  } else if (bearish.detected) {
    divergenceType = "bearish_smt";
    confirmsCandidate = candidateSide === "short";
    rejectsCandidate = candidateSide === "long";
    confidenceAdjustment = confirmsCandidate ? 0.05 : rejectsCandidate ? -0.1 : 0;
    reason = `Bearish SMT: ${bearish.sweepers.join(", ")} swept buy-side while ${bearish.nonConfirmers.join(", ")} did not confirm the high.`;
  } else {
    const coherent = coherentAlignmentFor(candidateSide, instruments);
    if (coherent) {
      confirmsCandidate = true;
      confidenceAdjustment = 0.02;
      reason =
        coherent === "risk_on_confirms_long"
          ? "No SMT divergence, but indexes show coherent risk-on alignment for the long research candidate."
          : "No SMT divergence, but indexes show coherent risk-off alignment for the short research candidate.";
    } else if (relativeStrength.mixed && candidateSide && candidateSide !== "flat") {
      confidenceAdjustment = -0.03;
      reason = "No SMT divergence, but mixed index relative strength reduces confidence.";
    }
  }

  return buildSignal({
    candidateSide,
    confidenceAdjustment,
    confirmsCandidate,
    divergenceType,
    instruments,
    notes,
    primarySymbol: input.primarySymbol,
    reason,
    rejectsCandidate,
    relativeStrengthLeader: relativeStrength.leader,
    relativeWeaknessLeader: relativeStrength.weakness
  });
};

export const applySmtToApprovedDecision = <T extends IctApprovedSetupDecision>(
  decision: T,
  smt?: IctSmtSignal
): T => {
  if (!smt) return decision;
  const next = JSON.parse(JSON.stringify(decision)) as T;
  const approvedReasons = new Set(next.approvedReasons ?? []);
  const rejectionReasons = new Set(next.rejectionReasons ?? []);
  const watchlistReasons = new Set(next.watchlistReasons ?? []);

  if (smt.rejectsCandidate) {
    rejectionReasons.add(`SMT/relative strength rejects candidate: ${smt.reason}`);
    if (next.status !== "no_trade") next.status = "rejected_candidate";
  } else if (smt.confirmsCandidate) {
    approvedReasons.add(`SMT/relative strength confirms candidate: ${smt.reason}`);
  } else if (smt.divergenceType === "insufficient_data") {
    watchlistReasons.add("SMT/relative strength unavailable; candidate remains governed by deterministic ICT filters.");
  } else if (smt.confidenceAdjustment < 0) {
    watchlistReasons.add(`SMT/relative strength confidence drag: ${smt.reason}`);
  }

  const scoreAlreadyIncludesSmt = Boolean(next.smtDivergenceType);
  next.approvalScore = scoreAlreadyIncludesSmt
    ? next.approvalScore
    : smt.rejectsCandidate
      ? Math.max(0, Math.round(next.approvalScore + smt.confidenceAdjustment * 100))
      : smt.confirmsCandidate
        ? clamp(Math.round(next.approvalScore + smt.confidenceAdjustment * 100), 0, 100)
        : next.approvalScore;
  next.approvedReasons = Array.from(approvedReasons).slice(0, 8);
  next.rejectionReasons = Array.from(rejectionReasons).slice(0, 8);
  next.watchlistReasons = Array.from(watchlistReasons).slice(0, 8);
  return {
    ...next,
    smtDivergenceType: smt.divergenceType,
    smtConfirmsCandidate: smt.confirmsCandidate,
    smtRejectsCandidate: smt.rejectsCandidate,
    relativeStrengthLeader: smt.relativeStrengthLeader,
    relativeWeaknessLeader: smt.relativeWeaknessLeader,
    smtConfidenceAdjustment: smt.confidenceAdjustment,
    smtReason: smt.reason,
    authority,
    safety
  };
};

export const sanitizeSmtSignal = (signal: IctSmtSignal): IctSmtSignal => {
  const sanitized = JSON.parse(JSON.stringify(signal)) as IctSmtSignal;
  return {
    ...sanitized,
    researchOnly: true,
    confidenceAdjustment: round(clamp(sanitized.confidenceAdjustment, -0.2, 0.1), 4),
    instruments: (sanitized.instruments ?? []).map((instrument) => ({ ...instrument })),
    authority,
    safety,
    provenance: {
      ...sanitized.provenance,
      methodology: "ICT",
      model: "index_futures_smt_relative_strength",
      sourceSet: "ICT Mentorship Core Content",
      researchOnly: true
    }
  };
};

export const buildIctIndexSmtJournalEvent = (signal: IctSmtSignal): IctIndexSmtJournalEvent => ({
  eventType: "ict_index_smt_summary",
  journalEventId: createId("ict_index_smt_journal"),
  generatedAt: new Date().toISOString(),
  primarySymbol: signal.primarySymbol,
  comparedSymbols: signal.comparedSymbols,
  divergenceType: signal.divergenceType,
  relativeStrengthLeader: signal.relativeStrengthLeader,
  relativeWeaknessLeader: signal.relativeWeaknessLeader,
  confirmsCandidate: signal.confirmsCandidate,
  rejectsCandidate: signal.rejectsCandidate,
  confidenceAdjustment: signal.confidenceAdjustment,
  reason: signal.reason,
  researchOnly: true,
  authority,
  safety
});

export const readIctIndexSmtJournalEvents = (): IctIndexSmtJournalEvent[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ICT_INDEX_SMT_JOURNAL_STORAGE_KEY) ?? "[]") as IctIndexSmtJournalEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((event) => event.eventType === "ict_index_smt_summary" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const appendIctIndexSmtJournalEvents = (events: IctIndexSmtJournalEvent[]) => {
  const sanitized = events.map((event) => ({ ...event, researchOnly: true as const, authority, safety }));
  if (!isBrowser()) {
    return { ok: true, storage: "memory_unavailable" as const, events: sanitized };
  }
  const current = readIctIndexSmtJournalEvents();
  const next = [...current, ...sanitized].slice(-MAX_ICT_INDEX_SMT_JOURNAL_EVENTS);
  window.localStorage.setItem(ICT_INDEX_SMT_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, events: sanitized, totalEvents: next.length };
};

export const smtSymbolMatchesIndexGroup = (symbol?: string) => {
  const normalized = canonical(symbol);
  return ICT_INDEX_SMT_INSTRUMENTS.some((instrument) =>
    [instrument.requestedSymbol, instrument.brokerSymbol].map(canonical).includes(normalized)
  );
};
