import type { Candle } from "@/lib/types";
import { clockMinutesFor } from "@/lib/ict/openingPriceEquilibrium";
import type { GrinchInvalidationPlan, GrinchPhase1ModelOutput, GrinchReversalProfileResult } from "@/lib/strategyLibrary/grinchStrategyTypes";
import type { SessionTimeMapping } from "@/lib/sessions";

const minutes = (hour: number, minute = 0) => hour * 60 + minute;
const between = (value: number | undefined, start: number, end: number) =>
  typeof value === "number" && value >= start && value <= end;

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const levelLabel = (label: string, value?: number) => (typeof value === "number" ? `${label} ${value.toFixed(2)}` : `${label} unavailable`);

const toleranceFor = (price?: number) => (typeof price === "number" ? Math.max(0.01, Math.abs(price) * 0.0005) : 0.01);

const averageRange = (candles: Candle[]) =>
  candles.length ? candles.reduce((sum, candle) => sum + (candle.high - candle.low), 0) / candles.length : 0;

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

const expansionAwayFromTwelveAm = ({
  candles,
  londonCandles,
  relation,
  twelveAmOpen,
  sessionTimeMapping
}: {
  candles: Candle[];
  londonCandles: Candle[];
  relation: ReturnType<typeof relationToLevel>;
  twelveAmOpen?: number;
  sessionTimeMapping?: SessionTimeMapping;
}) => {
  if (!londonCandles.length || typeof twelveAmOpen !== "number" || (relation !== "above" && relation !== "below")) {
    return false;
  }
  const preNy = candles.filter((candle) => between(clockMinutesFor(candle.timestamp, sessionTimeMapping), minutes(3), minutes(9, 29)));
  if (preNy.length < 2) {
    return false;
  }
  const tolerance = toleranceFor(twelveAmOpen);
  const avgRange = Math.max(averageRange([...londonCandles, ...preNy]), tolerance * 2);
  const londonHigh = Math.max(...londonCandles.map((candle) => candle.high));
  const londonLow = Math.min(...londonCandles.map((candle) => candle.low));
  const preNyHigh = Math.max(...preNy.map((candle) => candle.high));
  const preNyLow = Math.min(...preNy.map((candle) => candle.low));

  if (relation === "above") {
    return preNyHigh > londonHigh + avgRange * 0.6 && preNy.every((candle) => candle.low > twelveAmOpen - tolerance);
  }
  return preNyLow < londonLow - avgRange * 0.6 && preNy.every((candle) => candle.high < twelveAmOpen + tolerance);
};

const targetReachedAndContinuation = ({
  candles,
  relation,
  phase1,
  twelveAmOpen,
  sessionTimeMapping
}: {
  candles: Candle[];
  relation: ReturnType<typeof relationToLevel>;
  phase1: GrinchPhase1ModelOutput;
  twelveAmOpen?: number;
  sessionTimeMapping?: SessionTimeMapping;
}): GrinchReversalProfileResult["continuationBeyond12am"] => {
  if (typeof twelveAmOpen !== "number" || (relation !== "above" && relation !== "below")) {
    return "unclear";
  }
  const tolerance = toleranceFor(twelveAmOpen);
  const nyAndLater = candles.filter((candle) => between(clockMinutesFor(candle.timestamp, sessionTimeMapping), minutes(9, 30), minutes(16)));
  const touched = nyAndLater.some((candle) => candle.low <= twelveAmOpen + tolerance && candle.high >= twelveAmOpen - tolerance);
  if (!touched) {
    return "unclear";
  }
  const avgRange = Math.max(averageRange(nyAndLater), tolerance * 2);
  const reclaimCandle = nyAndLater.find((candle) => {
    const expanded = candle.high - candle.low >= avgRange * 1.25;
    if (relation === "below") {
      return candle.close > twelveAmOpen + tolerance && expanded;
    }
    return candle.close < twelveAmOpen - tolerance && expanded;
  });
  const htfSupports =
    relation === "below"
      ? phase1.htfDrawOnLiquidity === "buyside" || phase1.htfBias === "bullish"
      : phase1.htfDrawOnLiquidity === "sellside" || phase1.htfBias === "bearish";
  const targetBeyond12Am = phase1.rankedPdArrays.some((array) => {
    if (array.type === "twelve_am_open") {
      return false;
    }
    return relation === "below" ? array.midpoint > twelveAmOpen + tolerance : array.midpoint < twelveAmOpen - tolerance;
  });

  if (reclaimCandle && htfSupports && targetBeyond12Am) {
    return "supported";
  }

  const latest = nyAndLater[nyAndLater.length - 1];
  const rejected =
    latest &&
    (relation === "below"
      ? latest.close < twelveAmOpen - tolerance && nyAndLater.some((candle) => candle.high >= twelveAmOpen - tolerance)
      : latest.close > twelveAmOpen + tolerance && nyAndLater.some((candle) => candle.low <= twelveAmOpen + tolerance));
  return rejected ? "rejected" : "weak";
};

const nyReversalWindowFor = (phase1: GrinchPhase1ModelOutput, expandedAway: boolean): GrinchReversalProfileResult["nyReversalWindow"] => {
  if (phase1.timingGrade === "expired") {
    return "expired";
  }
  if (phase1.timingGrade === "early") {
    return "expected";
  }
  if (!expandedAway) {
    return phase1.timingGrade === "late" ? "missed" : "expected";
  }
  if (phase1.timingGrade === "late") {
    return "missed";
  }
  return "active";
};

const invalidationFor = ({
  candles,
  relation,
  phase1,
  twelveAmOpen,
  sessionTimeMapping
}: {
  candles: Candle[];
  relation: ReturnType<typeof relationToLevel>;
  phase1: GrinchPhase1ModelOutput;
  twelveAmOpen?: number;
  sessionTimeMapping?: SessionTimeMapping;
}): GrinchInvalidationPlan => {
  const nyAndLater = candles.filter((candle) => between(clockMinutesFor(candle.timestamp, sessionTimeMapping), minutes(9, 30), minutes(16)));
  const nyHigh = nyAndLater.length ? Math.max(...nyAndLater.map((candle) => candle.high)) : undefined;
  const nyLow = nyAndLater.length ? Math.min(...nyAndLater.map((candle) => candle.low)) : undefined;
  return {
    primaryInvalidation:
      relation === "below"
        ? levelLabel("Close below NY reversal low", nyLow)
        : relation === "above"
          ? levelLabel("Close above NY reversal high", nyHigh)
          : "Material continuation away from 12AM Open without reversal response",
    secondaryInvalidation: `Strong rejection from ${levelLabel("12AM Open", twelveAmOpen)} without reclaim/displacement.`,
    timeInvalidation: phase1.invalidation.timeInvalidation,
    narrativeInvalidation: "Reversal profile invalidates if London meaningfully interacts with 12AM Open or NY fails to rotate back toward it."
  };
};

export function detectReversalProfile({
  candles,
  phase1,
  sessionTimeMapping = phase1.sessionTimeMapping
}: {
  candles: Candle[];
  phase1: GrinchPhase1ModelOutput;
  sessionTimeMapping?: SessionTimeMapping;
}): GrinchReversalProfileResult {
  const reasons: string[] = [];
  const missingEvidence: string[] = [];
  const twelveAmOpen = phase1.twelveAmOpenState.price;
  const londonCandles = candles.filter((candle) => between(clockMinutesFor(candle.timestamp, sessionTimeMapping), minutes(2), minutes(3)));
  const londonRelation = relationToLevel(londonCandles, twelveAmOpen);
  const twelveAmInteractionState =
    londonRelation === "around" ? "interacted" : londonRelation === "above" || londonRelation === "below" ? "failed_to_interact" : "unclear";
  const expandedAway = expansionAwayFromTwelveAm({
    candles,
    londonCandles,
    relation: londonRelation,
    twelveAmOpen,
    sessionTimeMapping
  });
  const londonBehavior =
    expandedAway
      ? "expanded_away"
      : londonRelation === "above"
        ? "above_12am"
        : londonRelation === "below"
          ? "below_12am"
          : londonRelation === "around"
            ? "around_12am"
            : "unclear";
  const reversalBias = londonRelation === "below" ? "bullish" : londonRelation === "above" ? "bearish" : "unclear";
  const nyReversalWindow = nyReversalWindowFor(phase1, expandedAway);
  const continuationBeyond12am = targetReachedAndContinuation({
    candles,
    relation: londonRelation,
    phase1,
    twelveAmOpen,
    sessionTimeMapping
  });
  const invalidation = invalidationFor({ candles, relation: londonRelation, phase1, twelveAmOpen, sessionTimeMapping });

  if (typeof twelveAmOpen !== "number") {
    missingEvidence.push("12AM Open is required for Reversal Profile classification.");
  }
  if (!londonCandles.length) {
    missingEvidence.push("London 2:00-3:00 candles are missing, so 12AM interaction cannot be judged.");
  }
  if (twelveAmInteractionState === "interacted") {
    reasons.push("London interacted with 12AM Open; this is not the clean Reversal Profile condition.");
  }
  if (twelveAmInteractionState === "failed_to_interact") {
    reasons.push(`London failed to interact with 12AM Open and held ${londonRelation} the level.`);
  }
  if (expandedAway) {
    reasons.push("Price expanded away from 12AM Open into the NY approach.");
  } else {
    missingEvidence.push("No clean expansion away from 12AM Open into NY was detected.");
  }
  reasons.push(`First Reversal Profile target is ${levelLabel("12AM Open", twelveAmOpen)}.`);
  if (continuationBeyond12am === "supported") {
    reasons.push("Continuation beyond 12AM is supported by HTF draw, displacement/reclaim, and a target beyond the open.");
  }
  if (continuationBeyond12am === "rejected") {
    missingEvidence.push("Price reached 12AM Open and rejected; continuation beyond 12AM is weaker.");
  }

  const cleanWindow = nyReversalWindow === "active" || nyReversalWindow === "expected";
  const valid = twelveAmInteractionState === "failed_to_interact" && expandedAway && cleanWindow && continuationBeyond12am !== "rejected";
  const weak =
    twelveAmInteractionState === "failed_to_interact" &&
    (expandedAway || nyReversalWindow === "missed" || continuationBeyond12am === "weak");
  const invalid =
    twelveAmInteractionState === "interacted" ||
    phase1.timingGrade === "expired" ||
    (twelveAmInteractionState === "failed_to_interact" && continuationBeyond12am === "rejected");
  const reversalProfileState = valid ? "valid" : weak ? "weak" : invalid ? "invalid" : "not_present";
  const entryIntent =
    reversalProfileState === "valid" && nyReversalWindow === "active"
      ? "reversal_entry"
      : reversalProfileState === "valid" || reversalProfileState === "weak"
        ? "wait_for_confirmation"
        : "no_trade";
  const confidenceAdjustment = round(
    Math.max(
      -0.2,
      Math.min(
        0.85,
        (valid ? 0.42 : weak ? 0.18 : invalid ? -0.12 : 0) +
          (phase1.timingGrade === "ideal" ? 0.16 : phase1.timingGrade === "acceptable" ? 0.1 : phase1.timingGrade === "late" ? -0.08 : 0) +
          (continuationBeyond12am === "supported" ? 0.12 : continuationBeyond12am === "rejected" ? -0.16 : 0)
      )
    )
  );

  return {
    reversalProfileState,
    twelveAmInteractionState,
    londonBehavior,
    reversalBias,
    nyReversalWindow,
    firstTarget: "12am_open",
    firstTargetPrice: twelveAmOpen,
    continuationBeyond12am,
    timingGrade: phase1.timingGrade,
    entryIntent,
    confidenceAdjustment,
    invalidation,
    reasons: Array.from(new Set(reasons)).slice(0, 12),
    missingEvidence: Array.from(new Set(missingEvidence)).slice(0, 12)
  };
}
