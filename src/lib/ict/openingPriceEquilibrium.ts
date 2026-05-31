import type { Candle } from "@/lib/types";
import type { GrinchOpeningPriceReference } from "@/lib/strategyLibrary/grinchStrategyTypes";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export const clockMinutesFor = (timestamp: string) => {
  const match = /(?:T|\s)(\d{2}):(\d{2})/.exec(timestamp);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
};

const dateKeyFor = (timestamp: string) => timestamp.slice(0, 10);

const dayOfWeekFor = (timestamp: string) => {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return new Date(parsed).getDay();
};

const relationTo = (price: number | undefined, current: number | undefined): GrinchOpeningPriceReference["currentRelation"] => {
  if (typeof price !== "number" || typeof current !== "number" || !Number.isFinite(price) || !Number.isFinite(current)) {
    return "unknown";
  }
  const tolerance = Math.max(0.01, Math.abs(price) * 0.0005);
  if (Math.abs(current - price) <= tolerance) {
    return "at";
  }
  return current > price ? "above" : "below";
};

const gapDirectionFor = (
  openPrice: number | undefined,
  previousClose: number | undefined
): GrinchOpeningPriceReference["openingGapDirection"] => {
  if (
    typeof openPrice !== "number" ||
    typeof previousClose !== "number" ||
    !Number.isFinite(openPrice) ||
    !Number.isFinite(previousClose)
  ) {
    return "unknown";
  }
  const tolerance = Math.max(0.01, Math.abs(openPrice) * 0.0005);
  if (Math.abs(openPrice - previousClose) <= tolerance) {
    return "flat";
  }
  return openPrice > previousClose ? "gap_up" : "gap_down";
};

const touchedAfter = (candles: Candle[], openIndex: number, price: number) =>
  candles.slice(openIndex + 1).some((candle) => candle.low <= price && candle.high >= price);

const reclaimedAfter = (candles: Candle[], openIndex: number, price: number) => {
  const after = candles.slice(openIndex + 1);
  if (after.length < 2) {
    return false;
  }
  const crossed = after.findIndex((candle) => candle.low <= price && candle.high >= price);
  return crossed >= 0 && after.slice(crossed + 1).some((candle) => Math.sign(candle.close - price) !== Math.sign(after[crossed].close - price));
};

const sensitivityFor = (candles: Candle[], price: number | undefined) => {
  if (typeof price !== "number") {
    return 0;
  }
  const touches = candles.filter((candle) => candle.low <= price && candle.high >= price).length;
  return Math.min(1, round(touches / Math.max(3, candles.length * 0.08), 2));
};

const buildMissingState = (type: GrinchOpeningPriceReference["type"], label: string, missingEvidence: string[]): GrinchOpeningPriceReference => ({
  type,
  label,
  openingGapDirection: "unknown",
  currentRelation: "unknown",
  touchedAfterOpen: false,
  reclaimed: false,
  sensitivityScore: 0,
  expectation: `${label} is unavailable in the active candle window.`,
  missingEvidence
});

const firstCandleAtOrAfterMidnight = (candles: Candle[], dateKey: string) =>
  candles.find((candle) => dateKeyFor(candle.timestamp) === dateKey && (clockMinutesFor(candle.timestamp) ?? 0) <= 15) ??
  candles.find((candle) => dateKeyFor(candle.timestamp) === dateKey);

export function findTwelveAmOpenState(candles: Candle[]): GrinchOpeningPriceReference {
  const latest = candles[candles.length - 1];
  if (!latest) {
    return buildMissingState("twelve_am_open", "12AM Open", ["No candles available to locate 12AM Open."]);
  }

  const latestDate = dateKeyFor(latest.timestamp);
  const openCandle = [...candles].reverse().find((candle) => clockMinutesFor(candle.timestamp) === 0) ?? firstCandleAtOrAfterMidnight(candles, latestDate);
  if (!openCandle) {
    return buildMissingState("twelve_am_open", "12AM Open", ["Active window does not include a daily 12AM reference."]);
  }

  const openIndex = candles.findIndex((candle) => candle.id === openCandle.id);
  const price = openCandle.open;
  const touched = touchedAfter(candles, openIndex, price);
  const relation = relationTo(price, latest.close);
  return {
    type: "twelve_am_open",
    label: "12AM Open",
    price,
    timestamp: openCandle.timestamp,
    openingGapDirection: "unknown",
    currentRelation: relation,
    touchedAfterOpen: touched,
    reclaimed: reclaimedAfter(candles, openIndex, price),
    sensitivityScore: sensitivityFor(candles.slice(openIndex), price),
    expectation:
      relation === "below"
        ? "Price is below daily equilibrium; a bullish NY reversal first targets 12AM Open."
        : relation === "above"
          ? "Price is above daily equilibrium; 12AM Open can act as support or retracement magnet."
          : "Price is sensitive to daily equilibrium.",
    missingEvidence: []
  };
}

export function findSundayOpenState(candles: Candle[]): GrinchOpeningPriceReference {
  const latest = candles[candles.length - 1];
  if (!latest) {
    return buildMissingState("sunday_open", "Sunday Open", ["No candles available to locate Sunday Open."]);
  }

  const sundayCandles = candles.filter((candle) => dayOfWeekFor(candle.timestamp) === 0);
  const latestSundayDate = sundayCandles.length ? dateKeyFor(sundayCandles[sundayCandles.length - 1].timestamp) : undefined;
  const weeklyOpen = latestSundayDate ? sundayCandles.find((candle) => dateKeyFor(candle.timestamp) === latestSundayDate) : undefined;

  if (!weeklyOpen) {
    return buildMissingState("sunday_open", "Sunday Open", ["Active window does not include a Sunday weekly open reference."]);
  }

  const openIndex = candles.findIndex((candle) => candle.id === weeklyOpen.id);
  const price = weeklyOpen.open;
  const relation = relationTo(price, latest.close);
  const firstSessionCandles = candles.slice(openIndex + 1, Math.min(candles.length, openIndex + 24));
  const movedHigherFirst = firstSessionCandles.length > 0 && firstSessionCandles.every((candle) => candle.low >= price);
  const movedLowerFirst = firstSessionCandles.length > 0 && firstSessionCandles.every((candle) => candle.high <= price);
  const previousCandle = candles[openIndex - 1];
  const openingGapDirection = gapDirectionFor(price, previousCandle?.close);
  const expectation =
    openingGapDirection === "gap_up"
      ? movedHigherFirst && relation === "above"
        ? "Sunday gapped up and delivered higher without first trading lower; expect sensitivity back to or below Sunday Open during the week."
        : "Sunday gap up prices bullishness early; bullish continuation wants discount accumulation at or below Sunday Open first, while bearish context can use premium above Sunday Open."
      : openingGapDirection === "gap_down"
        ? movedLowerFirst && relation === "below"
          ? "Sunday gapped down and delivered lower without first trading higher; expect sensitivity back to or above Sunday Open during the week."
          : "Sunday gap down prices bearishness early; bearish continuation should not be chased below Sunday Open and wants a premium return above it first."
        : "Sunday Open is the weekly equilibrium reference on 1H and lower.";

  return {
    type: "sunday_open",
    label: "Sunday Open",
    price,
    timestamp: weeklyOpen.timestamp,
    openingGapDirection,
    gapReferenceClose: previousCandle?.close,
    currentRelation: relation,
    touchedAfterOpen: touchedAfter(candles, openIndex, price),
    reclaimed: reclaimedAfter(candles, openIndex, price),
    sensitivityScore: sensitivityFor(candles.slice(openIndex), price),
    expectation,
    missingEvidence: []
  };
}
