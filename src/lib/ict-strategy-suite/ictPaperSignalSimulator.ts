import type { IctResearchSignal } from "./ictSignalContractTypes";
import type {
  IctPaperSignal,
  IctPaperSignalCompactPrice,
  IctPaperSignalEligibility,
  IctPaperSignalJournalEvent,
  IctPaperSignalJournalEventType,
  IctPaperSignalOptions
} from "./ictPaperSignalSimulatorTypes";

export const ICT_PAPER_SIGNAL_JOURNAL_STORAGE_KEY = "gotrader.ict-paper-signal.journal.v1";
const MAX_ICT_PAPER_SIGNAL_JOURNAL_EVENTS = 150;

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safety = {
  realOrderPlaced: false as const,
  brokerMutation: false as const,
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

let memoryJournal: IctPaperSignalJournalEvent[] = [];

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const now = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));
const unique = (values: Array<string | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));

const entryPriceFor = (signal: IctResearchSignal, options: IctPaperSignalOptions = {}) => {
  if (finite(options.entryPrice)) {
    return {
      type: options.entryType ?? "manual_reference" as const,
      price: round(options.entryPrice)
    };
  }
  if (finite(signal.entryZone?.midpoint)) {
    return {
      type: "entry_zone_midpoint" as const,
      price: round(signal.entryZone.midpoint)
    };
  }
  if (finite(signal.entryZone?.low) && finite(signal.entryZone?.high)) {
    return {
      type: "entry_zone_midpoint" as const,
      price: round((signal.entryZone.low + signal.entryZone.high) / 2)
    };
  }
  return undefined;
};

const isDirectional = (side: IctResearchSignal["side"]): side is "long" | "short" =>
  side === "long" || side === "short";

const directionIsLogical = (side: "long" | "short", entry: number, target: number, invalidation: number) =>
  side === "long" ? target > entry && invalidation < entry : target < entry && invalidation > entry;

export const isResearchSignalEligibleForPaperSim = (
  signal: IctResearchSignal,
  options: IctPaperSignalOptions = {}
): IctPaperSignalEligibility => {
  const entry = entryPriceFor(signal, options);
  const reasons = unique([
    signal.status !== "approved_research_signal" && !(options.allowWatchlist && signal.status === "watchlist_signal")
      ? "Only approved research signals are eligible by default."
      : undefined,
    signal.status === "watchlist_signal" && !options.allowWatchlist ? "Watchlist signals require explicit paper-sim opt-in." : undefined,
    signal.status === "rejected_signal" ? "Rejected research signals cannot be paper simulated." : undefined,
    signal.status === "no_signal" ? "No active research signal is available." : undefined,
    !isDirectional(signal.side) ? "Signal side must be long or short." : undefined,
    !entry ? "Missing simulated entry reference." : undefined,
    !finite(signal.target) ? "Missing target." : undefined,
    !finite(signal.invalidation) ? "Missing invalidation." : undefined,
    !finite(signal.rrEstimate) ? "Missing RR estimate." : undefined,
    signal.executionAllowed !== false ? "Signal executionAllowed must remain false." : undefined,
    signal.authority.executionAuthority !== "none" ? "Signal execution authority must be none." : undefined,
    signal.authority.brokerAuthority !== "none" ? "Signal broker authority must be none." : undefined,
    signal.authority.readinessOverrideAuthority !== "none" ? "Signal readiness override authority must be none." : undefined,
    entry && finite(signal.target) && finite(signal.invalidation) && isDirectional(signal.side) &&
      !directionIsLogical(signal.side, entry.price, signal.target, signal.invalidation)
      ? "Target and invalidation are not logical for the signal side."
      : undefined
  ]);
  const warnings = unique([
    signal.status === "watchlist_signal" && options.allowWatchlist
      ? "Watchlist paper simulations are explicit research-only experiments."
      : undefined,
    signal.warnings.find((warning) => /CFD\/proxy|Execution is disabled|research-only/i.test(warning)),
    "Paper simulation creates no broker order and cannot promote readiness."
  ]);
  return {
    eligible: reasons.length === 0,
    status: reasons.length === 0 ? "eligible_for_paper_sim" : "not_eligible",
    reasons,
    warnings
  };
};

export const sanitizePaperSignal = (paperSignal: IctPaperSignal): IctPaperSignal => ({
  ...JSON.parse(JSON.stringify(paperSignal)),
  researchOnly: true,
  paperOnly: true,
  authority,
  safety
});

export const createPaperSignalFromResearchSignal = (
  signal: IctResearchSignal,
  options: IctPaperSignalOptions = {}
): IctPaperSignal => {
  const generatedAt = options.generatedAt ?? now();
  const eligibility = isResearchSignalEligibleForPaperSim(signal, options);
  const entry = entryPriceFor(signal, options) ?? {
    type: options.entryType ?? "manual_reference" as const,
    price: 0
  };
  const side = signal.side === "short" ? "short" : "long";
  const target = finite(signal.target) ? round(signal.target) : entry.price;
  const invalidation = finite(signal.invalidation) ? round(signal.invalidation) : entry.price;
  const rrEstimate = finite(signal.rrEstimate) ? round(signal.rrEstimate, 2) : 0;
  const riskPerIdeaPct = finite(options.riskPerIdeaPct)
    ? round(Math.max(0, options.riskPerIdeaPct), 2)
    : finite(signal.monteCarlo?.recommendedMaxRiskPerTradePct)
      ? round(Math.max(0, signal.monteCarlo.recommendedMaxRiskPerTradePct), 2)
      : 0.1;

  return sanitizePaperSignal({
    paperSignalId: createId("ict_paper_signal"),
    sourceSignalId: signal.signalId,
    generatedAt,
    researchOnly: true,
    paperOnly: true,
    status: eligibility.eligible ? "paper_open" : "not_eligible",
    outcome: eligibility.eligible ? "open" : "not_started",
    requestedSymbol: signal.requestedSymbol,
    brokerSymbol: signal.brokerSymbol,
    primaryTimeframe: signal.primaryTimeframe,
    side,
    simulatedEntry: entry,
    invalidation,
    target,
    rrEstimate,
    confidence: signal.confidence,
    simulatedRisk: {
      riskPerIdeaPct,
      maxLossR: 1,
      targetR: rrEstimate
    },
    lifecycle: eligibility.eligible
      ? [
          {
            at: generatedAt,
            event: "created",
            note: "Paper simulation created from approved research signal. No broker order created."
          },
          {
            at: generatedAt,
            event: "entry_simulated",
            price: entry.price,
            note: `${entry.type.replace(/_/g, " ")} used as simulated entry.`
          }
        ]
      : [
          {
            at: generatedAt,
            event: "created",
            note: `Paper simulation not eligible: ${eligibility.reasons.join("; ")}`
          }
        ],
    notes: [...eligibility.warnings, ...eligibility.reasons],
    authority,
    safety
  });
};

export const updatePaperSignalWithPrice = (
  paperSignal: IctPaperSignal,
  price: number,
  timestamp = now()
): IctPaperSignal => {
  const current = sanitizePaperSignal(paperSignal);
  if (current.status !== "paper_open" || !finite(price)) return current;
  const roundedPrice = round(price);
  const targetHit = current.side === "long" ? roundedPrice >= current.target : roundedPrice <= current.target;
  const invalidationHit = current.side === "long" ? roundedPrice <= current.invalidation : roundedPrice >= current.invalidation;
  if (targetHit) {
    return sanitizePaperSignal({
      ...current,
      status: "paper_target_hit",
      outcome: "target_hit",
      lifecycle: [
        ...current.lifecycle,
        {
          at: timestamp,
          event: "target_hit",
          price: roundedPrice,
          note: "Simulated target reached. No broker order was placed."
        }
      ]
    });
  }
  if (invalidationHit) {
    return sanitizePaperSignal({
      ...current,
      status: "paper_invalidation_hit",
      outcome: "invalidation_hit",
      lifecycle: [
        ...current.lifecycle,
        {
          at: timestamp,
          event: "invalidation_hit",
          price: roundedPrice,
          note: "Simulated invalidation reached. No broker state was mutated."
        }
      ]
    });
  }
  return current;
};

export const simulatePaperSignalOutcome = (
  paperSignal: IctPaperSignal,
  futureCompactPrices: IctPaperSignalCompactPrice[] = []
): IctPaperSignal => {
  let current = sanitizePaperSignal(paperSignal);
  for (const point of futureCompactPrices) {
    current = updatePaperSignalWithPrice(current, point.price, point.at);
    if (current.status !== "paper_open") return current;
  }
  if (current.status === "paper_open" && futureCompactPrices.length) {
    const last = futureCompactPrices[futureCompactPrices.length - 1];
    return sanitizePaperSignal({
      ...current,
      status: "paper_expired",
      outcome: "expired",
      lifecycle: [
        ...current.lifecycle,
        {
          at: last.at,
          event: "expired",
          price: round(last.price),
          note: "Future compact price path ended without target or invalidation."
        }
      ]
    });
  }
  return current;
};

export const cancelPaperSignal = (
  paperSignal: IctPaperSignal,
  reason = "Paper simulation cancelled by operator."
): IctPaperSignal => {
  const current = sanitizePaperSignal(paperSignal);
  if (current.status !== "paper_open" && current.status !== "eligible_for_paper_sim") return current;
  return sanitizePaperSignal({
    ...current,
    status: "paper_cancelled",
    outcome: "cancelled",
    lifecycle: [
      ...current.lifecycle,
      {
        at: now(),
        event: "cancelled",
        note: reason
      }
    ]
  });
};

export const buildIctPaperSignalJournalEvent = (
  paperSignal: IctPaperSignal,
  eventType: IctPaperSignalJournalEventType = "ict_paper_signal_updated"
): IctPaperSignalJournalEvent => ({
  eventType,
  journalEventId: createId("ict_paper_signal_journal"),
  paperSignalId: paperSignal.paperSignalId,
  sourceSignalId: paperSignal.sourceSignalId,
  generatedAt: paperSignal.generatedAt,
  status: paperSignal.status,
  outcome: paperSignal.outcome,
  requestedSymbol: paperSignal.requestedSymbol,
  brokerSymbol: paperSignal.brokerSymbol,
  side: paperSignal.side,
  simulatedEntryPrice: paperSignal.simulatedEntry.price,
  target: paperSignal.target,
  invalidation: paperSignal.invalidation,
  rrEstimate: paperSignal.rrEstimate,
  riskPerIdeaPct: paperSignal.simulatedRisk.riskPerIdeaPct,
  paperOnly: true,
  researchOnly: true,
  realOrderPlaced: false,
  brokerMutation: false,
  authority,
  safety
});

export const readIctPaperSignalJournalEvents = (): IctPaperSignalJournalEvent[] => {
  if (!isBrowser()) return memoryJournal;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ICT_PAPER_SIGNAL_JOURNAL_STORAGE_KEY) ?? "[]") as IctPaperSignalJournalEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((event) => /^ict_paper_signal_/.test(event?.eventType) && event.paperOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const appendIctPaperSignalJournalEvent = (event: IctPaperSignalJournalEvent) => {
  const sanitized = { ...event, paperOnly: true as const, researchOnly: true as const, realOrderPlaced: false as const, brokerMutation: false as const, authority, safety };
  if (!isBrowser()) {
    memoryJournal = [...memoryJournal, sanitized].slice(-MAX_ICT_PAPER_SIGNAL_JOURNAL_EVENTS);
    return { ok: true, storage: "memory" as const, event: sanitized, totalEvents: memoryJournal.length };
  }
  const next = [...readIctPaperSignalJournalEvents(), sanitized].slice(-MAX_ICT_PAPER_SIGNAL_JOURNAL_EVENTS);
  window.localStorage.setItem(ICT_PAPER_SIGNAL_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
};

export const assertIctPaperSignalIsSafe = (
  paperSignal: IctPaperSignal,
  journalEvent?: IctPaperSignalJournalEvent
) => {
  const serialized = JSON.stringify({ paperSignal, journalEvent });
  return {
    ok:
      paperSignal.researchOnly === true &&
      paperSignal.paperOnly === true &&
      paperSignal.authority.executionAuthority === "none" &&
      paperSignal.authority.brokerAuthority === "none" &&
      paperSignal.authority.readinessOverrideAuthority === "none" &&
      paperSignal.safety.realOrderPlaced === false &&
      paperSignal.safety.brokerMutation === false &&
      paperSignal.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
