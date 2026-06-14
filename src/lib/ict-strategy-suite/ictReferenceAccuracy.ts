import type {
  IctDealingRangeReference,
  IctReferenceAccuracyReport,
  IctReferenceCandleLike,
  IctReferenceLevel
} from "./ictReferenceAccuracyTypes";

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

const fmtCache = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string) => {
  const key = timeZone;
  const existing = fmtCache.get(key);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
    weekday: "short"
  });
  fmtCache.set(key, formatter);
  return formatter;
};

const localParts = (timestamp: string, timeZone: string) => {
  const parts = formatterFor(timeZone).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"),
    key: `${get("year")}-${get("month")}-${get("day")}`,
    label: `${get("year")}-${get("month")}-${get("day")} ${String(hour).padStart(2, "0")}:${get("minute")}:${get("second")} ${timeZone}`
  };
};

const sortCandlesAscending = <T extends IctReferenceCandleLike>(candles: T[]) =>
  candles.slice().sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

const reference = ({
  type,
  label,
  candle,
  sourceTimeframe,
  sourceMethod,
  timeZone,
  price,
  high,
  low,
  midpoint,
  confidence = 1
}: {
  type: IctReferenceLevel["type"];
  label: string;
  candle?: IctReferenceCandleLike;
  sourceTimeframe: string;
  sourceMethod: string;
  timeZone: string;
  price?: number;
  high?: number;
  low?: number;
  midpoint?: number;
  confidence?: number;
}): IctReferenceLevel => ({
  type,
  label,
  price,
  high,
  low,
  midpoint,
  timestamp: candle?.timestamp,
  localTimestamp: candle ? localParts(candle.timestamp, timeZone).label : undefined,
  sourceTimeframe,
  sourceMethod,
  confidence
});

const latestLocalDate = (candles: IctReferenceCandleLike[], timeZone: string) =>
  candles.length ? localParts(candles[candles.length - 1].timestamp, timeZone).key : undefined;

const previousLocalDate = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

const findTwelveAmOpen = (candles: IctReferenceCandleLike[], sourceTimeframe: string, timeZone: string, targetDate?: string) => {
  const date = targetDate ?? latestLocalDate(candles, timeZone);
  const candle = candles.find((item) => {
    const local = localParts(item.timestamp, timeZone);
    return local.key === date && local.hour === 0 && local.minute === 0;
  });
  return candle
    ? reference({
        type: "twelve_am_open",
        label: "12AM Open",
        candle,
        sourceTimeframe,
        sourceMethod: "session_local_exact_midnight",
        timeZone,
        price: candle.open
      })
    : undefined;
};

const findSundayOpen = (candles: IctReferenceCandleLike[], sourceTimeframe: string, timeZone: string) => {
  const sundayEveningCandles = candles.filter((item) => {
    const local = localParts(item.timestamp, timeZone);
    return local.weekday === "Sun" && local.hour >= 18;
  });
  const latestSundayKey = sundayEveningCandles.length
    ? localParts(sundayEveningCandles.at(-1)!.timestamp, timeZone).key
    : undefined;
  const candle = latestSundayKey
    ? sundayEveningCandles.find((item) => localParts(item.timestamp, timeZone).key === latestSundayKey)
    : undefined;
  return candle
    ? reference({
        type: "sunday_open",
        label: "Sunday Open",
        candle,
        sourceTimeframe,
        sourceMethod: "session_local_sunday_after_18",
        timeZone,
        price: candle.open
      })
    : undefined;
};

const findPreviousDayRange = (candles: IctReferenceCandleLike[], sourceTimeframe: string, timeZone: string, targetDate?: string) => {
  const date = targetDate ?? latestLocalDate(candles, timeZone);
  if (!date) return {};
  const previous = previousLocalDate(date);
  const dayCandles = candles.filter((item) => localParts(item.timestamp, timeZone).key === previous);
  if (!dayCandles.length) return {};
  const highCandle = dayCandles.reduce((best, item) => item.high > best.high ? item : best, dayCandles[0]);
  const lowCandle = dayCandles.reduce((best, item) => item.low < best.low ? item : best, dayCandles[0]);
  return {
    previousDayHigh: reference({
      type: "previous_day_high",
      label: "Previous Day High",
      candle: highCandle,
      sourceTimeframe,
      sourceMethod: "session_local_previous_day_high",
      timeZone,
      price: highCandle.high
    }),
    previousDayLow: reference({
      type: "previous_day_low",
      label: "Previous Day Low",
      candle: lowCandle,
      sourceTimeframe,
      sourceMethod: "session_local_previous_day_low",
      timeZone,
      price: lowCandle.low
    })
  };
};

const findSwings = (candles: IctReferenceCandleLike[], sourceTimeframe: string, timeZone: string, strength = 2) => {
  const swings: IctReferenceLevel[] = [];
  for (let index = strength; index < candles.length - strength; index += 1) {
    const window = candles.slice(index - strength, index + strength + 1);
    const candle = candles[index];
    if (window.every((item) => candle.high >= item.high)) {
      swings.push(reference({
        type: "swing_high",
        label: "Latest Swing High",
        candle,
        sourceTimeframe,
        sourceMethod: `fractal_${strength}_left_right`,
        timeZone,
        price: candle.high,
        confidence: 0.85
      }));
    }
    if (window.every((item) => candle.low <= item.low)) {
      swings.push(reference({
        type: "swing_low",
        label: "Latest Swing Low",
        candle,
        sourceTimeframe,
        sourceMethod: `fractal_${strength}_left_right`,
        timeZone,
        price: candle.low,
        confidence: 0.85
      }));
    }
  }
  return {
    latestSwingHigh: swings.filter((item) => item.type === "swing_high").at(-1),
    latestSwingLow: swings.filter((item) => item.type === "swing_low").at(-1)
  };
};

const averageRange = (candles: IctReferenceCandleLike[]) =>
  candles.length ? candles.reduce((sum, candle) => sum + Math.max(0, candle.high - candle.low), 0) / candles.length : 0;

const findConsolidation = (candles: IctReferenceCandleLike[], sourceTimeframe: string, timeZone: string) => {
  if (candles.length < 12) return {};
  const recent = candles.slice(-80);
  const avg = averageRange(recent) || 1;
  let best: { slice: IctReferenceCandleLike[]; width: number; start: number } | undefined;
  for (let size = 8; size <= 18; size += 1) {
    for (let start = 0; start <= recent.length - size; start += 1) {
      const slice = recent.slice(start, start + size);
      const high = Math.max(...slice.map((item) => item.high));
      const low = Math.min(...slice.map((item) => item.low));
      const width = high - low;
      if (width <= avg * size * 0.75 && (!best || width < best.width)) {
        best = { slice, width, start };
      }
    }
  }
  if (!best) return {};
  const high = Math.max(...best.slice.map((item) => item.high));
  const low = Math.min(...best.slice.map((item) => item.low));
  const anchor = best.slice[Math.floor(best.slice.length / 2)];
  return {
    consolidationHigh: reference({
      type: "consolidation_high",
      label: "Consolidation High",
      candle: anchor,
      sourceTimeframe,
      sourceMethod: "rolling_compression_range",
      timeZone,
      price: high,
      confidence: 0.72
    }),
    consolidationLow: reference({
      type: "consolidation_low",
      label: "Consolidation Low",
      candle: anchor,
      sourceTimeframe,
      sourceMethod: "rolling_compression_range",
      timeZone,
      price: low,
      confidence: 0.72
    })
  };
};

const findFvgs = (candles: IctReferenceCandleLike[], sourceTimeframe: string, timeZone: string) => {
  const references: IctReferenceLevel[] = [];
  for (let index = 2; index < candles.length; index += 1) {
    const first = candles[index - 2];
    const third = candles[index];
    if (first.high < third.low) {
      references.push(reference({
        type: "fair_value_gap",
        label: "Bullish FVG",
        candle: third,
        sourceTimeframe,
        sourceMethod: "three_candle_imbalance",
        timeZone,
        high: third.low,
        low: first.high,
        midpoint: (third.low + first.high) / 2,
        confidence: 0.7
      }));
    }
    if (first.low > third.high) {
      references.push(reference({
        type: "fair_value_gap",
        label: "Bearish FVG",
        candle: third,
        sourceTimeframe,
        sourceMethod: "three_candle_imbalance",
        timeZone,
        high: first.low,
        low: third.high,
        midpoint: (first.low + third.high) / 2,
        confidence: 0.7
      }));
    }
  }
  return references.slice(-8);
};

const dealingRangeFor = (
  high?: IctReferenceLevel,
  low?: IctReferenceLevel,
  latestClose?: number,
  sourceTimeframe?: string
): IctDealingRangeReference | undefined => {
  if (typeof high?.price !== "number" || typeof low?.price !== "number" || typeof latestClose !== "number") return undefined;
  const equilibrium = (high.price + low.price) / 2;
  const buffer = Math.max(0.0001, (high.price - low.price) * 0.05);
  return {
    high: high.price,
    low: low.price,
    equilibrium,
    currentLocation:
      Math.abs(latestClose - equilibrium) <= buffer
        ? "equilibrium"
        : latestClose > equilibrium
          ? "premium"
          : "discount",
    sourceTimeframe: sourceTimeframe ?? high.sourceTimeframe
  };
};

export const buildIctReferenceAccuracyReport = ({
  candles,
  sourceTimeframe = "M5",
  timeZone = "America/New_York",
  targetLocalDate
}: {
  candles: IctReferenceCandleLike[];
  sourceTimeframe?: string;
  timeZone?: string;
  targetLocalDate?: string;
}): IctReferenceAccuracyReport => {
  const sorted = sortCandlesAscending(candles);
  const twelveAmOpen = findTwelveAmOpen(sorted, sourceTimeframe, timeZone, targetLocalDate);
  const sundayOpen = findSundayOpen(sorted, sourceTimeframe, timeZone);
  const previousDay = findPreviousDayRange(sorted, sourceTimeframe, timeZone, targetLocalDate);
  const swings = findSwings(sorted, sourceTimeframe, timeZone);
  const consolidation = findConsolidation(sorted, sourceTimeframe, timeZone);
  const pdArrayReferences = findFvgs(sorted.slice(-240), sourceTimeframe, timeZone);
  const dealingRange = dealingRangeFor(
    consolidation.consolidationHigh ?? swings.latestSwingHigh ?? previousDay.previousDayHigh,
    consolidation.consolidationLow ?? swings.latestSwingLow ?? previousDay.previousDayLow,
    sorted.at(-1)?.close,
    sourceTimeframe
  );
  return {
    generatedAt: new Date().toISOString(),
    timeZone,
    sourceTimeframe,
    candleCount: sorted.length,
    twelveAmOpen,
    sundayOpen,
    previousDayHigh: previousDay.previousDayHigh,
    previousDayLow: previousDay.previousDayLow,
    latestSwingHigh: swings.latestSwingHigh,
    latestSwingLow: swings.latestSwingLow,
    consolidationHigh: consolidation.consolidationHigh,
    consolidationLow: consolidation.consolidationLow,
    dealingRange,
    pdArrayReferences,
    warnings: [
      !twelveAmOpen ? "12AM Open not found on the requested session-local date." : undefined,
      !sundayOpen ? "Sunday Open not found in available local-session history." : undefined,
      !dealingRange ? "Dealing range could not be built from compact references." : undefined
    ].filter((item): item is string => Boolean(item)),
    safety,
    authority
  };
};

export const assertIctReferenceAccuracyReportIsCompact = (report: IctReferenceAccuracyReport) => {
  const serialized = JSON.stringify(report);
  return {
    ok:
      report.authority.executionAuthority === "none" &&
      report.authority.brokerAuthority === "none" &&
      report.authority.readinessOverrideAuthority === "none" &&
      report.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"token"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
