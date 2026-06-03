import { getTimingClockMinutes, resolveSessionTimestampParts, type SessionTimeMapping } from "@/lib/sessions";
import type { Candle, MarketBias } from "@/lib/types";
import type {
  GrinchOpeningPriceReference,
  GrinchPhase1ModelOutput,
  GrinchPhase2ReversalModelOutput
} from "@/lib/strategyLibrary/grinchStrategyTypes";

export type GrinchExpansionExpectedDirection = "up_away_from_12am" | "down_away_from_12am" | "unknown";
export type GrinchReplayCandleRole =
  | "london_interaction"
  | "london_window"
  | "expansion_window"
  | "expansion_extreme"
  | "failed_clean_side"
  | "failed_expansion";

export interface GrinchOpeningReplayReference {
  label: string;
  rawTimestamp: string;
  localTimestamp: string;
  localDate?: string;
  localTime?: string;
  price?: number;
  timingZone: string;
  sourceTimestampZone: string;
  fallbackMethod: string;
  missingEvidence: string[];
}

export interface GrinchReplayCandleDiagnostic {
  id: string;
  role: GrinchReplayCandleRole;
  rawTimestamp: string;
  localTimestamp: string;
  localTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  reason: string;
}

export interface GrinchExpansionReplayMarker {
  id: string;
  rawTimestamp: string;
  price?: number;
  label: string;
  markerType: "current" | "entry" | "invalidation" | "target";
  direction: MarketBias;
  reason: string;
}

export interface GrinchExpansionReplayDiagnostics {
  title: "Grinch Timing / Expansion Replay";
  generatedAt: string;
  timingDate: string;
  timingZone: string;
  sourceTimestampZone: string;
  sessionModel: string;
  sessionWarning: string;
  twelveAmOpen: GrinchOpeningReplayReference;
  sundayOpen: GrinchOpeningReplayReference;
  londonInteraction: {
    windowStartLocal: string;
    windowEndLocal: string;
    candleCount: number;
    interacted: boolean;
    relationTo12am: "above" | "below" | "around" | "unclear";
    londonHigh?: number;
    londonLow?: number;
    interactionTimestamps: string[];
  };
  expansionWindow: {
    windowStartLocal: string;
    windowEndLocal: string;
    evaluatedCandleCount: number;
    firstRawTimestamp?: string;
    firstLocalTimestamp?: string;
    lastRawTimestamp?: string;
    lastLocalTimestamp?: string;
  };
  expansionTest: {
    expectedDirection: GrinchExpansionExpectedDirection;
    expansionDistance: number;
    requiredExpansionDistance: number;
    distancePass: boolean;
    cleanSideMaintained: boolean;
    displacementScore: number;
    chopScore: number;
    failedRule: string;
    failureReason: string;
    timingStatus: string;
  };
  candidateCandles: GrinchReplayCandleDiagnostic[];
  nearMissScore: number;
  recommendation: string;
  overlayMarkers: GrinchExpansionReplayMarker[];
  overlaySummary: {
    horizontalTwelveAmOpenLine: boolean;
    horizontalSundayOpenLine: boolean;
    candidateMarkers: boolean;
    shadedLondonWindow: false;
    shadedExpansionWindow: false;
    note: string;
  };
  safetyNotice: "Diagnostic-only replay. No broker execution, no order placement, no readiness override, no threshold change.";
}

const minutes = (hour: number, minute = 0) => hour * 60 + minute;
const between = (value: number | undefined, start: number, end: number) =>
  typeof value === "number" && value >= start && value <= end;
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const toleranceFor = (price?: number) => (typeof price === "number" ? Math.max(0.01, Math.abs(price) * 0.0005) : 0.01);

const averageRange = (candles: Candle[]) =>
  candles.length ? candles.reduce((sum, candle) => sum + Math.max(0, candle.high - candle.low), 0) / candles.length : 0;

const relationToLevel = (candles: Candle[], level?: number) => {
  if (!candles.length || typeof level !== "number") {
    return "unclear" as const;
  }
  const tolerance = toleranceFor(level);
  const interacted = candles.some((candle) => candle.low <= level + tolerance && candle.high >= level - tolerance);
  if (interacted) {
    return "around" as const;
  }
  const above = candles.filter((candle) => candle.low > level + tolerance).length;
  const below = candles.filter((candle) => candle.high < level - tolerance).length;
  if (above === candles.length) {
    return "above" as const;
  }
  if (below === candles.length) {
    return "below" as const;
  }
  return "unclear" as const;
};

const localTimestampFor = (timestamp: string, sessionTimeMapping?: SessionTimeMapping) => {
  const parts = resolveSessionTimestampParts(timestamp, sessionTimeMapping);
  return {
    date: parts.localDate,
    label: parts.localTimestampLabel ?? timestamp,
    time: parts.localTime?.slice(0, 5) ?? "unknown"
  };
};

const openingReplayReference = (
  reference: GrinchOpeningPriceReference | undefined,
  label: string,
  sessionTimeMapping?: SessionTimeMapping
): GrinchOpeningReplayReference => {
  const localParts = reference?.timestamp ? localTimestampFor(reference.timestamp, sessionTimeMapping) : undefined;
  return {
    label: reference?.label ?? label,
    rawTimestamp: reference?.timestamp ?? "not found",
    localTimestamp: reference?.localTimestampLabel ?? localParts?.label ?? "not resolved",
    localDate: reference?.localDate ?? localParts?.date,
    localTime: reference?.localTime ?? localParts?.time,
    price: reference?.price,
    timingZone: reference?.timingZone ?? sessionTimeMapping?.timingZone ?? "literal_timestamp",
    sourceTimestampZone: reference?.sourceTimestampZone ?? sessionTimeMapping?.sourceTimestampZone ?? "unknown",
    fallbackMethod: (reference?.fallbackMethod ?? "not_found").replace(/_/g, " "),
    missingEvidence: reference?.missingEvidence ?? [`${label} was not found in the active candle window.`]
  };
};

const replayCandle = (
  candle: Candle,
  role: GrinchReplayCandleRole,
  reason: string,
  sessionTimeMapping?: SessionTimeMapping
): GrinchReplayCandleDiagnostic => {
  const localParts = localTimestampFor(candle.timestamp, sessionTimeMapping);
  return {
    id: `${role}_${candle.id}`,
    role,
    rawTimestamp: candle.timestamp,
    localTimestamp: localParts.label,
    localTime: localParts.time,
    open: round(candle.open),
    high: round(candle.high),
    low: round(candle.low),
    close: round(candle.close),
    reason
  };
};

const uniqueCandles = (candles: GrinchReplayCandleDiagnostic[]) => {
  const seen = new Set<string>();
  return candles.filter((candle) => {
    const key = `${candle.rawTimestamp}|${candle.role}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const sideForClose = (candle: Candle, level: number, tolerance: number) => {
  if (candle.close > level + tolerance) {
    return 1;
  }
  if (candle.close < level - tolerance) {
    return -1;
  }
  return 0;
};

const chopScoreFor = (candles: Candle[], level?: number) => {
  if (!candles.length || typeof level !== "number") {
    return 100;
  }
  const tolerance = toleranceFor(level);
  const touches = candles.filter((candle) => candle.low <= level + tolerance && candle.high >= level - tolerance).length;
  let flips = 0;
  let previousSide = sideForClose(candles[0], level, tolerance);
  for (const candle of candles.slice(1)) {
    const side = sideForClose(candle, level, tolerance);
    if (side !== 0 && previousSide !== 0 && side !== previousSide) {
      flips += 1;
    }
    if (side !== 0) {
      previousSide = side;
    }
  }
  return Math.round(clamp((touches / candles.length) * 65 + (flips / Math.max(1, candles.length - 1)) * 35));
};

const firstOrExtremeCandles = ({
  expectedDirection,
  expansionCandles,
  failedCleanSideCandles,
  londonCandles,
  touchedLondonCandles,
  sessionTimeMapping
}: {
  expectedDirection: GrinchExpansionExpectedDirection;
  expansionCandles: Candle[];
  failedCleanSideCandles: Candle[];
  londonCandles: Candle[];
  touchedLondonCandles: Candle[];
  sessionTimeMapping?: SessionTimeMapping;
}) => {
  const expansionExtreme =
    expectedDirection === "up_away_from_12am"
      ? expansionCandles.reduce<Candle | undefined>((best, candle) => (!best || candle.high > best.high ? candle : best), undefined)
      : expectedDirection === "down_away_from_12am"
        ? expansionCandles.reduce<Candle | undefined>((best, candle) => (!best || candle.low < best.low ? candle : best), undefined)
        : undefined;
  const firstExpansion = expansionCandles[0];
  const lastExpansion = expansionCandles[expansionCandles.length - 1];
  const londonSamples = touchedLondonCandles.length ? touchedLondonCandles : londonCandles.slice(0, 2);

  return uniqueCandles([
    ...londonSamples.slice(0, 6).map((candle) =>
      replayCandle(
        candle,
        touchedLondonCandles.includes(candle) ? "london_interaction" : "london_window",
        touchedLondonCandles.includes(candle) ? "Candle touched or straddled 12AM Open tolerance." : "London 2:00-3:00 candle used for relation check.",
        sessionTimeMapping
      )
    ),
    ...(firstExpansion ? [replayCandle(firstExpansion, "expansion_window", "First candle in the 03:00-09:29 expansion window.", sessionTimeMapping)] : []),
    ...(expansionExtreme
      ? [replayCandle(expansionExtreme, "expansion_extreme", "Best expansion extreme used to measure distance away from London range.", sessionTimeMapping)]
      : []),
    ...failedCleanSideCandles.slice(0, 6).map((candle) =>
      replayCandle(candle, "failed_clean_side", "Candle violated the clean-side requirement relative to 12AM Open.", sessionTimeMapping)
    ),
    ...(lastExpansion && lastExpansion !== firstExpansion
      ? [replayCandle(lastExpansion, "expansion_window", "Last candle in the evaluated expansion window.", sessionTimeMapping)]
      : [])
  ]).slice(0, 16);
};

export function buildGrinchExpansionReplayDiagnostics({
  candles,
  phase1,
  reversal,
  sessionTimeMapping = phase1?.sessionTimeMapping
}: {
  candles: Candle[];
  phase1?: GrinchPhase1ModelOutput;
  reversal?: GrinchPhase2ReversalModelOutput;
  sessionTimeMapping?: SessionTimeMapping;
}): GrinchExpansionReplayDiagnostics {
  const generatedAt = new Date().toISOString();
  const sortedCandles = candles.slice().sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const twelveAmOpen = phase1?.twelveAmOpenState.price;
  const twelveAmReference = openingReplayReference(phase1?.twelveAmOpenState, "12AM Open", sessionTimeMapping);
  const sundayReference = openingReplayReference(phase1?.sundayOpenState, "Sunday Open", sessionTimeMapping);
  const latestTimingDate = sortedCandles.length
    ? localTimestampFor(sortedCandles[sortedCandles.length - 1].timestamp, sessionTimeMapping).date
    : undefined;
  const timingDate = twelveAmReference.localDate ?? latestTimingDate ?? "unknown";
  const timingDateCandles =
    timingDate === "unknown"
      ? sortedCandles
      : sortedCandles.filter((candle) => localTimestampFor(candle.timestamp, sessionTimeMapping).date === timingDate);
  const londonCandles = timingDateCandles.filter((candle) => between(getTimingClockMinutes(candle.timestamp, sessionTimeMapping), minutes(2), minutes(3)));
  const expansionCandles = timingDateCandles.filter((candle) =>
    between(getTimingClockMinutes(candle.timestamp, sessionTimeMapping), minutes(3), minutes(9, 29))
  );
  const tolerance = toleranceFor(twelveAmOpen);
  const londonRelation = relationToLevel(londonCandles, twelveAmOpen);
  const touchedLondonCandles =
    typeof twelveAmOpen === "number"
      ? londonCandles.filter((candle) => candle.low <= twelveAmOpen + tolerance && candle.high >= twelveAmOpen - tolerance)
      : [];
  const londonHigh = londonCandles.length ? Math.max(...londonCandles.map((candle) => candle.high)) : undefined;
  const londonLow = londonCandles.length ? Math.min(...londonCandles.map((candle) => candle.low)) : undefined;
  const preNyHigh = expansionCandles.length ? Math.max(...expansionCandles.map((candle) => candle.high)) : undefined;
  const preNyLow = expansionCandles.length ? Math.min(...expansionCandles.map((candle) => candle.low)) : undefined;
  const averageExpansionRange = Math.max(averageRange([...londonCandles, ...expansionCandles]), tolerance * 2);
  const requiredExpansionDistance = round(averageExpansionRange * 0.6);
  const expectedDirection: GrinchExpansionExpectedDirection =
    londonRelation === "above" ? "up_away_from_12am" : londonRelation === "below" ? "down_away_from_12am" : "unknown";
  const expansionDistance =
    expectedDirection === "up_away_from_12am" && typeof preNyHigh === "number" && typeof londonHigh === "number"
      ? Math.max(0, preNyHigh - londonHigh)
      : expectedDirection === "down_away_from_12am" && typeof preNyLow === "number" && typeof londonLow === "number"
        ? Math.max(0, londonLow - preNyLow)
        : 0;
  const failedCleanSideCandles =
    typeof twelveAmOpen === "number" && expectedDirection === "up_away_from_12am"
      ? expansionCandles.filter((candle) => candle.low <= twelveAmOpen - tolerance)
      : typeof twelveAmOpen === "number" && expectedDirection === "down_away_from_12am"
        ? expansionCandles.filter((candle) => candle.high >= twelveAmOpen + tolerance)
        : [];
  const cleanSideMaintained = expectedDirection !== "unknown" && failedCleanSideCandles.length === 0;
  const distancePass = expansionDistance > requiredExpansionDistance;
  const displacementScore = requiredExpansionDistance > 0 ? Math.round(clamp((expansionDistance / requiredExpansionDistance) * 100)) : 0;
  const chopScore = chopScoreFor(expansionCandles, twelveAmOpen);
  const timingStatus = reversal?.timingGrade ?? phase1?.timingGrade ?? "unknown";
  const failedRule =
    typeof twelveAmOpen !== "number"
      ? "missing_12am_open"
      : !londonCandles.length
        ? "missing_london_window"
        : londonRelation === "around"
          ? "london_interacted_with_12am"
          : expectedDirection === "unknown"
            ? "unclear_london_relation"
            : expansionCandles.length < 2
              ? "too_few_expansion_candles"
              : !distancePass
                ? "insufficient_expansion_distance"
                : !cleanSideMaintained
                  ? "clean_side_violation"
                  : chopScore >= 55
                    ? "chop_around_12am"
                    : timingStatus === "expired"
                      ? "timing_expired"
                      : "passed_diagnostic_check";
  const failureReason =
    failedRule === "missing_12am_open"
      ? "12AM Open is unavailable, so Reversal expansion cannot be replayed."
      : failedRule === "missing_london_window"
        ? "London 2:00-3:00 candles are missing, so interaction and expansion context cannot be judged."
        : failedRule === "london_interacted_with_12am"
          ? "London interacted with 12AM Open; the current Reversal condition expects London to hold cleanly above or below before expanding away."
          : failedRule === "unclear_london_relation"
            ? "London did not hold entirely above or below 12AM Open, leaving the expected expansion direction unclear."
            : failedRule === "too_few_expansion_candles"
              ? "Fewer than two candles were available in the 03:00-09:29 expansion window."
              : failedRule === "insufficient_expansion_distance"
                ? `Expansion distance ${round(expansionDistance)} did not exceed required distance ${requiredExpansionDistance}.`
                : failedRule === "clean_side_violation"
                  ? "Expansion candles did not stay cleanly away from 12AM Open after London relation was established."
                  : failedRule === "chop_around_12am"
                    ? "Expansion window shows chop around 12AM Open, reducing the clean expansion quality."
                    : failedRule === "timing_expired"
                      ? "Expansion evidence is diagnostic-only because the current Grinch timing grade is expired."
                      : "Expansion criteria passed in replay diagnostics; production strategy gates still decide validity.";
  const relationScore = londonRelation === "above" || londonRelation === "below" ? 20 : londonRelation === "around" ? 8 : 0;
  const distanceScore = requiredExpansionDistance > 0 ? clamp((expansionDistance / requiredExpansionDistance) * 42) : 0;
  const cleanSideScore = cleanSideMaintained ? 18 : 0;
  const candleScore = expansionCandles.length >= 2 ? 8 : 0;
  const timingPenalty = timingStatus === "expired" ? 12 : 0;
  const chopPenalty = chopScore * 0.22;
  const nearMissScore = Math.round(clamp(relationScore + distanceScore + cleanSideScore + candleScore - timingPenalty - chopPenalty));
  const recommendation =
    timingStatus === "expired"
      ? "Keep the setup blocked. Use timing-window sensitivity only as research evidence, not as a production threshold change."
      : failedRule === "insufficient_expansion_distance" && displacementScore >= 70
        ? "Near-miss expansion: test reversal expansion confirmation variants in Auto Research before any threshold discussion."
        : failedRule === "chop_around_12am" || chopScore >= 45
          ? "Prioritize chop/structure diagnostics before testing looser expansion distance."
          : failedRule === "clean_side_violation"
            ? "Investigate whether failed clean-side candles are true invalidation or broker CFD session noise."
            : "Treat this as an invalid setup until research-only candidate validation proves otherwise.";
  const candidateCandles = firstOrExtremeCandles({
    expectedDirection,
    expansionCandles,
    failedCleanSideCandles,
    londonCandles,
    touchedLondonCandles,
    sessionTimeMapping
  });
  const firstExpansion = expansionCandles[0];
  const lastExpansion = expansionCandles[expansionCandles.length - 1];
  const expansionExtreme =
    expectedDirection === "up_away_from_12am"
      ? expansionCandles.reduce<Candle | undefined>((best, candle) => (!best || candle.high > best.high ? candle : best), undefined)
      : expectedDirection === "down_away_from_12am"
        ? expansionCandles.reduce<Candle | undefined>((best, candle) => (!best || candle.low < best.low ? candle : best), undefined)
        : undefined;
  const failureCandle = failedCleanSideCandles[0] ?? expansionExtreme ?? lastExpansion;
  const overlayMarkers: GrinchExpansionReplayMarker[] = [
    ...(phase1?.twelveAmOpenState.timestamp
      ? [
          {
            direction: "neutral" as const,
            id: "grinch-replay-12am-open",
            label: "12AM",
            markerType: "target" as const,
            price: phase1.twelveAmOpenState.price,
            rawTimestamp: phase1.twelveAmOpenState.timestamp,
            reason: "Resolved 12AM Open used by Grinch replay diagnostics."
          }
        ]
      : []),
    ...(phase1?.sundayOpenState.timestamp
      ? [
          {
            direction: "neutral" as const,
            id: "grinch-replay-sunday-open",
            label: "SUN",
            markerType: "target" as const,
            price: phase1.sundayOpenState.price,
            rawTimestamp: phase1.sundayOpenState.timestamp,
            reason: "Resolved Sunday Open used by Grinch replay diagnostics."
          }
        ]
      : []),
    ...candidateCandles
      .filter((candle) => candle.role === "london_interaction" || candle.role === "expansion_extreme")
      .slice(0, 8)
      .map((candle) => ({
        direction:
          candle.role === "expansion_extreme" && expectedDirection === "up_away_from_12am"
            ? ("bullish" as const)
            : candle.role === "expansion_extreme" && expectedDirection === "down_away_from_12am"
              ? ("bearish" as const)
              : ("neutral" as const),
        id: `grinch-replay-${candle.role}-${candle.rawTimestamp}`,
        label: candle.role === "london_interaction" ? "LON" : "EXP",
        markerType: candle.role === "expansion_extreme" ? ("entry" as const) : ("current" as const),
        price: candle.role === "expansion_extreme" && expectedDirection === "down_away_from_12am" ? candle.low : candle.high,
        rawTimestamp: candle.rawTimestamp,
        reason: candle.reason
      })),
    ...(failureCandle && failedRule !== "passed_diagnostic_check"
      ? [
          {
            direction: "neutral" as const,
            id: `grinch-replay-fail-${failureCandle.timestamp}`,
            label: "FAIL",
            markerType: "invalidation" as const,
            price: failureCandle.close,
            rawTimestamp: failureCandle.timestamp,
            reason: failureReason
          }
        ]
      : [])
  ];

  return {
    title: "Grinch Timing / Expansion Replay",
    generatedAt,
    timingDate,
    timingZone: sessionTimeMapping?.timingZone ?? "literal_timestamp",
    sourceTimestampZone: sessionTimeMapping?.sourceTimestampZone ?? "unknown",
    sessionModel: sessionTimeMapping?.sessionModel ?? "exchange_local_literal",
    sessionWarning: sessionTimeMapping?.warnings[0] ?? "No provider-specific session warning.",
    twelveAmOpen: twelveAmReference,
    sundayOpen: sundayReference,
    londonInteraction: {
      windowStartLocal: "02:00",
      windowEndLocal: "03:00",
      candleCount: londonCandles.length,
      interacted: touchedLondonCandles.length > 0,
      relationTo12am: londonRelation,
      londonHigh: typeof londonHigh === "number" ? round(londonHigh) : undefined,
      londonLow: typeof londonLow === "number" ? round(londonLow) : undefined,
      interactionTimestamps: touchedLondonCandles.map((candle) => localTimestampFor(candle.timestamp, sessionTimeMapping).label)
    },
    expansionWindow: {
      windowStartLocal: "03:00",
      windowEndLocal: "09:29",
      evaluatedCandleCount: expansionCandles.length,
      firstRawTimestamp: firstExpansion?.timestamp,
      firstLocalTimestamp: firstExpansion ? localTimestampFor(firstExpansion.timestamp, sessionTimeMapping).label : undefined,
      lastRawTimestamp: lastExpansion?.timestamp,
      lastLocalTimestamp: lastExpansion ? localTimestampFor(lastExpansion.timestamp, sessionTimeMapping).label : undefined
    },
    expansionTest: {
      expectedDirection,
      expansionDistance: round(expansionDistance),
      requiredExpansionDistance,
      distancePass,
      cleanSideMaintained,
      displacementScore,
      chopScore,
      failedRule,
      failureReason,
      timingStatus
    },
    candidateCandles,
    nearMissScore,
    recommendation,
    overlayMarkers,
    overlaySummary: {
      horizontalTwelveAmOpenLine: typeof twelveAmReference.price === "number",
      horizontalSundayOpenLine: typeof sundayReference.price === "number",
      candidateMarkers: overlayMarkers.length > 0,
      shadedLondonWindow: false,
      shadedExpansionWindow: false,
      note: "The chart renderer supports opening-price lines and point markers here; arbitrary shaded time windows are reported in the table but not drawn yet."
    },
    safetyNotice: "Diagnostic-only replay. No broker execution, no order placement, no readiness override, no threshold change."
  };
}
