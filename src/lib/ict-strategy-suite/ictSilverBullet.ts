import type { Candle } from "@/lib/types";
import type {
  IctSilverBulletCandidate,
  IctSilverBulletFvg,
  IctSilverBulletInput,
  IctSilverBulletNewsEvent,
  IctSilverBulletSessionId,
  IctSilverBulletSessionWindow,
  IctSilverBulletSide,
  IctSilverBulletStatus,
  IctSilverBulletSweep
} from "./ictSilverBulletTypes";

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

const SILVER_BULLET_SESSIONS: Array<IctSilverBulletSessionWindow & { startMinute: number; endMinute: number }> = [
  {
    id: "london_open",
    label: "03:00-04:00 NY Silver Bullet",
    startLocal: "03:00",
    endLocal: "04:00",
    timingZone: "America/New_York",
    startMinute: 180,
    endMinute: 240
  },
  {
    id: "new_york_am",
    label: "10:00-11:00 NY Silver Bullet",
    startLocal: "10:00",
    endLocal: "11:00",
    timingZone: "America/New_York",
    startMinute: 600,
    endMinute: 660
  },
  {
    id: "new_york_pm",
    label: "14:00-15:00 NY Silver Bullet",
    startLocal: "14:00",
    endLocal: "15:00",
    timingZone: "America/New_York",
    startMinute: 840,
    endMinute: 900
  }
];

type InternalSilverBulletSession = (typeof SILVER_BULLET_SESSIONS)[number];

const nyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

type NormalizedCandle = Candle & {
  index: number;
  epochMs: number;
  nyDayKey: string;
  nyMinute: number;
};

const asNumber = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

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

const compactSession = (
  session: InternalSilverBulletSession
): IctSilverBulletSessionWindow => ({
  id: session.id,
  label: session.label,
  startLocal: session.startLocal,
  endLocal: session.endLocal,
  timingZone: session.timingZone
});

const resolveSession = (candle: NormalizedCandle) =>
  SILVER_BULLET_SESSIONS.find((session) => candle.nyMinute >= session.startMinute && candle.nyMinute < session.endMinute);

const sessionCandlesFor = (
  candles: NormalizedCandle[],
  sessionId: IctSilverBulletSessionId,
  nyDayKey: string
) => {
  const session = SILVER_BULLET_SESSIONS.find((item) => item.id === sessionId);
  if (!session) return [];
  return candles.filter((candle) =>
    candle.nyDayKey === nyDayKey &&
    candle.nyMinute >= session.startMinute &&
    candle.nyMinute < session.endMinute
  );
};

const findSweep = (candles: NormalizedCandle[], sessionCandles: NormalizedCandle[]) => {
  for (const candle of sessionCandles) {
    const lookback = candles.slice(Math.max(0, candle.index - 20), candle.index);
    if (lookback.length < 5) continue;
    const priorLow = Math.min(...lookback.map((item) => item.low));
    const priorHigh = Math.max(...lookback.map((item) => item.high));
    const sellSideSweep = candle.low < priorLow && candle.close > priorLow;
    const buySideSweep = candle.high > priorHigh && candle.close < priorHigh;
    if (sellSideSweep) {
      return {
        side: "long" as const,
        sweep: {
          type: "sell_side" as const,
          sweptLevel: priorLow,
          candleTimestamp: candle.timestamp,
          candleIndex: candle.index
        }
      };
    }
    if (buySideSweep) {
      return {
        side: "short" as const,
        sweep: {
          type: "buy_side" as const,
          sweptLevel: priorHigh,
          candleTimestamp: candle.timestamp,
          candleIndex: candle.index
        }
      };
    }
  }
  return undefined;
};

const findFvgAfterSweep = (
  candles: NormalizedCandle[],
  sessionCandles: NormalizedCandle[],
  side: Exclude<IctSilverBulletSide, "flat">,
  sweep: IctSilverBulletSweep
): IctSilverBulletFvg | undefined => {
  const sessionIndexes = new Set(sessionCandles.map((candle) => candle.index));
  for (let index = sweep.candleIndex + 2; index < candles.length; index += 1) {
    if (!sessionIndexes.has(index)) continue;
    const first = candles[index - 2];
    const third = candles[index];
    if (!first || !third) continue;
    if (side === "long" && first.high < third.low) {
      return {
        direction: "bullish",
        low: first.high,
        high: third.low,
        midpoint: (first.high + third.low) / 2,
        candleOpen: third.open,
        createdAt: third.timestamp,
        candleIndex: index
      };
    }
    if (side === "short" && first.low > third.high) {
      return {
        direction: "bearish",
        low: third.high,
        high: first.low,
        midpoint: (third.high + first.low) / 2,
        candleOpen: third.open,
        createdAt: third.timestamp,
        candleIndex: index
      };
    }
  }
  return undefined;
};

const findReturnToFvg = (
  sessionCandles: NormalizedCandle[],
  fvg: IctSilverBulletFvg
) =>
  sessionCandles.find((candle) =>
    candle.index > fvg.candleIndex &&
    candle.high >= fvg.low &&
    candle.low <= fvg.high
  );

const findTarget = (
  candles: NormalizedCandle[],
  side: Exclude<IctSilverBulletSide, "flat">,
  entry: number,
  returnIndex: number
) => {
  const lookback = candles.slice(Math.max(0, returnIndex - 80), returnIndex);
  if (side === "long") {
    const highs = lookback.map((candle) => candle.high).filter((value) => value > entry);
    return highs.length ? Math.max(...highs) : undefined;
  }
  const lows = lookback.map((candle) => candle.low).filter((value) => value < entry);
  return lows.length ? Math.min(...lows) : undefined;
};

const calculateRr = (
  side: Exclude<IctSilverBulletSide, "flat">,
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

const highImpactNewsWithinMinutes = (
  latestTimestamp: string | undefined,
  newsEvents: IctSilverBulletNewsEvent[] | undefined,
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

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

const buildCandidate = (input: {
  source: IctSilverBulletInput;
  generatedAt: string;
  status: IctSilverBulletStatus;
  latestCandleTimestamp?: string;
  sessionWindow?: IctSilverBulletSessionWindow;
  side?: IctSilverBulletSide;
  sweep?: IctSilverBulletSweep;
  fvg?: IctSilverBulletFvg;
  returnToFvgTimestamp?: string;
  entry?: number;
  alternateEntry?: number;
  stop?: number;
  target?: number;
  rr?: number;
  blockers: string[];
  warnings: string[];
  presentConditions: string[];
  missingConditions: string[];
}): IctSilverBulletCandidate => {
  const canCreateValidationChainEntry = input.status === "replay_required" && input.blockers.length === 0;
  const sideText = input.side && input.side !== "flat" ? input.side : "flat";
  const summary = canCreateValidationChainEntry
    ? `Silver Bullet ${sideText} candidate in ${input.sessionWindow?.label ?? "session"}; RR ${input.rr?.toFixed(2) ?? "n/a"} requires replay validation.`
    : `Silver Bullet ${sideText} not tradable: ${input.blockers[0] ?? input.missingConditions[0] ?? "validation required"}.`;

  return {
    strategyId: "silver_bullet_v1",
    generatedAt: input.generatedAt,
    status: input.status,
    requestedSymbol: input.source.requestedSymbol,
    brokerSymbol: input.source.brokerSymbol,
    sourceProvider: input.source.sourceProvider,
    sourceFingerprint: input.source.sourceFingerprint,
    timeframe: input.source.timeframe ?? "1m",
    contextTimeframes: [
      ...(input.source.contextCandles?.["5m"]?.length ? ["5m"] : []),
      ...(input.source.contextCandles?.["15m"]?.length ? ["15m"] : [])
    ],
    sessionWindow: input.sessionWindow,
    latestCandleTimestamp: input.latestCandleTimestamp,
    side: input.side ?? "flat",
    sweep: input.sweep,
    fvg: input.fvg,
    returnToFvgTimestamp: input.returnToFvgTimestamp,
    entry: asNumber(input.entry),
    alternateEntry: asNumber(input.alternateEntry),
    stop: asNumber(input.stop),
    target: asNumber(input.target),
    rr: asNumber(input.rr),
    blockers: unique(input.blockers),
    warnings: unique(input.warnings),
    presentConditions: unique(input.presentConditions),
    missingConditions: unique(input.missingConditions),
    canCreateValidationChainEntry,
    validationChainSeed: canCreateValidationChainEntry
      ? {
          recognitionType: "full_model",
          setupLabel: "silver_bullet_v1",
          candidateFamily: "silver_bullet",
          requiredValidation: "Replay, walk-forward, evidence, maturity, readiness checklist, and Research Committee review."
        }
      : undefined,
    compactSummary: summary,
    researchOnly: true,
    authority: authorityNone,
    safety: safetyCompact
  };
};

export function evaluateIctSilverBullet(input: IctSilverBulletInput): IctSilverBulletCandidate {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const blockers: string[] = [];
  const warnings: string[] = [];
  const presentConditions: string[] = [];
  const missingConditions: string[] = [];
  const candles = normalizeCandles(input.candles);
  const timeframe = input.timeframe ?? candles.at(-1)?.timeframe ?? "1m";

  if (/mock|sample/i.test(input.sourceProvider ?? "")) {
    blockers.push("Mock/sample source cannot create a Silver Bullet candidate.");
  }
  if (timeframe !== "1m") {
    blockers.push("Silver Bullet v1 requires 1m entry candles.");
  }
  if (candles.length < 30) {
    blockers.push("Insufficient 1m candles for Silver Bullet detection.");
    return buildCandidate({
      source: { ...input, timeframe },
      generatedAt,
      status: blockers.length ? "needs_more_data" : "no_trade",
      blockers,
      warnings,
      presentConditions,
      missingConditions: ["insufficient_candles"]
    });
  }

  const latest = candles.at(-1);
  const session = latest ? resolveSession(latest) : undefined;
  if (!session || !latest) {
    blockers.push("Outside Silver Bullet killzone.");
    missingConditions.push("silver_bullet_killzone");
    return buildCandidate({
      source: { ...input, timeframe },
      generatedAt,
      status: blockers.length ? "no_trade" : "blocked",
      latestCandleTimestamp: latest?.timestamp,
      blockers,
      warnings,
      presentConditions,
      missingConditions
    });
  }
  presentConditions.push("silver_bullet_killzone");
  const sessionWindow = compactSession(session);
  const sessionCandles = sessionCandlesFor(candles, session.id, latest.nyDayKey);
  const sweepResult = findSweep(candles, sessionCandles);
  if (!sweepResult) {
    blockers.push("No qualifying liquidity sweep found in the active Silver Bullet window.");
    missingConditions.push("liquidity_sweep");
    return buildCandidate({
      source: { ...input, timeframe },
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
  presentConditions.push("liquidity_sweep");

  const fvg = findFvgAfterSweep(candles, sessionCandles, sweepResult.side, sweepResult.sweep);
  if (!fvg) {
    blockers.push("No directional FVG formed after the liquidity sweep.");
    missingConditions.push("directional_fvg");
    return buildCandidate({
      source: { ...input, timeframe },
      generatedAt,
      status: "no_trade",
      latestCandleTimestamp: latest.timestamp,
      sessionWindow,
      side: sweepResult.side,
      sweep: sweepResult.sweep,
      blockers,
      warnings,
      presentConditions,
      missingConditions
    });
  }
  presentConditions.push("directional_fvg");

  const returnCandle = findReturnToFvg(sessionCandles, fvg);
  if (!returnCandle) {
    blockers.push("Price has not returned to the Silver Bullet FVG entry zone.");
    missingConditions.push("return_to_fvg");
    return buildCandidate({
      source: { ...input, timeframe },
      generatedAt,
      status: "no_trade",
      latestCandleTimestamp: latest.timestamp,
      sessionWindow,
      side: sweepResult.side,
      sweep: sweepResult.sweep,
      fvg,
      blockers,
      warnings,
      presentConditions,
      missingConditions
    });
  }
  presentConditions.push("return_to_fvg");

  if (input.newsEvents === undefined) {
    warnings.push("High-impact news state unknown; review manually before validation.");
  } else if (highImpactNewsWithinMinutes(latest.timestamp, input.newsEvents, 30)) {
    blockers.push("High-impact news is within 30 minutes of the active Silver Bullet window.");
  }
  if (input.vwap === undefined) {
    warnings.push("VWAP extension unavailable; treat distance-from-VWAP as manual review.");
  } else {
    const threshold = input.vwapExtensionThreshold ?? 0.0075;
    const extension = Math.abs(latest.close - input.vwap) / Math.max(1, Math.abs(latest.close));
    if (extension > threshold) {
      blockers.push("Price is already extended far from VWAP.");
    }
  }

  const entry = fvg.midpoint;
  const alternateEntry = fvg.candleOpen;
  const stop = sweepResult.side === "long"
    ? Math.min(fvg.low, sweepResult.sweep.sweptLevel)
    : Math.max(fvg.high, sweepResult.sweep.sweptLevel);
  const target = findTarget(candles, sweepResult.side, entry, returnCandle.index);
  const rr = calculateRr(sweepResult.side, entry, stop, target);
  if (target === undefined || stop === undefined || entry === undefined) {
    blockers.push("Silver Bullet target, entry, or invalidation is missing.");
    missingConditions.push("target_invalidation_rr");
  } else if (rr === undefined || rr < 2) {
    blockers.push(`Silver Bullet RR is below 2R (${rr?.toFixed(2) ?? "n/a"}R).`);
    missingConditions.push("target_invalidation_rr");
  } else {
    presentConditions.push("target_invalidation_rr");
  }

  return buildCandidate({
    source: { ...input, timeframe },
    generatedAt,
    status: blockers.length ? "no_trade" : "replay_required",
    latestCandleTimestamp: latest.timestamp,
    sessionWindow,
    side: sweepResult.side,
    sweep: sweepResult.sweep,
    fvg,
    returnToFvgTimestamp: returnCandle.timestamp,
    entry,
    alternateEntry,
    stop,
    target,
    rr,
    blockers,
    warnings,
    presentConditions,
    missingConditions
  });
}

export const ictSilverBulletCanQueueValidation = (candidate: IctSilverBulletCandidate) =>
  candidate.canCreateValidationChainEntry &&
  candidate.status === "replay_required" &&
  candidate.authority.executionAuthority === "none" &&
  candidate.authority.brokerAuthority === "none" &&
  candidate.authority.readinessOverrideAuthority === "none";
