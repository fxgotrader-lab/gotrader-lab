import type { Candle } from "@/lib/types";
import type {
  GrinchDealingRange,
  GrinchModelOnePowerThreeResult,
  GrinchOpeningPriceReference,
  GrinchPdArray,
  GrinchTimePriceAlignment
} from "@/lib/strategyLibrary/grinchStrategyTypes";
import { clockMinutesFor } from "@/lib/ict/openingPriceEquilibrium";
import { resolveDealingRange } from "@/lib/ict/dealingRangePremiumDiscount";

const minutes = (hour: number, minute = 0) => hour * 60 + minute;
const between = (value: number | undefined, start: number, end: number) =>
  typeof value === "number" && value >= start && value <= end;

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

const relationToLevel = (candles: Candle[], level?: number) => {
  if (typeof level !== "number" || !candles.length) {
    return "missing" as const;
  }
  const above = candles.filter((candle) => candle.close > level).length;
  const below = candles.filter((candle) => candle.close < level).length;
  const around = candles.some((candle) => candle.low <= level && candle.high >= level);
  if (around && Math.abs(above - below) <= Math.max(1, candles.length * 0.25)) {
    return "around" as const;
  }
  return above > below ? ("above" as const) : ("below" as const);
};

const displacementAfter = (candles: Candle[], startMinute: number, endMinute: number) => {
  const after = candles.filter((candle) => {
    const clock = clockMinutesFor(candle.timestamp);
    return typeof clock === "number" && clock > startMinute && clock <= endMinute;
  });
  if (after.length < 3) {
    return undefined;
  }
  const ranges = after.slice(0, -1).map((candle) => candle.high - candle.low);
  const avg = ranges.reduce((sum, value) => sum + value, 0) / Math.max(1, ranges.length);
  return after.find((candle) => candle.high - candle.low >= avg * 1.45 && Math.abs(candle.close - candle.open) >= avg * 0.6);
};

const touchedPdArray = (arrays: GrinchPdArray[]) => arrays.find((array) => array.respected || array.active);

export function detectModelOnePowerThree({
  candles,
  dealingRange,
  pdArrays,
  timePriceAlignment,
  twelveAmOpenState
}: {
  candles: Candle[];
  dealingRange: GrinchDealingRange;
  pdArrays: GrinchPdArray[];
  timePriceAlignment: GrinchTimePriceAlignment;
  twelveAmOpenState: GrinchOpeningPriceReference;
}): GrinchModelOnePowerThreeResult {
  const reasons: string[] = [];
  const missingEvidence: string[] = [];
  const level = twelveAmOpenState.price;
  const londonCandles = candles.filter((candle) => between(clockMinutesFor(candle.timestamp), minutes(2), minutes(3)));
  const nySetupCandles = candles.filter((candle) => between(clockMinutesFor(candle.timestamp), minutes(9, 30), minutes(10)));
  const londonRelationToTwelveAm = relationToLevel(londonCandles, level);
  const displacementCandle = displacementAfter(candles, minutes(3), minutes(9, 30));
  const activeArray = touchedPdArray(pdArrays);

  if (typeof level !== "number") {
    missingEvidence.push("12AM Open is required to anchor Model 1 daily equilibrium.");
  }
  if (!londonCandles.length) {
    missingEvidence.push("London 2:00-3:00 observation candles are missing.");
  } else {
    reasons.push(`London traded ${londonRelationToTwelveAm} 12AM Open.`);
  }
  if (!displacementCandle) {
    missingEvidence.push("No clear displacement away from the London accumulation window before NY.");
  } else {
    reasons.push(`Displacement candle detected at ${displacementCandle.timestamp}.`);
  }
  if (!activeArray) {
    missingEvidence.push("No active or respected PD array confirms continuation/retracement entry.");
  } else {
    reasons.push(`${activeArray.label} is active/respected in the delivery path.`);
  }

  const londonHigh = londonCandles.length ? Math.max(...londonCandles.map((candle) => candle.high)) : undefined;
  const londonLow = londonCandles.length ? Math.min(...londonCandles.map((candle) => candle.low)) : undefined;
  const displacementDirection = displacementCandle
    ? displacementCandle.close > displacementCandle.open
      ? "higher"
      : "lower"
    : undefined;
  const postNyCandles = candles.filter((candle) => {
    const clock = clockMinutesFor(candle.timestamp);
    return typeof clock === "number" && clock >= minutes(9, 30);
  });
  const protectedHighViolated =
    londonRelationToTwelveAm === "above" &&
    displacementDirection === "lower" &&
    typeof londonHigh === "number" &&
    postNyCandles.some((candle) => candle.high > londonHigh);
  const protectedLowViolated =
    londonRelationToTwelveAm === "below" &&
    displacementDirection === "higher" &&
    typeof londonLow === "number" &&
    postNyCandles.some((candle) => candle.low < londonLow);
  const protectedExtremeViolated = protectedHighViolated || protectedLowViolated;

  if (protectedHighViolated) {
    missingEvidence.push("London high was not protected after accumulation above 12AM Open and bearish displacement.");
  }
  if (protectedLowViolated) {
    missingEvidence.push("London low was not protected after accumulation below 12AM Open and bullish displacement.");
  }

  const accumulationExtreme =
    londonRelationToTwelveAm === "below" ? londonLow : londonRelationToTwelveAm === "above" ? londonHigh : undefined;
  const displacementExtreme = displacementCandle
    ? displacementCandle.close > displacementCandle.open
      ? displacementCandle.high
      : displacementCandle.low
    : undefined;
  const syntheticRangeCandles =
    typeof accumulationExtreme === "number" && typeof displacementExtreme === "number"
      ? [
          {
            ...candles[0],
            id: "grinch-model-one-a",
            high: Math.max(accumulationExtreme, displacementExtreme),
            low: Math.min(accumulationExtreme, displacementExtreme),
            open: accumulationExtreme,
            close: displacementExtreme
          },
          {
            ...candles[candles.length - 1],
            id: "grinch-model-one-b",
            high: Math.max(accumulationExtreme, displacementExtreme),
            low: Math.min(accumulationExtreme, displacementExtreme),
            open: accumulationExtreme,
            close: displacementExtreme
          }
        ]
      : [];
  const abRange = syntheticRangeCandles.length ? resolveDealingRange(syntheticRangeCandles, [], 2) : undefined;
  const nyRetraced =
    typeof abRange?.equilibrium === "number" &&
    nySetupCandles.some((candle) => candle.low <= abRange.equilibrium && candle.high >= abRange.equilibrium);

  if (nyRetraced) {
    reasons.push(`NY setup window retraced into A-B equilibrium near ${round(abRange!.equilibrium)}.`);
  }
  if (timePriceAlignment.currentWindow === "ny_setup") {
    reasons.push(
      "9:30-10:00 is treated as retracement/observation unless a target-met reversal appears in the first five minutes; 10:00-10:15 confirmation is preferred."
    );
  }

  const accumulationIdentified = londonRelationToTwelveAm !== "missing" && londonRelationToTwelveAm !== "around";
  const displacementIdentified = Boolean(displacementCandle);
  const continuationContext =
    activeArray?.respected &&
    displacementIdentified &&
    (timePriceAlignment.currentWindow === "ny_confirmation" || timePriceAlignment.currentWindow === "delayed_profile");
  const retracementContext = nyRetraced || timePriceAlignment.currentWindow === "ny_setup";

  if (accumulationIdentified && displacementIdentified && activeArray?.respected && retracementContext && !protectedExtremeViolated) {
    return {
      modelOneState: "valid",
      tradeIntent: continuationContext ? "continuation_entry" : "retracement_entry",
      londonRelationToTwelveAm,
      accumulationIdentified,
      displacementIdentified,
      accumulationExtreme,
      displacementExtreme,
      abRange,
      reasons,
      missingEvidence
    };
  }

  if (accumulationIdentified || displacementIdentified || activeArray) {
    return {
      modelOneState: "weak",
      tradeIntent: retracementContext ? "retracement_entry" : "no_trade",
      londonRelationToTwelveAm,
      accumulationIdentified,
      displacementIdentified,
      accumulationExtreme,
      displacementExtreme,
      abRange: abRange ?? dealingRange,
      reasons,
      missingEvidence
    };
  }

  return {
    modelOneState: missingEvidence.length ? "not_present" : "invalid",
    tradeIntent: "no_trade",
    londonRelationToTwelveAm,
    accumulationIdentified,
    displacementIdentified,
    accumulationExtreme,
    displacementExtreme,
    reasons: reasons.length ? reasons : ["Model 1 / Power 3 OTE profile is not present in the active window."],
    missingEvidence
  };
}
