import type { Candle } from "@/lib/types";
import type {
  IctTurtleSoupCandidate,
  IctTurtleSoupInput,
  IctTurtleSoupNewsEvent,
  IctTurtleSoupSessionId,
  IctTurtleSoupSessionWindow,
  IctTurtleSoupSide,
  IctTurtleSoupStatus,
  IctTurtleSoupSweep
} from "./ictTurtleSoupTypes";

const authorityNone = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safetyCompact = {
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

const TURTLE_SOUP_SESSIONS: Array<IctTurtleSoupSessionWindow & { startMinute: number; endMinute: number }> = [
  {
    id: "london_open",
    label: "London Open Turtle Soup",
    startLocal: "03:00",
    endLocal: "05:00",
    timingZone: "America/New_York",
    startMinute: 180,
    endMinute: 300
  },
  {
    id: "new_york_open",
    label: "New York Open Turtle Soup",
    startLocal: "09:30",
    endLocal: "11:00",
    timingZone: "America/New_York",
    startMinute: 570,
    endMinute: 660
  }
];

type InternalTurtleSoupSession = (typeof TURTLE_SOUP_SESSIONS)[number];

type NormalizedCandle = Candle & {
  index: number;
  epochMs: number;
  nyDayKey: string;
  nyMinute: number;
};

const nyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const normalizeCandles = (candles: Candle[]): NormalizedCandle[] =>
  candles
    .map((candle) => ({
      ...candle,
      epochMs: new Date(candle.timestamp).getTime()
    }))
    .filter((candle) =>
      Number.isFinite(candle.epochMs) &&
      [candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(value))
    )
    .sort((left, right) => left.epochMs - right.epochMs)
    .map((candle, index) => {
      const parts = Object.fromEntries(
        nyFormatter.formatToParts(new Date(candle.epochMs)).map((part) => [part.type, part.value])
      ) as Record<string, string>;
      const hour = Number(parts.hour === "24" ? "0" : parts.hour);
      const minute = Number(parts.minute ?? "0");
      return {
        ...candle,
        index,
        nyDayKey: `${parts.year}-${parts.month}-${parts.day}`,
        nyMinute: hour * 60 + minute
      };
    });

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

const averageRange = (candles: NormalizedCandle[]) =>
  candles.length
    ? candles.reduce((total, candle) => total + Math.max(0, candle.high - candle.low), 0) / candles.length
    : 0;

const compactSession = (session: InternalTurtleSoupSession): IctTurtleSoupSessionWindow => ({
  id: session.id,
  label: session.label,
  startLocal: session.startLocal,
  endLocal: session.endLocal,
  timingZone: session.timingZone
});

const resolveSession = (candle: NormalizedCandle) =>
  TURTLE_SOUP_SESSIONS.find((session) => candle.nyMinute >= session.startMinute && candle.nyMinute < session.endMinute);

const sessionCandlesFor = (
  candles: NormalizedCandle[],
  sessionId: IctTurtleSoupSessionId,
  nyDayKey: string
) => {
  const session = TURTLE_SOUP_SESSIONS.find((item) => item.id === sessionId);
  if (!session) return [];
  return candles.filter((candle) =>
    candle.nyDayKey === nyDayKey &&
    candle.nyMinute >= session.startMinute &&
    candle.nyMinute < session.endMinute
  );
};

const highImpactNewsWithinMinutes = (
  latestTimestamp: string | undefined,
  newsEvents: IctTurtleSoupNewsEvent[] | undefined,
  minutes: number
) => {
  if (!latestTimestamp || !newsEvents?.length) return false;
  const latestMs = new Date(latestTimestamp).getTime();
  return newsEvents.some((event) => {
    if (event.impact !== "high") return false;
    const eventMs = new Date(event.timestamp).getTime();
    return Number.isFinite(eventMs) && Math.abs(eventMs - latestMs) <= minutes * 60 * 1000;
  });
};

const setupRange = (setupCandles: NormalizedCandle[], latestTimestamp: string) => {
  const latestMs = new Date(latestTimestamp).getTime();
  const prior = setupCandles.filter((candle) => candle.epochMs < latestMs).slice(-48);
  if (prior.length < 12) return undefined;
  const rangeHigh = Math.max(...prior.map((candle) => candle.high));
  const rangeLow = Math.min(...prior.map((candle) => candle.low));
  const rangeSize = rangeHigh - rangeLow;
  const avgRange = averageRange(prior);
  if (rangeSize <= 0 || rangeSize > avgRange * 28) return undefined;
  return { rangeHigh, rangeLow, rangeSize, candles: prior };
};

const findSweep = (
  entryCandles: NormalizedCandle[],
  sessionCandles: NormalizedCandle[],
  rangeHigh: number,
  rangeLow: number
) => {
  const tolerance = Math.max((rangeHigh - rangeLow) * 0.02, 1);
  for (const candle of sessionCandles) {
    const sweepHigh = candle.high > rangeHigh + tolerance && candle.close < rangeHigh;
    const sweepLow = candle.low < rangeLow - tolerance && candle.close > rangeLow;
    if (sweepHigh) {
      return {
        side: "short" as const,
        sweep: {
          type: "sweep_high" as const,
          level: rangeHigh,
          wick: candle.high,
          timestamp: candle.timestamp,
          candleIndex: candle.index
        }
      };
    }
    if (sweepLow) {
      return {
        side: "long" as const,
        sweep: {
          type: "sweep_low" as const,
          level: rangeLow,
          wick: candle.low,
          timestamp: candle.timestamp,
          candleIndex: candle.index
        }
      };
    }
  }
  return undefined;
};

const findImmediateRejection = (
  entryCandles: NormalizedCandle[],
  side: Exclude<IctTurtleSoupSide, "flat">,
  sweep: IctTurtleSoupSweep
) => {
  const next = entryCandles.filter((candle) => candle.index > sweep.candleIndex && candle.index <= sweep.candleIndex + 3);
  return next.find((candle) =>
    side === "short"
      ? candle.close < sweep.level && candle.close < candle.open
      : candle.close > sweep.level && candle.close > candle.open
  );
};

const findMss = (
  entryCandles: NormalizedCandle[],
  side: Exclude<IctTurtleSoupSide, "flat">,
  sweep: IctTurtleSoupSweep,
  rejectionIndex: number
) => {
  const preSweep = entryCandles.slice(Math.max(0, sweep.candleIndex - 12), sweep.candleIndex);
  if (preSweep.length < 5) return undefined;
  const brokenLevel = side === "short"
    ? Math.min(...preSweep.map((candle) => candle.low))
    : Math.max(...preSweep.map((candle) => candle.high));
  const mssCandles = entryCandles.filter((candle) => candle.index > rejectionIndex && candle.index <= sweep.candleIndex + 10);
  const mssCandle = mssCandles.find((candle) =>
    side === "short" ? candle.close < brokenLevel : candle.close > brokenLevel
  );
  return mssCandle
    ? {
        direction: side === "short" ? "bearish" as const : "bullish" as const,
        brokenLevel,
        timestamp: mssCandle.timestamp,
        candleIndex: mssCandle.index
      }
    : undefined;
};

const findRetestEntry = (
  entryCandles: NormalizedCandle[],
  side: Exclude<IctTurtleSoupSide, "flat">,
  mssIndex: number
) => {
  const mssCandle = entryCandles[mssIndex];
  if (!mssCandle) return undefined;
  const retestZone = side === "short"
    ? { low: Math.min(mssCandle.open, mssCandle.close), high: mssCandle.open }
    : { low: mssCandle.open, high: Math.max(mssCandle.open, mssCandle.close) };
  const retest = entryCandles
    .filter((candle) => candle.index > mssIndex && candle.index <= mssIndex + 6)
    .find((candle) => candle.high >= retestZone.low && candle.low <= retestZone.high);
  return retest ? (retestZone.low + retestZone.high) / 2 : undefined;
};

const calculateRr = (
  side: Exclude<IctTurtleSoupSide, "flat">,
  entry: number | undefined,
  stop: number | undefined,
  target: number | undefined
) => {
  if (entry === undefined || stop === undefined || target === undefined) return undefined;
  const risk = side === "long" ? entry - stop : stop - entry;
  const reward = side === "long" ? target - entry : entry - target;
  if (risk <= 0 || reward <= 0) return undefined;
  return reward / risk;
};

const buildCandidate = (input: {
  source: IctTurtleSoupInput;
  generatedAt: string;
  status: IctTurtleSoupStatus;
  latestCandleTimestamp?: string;
  sessionWindow?: IctTurtleSoupSessionWindow;
  side?: IctTurtleSoupSide;
  rangeHigh?: number;
  rangeLow?: number;
  sweep?: IctTurtleSoupSweep;
  rejectionTimestamp?: string;
  marketStructureShift?: IctTurtleSoupCandidate["marketStructureShift"];
  entry?: number;
  stop?: number;
  target?: number;
  rr?: number;
  blockers: string[];
  warnings: string[];
  presentConditions: string[];
  missingConditions: string[];
}): IctTurtleSoupCandidate => {
  const canCreateValidationChainEntry = input.status === "replay_required" && input.blockers.length === 0;
  const sideText = input.side && input.side !== "flat" ? input.side : "flat";
  return {
    strategyId: "turtle_soup_v1",
    generatedAt: input.generatedAt,
    status: input.status,
    requestedSymbol: input.source.requestedSymbol,
    brokerSymbol: input.source.brokerSymbol,
    sourceProvider: input.source.sourceProvider,
    sourceFingerprint: input.source.sourceFingerprint,
    setupTimeframe: input.source.setupTimeframe ?? "15m",
    entryTimeframe: input.source.entryTimeframe ?? "5m",
    sessionWindow: input.sessionWindow,
    latestCandleTimestamp: input.latestCandleTimestamp,
    side: input.side ?? "flat",
    rangeHigh: input.rangeHigh,
    rangeLow: input.rangeLow,
    sweep: input.sweep,
    rejectionTimestamp: input.rejectionTimestamp,
    marketStructureShift: input.marketStructureShift,
    entry: input.entry,
    stop: input.stop,
    target: input.target,
    rr: input.rr,
    blockers: unique(input.blockers),
    warnings: unique(input.warnings),
    presentConditions: unique(input.presentConditions),
    missingConditions: unique(input.missingConditions),
    canCreateValidationChainEntry,
    validationChainSeed: canCreateValidationChainEntry
      ? {
          recognitionType: "full_model",
          setupLabel: "turtle_soup_v1",
          candidateFamily: "turtle_soup",
          requiredValidation: "Replay, walk-forward, evidence, maturity, readiness checklist, and Research Committee review."
        }
      : undefined,
    compactSummary: canCreateValidationChainEntry
      ? `Turtle Soup ${sideText} candidate; RR ${input.rr?.toFixed(2) ?? "n/a"} requires replay validation.`
      : `Turtle Soup ${sideText} not tradable: ${input.blockers[0] ?? input.missingConditions[0] ?? "validation required"}.`,
    researchOnly: true,
    authority: authorityNone,
    safety: safetyCompact
  };
};

const terminalBlockedStatus = (blockers: string[]): IctTurtleSoupStatus => {
  const text = blockers.join(" ").toLowerCase();
  if (/mock|sample/.test(text)) return "blocked_mock_source";
  if (/news/.test(text)) return "blocked_news";
  return "blocked_low_rr";
};

export function evaluateIctTurtleSoup(input: IctTurtleSoupInput): IctTurtleSoupCandidate {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const blockers: string[] = [];
  const warnings: string[] = [];
  const presentConditions: string[] = [];
  const missingConditions: string[] = [];
  const setupTimeframe = input.setupTimeframe ?? input.setupCandles.at(-1)?.timeframe;
  const entryTimeframe = input.entryTimeframe ?? input.entryCandles.at(-1)?.timeframe;
  const setupCandles = normalizeCandles(input.setupCandles);
  const entryCandles = normalizeCandles(input.entryCandles);

  if (/mock|sample/i.test(input.sourceProvider ?? "")) {
    blockers.push("Mock/sample source cannot create a Turtle Soup candidate.");
  }
  if (setupTimeframe !== "15m" && setupTimeframe !== "1h") {
    blockers.push("Turtle Soup setup timeframe must be 15m or 1h.");
  }
  if (entryTimeframe !== "5m") {
    blockers.push("Turtle Soup entry timeframe must be 5m.");
  }
  if (setupCandles.length < 20 || entryCandles.length < 30) {
    blockers.push("Insufficient candles for Turtle Soup detection.");
    return buildCandidate({
      source: { ...input, setupTimeframe: setupTimeframe === "1h" ? "1h" : "15m", entryTimeframe: "5m" },
      generatedAt,
      status: "needs_more_data",
      blockers,
      warnings,
      presentConditions,
      missingConditions: ["insufficient_candles"]
    });
  }

  const latest = entryCandles.at(-1);
  const session = latest ? resolveSession(latest) : undefined;
  if (!latest || !session) {
    blockers.push("Outside Turtle Soup London/New York open window.");
    missingConditions.push("turtle_soup_session");
    return buildCandidate({
      source: { ...input, setupTimeframe: setupTimeframe === "1h" ? "1h" : "15m", entryTimeframe: "5m" },
      generatedAt,
      status: "no_trade",
      latestCandleTimestamp: latest?.timestamp,
      blockers,
      warnings,
      presentConditions,
      missingConditions
    });
  }
  presentConditions.push("turtle_soup_session");
  const sessionWindow = compactSession(session);
  const range = setupRange(setupCandles, latest.timestamp);
  if (!range) {
    blockers.push("No clear 15m/1h range; trending market or insufficient setup context.");
    missingConditions.push("clear_setup_range");
    return buildCandidate({
      source: { ...input, setupTimeframe: setupTimeframe === "1h" ? "1h" : "15m", entryTimeframe: "5m" },
      generatedAt,
      status: "no_trade",
      latestCandleTimestamp: latest.timestamp,
      sessionWindow,
      blockers,
      warnings,
      presentConditions,
      missingConditions
    });
  }
  presentConditions.push("clear_setup_range");

  const sessionCandles = sessionCandlesFor(entryCandles, session.id, latest.nyDayKey);
  const sweepResult = findSweep(entryCandles, sessionCandles, range.rangeHigh, range.rangeLow);
  if (!sweepResult) {
    blockers.push("No fresh sweep of the setup range high/low.");
    missingConditions.push("range_liquidity_sweep");
    return buildCandidate({
      source: { ...input, setupTimeframe: setupTimeframe === "1h" ? "1h" : "15m", entryTimeframe: "5m" },
      generatedAt,
      status: "no_trade",
      latestCandleTimestamp: latest.timestamp,
      sessionWindow,
      rangeHigh: range.rangeHigh,
      rangeLow: range.rangeLow,
      blockers,
      warnings,
      presentConditions,
      missingConditions
    });
  }
  presentConditions.push("range_liquidity_sweep");

  const latestDistance = latest.index - sweepResult.sweep.candleIndex;
  if (latestDistance > 10) {
    blockers.push("Turtle Soup sweep is stale by more than ten 5m candles.");
    missingConditions.push("fresh_sweep");
    return buildCandidate({
      source: { ...input, setupTimeframe: setupTimeframe === "1h" ? "1h" : "15m", entryTimeframe: "5m" },
      generatedAt,
      status: "blocked_stale_sweep",
      latestCandleTimestamp: latest.timestamp,
      sessionWindow,
      side: sweepResult.side,
      rangeHigh: range.rangeHigh,
      rangeLow: range.rangeLow,
      sweep: sweepResult.sweep,
      blockers,
      warnings,
      presentConditions,
      missingConditions
    });
  }

  const currentLocation = (latest.close - range.rangeLow) / Math.max(range.rangeSize, 1);
  if ((sweepResult.side === "short" && currentLocation < 0.45) || (sweepResult.side === "long" && currentLocation > 0.55)) {
    blockers.push("Turtle Soup candidate is in the middle of the range instead of near swept liquidity.");
    missingConditions.push("range_extreme_location");
    return buildCandidate({
      source: { ...input, setupTimeframe: setupTimeframe === "1h" ? "1h" : "15m", entryTimeframe: "5m" },
      generatedAt,
      status: "blocked_middle_of_range",
      latestCandleTimestamp: latest.timestamp,
      sessionWindow,
      side: sweepResult.side,
      rangeHigh: range.rangeHigh,
      rangeLow: range.rangeLow,
      sweep: sweepResult.sweep,
      blockers,
      warnings,
      presentConditions,
      missingConditions
    });
  }
  presentConditions.push("range_extreme_location");

  if (input.newsEvents === undefined) {
    warnings.push("High-impact news state unknown; review manually before validation.");
  } else if (highImpactNewsWithinMinutes(latest.timestamp, input.newsEvents, 15)) {
    blockers.push("High-impact news is within 15 minutes of Turtle Soup setup.");
    missingConditions.push("news_clearance");
  }

  const rejection = findImmediateRejection(entryCandles, sweepResult.side, sweepResult.sweep);
  if (!rejection) {
    blockers.push("No immediate 1-3 candle rejection after Turtle Soup sweep.");
    missingConditions.push("immediate_rejection");
    return buildCandidate({
      source: { ...input, setupTimeframe: setupTimeframe === "1h" ? "1h" : "15m", entryTimeframe: "5m" },
      generatedAt,
      status: blockers.some((blocker) => /news/i.test(blocker)) ? "blocked_news" : "blocked_no_rejection",
      latestCandleTimestamp: latest.timestamp,
      sessionWindow,
      side: sweepResult.side,
      rangeHigh: range.rangeHigh,
      rangeLow: range.rangeLow,
      sweep: sweepResult.sweep,
      blockers,
      warnings,
      presentConditions,
      missingConditions
    });
  }
  presentConditions.push("immediate_rejection");

  const mss = findMss(entryCandles, sweepResult.side, sweepResult.sweep, rejection.index);
  if (!mss) {
    blockers.push("No 5m market structure shift confirming Turtle Soup reversal.");
    missingConditions.push("market_structure_shift");
    return buildCandidate({
      source: { ...input, setupTimeframe: setupTimeframe === "1h" ? "1h" : "15m", entryTimeframe: "5m" },
      generatedAt,
      status: blockers.some((blocker) => /news/i.test(blocker)) ? "blocked_news" : "blocked_no_mss",
      latestCandleTimestamp: latest.timestamp,
      sessionWindow,
      side: sweepResult.side,
      rangeHigh: range.rangeHigh,
      rangeLow: range.rangeLow,
      sweep: sweepResult.sweep,
      rejectionTimestamp: rejection.timestamp,
      blockers,
      warnings,
      presentConditions,
      missingConditions
    });
  }
  presentConditions.push("market_structure_shift");

  const entry = findRetestEntry(entryCandles, sweepResult.side, mss.candleIndex);
  const stop = sweepResult.side === "short" ? sweepResult.sweep.wick : sweepResult.sweep.wick;
  const target = sweepResult.side === "short" ? range.rangeLow : range.rangeHigh;
  const rr = calculateRr(sweepResult.side, entry, stop, target);
  if (entry === undefined || rr === undefined || rr < 2.5) {
    blockers.push(`Turtle Soup RR is below 2.5R (${rr?.toFixed(2) ?? "n/a"}R).`);
    missingConditions.push("target_invalidation_rr");
  } else {
    presentConditions.push("target_invalidation_rr");
  }

  return buildCandidate({
    source: { ...input, setupTimeframe: setupTimeframe === "1h" ? "1h" : "15m", entryTimeframe: "5m" },
    generatedAt,
    status: blockers.length ? terminalBlockedStatus(blockers) : "replay_required",
    latestCandleTimestamp: latest.timestamp,
    sessionWindow,
    side: sweepResult.side,
    rangeHigh: range.rangeHigh,
    rangeLow: range.rangeLow,
    sweep: sweepResult.sweep,
    rejectionTimestamp: rejection.timestamp,
    marketStructureShift: mss,
    entry,
    stop,
    target,
    rr,
    blockers,
    warnings,
    presentConditions,
    missingConditions
  });
}

export const ictTurtleSoupCanQueueValidation = (candidate: IctTurtleSoupCandidate) =>
  candidate.canCreateValidationChainEntry &&
  candidate.status === "replay_required" &&
  candidate.authority.executionAuthority === "none" &&
  candidate.authority.brokerAuthority === "none" &&
  candidate.authority.readinessOverrideAuthority === "none";
