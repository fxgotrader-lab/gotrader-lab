import type { Candle } from "@/lib/types";
import { clockMinutesFor } from "@/lib/ict/openingPriceEquilibrium";
import type { SessionTimeMapping } from "@/lib/sessions";
import type {
  GrinchConsolidationProfileResult,
  GrinchExpectedExpansionDirection,
  GrinchInvalidationPlan,
  GrinchLiquidityRaidState,
  GrinchPhase1ModelOutput,
  GrinchTargetHierarchy,
  GrinchTwelveAmConsolidationRelationship
} from "@/lib/strategyLibrary/grinchStrategyTypes";

const minutes = (hour: number, minute = 0) => hour * 60 + minute;
const between = (value: number | undefined, start: number, end: number) =>
  typeof value === "number" && value >= start && value <= end;
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const levelLabel = (label: string, value?: number) => (typeof value === "number" ? `${label} ${value.toFixed(2)}` : `${label} unavailable`);
const toleranceFor = (price?: number) => (typeof price === "number" ? Math.max(0.01, Math.abs(price) * 0.0006) : 0.01);

const averageRange = (candles: Candle[]) =>
  candles.length ? candles.reduce((sum, candle) => sum + (candle.high - candle.low), 0) / candles.length : 0;

const rangeFor = (candles: Candle[]) => {
  if (!candles.length) {
    return {
      isTight: false
    };
  }
  const rangeHigh = round(Math.max(...candles.map((candle) => candle.high)));
  const rangeLow = round(Math.min(...candles.map((candle) => candle.low)));
  const rangeWidth = round(rangeHigh - rangeLow);
  const rangeMidpoint = round((rangeHigh + rangeLow) / 2);
  const avg = Math.max(averageRange(candles), rangeWidth * 0.1, 0.01);
  return {
    rangeHigh,
    rangeLow,
    rangeMidpoint,
    rangeWidth,
    isTight: rangeWidth <= avg * 5
  };
};

const relationshipToTwelveAm = ({
  consolidationCandles,
  nyCandles,
  phase1,
  rangeHigh,
  rangeLow
}: {
  consolidationCandles: Candle[];
  nyCandles: Candle[];
  phase1: GrinchPhase1ModelOutput;
  rangeHigh?: number;
  rangeLow?: number;
}): GrinchTwelveAmConsolidationRelationship => {
  const open = phase1.twelveAmOpenState.price;
  if (typeof open !== "number" || !consolidationCandles.length) {
    return "unclear";
  }
  const tolerance = toleranceFor(open);
  const around =
    typeof rangeHigh === "number" &&
    typeof rangeLow === "number" &&
    rangeLow <= open + tolerance &&
    rangeHigh >= open - tolerance;
  const latestNy = nyCandles[nyCandles.length - 1];
  const touchedNy = nyCandles.some((candle) => candle.low <= open + tolerance && candle.high >= open - tolerance);
  if (touchedNy && latestNy && latestNy.close > open + tolerance) {
    return "acting_as_support";
  }
  if (touchedNy && latestNy && latestNy.close < open - tolerance) {
    return "acting_as_resistance";
  }
  if (around) {
    return "around";
  }
  const above = consolidationCandles.every((candle) => candle.low > open + tolerance);
  const below = consolidationCandles.every((candle) => candle.high < open - tolerance);
  if (above) {
    return "above";
  }
  if (below) {
    return "below";
  }
  return "unclear";
};

const liquidityRaidStateFor = ({
  nyCandles,
  rangeHigh,
  rangeLow
}: {
  nyCandles: Candle[];
  rangeHigh?: number;
  rangeLow?: number;
}): GrinchLiquidityRaidState => {
  if (!nyCandles.length || typeof rangeHigh !== "number" || typeof rangeLow !== "number") {
    return "unclear";
  }
  const tolerance = Math.max(0.01, (rangeHigh - rangeLow) * 0.06);
  const buySideRaided = nyCandles.some((candle) => candle.high > rangeHigh + tolerance);
  const sellSideRaided = nyCandles.some((candle) => candle.low < rangeLow - tolerance);
  if (buySideRaided && sellSideRaided) {
    return "both";
  }
  if (buySideRaided) {
    return "buySideRaided";
  }
  if (sellSideRaided) {
    return "sellSideRaided";
  }
  return "none";
};

const displacementDirectionFor = (nyCandles: Candle[]): GrinchExpectedExpansionDirection => {
  if (nyCandles.length < 2) {
    return "unclear";
  }
  const avg = Math.max(averageRange(nyCandles), 0.01);
  const displacement = nyCandles.find((candle) => candle.high - candle.low >= avg * 1.25 && Math.abs(candle.close - candle.open) >= avg * 0.45);
  if (!displacement) {
    return "neutral";
  }
  return displacement.close > displacement.open ? "bullish" : "bearish";
};

const expectedExpansionFor = ({
  displacementDirection,
  phase1,
  raidState,
  relationship
}: {
  displacementDirection: GrinchExpectedExpansionDirection;
  phase1: GrinchPhase1ModelOutput;
  raidState: GrinchLiquidityRaidState;
  relationship: GrinchTwelveAmConsolidationRelationship;
}): GrinchExpectedExpansionDirection => {
  if (phase1.htfBias === "bullish") {
    if (raidState === "sellSideRaided" || relationship === "acting_as_support") {
      return "bullish";
    }
    return displacementDirection === "bullish" ? "bullish" : "neutral";
  }
  if (phase1.htfBias === "bearish") {
    if (raidState === "buySideRaided" || relationship === "acting_as_resistance") {
      return "bearish";
    }
    return displacementDirection === "bearish" ? "bearish" : "neutral";
  }
  return displacementDirection;
};

const targetHierarchyFor = ({
  direction,
  phase1,
  rangeHigh,
  rangeLow
}: {
  direction: GrinchExpectedExpansionDirection;
  phase1: GrinchPhase1ModelOutput;
  rangeHigh?: number;
  rangeLow?: number;
}): GrinchTargetHierarchy => {
  const nextPdArray = phase1.rankedPdArrays.find((array) => {
    if (direction === "bullish") {
      return typeof rangeHigh === "number" ? array.midpoint > rangeHigh : array.direction === "bullish";
    }
    if (direction === "bearish") {
      return typeof rangeLow === "number" ? array.midpoint < rangeLow : array.direction === "bearish";
    }
    return array.active;
  });
  return {
    target1:
      direction === "bearish"
        ? levelLabel("Consolidation low", rangeLow)
        : direction === "bullish"
          ? levelLabel("Consolidation high", rangeHigh)
          : levelLabel("12AM Open", phase1.twelveAmOpenState.price),
    target2: nextPdArray?.label ?? "Next valid PD array in expansion path",
    target3:
      direction === "bearish"
        ? "External sellside liquidity"
        : direction === "bullish"
          ? "External buyside liquidity"
          : "External liquidity objective unclear"
  };
};

const invalidationFor = ({
  direction,
  phase1,
  rangeHigh,
  rangeLow
}: {
  direction: GrinchExpectedExpansionDirection;
  phase1: GrinchPhase1ModelOutput;
  rangeHigh?: number;
  rangeLow?: number;
}): GrinchInvalidationPlan => ({
  primaryInvalidation:
    direction === "bullish"
      ? levelLabel("Close back below consolidation low", rangeLow)
      : direction === "bearish"
        ? levelLabel("Close back above consolidation high", rangeHigh)
        : "Material break from consolidation without displacement confirmation",
  secondaryInvalidation: levelLabel("12AM Open fails as support/resistance", phase1.twelveAmOpenState.price),
  timeInvalidation: phase1.invalidation.timeInvalidation,
  narrativeInvalidation:
    "Consolidation Profile invalidates if price is not held around 12AM Open into NY or expansion contradicts the established HTF bias."
});

export function detectConsolidationProfile({
  candles,
  phase1,
  sessionTimeMapping = phase1.sessionTimeMapping
}: {
  candles: Candle[];
  phase1: GrinchPhase1ModelOutput;
  sessionTimeMapping?: SessionTimeMapping;
}): GrinchConsolidationProfileResult {
  const reasons: string[] = [];
  const missingEvidence: string[] = [];
  const twelveAmOpen = phase1.twelveAmOpenState.price;
  const consolidationCandles = candles.filter((candle) => between(clockMinutesFor(candle.timestamp, sessionTimeMapping), minutes(2), minutes(9, 29)));
  const londonCandles = candles.filter((candle) => between(clockMinutesFor(candle.timestamp, sessionTimeMapping), minutes(2), minutes(3)));
  const nyCandles = candles.filter((candle) => between(clockMinutesFor(candle.timestamp, sessionTimeMapping), minutes(9, 30), minutes(10)));
  const confirmationCandles = candles.filter((candle) => between(clockMinutesFor(candle.timestamp, sessionTimeMapping), minutes(10), minutes(10, 15)));
  const consolidationRange = rangeFor(consolidationCandles.length ? consolidationCandles : londonCandles);
  const { rangeHigh, rangeLow, rangeMidpoint } = consolidationRange;
  const tolerance = toleranceFor(twelveAmOpen);
  const containsTwelveAm =
    typeof twelveAmOpen === "number" &&
    typeof rangeHigh === "number" &&
    typeof rangeLow === "number" &&
    rangeLow <= twelveAmOpen + tolerance &&
    rangeHigh >= twelveAmOpen - tolerance;
  const midpointNearTwelveAm =
    typeof twelveAmOpen === "number" &&
    typeof rangeMidpoint === "number" &&
    Math.abs(rangeMidpoint - twelveAmOpen) <= Math.max(tolerance * 2, (consolidationRange.rangeWidth ?? 0) * 0.35);
  const twelveAmRelationship = relationshipToTwelveAm({
    consolidationCandles,
    nyCandles: [...nyCandles, ...confirmationCandles],
    phase1,
    rangeHigh,
    rangeLow
  });
  const liquidityRaidState = liquidityRaidStateFor({ nyCandles, rangeHigh, rangeLow });
  const displacementDirection = displacementDirectionFor([...nyCandles, ...confirmationCandles]);
  const expectedExpansionDirection = expectedExpansionFor({
    displacementDirection,
    phase1,
    raidState: liquidityRaidState,
    relationship: twelveAmRelationship
  });
  const targetHierarchy = targetHierarchyFor({
    direction: expectedExpansionDirection,
    phase1,
    rangeHigh,
    rangeLow
  });
  const invalidation = invalidationFor({
    direction: expectedExpansionDirection,
    phase1,
    rangeHigh,
    rangeLow
  });

  if (typeof twelveAmOpen !== "number") {
    missingEvidence.push("12AM Open is required for Consolidation Profile classification.");
  }
  if (!londonCandles.length) {
    missingEvidence.push("London 2:00-3:00 candles are missing.");
  }
  if (!consolidationCandles.length) {
    missingEvidence.push("No 2:00-9:30 consolidation window is available.");
  }
  if (!nyCandles.length) {
    missingEvidence.push("NY 9:30-10:00 candles are missing, so raid/expansion cannot be judged.");
  }
  if (consolidationRange.isTight && containsTwelveAm) {
    reasons.push("Price was held in a tight range around 12AM Open into NY.");
  }
  if (midpointNearTwelveAm) {
    reasons.push("Consolidation midpoint is close to 12AM Open.");
  }
  if (liquidityRaidState !== "none" && liquidityRaidState !== "unclear") {
    reasons.push(`NY raided ${liquidityRaidState.replace(/([A-Z])/g, " $1").toLowerCase()} from the consolidation.`);
  }
  if (twelveAmRelationship === "acting_as_support" || twelveAmRelationship === "acting_as_resistance") {
    reasons.push(`12AM Open is ${twelveAmRelationship.replace(/_/g, " ")}.`);
  }
  if (expectedExpansionDirection === "bullish" || expectedExpansionDirection === "bearish") {
    reasons.push(`Expected expansion direction is ${expectedExpansionDirection} based on HTF bias, raid state, and 12AM reaction.`);
  }
  if (phase1.htfBias === "unclear" || phase1.htfBias === "neutral") {
    missingEvidence.push("Higher-timeframe bias is not established; Consolidation Profile direction should remain muted.");
  }

  const hasUsefulRaid = liquidityRaidState !== "none" && liquidityRaidState !== "unclear";
  const directionAligned =
    (expectedExpansionDirection === "bullish" && phase1.htfBias === "bullish") ||
    (expectedExpansionDirection === "bearish" && phase1.htfBias === "bearish");
  const cleanTiming = phase1.timingGrade === "ideal" || phase1.timingGrade === "acceptable";
  const valid =
    consolidationRange.isTight &&
    containsTwelveAm &&
    midpointNearTwelveAm &&
    cleanTiming &&
    directionAligned &&
    (hasUsefulRaid || twelveAmRelationship === "acting_as_support" || twelveAmRelationship === "acting_as_resistance");
  const weak =
    consolidationRange.isTight &&
    containsTwelveAm &&
    cleanTiming &&
    (hasUsefulRaid || expectedExpansionDirection === "bullish" || expectedExpansionDirection === "bearish");
  const invalid =
    phase1.timingGrade === "expired" ||
    (phase1.htfBias === "bullish" && expectedExpansionDirection === "bearish") ||
    (phase1.htfBias === "bearish" && expectedExpansionDirection === "bullish");
  const consolidationProfileState = valid ? "valid" : weak ? "weak" : invalid ? "invalid" : "not_present";
  const entryIntent =
    consolidationProfileState === "valid" && hasUsefulRaid
      ? "reversal_entry"
      : consolidationProfileState === "valid" && expectedExpansionDirection !== "neutral"
        ? "continuation_entry"
        : consolidationProfileState === "weak"
          ? "wait_for_confirmation"
          : "no_trade";
  const confidenceAdjustment = round(
    Math.max(
      -0.2,
      Math.min(
        0.85,
        (valid ? 0.38 : weak ? 0.16 : invalid ? -0.12 : 0) +
          (directionAligned ? 0.14 : 0) +
          (phase1.timingGrade === "ideal" ? 0.12 : phase1.timingGrade === "acceptable" ? 0.08 : phase1.timingGrade === "late" ? -0.08 : 0)
      )
    )
  );

  return {
    consolidationProfileState,
    consolidationRange,
    twelveAmRelationship,
    liquidityRaidState,
    expectedExpansionDirection,
    entryIntent,
    timingGrade: phase1.timingGrade,
    targetHierarchy,
    invalidation,
    confidenceAdjustment,
    reasons: Array.from(new Set(reasons)).slice(0, 12),
    missingEvidence: Array.from(new Set(missingEvidence)).slice(0, 12)
  };
}
