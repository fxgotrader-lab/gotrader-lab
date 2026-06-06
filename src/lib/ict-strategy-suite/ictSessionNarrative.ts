import type { Candle } from "../types";
import { normalizeCandles } from "./ictStrategySuiteHelpers";
import type {
  IctDataDepthStatus,
  IctKillzoneName,
  IctMitigationContext,
  IctSessionFvgTarget,
  IctSessionDirectionalRead,
  IctSessionNarrative,
  IctSessionNarrativeDataDepth,
  IctSessionNarrativeEvent,
  IctSessionNarrativeOptions,
  IctSessionNarrativeProfile,
  IctSessionRange
} from "./ictSessionNarrativeTypes";

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safety = {
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

const DEFAULT_TIMING_ZONE = "America/New_York";
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (timeZone: string) => {
  const existing = formatterCache.get(timeZone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    weekday: "short",
    year: "numeric"
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
};

const localParts = (timestamp: string, timeZone = DEFAULT_TIMING_ZONE) => {
  const parts = formatterFor(timeZone).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour")) % 24;
  const minute = Number(value("minute"));
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour,
    minute,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    weekday: value("weekday")
  };
};

const addCalendarDay = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
};

export const tradingDateFor = (timestamp: string, timeZone = DEFAULT_TIMING_ZONE) => {
  const parts = localParts(timestamp, timeZone);
  return parts.hour >= 20 ? addCalendarDay(parts.date) : parts.date;
};

export const classifyIctKillzone = (timestamp: string, timeZone = DEFAULT_TIMING_ZONE): IctKillzoneName => {
  const { hour, minute } = localParts(timestamp, timeZone);
  const minutes = hour * 60 + minute;
  if (minutes >= 20 * 60 || minutes < 1) return "asia";
  if (minutes >= 2 * 60 && minutes < 5 * 60) return "london";
  if (minutes >= 9 * 60 + 30 && minutes < 12 * 60) return "new_york_am";
  if (minutes >= 12 * 60 && minutes < 13 * 60 + 30) return "new_york_lunch";
  if (minutes >= 13 * 60 + 30 && minutes < 16 * 60) return "new_york_pm";
  return "off_hours";
};

const sessionLabel = (session: IctKillzoneName) =>
  ({
    asia: "Asia",
    london: "London",
    new_york_am: "NY AM",
    new_york_lunch: "NY Lunch",
    new_york_pm: "NY PM",
    off_hours: "Off hours"
  })[session];

const averageRange = (candles: Candle[]) =>
  candles.length
    ? candles.reduce((total, candle) => total + Math.max(0, candle.high - candle.low), 0) / candles.length
    : 0;

const dynamicTolerance = (candles: Candle[], fallbackRange = 1) =>
  Math.max(0.01, averageRange(candles) * 0.65, Math.max(0.01, fallbackRange) * 0.035);

const localMinutesFor = (timestamp: string, timeZone = DEFAULT_TIMING_ZONE) => {
  const { hour, minute } = localParts(timestamp, timeZone);
  return hour * 60 + minute;
};

const candlesBetweenLocal = (candles: Candle[], timeZone: string, startMinutes: number, endMinutes: number) =>
  candles.filter((candle) => {
    const minutes = localMinutesFor(candle.timestamp, timeZone);
    return minutes >= startMinutes && minutes < endMinutes;
  });

const rangeFromCandles = (candles: Candle[]) => {
  if (!candles.length) return undefined;
  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  return {
    high: round(high),
    low: round(low),
    midpoint: round((high + low) / 2),
    range: round(high - low),
    candleCount: candles.length,
    startTimestamp: candles[0]?.timestamp,
    endTimestamp: candles.at(-1)?.timestamp
  };
};

const locationFor = (price: number, range?: { high: number; low: number; midpoint: number }) => {
  if (!range) return "equilibrium" as const;
  const width = Math.max(0.01, range.high - range.low);
  const equilibriumBand = width * 0.08;
  if (price > range.midpoint + equilibriumBand) return "premium" as const;
  if (price < range.midpoint - equilibriumBand) return "discount" as const;
  return "equilibrium" as const;
};

export const calculateIctSessionRanges = (
  candles: Candle[],
  timeZone = DEFAULT_TIMING_ZONE
): IctSessionRange[] => {
  const normalized = normalizeCandles(candles);
  return (["asia", "london", "new_york_am", "new_york_lunch", "new_york_pm", "off_hours"] as const).map((session) => {
    const sessionCandles = normalized.filter((candle) => classifyIctKillzone(candle.timestamp, timeZone) === session);
    const high = sessionCandles.length ? Math.max(...sessionCandles.map((candle) => candle.high)) : undefined;
    const low = sessionCandles.length ? Math.min(...sessionCandles.map((candle) => candle.low)) : undefined;
    return {
      session,
      label: sessionLabel(session),
      startTimestamp: sessionCandles[0]?.timestamp,
      endTimestamp: sessionCandles.at(-1)?.timestamp,
      high: high === undefined ? undefined : round(high),
      low: low === undefined ? undefined : round(low),
      midpoint: high === undefined || low === undefined ? undefined : round((high + low) / 2),
      range: high === undefined || low === undefined ? undefined : round(high - low),
      candleCount: sessionCandles.length
    };
  });
};

const eventLocalTime = (timestamp?: string, timeZone = DEFAULT_TIMING_ZONE) =>
  timestamp ? `${localParts(timestamp, timeZone).date} ${localParts(timestamp, timeZone).time} ${timeZone}` : undefined;

const openEvent = (
  eventType: "midnight_open" | "sunday_open",
  candle: Candle | undefined,
  note: string,
  timeZone: string
): IctSessionNarrativeEvent | undefined =>
  candle
    ? {
        eventType,
        timestamp: candle.timestamp,
        localTime: eventLocalTime(candle.timestamp, timeZone),
        price: round(candle.open),
        confidence: 1,
        note
      }
    : undefined;

const findMidnightOpen = (candles: Candle[], tradingDate: string, timeZone: string) => {
  const sameDate = candles.filter((candle) => localParts(candle.timestamp, timeZone).date === tradingDate);
  const exact = sameDate.find((candle) => {
    const parts = localParts(candle.timestamp, timeZone);
    return parts.hour === 0 && parts.minute === 0;
  });
  if (exact) return { candle: exact, fallback: "exact_midnight" as const };
  const firstAfter = sameDate.find((candle) => {
    const parts = localParts(candle.timestamp, timeZone);
    return parts.hour === 0 || parts.hour === 1;
  });
  return { candle: firstAfter ?? sameDate[0], fallback: firstAfter ? "first_after_midnight" as const : "first_available_for_date" as const };
};

const findSundayOpen = (candles: Candle[], timeZone: string) => {
  const sunday = candles.find((candle) => {
    const parts = localParts(candle.timestamp, timeZone);
    const minutes = parts.hour * 60 + parts.minute;
    return parts.weekday === "Sun" && minutes >= 18 * 60;
  });
  return sunday ?? candles[0];
};

const eventForEqualLiquidity = ({
  eventType,
  sessionCandles,
  timeZone,
  type
}: {
  eventType: "london_equal_lows" | "london_equal_highs";
  sessionCandles: Candle[];
  timeZone: string;
  type: "low" | "high";
}): IctSessionNarrativeEvent | undefined => {
  if (sessionCandles.length < 3) return undefined;
  const range = Math.max(...sessionCandles.map((candle) => candle.high)) - Math.min(...sessionCandles.map((candle) => candle.low));
  const tolerance = dynamicTolerance(sessionCandles, range);
  const sorted = sessionCandles
    .map((candle) => ({ candle, price: candle[type] }))
    .sort((left, right) => (type === "low" ? left.price - right.price : right.price - left.price));
  const anchor = sorted[0];
  const near = sorted.filter((item) => Math.abs(item.price - anchor.price) <= tolerance);
  if (near.length < 2) return undefined;
  const eventCandle = near[0].candle;
  return {
    eventType,
    timestamp: eventCandle.timestamp,
    localTime: eventLocalTime(eventCandle.timestamp, timeZone),
    price: round(anchor.price),
    confidence: clamp01(0.55 + near.length * 0.08),
    note: `${sessionLabel("london")} printed ${near.length} ${type === "low" ? "near-equal lows" : "near-equal highs"} within ${round(tolerance)} points.`
  };
};

const detectLondonCompression = (london: IctSessionRange | undefined, asia: IctSessionRange | undefined): IctSessionNarrativeEvent | undefined => {
  if (!london?.range || !asia?.range) return undefined;
  if (london.range > asia.range * 0.95) return undefined;
  return {
    eventType: "london_compression",
    timestamp: london.endTimestamp,
    high: london.high,
    low: london.low,
    confidence: clamp01(0.45 + (1 - london.range / Math.max(asia.range, 0.01)) * 0.5),
    note: `London range ${london.range} held inside the Asia reference range ${asia.range}.`
  };
};

const detectLondonSweepOfAsia = ({
  asia,
  londonCandles,
  direction,
  timeZone
}: {
  asia?: IctSessionRange;
  londonCandles: Candle[];
  direction: "high" | "low";
  timeZone: string;
}): IctSessionNarrativeEvent | undefined => {
  const level = direction === "high" ? asia?.high : asia?.low;
  if (level === undefined || !londonCandles.length) return undefined;
  const tolerance = dynamicTolerance(londonCandles, asia?.range ?? averageRange(londonCandles));
  const candle =
    direction === "high"
      ? londonCandles.find((item) => item.high > level + tolerance * 0.2)
      : londonCandles.find((item) => item.low < level - tolerance * 0.2);
  if (!candle) return undefined;
  return {
    eventType: direction === "high" ? "london_swept_asia_high" : "london_swept_asia_low",
    timestamp: candle.timestamp,
    localTime: eventLocalTime(candle.timestamp, timeZone),
    price: round(direction === "high" ? candle.high : candle.low),
    direction: direction === "high" ? "bearish" : "bullish",
    confidence: 0.72,
    note: `London swept the Asia ${direction} reference near ${round(level)}.`
  };
};

const detectSweep = ({
  afterCandles,
  direction,
  level,
  timeZone
}: {
  afterCandles: Candle[];
  direction: "buyside" | "sellside";
  level?: number;
  timeZone: string;
}): IctSessionNarrativeEvent | undefined => {
  if (level === undefined) return undefined;
  const tolerance = dynamicTolerance(afterCandles, averageRange(afterCandles));
  const candle =
    direction === "buyside"
      ? afterCandles.find((item) => item.high > level + tolerance * 0.25)
      : afterCandles.find((item) => item.low < level - tolerance * 0.25);
  if (!candle) return undefined;
  return {
    eventType: direction === "buyside" ? "buyside_sweep" : "sellside_sweep",
    timestamp: candle.timestamp,
    localTime: eventLocalTime(candle.timestamp, timeZone),
    price: direction === "buyside" ? round(candle.high) : round(candle.low),
    direction: direction === "buyside" ? "bearish" : "bullish",
    confidence: 0.72,
    note: `${direction === "buyside" ? "Buy-side" : "Sell-side"} liquidity was swept beyond ${round(level)}.`
  };
};

const detectMidnightReclaim = (candles: Candle[], midnightPrice: number | undefined, timeZone: string) => {
  if (midnightPrice === undefined) return undefined;
  const candle = candles.find((item) => item.high > midnightPrice && item.close > midnightPrice);
  return candle
    ? {
        eventType: "midnight_open_reclaim" as const,
        timestamp: candle.timestamp,
        localTime: eventLocalTime(candle.timestamp, timeZone),
        price: round(midnightPrice),
        confidence: 0.68,
        note: "Price reclaimed and traded above the 12AM opening price before the New York decision window."
      }
    : undefined;
};

const detectMidnightRejection = (candles: Candle[], midnightPrice: number | undefined, timeZone: string) => {
  if (midnightPrice === undefined) return undefined;
  const candle = candles.find((item) => item.high >= midnightPrice && item.close < midnightPrice);
  return candle
    ? {
        eventType: "midnight_open_rejection" as const,
        timestamp: candle.timestamp,
        localTime: eventLocalTime(candle.timestamp, timeZone),
        price: round(midnightPrice),
        confidence: 0.64,
        note: "Price traded into the 12AM opening price and rejected below it."
      }
    : undefined;
};

const detectNyPreopenConsolidation = (
  candles: Candle[],
  midnightPrice: number | undefined,
  timeZone: string
): IctSessionNarrativeEvent | undefined => {
  const preopen = candlesBetweenLocal(candles, timeZone, 8 * 60, 9 * 60 + 30);
  const range = rangeFromCandles(preopen);
  if (!range || range.candleCount < 3) return undefined;
  const avg = averageRange(candles);
  const mostlyBelowMidnight =
    midnightPrice === undefined ? true : preopen.filter((candle) => candle.close < midnightPrice).length >= Math.ceil(preopen.length * 0.6);
  if (!mostlyBelowMidnight || range.range > avg * Math.max(3.2, preopen.length * 0.8)) return undefined;
  return {
    eventType: "ny_preopen_consolidation",
    timestamp: range.startTimestamp,
    localTime: eventLocalTime(range.startTimestamp, timeZone),
    high: range.high,
    low: range.low,
    confidence: 0.7,
    note: "NY preopen consolidated below the 12AM opening price."
  };
};

const detectNyOpenConsolidationSweep = ({
  candles,
  consolidation,
  direction,
  timeZone
}: {
  candles: Candle[];
  consolidation?: IctSessionNarrativeEvent;
  direction: "low" | "high";
  timeZone: string;
}): IctSessionNarrativeEvent | undefined => {
  const level = direction === "low" ? consolidation?.low : consolidation?.high;
  if (level === undefined) return undefined;
  const nyOpen = candlesBetweenLocal(candles, timeZone, 9 * 60 + 30, 10 * 60 + 30);
  if (!nyOpen.length) return undefined;
  const tolerance = dynamicTolerance(nyOpen, averageRange(nyOpen));
  const candle =
    direction === "low"
      ? nyOpen.find((item) => item.low < level - tolerance * 0.2)
      : nyOpen.find((item) => item.high > level + tolerance * 0.2);
  if (!candle) return undefined;
  return {
    eventType: direction === "low" ? "ny_open_consolidation_low_sweep" : "ny_open_consolidation_high_sweep",
    timestamp: candle.timestamp,
    localTime: eventLocalTime(candle.timestamp, timeZone),
    price: round(direction === "low" ? candle.low : candle.high),
    direction: direction === "low" ? "bullish" : "bearish",
    confidence: 0.72,
    note: `NY 9:30 swept the preopen consolidation ${direction}.`
  };
};

const calculateActiveDealingRange = (candles: Candle[], referencePrice?: number) => {
  const range = rangeFromCandles(candles);
  if (!range || referencePrice === undefined) return undefined;
  return {
    high: range.high,
    low: range.low,
    midpoint: range.midpoint,
    currentLocation: locationFor(referencePrice, range),
    referencePrice: round(referencePrice)
  };
};

const detectFvgTarget = ({
  candles,
  activeRange,
  direction,
  referencePrice
}: {
  candles: Candle[];
  activeRange?: { high: number; low: number; midpoint: number };
  direction: "premium" | "discount";
  referencePrice?: number;
}): IctSessionFvgTarget => {
  if (!activeRange || referencePrice === undefined || candles.length < 3) {
    return {
      detected: false,
      direction,
      note: "FVG target could not be evaluated because dealing range or reference price is missing."
    };
  }
  const candidates: Array<{ high: number; low: number; midpoint: number; timestamp: string }> = [];
  for (let index = 2; index < candles.length; index += 1) {
    const left = candles[index - 2];
    const right = candles[index];
    if (left.high < right.low) {
      const low = left.high;
      const high = right.low;
      candidates.push({ low, high, midpoint: (low + high) / 2, timestamp: right.timestamp });
    }
    if (left.low > right.high) {
      const low = right.high;
      const high = left.low;
      candidates.push({ low, high, midpoint: (low + high) / 2, timestamp: right.timestamp });
    }
  }
  const target =
    direction === "premium"
      ? candidates.find((gap) => gap.midpoint > referencePrice && gap.midpoint > activeRange.midpoint)
      : candidates
          .slice()
          .reverse()
          .find((gap) => gap.midpoint < referencePrice && gap.midpoint < activeRange.midpoint);
  if (!target) {
    return {
      detected: false,
      direction,
      note: `${direction === "premium" ? "Premium" : "Discount"} FVG target was not detected from compact candle context.`
    };
  }
  return {
    detected: true,
    direction,
    high: round(target.high),
    low: round(target.low),
    midpoint: round(target.midpoint),
    sourceTimestamp: target.timestamp,
    distanceFromCurrent: round(target.midpoint - referencePrice),
    note: `${direction === "premium" ? "Premium" : "Discount"} FVG target identified as a draw, not an entry trigger.`
  };
};

export const detectNyOpenMitigationTap = ({
  candles,
  londonRange,
  sweepEvent,
  timeZone
}: {
  candles: Candle[];
  londonRange?: IctSessionRange;
  sweepEvent?: IctSessionNarrativeEvent;
  timeZone?: string;
}): IctMitigationContext => {
  const zoneHigh = sweepEvent?.price ?? londonRange?.high;
  const zoneLow = londonRange?.midpoint ?? londonRange?.low;
  const nyCandles = candles.filter((candle) => classifyIctKillzone(candle.timestamp, timeZone) === "new_york_am");
  if (zoneHigh === undefined || zoneLow === undefined || !nyCandles.length) {
    return {
      detected: false,
      sourceSession: "london",
      sourceLabel: "London/source zone",
      note: "NY mitigation could not be evaluated because the source zone or NY AM candles are missing."
    };
  }
  const high = Math.max(zoneHigh, zoneLow);
  const low = Math.min(zoneHigh, zoneLow);
  const tap = nyCandles.find((candle) => candle.low <= high && candle.high >= low);
  return {
    detected: Boolean(tap),
    sourceSession: "london",
    sourceLabel: "London/sweep source zone",
    zoneHigh: round(high),
    zoneLow: round(low),
    tapTimestamp: tap?.timestamp,
    tapLocalTime: eventLocalTime(tap?.timestamp, timeZone),
    note: tap
      ? "NY AM tapped the London/sweep source zone before continuation evaluation."
      : "NY AM did not tap the London/sweep source zone."
  };
};

const detectExpansion = ({
  candles,
  direction,
  eventType,
  fromTimestamp,
  referenceLevel,
  timeZone
}: {
  candles: Candle[];
  direction: "bearish" | "bullish";
  eventType?: "bearish_expansion" | "bullish_expansion" | "ny_reversal_higher" | "ny_reversal_lower";
  fromTimestamp?: string;
  referenceLevel?: number;
  timeZone: string;
}): IctSessionNarrativeEvent | undefined => {
  if (!fromTimestamp || referenceLevel === undefined) return undefined;
  const after = candles.filter((candle) => Date.parse(candle.timestamp) >= Date.parse(fromTimestamp));
  if (after.length < 2) return undefined;
  const recentRange = Math.max(averageRange(after), 0.01);
  const candle =
    direction === "bearish"
      ? after.find((item) => item.close < referenceLevel - recentRange * 0.75)
      : after.find((item) => item.close > referenceLevel + recentRange * 0.75);
  if (!candle) return undefined;
  return {
    eventType: eventType ?? (direction === "bearish" ? "bearish_expansion" : "bullish_expansion"),
    timestamp: candle.timestamp,
    localTime: eventLocalTime(candle.timestamp, timeZone),
    price: round(candle.close),
    direction,
    confidence: 0.76,
    note: `${direction === "bearish" ? "Bearish" : "Bullish"} expansion delivered away from the mitigation/open reference.`
  };
};

export const classifySessionNarrativeDataDepth = ({
  availableLookbackDays,
  candleCount,
  requestedLookbackDays = 90
}: {
  availableLookbackDays: number;
  candleCount: number;
  requestedLookbackDays?: number;
}): IctDataDepthStatus => {
  if (!candleCount || availableLookbackDays <= 0) return "unavailable";
  if (availableLookbackDays >= requestedLookbackDays * 0.8) return "sufficient";
  if (availableLookbackDays >= Math.min(20, requestedLookbackDays * 0.25)) return "limited";
  return "insufficient";
};

export const buildIctSessionNarrativeDataDepth = (
  candles: Candle[],
  options: Pick<IctSessionNarrativeOptions, "availableLookbackDays" | "depthSource" | "requestedLookbackDays">
): IctSessionNarrativeDataDepth => {
  const normalized = normalizeCandles(candles);
  const firstTimestamp = normalized[0]?.timestamp;
  const lastTimestamp = normalized.at(-1)?.timestamp;
  const inferredDays =
    firstTimestamp && lastTimestamp
      ? Math.max(0, (Date.parse(lastTimestamp) - Date.parse(firstTimestamp)) / (24 * 60 * 60 * 1000))
      : 0;
  const requestedLookbackDays = Math.max(1, options.requestedLookbackDays ?? 90);
  const availableLookbackDays = round(options.availableLookbackDays ?? inferredDays, 2);
  const status = classifySessionNarrativeDataDepth({
    availableLookbackDays,
    candleCount: normalized.length,
    requestedLookbackDays
  });
  return {
    requestedLookbackDays,
    availableLookbackDays,
    status,
    firstTimestamp,
    lastTimestamp,
    candleCount: normalized.length,
    source: options.depthSource ?? "current_window",
    note:
      status === "sufficient"
        ? `Depth covers ${availableLookbackDays} of requested ${requestedLookbackDays} days.`
        : `Depth is ${status}; current compact read covers ${availableLookbackDays} of requested ${requestedLookbackDays} days.`
  };
};

const decideNarrativeProfile = ({
  activeDealingRange,
  buysideSweep,
  expansionBearish,
  expansionBullish,
  fvgTarget,
  londonEqualLows,
  londonSweepAsiaHigh,
  mitigation,
  midnightReclaim,
  nyOpenConsolidationLowSweep,
  nyPreopenConsolidation,
  sellsideSweep
}: {
  activeDealingRange?: { currentLocation: "premium" | "discount" | "equilibrium" };
  buysideSweep?: IctSessionNarrativeEvent;
  sellsideSweep?: IctSessionNarrativeEvent;
  londonSweepAsiaHigh?: IctSessionNarrativeEvent;
  londonEqualLows?: IctSessionNarrativeEvent;
  midnightReclaim?: IctSessionNarrativeEvent;
  nyPreopenConsolidation?: IctSessionNarrativeEvent;
  nyOpenConsolidationLowSweep?: IctSessionNarrativeEvent;
  mitigation: IctMitigationContext;
  expansionBearish?: IctSessionNarrativeEvent;
  expansionBullish?: IctSessionNarrativeEvent;
  fvgTarget?: IctSessionFvgTarget;
}): {
  confidence: number;
  directionalRead: IctSessionDirectionalRead;
  profile: IctSessionNarrativeProfile;
} => {
  if (buysideSweep && londonEqualLows && midnightReclaim && mitigation.detected && expansionBearish) {
    return {
      profile: "consolidation_manipulation_distribution",
      directionalRead: "bearish",
      confidence: 0.82
    };
  }
  if (
    activeDealingRange?.currentLocation === "discount" &&
    fvgTarget?.detected &&
    fvgTarget.direction === "premium" &&
    (londonSweepAsiaHigh || midnightReclaim) &&
    sellsideSweep &&
    nyPreopenConsolidation &&
    nyOpenConsolidationLowSweep &&
    expansionBullish
  ) {
    return {
      profile: "ny_session_reversal_to_premium_fvg",
      directionalRead: "bullish",
      confidence: 0.84
    };
  }
  if (sellsideSweep && mitigation.detected) {
    return {
      profile: "accumulation_manipulation_expansion",
      directionalRead: "bullish",
      confidence: 0.66
    };
  }
  if (buysideSweep || sellsideSweep) {
    return {
      profile: "range_bound",
      directionalRead: buysideSweep ? "bearish" : "bullish",
      confidence: 0.48
    };
  }
  return {
    profile: "range_bound",
    directionalRead: "neutral",
    confidence: 0.35
  };
};

export const buildIctSessionNarrative = (
  candles: Candle[] = [],
  options: IctSessionNarrativeOptions
): IctSessionNarrative => {
  const timeZone = options.timingZone ?? DEFAULT_TIMING_ZONE;
  const normalized = normalizeCandles(candles);
  const latestTradingDate = options.tradingDate ?? tradingDateFor(normalized.at(-1)?.timestamp ?? new Date().toISOString(), timeZone);
  const dayCandles = normalized.filter((candle) => tradingDateFor(candle.timestamp, timeZone) === latestTradingDate);
  const ranges = calculateIctSessionRanges(dayCandles, timeZone);
  const asia = ranges.find((range) => range.session === "asia");
  const london = ranges.find((range) => range.session === "london");
  const londonCandles = dayCandles.filter((candle) => classifyIctKillzone(candle.timestamp, timeZone) === "london");
  const preNyReferenceCandle =
    candlesBetweenLocal(dayCandles, timeZone, 8 * 60, 9 * 60 + 30).at(-1) ??
    candlesBetweenLocal(dayCandles, timeZone, 5 * 60, 9 * 60 + 30).at(-1) ??
    dayCandles.at(-1);
  const activeDealingRange = calculateActiveDealingRange(normalized, preNyReferenceCandle?.close);
  const earlyAmCandles = dayCandles.filter((candle) => {
    const { hour, minute } = localParts(candle.timestamp, timeZone);
    const minutes = hour * 60 + minute;
    return minutes >= 3 * 60 && minutes < 9 * 60 + 45;
  });
  const midnight = findMidnightOpen(dayCandles, latestTradingDate, timeZone);
  const sundayOpen = findSundayOpen(normalized, timeZone);
  const londonEqualLows = eventForEqualLiquidity({
    eventType: "london_equal_lows",
    sessionCandles: londonCandles,
    timeZone,
    type: "low"
  });
  const londonEqualHighs = eventForEqualLiquidity({
    eventType: "london_equal_highs",
    sessionCandles: londonCandles,
    timeZone,
    type: "high"
  });
  const londonSweepAsiaHigh = detectLondonSweepOfAsia({
    asia,
    londonCandles,
    direction: "high",
    timeZone
  });
  const londonSweepAsiaLow = detectLondonSweepOfAsia({
    asia,
    londonCandles,
    direction: "low",
    timeZone
  });
  const compression = detectLondonCompression(london, asia);
  const buysideLevel = Math.max(
    asia?.high ?? Number.NEGATIVE_INFINITY,
    midnight.candle?.open ?? Number.NEGATIVE_INFINITY
  );
  const sellsideLevel = Math.min(
    asia?.low ?? Number.POSITIVE_INFINITY,
    midnight.candle?.open ?? Number.POSITIVE_INFINITY
  );
  const buysideSweep = detectSweep({
    afterCandles: earlyAmCandles,
    direction: "buyside",
    level: Number.isFinite(buysideLevel) ? buysideLevel : undefined,
    timeZone
  });
  const sellsideSweep = detectSweep({
    afterCandles: earlyAmCandles,
    direction: "sellside",
    level: Number.isFinite(sellsideLevel) ? sellsideLevel : undefined,
    timeZone
  });
  const midnightReclaim = detectMidnightReclaim(earlyAmCandles, midnight.candle?.open, timeZone);
  const midnightRejection = detectMidnightRejection(earlyAmCandles, midnight.candle?.open, timeZone);
  const nyPreopenConsolidation = detectNyPreopenConsolidation(dayCandles, midnight.candle?.open, timeZone);
  const nyOpenConsolidationLowSweep = detectNyOpenConsolidationSweep({
    candles: dayCandles,
    consolidation: nyPreopenConsolidation,
    direction: "low",
    timeZone
  });
  const nyOpenConsolidationHighSweep = detectNyOpenConsolidationSweep({
    candles: dayCandles,
    consolidation: nyPreopenConsolidation,
    direction: "high",
    timeZone
  });
  const premiumFvgTarget = detectFvgTarget({
    candles: normalized,
    activeRange: activeDealingRange,
    direction: "premium",
    referencePrice: preNyReferenceCandle?.close
  });
  const discountFvgTarget = detectFvgTarget({
    candles: normalized,
    activeRange: activeDealingRange,
    direction: "discount",
    referencePrice: preNyReferenceCandle?.close
  });
  const fvgTarget = premiumFvgTarget.detected ? premiumFvgTarget : discountFvgTarget.detected ? discountFvgTarget : premiumFvgTarget;
  const mitigationContext = detectNyOpenMitigationTap({
    candles: dayCandles,
    londonRange: london,
    sweepEvent: buysideSweep ?? sellsideSweep,
    timeZone
  });
  const bearishExpansion = detectExpansion({
    candles: dayCandles,
    direction: "bearish",
    fromTimestamp: mitigationContext.tapTimestamp ?? buysideSweep?.timestamp,
    referenceLevel: london?.low ?? asia?.low ?? midnight.candle?.open,
    timeZone
  });
  const bullishExpansion = detectExpansion({
    candles: dayCandles,
    direction: "bullish",
    fromTimestamp: mitigationContext.tapTimestamp ?? sellsideSweep?.timestamp,
    referenceLevel: london?.high ?? asia?.high ?? midnight.candle?.open,
    timeZone
  });
  const nyReversalHigher = detectExpansion({
    candles: dayCandles,
    direction: "bullish",
    eventType: "ny_reversal_higher",
    fromTimestamp: nyOpenConsolidationLowSweep?.timestamp ?? sellsideSweep?.timestamp,
    referenceLevel: nyPreopenConsolidation?.high ?? midnight.candle?.open ?? asia?.high,
    timeZone
  });
  const nyReversalLower = detectExpansion({
    candles: dayCandles,
    direction: "bearish",
    eventType: "ny_reversal_lower",
    fromTimestamp: nyOpenConsolidationHighSweep?.timestamp ?? buysideSweep?.timestamp,
    referenceLevel: nyPreopenConsolidation?.low ?? midnight.candle?.open ?? asia?.low,
    timeZone
  });
  const mitigationContextWithExpansion = {
    ...mitigationContext,
    direction: bearishExpansion ? "bearish" as const : bullishExpansion ? "bullish" as const : mitigationContext.direction,
    expansionConfirmed: Boolean(mitigationContext.detected && (bearishExpansion || bullishExpansion))
  };
  const classified = decideNarrativeProfile({
    activeDealingRange,
    buysideSweep,
    expansionBearish: bearishExpansion,
    expansionBullish: nyReversalHigher ?? bullishExpansion,
    fvgTarget,
    londonEqualLows,
    londonSweepAsiaHigh,
    mitigation: mitigationContextWithExpansion,
    midnightReclaim,
    nyOpenConsolidationLowSweep,
    nyPreopenConsolidation,
    sellsideSweep
  });
  const depth = buildIctSessionNarrativeDataDepth(normalized, options);
  const events = [
    openEvent("midnight_open", midnight.candle, `12AM open resolved by ${midnight.fallback}.`, timeZone),
    openEvent("sunday_open", sundayOpen, "Sunday/opening reference resolved from available compact candle history.", timeZone),
    asia?.candleCount
      ? {
          eventType: "asia_range" as const,
          timestamp: asia.startTimestamp,
          high: asia.high,
          low: asia.low,
          confidence: 0.9,
          note: `Asia range ${asia.range ?? "n/a"} from ${eventLocalTime(asia.startTimestamp, timeZone)} to ${eventLocalTime(asia.endTimestamp, timeZone)}.`
        }
      : undefined,
    londonEqualLows,
    londonEqualHighs,
    londonSweepAsiaHigh,
    londonSweepAsiaLow,
    compression,
    buysideSweep,
    sellsideSweep,
    midnightReclaim,
    midnightRejection,
    nyPreopenConsolidation,
    nyOpenConsolidationLowSweep,
    nyOpenConsolidationHighSweep,
    fvgTarget.detected
      ? {
          eventType: fvgTarget.direction === "premium" ? "premium_fvg_target" as const : "discount_fvg_target" as const,
          timestamp: fvgTarget.sourceTimestamp,
          high: fvgTarget.high,
          low: fvgTarget.low,
          price: fvgTarget.midpoint,
          direction: fvgTarget.direction === "premium" ? "bullish" : "bearish",
          confidence: 0.68,
          note: fvgTarget.note
        }
      : undefined,
    mitigationContextWithExpansion.detected
      ? {
          eventType: "ny_open_mitigation" as const,
          timestamp: mitigationContextWithExpansion.tapTimestamp,
          localTime: mitigationContextWithExpansion.tapLocalTime,
          high: mitigationContextWithExpansion.zoneHigh,
          low: mitigationContextWithExpansion.zoneLow,
          confidence: 0.72,
          note: mitigationContextWithExpansion.note
        }
      : undefined,
    bearishExpansion,
    bullishExpansion,
    nyReversalHigher,
    nyReversalLower
  ].filter((event): event is IctSessionNarrativeEvent => Boolean(event));
  const topReasons = [
    classified.profile === "consolidation_manipulation_distribution"
      ? "Asia range, London equal-lows/compression, buy-side sweep, NY mitigation, and bearish expansion align."
      : undefined,
    classified.profile === "ny_session_reversal_to_premium_fvg"
      ? "Discount context, London raid/expansion lower, NY consolidation-low sweep, and reversal toward premium FVG align."
      : undefined,
    activeDealingRange?.currentLocation ? `Pre-NY reference price is in ${activeDealingRange.currentLocation} of the active dealing range.` : undefined,
    londonSweepAsiaHigh ? "London swept the Asian high / 12AM context and reversed lower." : undefined,
    sellsideSweep ? "Sell-side liquidity below Asia/prior lows was taken before the NY reversal evaluation." : undefined,
    nyPreopenConsolidation ? "NY preopen consolidated below the 12AM opening price." : undefined,
    nyOpenConsolidationLowSweep ? "NY 9:30 swept the preopen consolidation low." : undefined,
    fvgTarget.detected ? fvgTarget.note : undefined,
    nyReversalHigher ? "NY reversed higher toward the premium FVG draw." : undefined,
    buysideSweep ? "Buy-side sweep above the Asia/London/midnight reference was detected." : undefined,
    midnightReclaim ? "Price reclaimed the 12AM opening price before NY decision context." : undefined,
    mitigationContextWithExpansion.detected ? "NY open mitigation context was detected." : undefined,
    bearishExpansion ? "Bearish expansion delivered away from the NY mitigation/open context." : undefined,
    depth.status !== "sufficient" ? depth.note : undefined
  ].filter((reason): reason is string => Boolean(reason));
  const noTradeReasons = [
    !asia?.candleCount ? "Asia range is missing for the active timing-zone date." : undefined,
    !london?.candleCount ? "London window is missing for the active timing-zone date." : undefined,
    !londonEqualLows && !londonEqualHighs ? "No London equal-high/equal-low liquidity family was detected." : undefined,
    !buysideSweep && !sellsideSweep ? "No post-London liquidity sweep was detected." : undefined,
    !mitigationContextWithExpansion.detected ? mitigationContextWithExpansion.note : undefined,
    classified.profile !== "ny_session_reversal_to_premium_fvg" && !fvgTarget.detected ? fvgTarget.note : undefined,
    !bearishExpansion && !bullishExpansion ? "No clean directional expansion away from the mitigation/open context was detected." : undefined
  ].filter((reason): reason is string => Boolean(reason));
  return sanitizeIctSessionNarrative({
    researchOnly: true,
    profile: classified.profile,
    directionalRead: classified.directionalRead,
    confidence: classified.confidence,
    requestedSymbol: options.requestedSymbol,
    brokerSymbol: options.brokerSymbol,
    primaryTimeframe: options.primaryTimeframe,
    timingZone: timeZone,
    sourceTimestampZone: normalized.every((candle) => /Z$/.test(candle.timestamp)) ? "UTC" : "unknown",
    tradingDate: latestTradingDate,
    midnightOpen: {
      timestamp: midnight.candle?.timestamp,
      localTime: eventLocalTime(midnight.candle?.timestamp, timeZone),
      price: midnight.candle ? round(midnight.candle.open) : undefined
    },
    sundayOpen: {
      timestamp: sundayOpen?.timestamp,
      localTime: eventLocalTime(sundayOpen?.timestamp, timeZone),
      price: sundayOpen ? round(sundayOpen.open) : undefined
    },
    activeDealingRange,
    ranges,
    events,
    fvgTarget,
    mitigationContext: mitigationContextWithExpansion,
    dataDepth: depth,
    topReasons: topReasons.length ? topReasons.slice(0, 6) : ["Session narrative did not find a complete manipulation/expansion sequence."],
    noTradeReasons: noTradeReasons.slice(0, 8),
    summary:
      classified.profile === "consolidation_manipulation_distribution"
        ? "Consolidation profile: Asia/London liquidity formed, buy-side liquidity was swept, NY mitigation appeared, and bearish expansion followed."
        : classified.profile === "ny_session_reversal_to_premium_fvg"
          ? "NY reversal profile: price traded from discount, sell-side liquidity was swept, and NY reversed higher toward a premium FVG draw."
        : `Session narrative is ${classified.profile.replace(/_/g, " ")} with ${classified.directionalRead} read.`,
    authority,
    safety
  });
};

export const sanitizeIctSessionNarrative = (narrative: IctSessionNarrative): IctSessionNarrative => ({
  ...JSON.parse(JSON.stringify(narrative)),
  researchOnly: true,
  authority,
  safety
});

export const assertIctSessionNarrativeIsCompact = (narrative: IctSessionNarrative) => {
  const { safety: _safety, ...payloadWithoutSafetyLabels } = narrative;
  const serialized = JSON.stringify(payloadWithoutSafetyLabels);
  return {
    ok:
      narrative.researchOnly === true &&
      narrative.authority.executionAuthority === "none" &&
      narrative.authority.brokerAuthority === "none" &&
      narrative.authority.readinessOverrideAuthority === "none" &&
      narrative.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
