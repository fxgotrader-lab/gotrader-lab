import type { Candle } from "@/lib/types";
import type {
  IctIfvgBounds,
  IctIfvgCandidate,
  IctIfvgCandleReference,
  IctIfvgHtfAlignment,
  IctIfvgInput,
  IctIfvgLiquidityTarget,
  IctIfvgOriginalDirection,
  IctIfvgSessionContext,
  IctIfvgSide,
  IctIfvgStatus
} from "./ictIfvgTypes";

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

interface InternalFvg {
  direction: IctIfvgOriginalDirection;
  bounds: IctIfvgBounds;
  createdBy: NormalizedCandle;
}

interface InternalIfvgCandidate {
  side: Exclude<IctIfvgSide, "flat">;
  originalFvgDirection: IctIfvgOriginalDirection;
  originalFvg: InternalFvg;
  inversionCandle?: NormalizedCandle;
  retestCandle?: NormalizedCandle;
  entry?: number;
  stop?: number;
  target?: number;
  rr?: number;
  liquidityTarget?: IctIfvgLiquidityTarget;
  htfAlignment: IctIfvgHtfAlignment;
  htfDirections: string[];
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

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

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

const asReference = (candle: NormalizedCandle | undefined): IctIfvgCandleReference | undefined =>
  candle
    ? {
        timestamp: candle.timestamp,
        candleIndex: candle.index,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      }
    : undefined;

const averageRange = (candles: NormalizedCandle[]) =>
  candles.length
    ? candles.reduce((total, candle) => total + Math.max(0, candle.high - candle.low), 0) / candles.length
    : 0;

const averageVolume = (candles: NormalizedCandle[]) => {
  const values = candles.map((candle) => Number(candle.volume ?? 0)).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
};

const resolveSessionContext = (candle: NormalizedCandle): IctIfvgSessionContext => {
  const minute = candle.nyMinute;
  if (minute >= 180 && minute < 300) {
    return {
      id: "london_open",
      label: "London open IFVG window",
      localTime: candle.nyLocalTime,
      timingZone: "America/New_York",
      preferredWindow: true
    };
  }
  if (minute >= 570 && minute < 660) {
    return {
      id: "new_york_open",
      label: "New York open IFVG window",
      localTime: candle.nyLocalTime,
      timingZone: "America/New_York",
      preferredWindow: true
    };
  }
  if (minute >= 570 && minute < 960) {
    return {
      id: "rth",
      label: "RTH non-open IFVG window",
      localTime: candle.nyLocalTime,
      timingZone: "America/New_York",
      preferredWindow: false
    };
  }
  return {
    id: "outside_rth",
    label: "Outside RTH",
    localTime: candle.nyLocalTime,
    timingZone: "America/New_York",
    preferredWindow: false
  };
};

const detectFvgAt = (candles: NormalizedCandle[], index: number): InternalFvg | undefined => {
  const first = candles[index - 2];
  const third = candles[index];
  if (!first || !third) return undefined;
  if (first.high < third.low) {
    return {
      direction: "bullish",
      bounds: {
        low: first.high,
        high: third.low,
        midpoint: (first.high + third.low) / 2
      },
      createdBy: third
    };
  }
  if (first.low > third.high) {
    return {
      direction: "bearish",
      bounds: {
        low: third.high,
        high: first.low,
        midpoint: (third.high + first.low) / 2
      },
      createdBy: third
    };
  }
  return undefined;
};

const fullyInverts = (candle: NormalizedCandle, fvg: InternalFvg) =>
  fvg.direction === "bearish"
    ? candle.close > fvg.bounds.high
    : candle.close < fvg.bounds.low;

const touchesBounds = (candle: NormalizedCandle, bounds: IctIfvgBounds) =>
  candle.high >= bounds.low && candle.low <= bounds.high;

const retestRespects = (
  candle: NormalizedCandle,
  side: Exclude<IctIfvgSide, "flat">,
  bounds: IctIfvgBounds
) => side === "long" ? candle.close >= bounds.low : candle.close <= bounds.high;

const findFirstInversion = (candles: NormalizedCandle[], fvg: InternalFvg) =>
  candles
    .filter((candle) => candle.index > fvg.createdBy.index && candle.index <= fvg.createdBy.index + 36)
    .find((candle) => fullyInverts(candle, fvg));

const wasFvgUsedBeforeInversion = (
  candles: NormalizedCandle[],
  fvg: InternalFvg,
  inversionCandle: NormalizedCandle | undefined
) => {
  if (!inversionCandle) return false;
  return candles
    .filter((candle) => candle.index > fvg.createdBy.index && candle.index < inversionCandle.index)
    .some((candle) => touchesBounds(candle, fvg.bounds));
};

const findRetest = (
  candles: NormalizedCandle[],
  side: Exclude<IctIfvgSide, "flat">,
  fvg: InternalFvg,
  inversionCandle: NormalizedCandle
) =>
  candles
    .filter((candle) => candle.index > inversionCandle.index && candle.index <= inversionCandle.index + 24)
    .find((candle) => touchesBounds(candle, fvg.bounds) && retestRespects(candle, side, fvg.bounds));

const directionFor = (candles: Candle[] | undefined) => {
  if (!candles?.length || candles.length < 3) return "unknown" as const;
  const normalized = normalizeCandles(candles);
  const start = normalized[Math.max(0, normalized.length - 12)] ?? normalized[0];
  const end = normalized.at(-1);
  if (!start || !end) return "unknown" as const;
  const move = end.close - start.open;
  const range = Math.max(averageRange(normalized.slice(-16)), Math.abs(end.close) * 0.0001, 1);
  if (move > range * 0.6) return "bullish" as const;
  if (move < -range * 0.6) return "bearish" as const;
  return "mixed" as const;
};

const resolveHtfAlignment = (
  context: IctIfvgInput["contextCandles"],
  side: Exclude<IctIfvgSide, "flat">
): { alignment: IctIfvgHtfAlignment; directions: string[] } => {
  const expected = side === "long" ? "bullish" : "bearish";
  const rows = [
    ["15m", directionFor(context?.["15m"])],
    ["1h", directionFor(context?.["1h"])],
    ["4h", directionFor(context?.["4h"])],
    ["1d", directionFor(context?.["1d"])]
  ] as const;
  const available = rows.filter(([, direction]) => direction !== "unknown");
  const directions = rows.map(([timeframe, direction]) => `${timeframe}:${direction}`);
  if (!available.length) return { alignment: "unavailable", directions };
  const aligned = available.filter(([, direction]) => direction === expected).length;
  const against = available.filter(([, direction]) =>
    side === "long" ? direction === "bearish" : direction === "bullish"
  ).length;
  if (aligned > 0 && against === 0) return { alignment: "aligned", directions };
  if (against > aligned) return { alignment: "against_htf", directions };
  return { alignment: "mixed", directions };
};

const findLiquidityTarget = (
  candles: NormalizedCandle[],
  side: Exclude<IctIfvgSide, "flat">,
  entry: number,
  retestIndex: number
): IctIfvgLiquidityTarget | undefined => {
  const lookback = candles.slice(Math.max(0, retestIndex - 96), retestIndex);
  const minimumDistance = Math.max(averageRange(candles.slice(Math.max(0, retestIndex - 24), retestIndex)) * 0.8, 1);
  if (side === "long") {
    const candidates = lookback
      .map((candle) => candle.high)
      .filter((price) => price > entry + minimumDistance)
      .sort((left, right) => left - right);
    return candidates[0]
      ? { type: "buy_side_liquidity", price: candidates[0], source: "prior_swing" }
      : undefined;
  }
  const candidates = lookback
    .map((candle) => candle.low)
    .filter((price) => price < entry - minimumDistance)
    .sort((left, right) => right - left);
  return candidates[0]
    ? { type: "sell_side_liquidity", price: candidates[0], source: "prior_swing" }
    : undefined;
};

const calculateRr = (
  side: Exclude<IctIfvgSide, "flat">,
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

const isLowVolumeContext = (candles: NormalizedCandle[], candle: NormalizedCandle) => {
  const recent = candles.slice(Math.max(0, candle.index - 24), candle.index);
  const baseline = averageVolume(recent);
  const current = Number(candle.volume ?? 0);
  if (!baseline || !current) return false;
  return current < baseline * 0.35;
};

const findInternalCandidate = (
  candles: NormalizedCandle[],
  contextCandles: IctIfvgInput["contextCandles"]
): InternalIfvgCandidate | undefined => {
  const scanStart = Math.max(2, candles.length - 120);
  const scanEnd = candles.length - 3;
  const candidates: InternalIfvgCandidate[] = [];

  for (let index = scanStart; index <= scanEnd; index += 1) {
    const fvg = detectFvgAt(candles, index);
    if (!fvg) continue;
    const side = fvg.direction === "bearish" ? "long" as const : "short" as const;
    const presentConditions = ["fair_value_gap"];
    const missingConditions: string[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];

    const inversionCandle = findFirstInversion(candles, fvg);
    if (!inversionCandle) {
      blockers.push("FVG was never fully inverted.");
      missingConditions.push("full_inversion");
    } else {
      presentConditions.push("full_inversion");
    }

    const reused = wasFvgUsedBeforeInversion(candles, fvg, inversionCandle);
    if (reused) {
      blockers.push("IFVG zone was already used before inversion.");
      missingConditions.push("unused_ifvg_zone");
    } else {
      presentConditions.push("unused_ifvg_zone");
    }

    const { alignment, directions } = resolveHtfAlignment(contextCandles, side);
    if (alignment === "against_htf") {
      blockers.push("IFVG direction is against available HTF context.");
      missingConditions.push("htf_alignment");
    } else if (alignment === "unavailable") {
      warnings.push("HTF context unavailable; IFVG requires manual context review.");
    } else if (alignment === "mixed") {
      warnings.push("HTF context is mixed; keep IFVG replay-required.");
    }
    if (alignment === "aligned" || alignment === "mixed" || alignment === "unavailable") {
      presentConditions.push("htf_context_reviewed");
    }

    const retestCandle = inversionCandle ? findRetest(candles, side, fvg, inversionCandle) : undefined;
    if (!retestCandle) {
      blockers.push("Price did not retest and respect the inverted FVG zone.");
      missingConditions.push("ifvg_retest");
    } else {
      presentConditions.push("ifvg_retest");
    }

    if (inversionCandle && isLowVolumeContext(candles, inversionCandle)) {
      blockers.push("Inversion formed in low-volume context.");
      missingConditions.push("sufficient_volume");
    } else {
      presentConditions.push("sufficient_volume");
    }

    const entry = retestCandle ? fvg.bounds.midpoint : undefined;
    const stop = entry === undefined ? undefined : side === "long" ? fvg.bounds.low : fvg.bounds.high;
    const liquidityTarget = entry === undefined || !retestCandle
      ? undefined
      : findLiquidityTarget(candles, side, entry, retestCandle.index);
    const target = liquidityTarget?.price;
    const rr = calculateRr(side, entry, stop, target);
    if (!liquidityTarget || target === undefined) {
      blockers.push("No next draw-on-liquidity target in IFVG direction.");
      missingConditions.push("liquidity_target");
    } else {
      presentConditions.push("liquidity_target");
    }
    if (rr === undefined || rr < 2) {
      blockers.push(`IFVG RR is below 2R (${rr?.toFixed(2) ?? "n/a"}R).`);
      missingConditions.push("minimum_2r");
    } else {
      presentConditions.push("minimum_2r");
    }

    candidates.push({
      side,
      originalFvgDirection: fvg.direction,
      originalFvg: fvg,
      inversionCandle,
      retestCandle,
      entry,
      stop,
      target,
      rr,
      liquidityTarget,
      htfAlignment: alignment,
      htfDirections: directions,
      blockers,
      warnings,
      presentConditions,
      missingConditions
    });
  }

  return candidates.sort((left, right) => {
    const leftReady = left.blockers.length === 0 ? 1 : 0;
    const rightReady = right.blockers.length === 0 ? 1 : 0;
    if (leftReady !== rightReady) return rightReady - leftReady;
    if (left.blockers.length !== right.blockers.length) return left.blockers.length - right.blockers.length;
    const leftIndex = left.retestCandle?.index ?? left.inversionCandle?.index ?? left.originalFvg.createdBy.index;
    const rightIndex = right.retestCandle?.index ?? right.inversionCandle?.index ?? right.originalFvg.createdBy.index;
    return rightIndex - leftIndex;
  })[0];
};

const statusForBlocker = (blocker: string | undefined): IctIfvgStatus => {
  if (!blocker) return "replay_required";
  if (/never fully inverted/i.test(blocker)) return "blocked_not_inverted";
  if (/already used/i.test(blocker)) return "blocked_reused_ifvg";
  if (/against available HTF/i.test(blocker)) return "blocked_against_htf";
  if (/low-volume/i.test(blocker)) return "blocked_low_volume";
  if (/retest/i.test(blocker)) return "blocked_no_retest";
  if (/RR|liquidity target/i.test(blocker)) return "blocked_rr";
  return "no_trade";
};

const buildCandidate = (input: {
  source: IctIfvgInput;
  generatedAt: string;
  status: IctIfvgStatus;
  latestCandleTimestamp?: string;
  internal?: InternalIfvgCandidate;
  blockers: string[];
  warnings?: string[];
  presentConditions?: string[];
  missingConditions?: string[];
  htfAlignment?: IctIfvgHtfAlignment;
  htfDirections?: string[];
}): IctIfvgCandidate => {
  const canCreateValidationChainEntry =
    input.status === "replay_required" &&
    input.blockers.length === 0 &&
    input.source.sourceProvider !== "mock" &&
    input.source.sourceProvider !== "sample";
  const sideText = input.internal?.side ?? "flat";
  const compactSummary = canCreateValidationChainEntry
    ? `IFVG ${sideText} replay-required on ${input.source.timeframe ?? "n/a"}; RR ${input.internal?.rr?.toFixed(2) ?? "n/a"}.`
    : `IFVG ${sideText} not tradable: ${input.blockers[0] ?? input.missingConditions?.[0] ?? "validation required"}.`;

  return {
    strategyId: "ifvg_v1",
    generatedAt: input.generatedAt,
    status: input.status,
    requestedSymbol: input.source.requestedSymbol,
    brokerSymbol: input.source.brokerSymbol,
    sourceProvider: input.source.sourceProvider,
    sourceFingerprint: input.source.sourceFingerprint,
    timeframe: input.source.timeframe ?? "5m",
    contextTimeframes: Object.entries(input.source.contextCandles ?? {})
      .filter(([, candles]) => candles?.length)
      .map(([timeframe]) => timeframe),
    latestCandleTimestamp: input.latestCandleTimestamp,
    side: input.internal?.side ?? "flat",
    originalFvgDirection: input.internal?.originalFvgDirection,
    ifvgBounds: input.internal?.originalFvg.bounds,
    originalFvgCandle: asReference(input.internal?.originalFvg.createdBy),
    inversionCandle: asReference(input.internal?.inversionCandle),
    retestCandle: asReference(input.internal?.retestCandle),
    sessionContext: input.internal?.retestCandle
      ? resolveSessionContext(input.internal.retestCandle)
      : input.internal?.inversionCandle
        ? resolveSessionContext(input.internal.inversionCandle)
        : undefined,
    entry: input.internal?.entry,
    stop: input.internal?.stop,
    target: input.internal?.target,
    rr: input.internal?.rr,
    htfAlignment: input.htfAlignment ?? input.internal?.htfAlignment ?? "unavailable",
    htfDirections: input.htfDirections ?? input.internal?.htfDirections ?? [],
    liquidityTarget: input.internal?.liquidityTarget,
    blockers: unique(input.blockers),
    warnings: unique(input.warnings ?? input.internal?.warnings ?? []),
    presentConditions: unique(input.presentConditions ?? input.internal?.presentConditions ?? []),
    missingConditions: unique(input.missingConditions ?? input.internal?.missingConditions ?? []),
    canCreateValidationChainEntry,
    validationChainSeed: canCreateValidationChainEntry
      ? {
          recognitionType: "full_model",
          setupLabel: "ifvg_v1",
          candidateFamily: "ifvg",
          requiredValidation: "Replay IFVG inversion/retest outcome before evidence or Paper-Demo progression."
        }
      : undefined,
    compactSummary,
    researchOnly: true,
    authority: authorityNone,
    safety: safetyCompact
  };
};

export const evaluateIctIfvg = (input: IctIfvgInput): IctIfvgCandidate => {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const normalized = normalizeCandles(input.candles);
  const latestCandleTimestamp = normalized.at(-1)?.timestamp;

  if (input.sourceProvider === "mock" || input.sourceProvider === "sample") {
    return buildCandidate({
      source: input,
      generatedAt,
      latestCandleTimestamp,
      status: "blocked_mock_source",
      blockers: ["Mock/sample source cannot create IFVG validation candidates."],
      missingConditions: ["non_mock_source"]
    });
  }

  if (input.timeframe && input.timeframe !== "5m" && input.timeframe !== "15m") {
    return buildCandidate({
      source: input,
      generatedAt,
      latestCandleTimestamp,
      status: "needs_more_data",
      blockers: ["IFVG v1 supports 5m or 15m only."],
      missingConditions: ["supported_timeframe"]
    });
  }

  if (normalized.length < 24) {
    return buildCandidate({
      source: input,
      generatedAt,
      latestCandleTimestamp,
      status: "needs_more_data",
      blockers: ["Insufficient candles for FVG, inversion, retest, target, and invalidation."],
      missingConditions: ["minimum_candles"]
    });
  }

  const internal = findInternalCandidate(normalized, input.contextCandles);
  if (!internal) {
    return buildCandidate({
      source: input,
      generatedAt,
      latestCandleTimestamp,
      status: "no_trade",
      blockers: ["No IFVG candidate found in the active scan window."],
      missingConditions: ["fair_value_gap", "full_inversion", "ifvg_retest"]
    });
  }

  const status = statusForBlocker(internal.blockers[0]);
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

export const ictIfvgCanQueueValidation = (candidate: IctIfvgCandidate) =>
  candidate.canCreateValidationChainEntry &&
  candidate.status === "replay_required" &&
  candidate.researchOnly === true &&
  candidate.authority.executionAuthority === "none" &&
  candidate.authority.brokerAuthority === "none" &&
  candidate.authority.readinessOverrideAuthority === "none";
