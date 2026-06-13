import type { Candle } from "@/lib/types";
import type {
  IctCisdBodyZone,
  IctCisdCandidate,
  IctCisdCandleReference,
  IctCisdDeliveryDirection,
  IctCisdInput,
  IctCisdNewsEvent,
  IctCisdSessionContext,
  IctCisdSide,
  IctCisdStatus
} from "./ictCisdTypes";

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

type NormalizedCandle = Candle & {
  index: number;
  epochMs: number;
  nyDayKey: string;
  nyMinute: number;
  nyLocalTime: string;
};

interface DeliveryAssessment {
  direction: IctCisdDeliveryDirection;
  score: number;
  bodyAverage: number;
  rangeAverage: number;
  trendMove: number;
}

interface InternalCisdCandidate {
  side: Exclude<IctCisdSide, "flat">;
  priorDeliveryDirection: Exclude<IctCisdDeliveryDirection, "mixed" | "unknown">;
  cisdCandle: NormalizedCandle;
  cisdReference: IctCisdCandleReference;
  bodyZone: IctCisdBodyZone;
  retest?: NormalizedCandle;
  entry?: number;
  stop?: number;
  target?: number;
  rr?: number;
  blockers: string[];
  warnings: string[];
  presentConditions: string[];
  missingConditions: string[];
}

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
      const nyLocalTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      return {
        ...candle,
        index,
        nyDayKey: `${parts.year}-${parts.month}-${parts.day}`,
        nyMinute: hour * 60 + minute,
        nyLocalTime
      };
    });

const bodyHigh = (candle: Candle) => Math.max(candle.open, candle.close);
const bodyLow = (candle: Candle) => Math.min(candle.open, candle.close);
const bodySize = (candle: Candle) => Math.abs(candle.close - candle.open);
const rangeSize = (candle: Candle) => Math.max(0, candle.high - candle.low);

const average = (values: number[]) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

const highImpactNewsWithinMinutes = (
  latestTimestamp: string | undefined,
  newsEvents: IctCisdNewsEvent[] | undefined,
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

const candleReference = (candle: NormalizedCandle): IctCisdCandleReference => {
  const size = bodySize(candle);
  const range = rangeSize(candle);
  return {
    timestamp: candle.timestamp,
    candleIndex: candle.index,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    bodyHigh: bodyHigh(candle),
    bodyLow: bodyLow(candle),
    bodySize: size,
    rangeSize: range,
    direction: size <= Math.max(range * 0.12, 0.000001)
      ? "doji"
      : candle.close > candle.open
        ? "bullish"
        : "bearish"
  };
};

const resolveSessionContext = (candle: NormalizedCandle): IctCisdSessionContext => {
  const isRthOpen = candle.nyMinute >= 570 && candle.nyMinute < 630;
  const isRth = candle.nyMinute >= 570 && candle.nyMinute < 960;
  return {
    id: isRthOpen ? "rth_open" : isRth ? "rth" : "outside_rth",
    label: isRthOpen ? "RTH open" : isRth ? "RTH" : "Outside RTH",
    timingZone: "America/New_York",
    localTime: candle.nyLocalTime,
    isSessionOpenWindow: isRthOpen
  };
};

const assessPriorDelivery = (candles: NormalizedCandle[]): DeliveryAssessment => {
  if (candles.length < 8) {
    return { direction: "unknown", score: 0, bodyAverage: 0, rangeAverage: 0, trendMove: 0 };
  }
  const bodyAverage = average(candles.map(bodySize));
  const rangeAverage = average(candles.map(rangeSize));
  const trendMove = candles[candles.length - 1].close - candles[0].open;
  const upCloses = candles.filter((candle, index) => index > 0 && candle.close > candles[index - 1].close).length;
  const downCloses = candles.filter((candle, index) => index > 0 && candle.close < candles[index - 1].close).length;
  const bullishBodies = candles.filter((candle) => candle.close > candle.open).length;
  const bearishBodies = candles.filter((candle) => candle.close < candle.open).length;
  const minMove = Math.max(rangeAverage * 1.4, bodyAverage * 4);
  const bullishScore = (trendMove > minMove ? 2 : 0) + (upCloses >= candles.length * 0.58 ? 1 : 0) + (bullishBodies >= candles.length * 0.55 ? 1 : 0);
  const bearishScore = (trendMove < -minMove ? 2 : 0) + (downCloses >= candles.length * 0.58 ? 1 : 0) + (bearishBodies >= candles.length * 0.55 ? 1 : 0);
  if (bullishScore >= 3 && bullishScore > bearishScore) {
    return { direction: "bullish", score: bullishScore, bodyAverage, rangeAverage, trendMove };
  }
  if (bearishScore >= 3 && bearishScore > bullishScore) {
    return { direction: "bearish", score: bearishScore, bodyAverage, rangeAverage, trendMove };
  }
  return { direction: "mixed", score: Math.max(bullishScore, bearishScore), bodyAverage, rangeAverage, trendMove };
};

const isWeakCisdCandle = (candle: NormalizedCandle, assessment: DeliveryAssessment) => {
  const body = bodySize(candle);
  const range = rangeSize(candle);
  const minBody = Math.max(assessment.bodyAverage * 0.85, assessment.rangeAverage * 0.28);
  return range <= 0 || body < minBody || body / range < 0.42;
};

const findRetest = (
  candles: NormalizedCandle[],
  cisdIndex: number,
  bodyZone: IctCisdBodyZone
) =>
  candles
    .filter((candle) => candle.index > cisdIndex && candle.index <= cisdIndex + 10)
    .find((candle) => candle.high >= bodyZone.low && candle.low <= bodyZone.high);

const findLiquidityTarget = (
  candles: NormalizedCandle[],
  cisdIndex: number,
  side: Exclude<IctCisdSide, "flat">,
  entry: number
) => {
  const lookback = candles.slice(Math.max(0, cisdIndex - 48), cisdIndex);
  if (lookback.length < 10) return undefined;
  if (side === "long") {
    const candidates = lookback
      .map((candle) => candle.high)
      .filter((level) => level > entry);
    return candidates.length ? Math.max(...candidates) : undefined;
  }
  const candidates = lookback
    .map((candle) => candle.low)
    .filter((level) => level < entry);
  return candidates.length ? Math.min(...candidates) : undefined;
};

const calculateRr = (
  side: Exclude<IctCisdSide, "flat">,
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

const hasChopConflict = (candles: NormalizedCandle[], cisdIndex: number, side: Exclude<IctCisdSide, "flat">) => {
  const recent = candles.slice(Math.max(0, cisdIndex - 14), cisdIndex + 1);
  if (recent.length < 8) return false;
  const directionFlips = recent.reduce((total, candle, index) => {
    if (index === 0) return total;
    const previous = recent[index - 1];
    const direction = candle.close > candle.open ? 1 : candle.close < candle.open ? -1 : 0;
    const previousDirection = previous.close > previous.open ? 1 : previous.close < previous.open ? -1 : 0;
    return direction !== 0 && previousDirection !== 0 && direction !== previousDirection ? total + 1 : total;
  }, 0);
  return directionFlips >= 7;
};

const findInternalCandidate = (candles: NormalizedCandle[]): InternalCisdCandidate | undefined => {
  const scanStart = Math.max(12, candles.length - 24);
  const scanEnd = candles.length - 2;
  const candidates: InternalCisdCandidate[] = [];

  for (let index = scanStart; index <= scanEnd; index += 1) {
    const candle = candles[index];
    const priorWindow = candles.slice(Math.max(0, index - 14), index);
    const assessment = assessPriorDelivery(priorWindow);
    if (assessment.direction !== "bullish" && assessment.direction !== "bearish") continue;

    const priorBodyHigh = Math.max(...priorWindow.slice(-8).map(bodyHigh));
    const priorBodyLow = Math.min(...priorWindow.slice(-8).map(bodyLow));
    const ref = candleReference(candle);
    const bullishCisd = assessment.direction === "bearish" && candle.close > candle.open && candle.close > priorBodyHigh;
    const bearishCisd = assessment.direction === "bullish" && candle.close < candle.open && candle.close < priorBodyLow;
    if (!bullishCisd && !bearishCisd) continue;

    const side = bullishCisd ? "long" as const : "short" as const;
    const bodyZone = {
      low: ref.bodyLow,
      high: ref.bodyHigh,
      midpoint: (ref.bodyLow + ref.bodyHigh) / 2
    };
    const retest = findRetest(candles, candle.index, bodyZone);
    const entry = retest ? bodyZone.midpoint : undefined;
    const stop = entry === undefined ? undefined : side === "long" ? candle.low : candle.high;
    const target = entry === undefined ? undefined : findLiquidityTarget(candles, candle.index, side, entry);
    const rr = calculateRr(side, entry, stop, target);
    const blockers: string[] = [];
    const warnings: string[] = [];
    const presentConditions = [
      "prior_delivery",
      "opposite_body_close",
      "cisd_candle"
    ];
    const missingConditions: string[] = [];

    if (isWeakCisdCandle(candle, assessment)) {
      blockers.push("weak CISD candle body/displacement");
      missingConditions.push("strong_cisd_candle");
    } else {
      presentConditions.push("strong_cisd_candle");
    }

    if (hasChopConflict(candles, candle.index, side)) {
      blockers.push("multiple opposite delivery shifts in chop");
      missingConditions.push("clean_delivery_shift");
    } else {
      presentConditions.push("clean_delivery_shift");
    }

    if (!retest || entry === undefined) {
      blockers.push("no retest of CISD open-to-close body");
      missingConditions.push("body_retest_entry");
    } else {
      presentConditions.push("body_retest_entry");
    }

    if (target === undefined) {
      blockers.push("no opposing liquidity target in new delivery direction");
      missingConditions.push("opposing_liquidity_target");
    } else {
      presentConditions.push("opposing_liquidity_target");
    }

    if (rr === undefined || rr < 2) {
      blockers.push("reward/risk below 2R");
      missingConditions.push("minimum_2r");
    } else {
      presentConditions.push("minimum_2r");
    }

    const session = resolveSessionContext(candle);
    if (session.id === "outside_rth") {
      warnings.push("CISD formed outside RTH; session-open probability is lower.");
    } else if (!session.isSessionOpenWindow) {
      warnings.push("CISD formed outside the highest-probability RTH open window.");
    }

    candidates.push({
      side,
      priorDeliveryDirection: assessment.direction,
      cisdCandle: candle,
      cisdReference: ref,
      bodyZone,
      retest,
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

  return candidates.sort((left, right) => right.cisdCandle.index - left.cisdCandle.index)[0];
};

const buildCandidate = (input: {
  source: IctCisdInput;
  generatedAt: string;
  status: IctCisdStatus;
  latestCandleTimestamp?: string;
  side?: IctCisdSide;
  priorDeliveryDirection?: IctCisdDeliveryDirection;
  internal?: InternalCisdCandidate;
  blockers: string[];
  warnings?: string[];
  presentConditions?: string[];
  missingConditions?: string[];
}): IctCisdCandidate => {
  const canCreateValidationChainEntry =
    input.status === "replay_required" &&
    input.source.sourceProvider !== "mock" &&
    input.source.sourceProvider !== "sample" &&
    input.internal?.rr !== undefined &&
    input.internal.rr >= 2;
  const compactSummary = canCreateValidationChainEntry
    ? `CISD ${input.internal?.side} replay-required on ${input.source.timeframe ?? "n/a"}; RR ${input.internal?.rr?.toFixed(2) ?? "n/a"}.`
    : `CISD blocked: ${input.blockers[0] ?? "no valid delivery-state shift"}.`;

  return {
    strategyId: "cisd_v1",
    generatedAt: input.generatedAt,
    status: input.status,
    requestedSymbol: input.source.requestedSymbol,
    brokerSymbol: input.source.brokerSymbol,
    sourceProvider: input.source.sourceProvider,
    sourceFingerprint: input.source.sourceFingerprint,
    timeframe: input.source.timeframe ?? "5m",
    latestCandleTimestamp: input.latestCandleTimestamp,
    side: input.side ?? input.internal?.side ?? "flat",
    priorDeliveryDirection: input.priorDeliveryDirection ?? input.internal?.priorDeliveryDirection ?? "unknown",
    cisdCandle: input.internal?.cisdReference,
    retestTimestamp: input.internal?.retest?.timestamp,
    bodyZone: input.internal?.bodyZone,
    sessionContext: input.internal ? resolveSessionContext(input.internal.cisdCandle) : undefined,
    entry: input.internal?.entry,
    stop: input.internal?.stop,
    target: input.internal?.target,
    rr: input.internal?.rr,
    blockers: input.blockers,
    warnings: input.warnings ?? input.internal?.warnings ?? [],
    presentConditions: input.presentConditions ?? input.internal?.presentConditions ?? [],
    missingConditions: input.missingConditions ?? input.internal?.missingConditions ?? [],
    canCreateValidationChainEntry,
    validationChainSeed: canCreateValidationChainEntry
      ? {
          recognitionType: "full_model",
          setupLabel: "cisd_v1",
          candidateFamily: "cisd",
          requiredValidation: "Replay CISD body retest outcome before evidence or Paper-Demo progression."
        }
      : undefined,
    compactSummary,
    researchOnly: true,
    authority: authorityNone,
    safety: safetyCompact
  };
};

export const evaluateIctCisd = (input: IctCisdInput): IctCisdCandidate => {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const normalized = normalizeCandles(input.candles);
  const latestCandleTimestamp = normalized[normalized.length - 1]?.timestamp;

  if (input.sourceProvider === "mock" || input.sourceProvider === "sample") {
    return buildCandidate({
      source: input,
      generatedAt,
      latestCandleTimestamp,
      status: "blocked_mock_source",
      blockers: ["mock/sample source cannot create CISD validation candidates"],
      missingConditions: ["non_mock_source"]
    });
  }

  if (input.timeframe && input.timeframe !== "5m" && input.timeframe !== "15m") {
    return buildCandidate({
      source: input,
      generatedAt,
      latestCandleTimestamp,
      status: "needs_more_data",
      blockers: ["CISD v1 supports 5m or 15m only"],
      missingConditions: ["supported_timeframe"]
    });
  }

  if (normalized.length < 18) {
    return buildCandidate({
      source: input,
      generatedAt,
      latestCandleTimestamp,
      status: "needs_more_data",
      blockers: ["insufficient candles for prior delivery, CISD, and retest"],
      missingConditions: ["minimum_candles"]
    });
  }

  if (highImpactNewsWithinMinutes(latestCandleTimestamp, input.newsEvents, 30)) {
    return buildCandidate({
      source: input,
      generatedAt,
      latestCandleTimestamp,
      status: "blocked_news",
      blockers: ["high-impact news within 30 minutes"],
      missingConditions: ["news_clearance"]
    });
  }

  const internal = findInternalCandidate(normalized);
  if (!internal) {
    const latestIndex = normalized.length - 1;
    const delivery = assessPriorDelivery(normalized.slice(Math.max(0, latestIndex - 18), latestIndex));
    return buildCandidate({
      source: input,
      generatedAt,
      latestCandleTimestamp,
      status: delivery.direction === "mixed" || delivery.direction === "unknown"
        ? "blocked_no_prior_delivery"
        : "no_trade",
      priorDeliveryDirection: delivery.direction,
      blockers: delivery.direction === "mixed" || delivery.direction === "unknown"
        ? ["no prior clear delivery trend"]
        : ["no close beyond a significant prior candle body in the opposite direction"],
      presentConditions: delivery.direction === "mixed" || delivery.direction === "unknown" ? [] : ["prior_delivery"],
      missingConditions: delivery.direction === "mixed" || delivery.direction === "unknown"
        ? ["prior_delivery"]
        : ["opposite_body_close"]
    });
  }

  const hardBlocker = internal.blockers[0];
  const status: IctCisdStatus = !hardBlocker
    ? "replay_required"
    : hardBlocker.includes("weak")
      ? "blocked_weak_cisd_candle"
      : hardBlocker.includes("chop")
        ? "blocked_chop"
        : hardBlocker.includes("retest")
          ? "blocked_no_retest"
          : "blocked_rr";

  return buildCandidate({
    source: input,
    generatedAt,
    latestCandleTimestamp,
    status,
    internal,
    blockers: internal.blockers,
    warnings: internal.warnings,
    presentConditions: internal.presentConditions,
    missingConditions: internal.missingConditions
  });
};

export const ictCisdCanQueueValidation = (candidate: IctCisdCandidate) =>
  candidate.canCreateValidationChainEntry &&
  candidate.status === "replay_required" &&
  candidate.researchOnly === true &&
  candidate.authority.executionAuthority === "none" &&
  candidate.authority.brokerAuthority === "none" &&
  candidate.authority.readinessOverrideAuthority === "none";
