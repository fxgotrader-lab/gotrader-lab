import { buildIctTradeConstruction } from "./ictTradeConstruction";
import type {
  IctSessionRaidReversalInput,
  IctSessionRaidReversalLevel,
  IctSessionRaidReversalNarrative,
  IctSessionRaidReversalPremiumDiscount,
  IctSessionRaidReversalRange,
  IctSessionRaidReversalStep,
  IctSessionRaidReversalStepName,
  IctSessionRaidReversalZone
} from "./ictSessionRaidReversalTypes";

type CompactCandle = IctSessionRaidReversalInput["candles5m"][number];

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

const defaultZone = "America/New_York";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));
const unique = (values: Array<string | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));

const sortCandles = (candles: CompactCandle[]) =>
  candles
    .filter((candle) =>
      Boolean(candle?.timestamp) &&
      finite(candle.open) &&
      finite(candle.high) &&
      finite(candle.low) &&
      finite(candle.close)
    )
    .slice()
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string) => {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
};

const localParts = (timestamp: string, timeZone: string) => {
  const parts = Object.fromEntries(
    formatterFor(timeZone).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value])
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const dateKey = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateKey,
    minuteOfDay: hour * 60 + minute,
    label: `${dateKey} ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
  };
};

const addDays = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const tradingDateFor = (timestamp: string, timeZone: string) => {
  const parts = localParts(timestamp, timeZone);
  return parts.minuteOfDay >= 20 * 60 ? addDays(parts.dateKey, 1) : parts.dateKey;
};

const inMinutes = (timestamp: string, timeZone: string, start: number, end: number) => {
  const minute = localParts(timestamp, timeZone).minuteOfDay;
  return minute >= start && minute < end;
};

const rangeOf = (candles: CompactCandle[]): IctSessionRaidReversalRange => {
  if (!candles.length) return { candleCount: 0 };
  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  return {
    high: round(high),
    low: round(low),
    midpoint: round((high + low) / 2),
    startTimestamp: candles[0]?.timestamp,
    endTimestamp: candles[candles.length - 1]?.timestamp,
    candleCount: candles.length
  };
};

const highestCandle = (candles: CompactCandle[]) =>
  candles.reduce<CompactCandle | undefined>((best, candle) => (!best || candle.high > best.high ? candle : best), undefined);

const lowestCandle = (candles: CompactCandle[]) =>
  candles.reduce<CompactCandle | undefined>((best, candle) => (!best || candle.low < best.low ? candle : best), undefined);

const averageRange = (candles: CompactCandle[]) => {
  if (!candles.length) return 0;
  return candles.reduce((sum, candle) => sum + Math.max(0, candle.high - candle.low), 0) / candles.length;
};

const averageBody = (candles: CompactCandle[]) => {
  if (!candles.length) return 0;
  return candles.reduce((sum, candle) => sum + Math.abs(candle.close - candle.open), 0) / candles.length;
};

const step = (
  stepName: IctSessionRaidReversalStepName,
  detected: boolean,
  note: string,
  patch: Partial<IctSessionRaidReversalStep> = {}
): IctSessionRaidReversalStep => ({
  step: stepName,
  detected,
  note,
  confidence: detected ? 0.75 : 0.25,
  ...patch
});

const level = (label: string, candle: CompactCandle | undefined, price: number | undefined, source: string, timingZone: string): IctSessionRaidReversalLevel | undefined =>
  finite(price)
    ? {
        label,
        price: round(price),
        timestamp: candle?.timestamp,
        localTime: candle ? localParts(candle.timestamp, timingZone).label : undefined,
        source
      }
    : undefined;

const resolveMidnightOpen = (candles: CompactCandle[], tradingDate: string, timingZone: string) => {
  const midnight = candles.find((candle) => {
    const parts = localParts(candle.timestamp, timingZone);
    return parts.dateKey === tradingDate && parts.minuteOfDay === 0;
  }) ?? candles.find((candle) => {
    const parts = localParts(candle.timestamp, timingZone);
    return parts.dateKey === tradingDate && parts.minuteOfDay > 0 && parts.minuteOfDay < 60;
  });
  return level("12AM New York Open", midnight, midnight?.open, "session_midnight_open", timingZone);
};

const resolveSundayOpen = (candles: CompactCandle[], timingZone: string, override?: number, tradingDate?: string) => {
  if (finite(override)) {
    return {
      label: "Sunday Open",
      price: round(override),
      source: "operator_override"
    };
  }
  const sundayCandidates = candles.filter((candle) => {
    const date = new Date(candle.timestamp);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timingZone, weekday: "short" }).format(date);
    const parts = localParts(candle.timestamp, timingZone);
    return weekday === "Sun" && parts.minuteOfDay >= 18 * 60 && (!tradingDate || parts.dateKey <= tradingDate);
  });
  const latestSundayDate = sundayCandidates
    .map((candle) => localParts(candle.timestamp, timingZone).dateKey)
    .sort()
    .at(-1);
  const sunday = latestSundayDate
    ? sundayCandidates.find((candle) => localParts(candle.timestamp, timingZone).dateKey === latestSundayDate)
    : undefined;
  return level("Sunday Open", sunday, sunday?.open, "first_sunday_evening_candle", timingZone);
};

const findFirstFvg = (candles: CompactCandle[], startIndex: number, direction: "bearish" | "bullish"): IctSessionRaidReversalZone | undefined => {
  for (let index = Math.max(2, startIndex); index < candles.length; index += 1) {
    const first = candles[index - 2];
    const third = candles[index];
    if (!first || !third) continue;
    if (direction === "bearish" && first.low > third.high) {
      return {
        high: round(first.low),
        low: round(third.high),
        midpoint: round((first.low + third.high) / 2),
        createdAt: third.timestamp,
        source: "bearish_three_candle_fvg"
      };
    }
    if (direction === "bullish" && first.high < third.low) {
      return {
        high: round(third.low),
        low: round(first.high),
        midpoint: round((third.low + first.high) / 2),
        createdAt: third.timestamp,
        source: "bullish_three_candle_fvg"
      };
    }
  }
  return undefined;
};

const findRetraceIntoZone = (candles: CompactCandle[], startIndex: number, zone?: IctSessionRaidReversalZone) => {
  if (!zone || !finite(zone.low) || !finite(zone.high)) return undefined;
  return candles.slice(Math.max(0, startIndex)).find((candle) => candle.high >= zone.low! && candle.low <= zone.high!);
};

const sweepAbove = (candles: CompactCandle[], price?: number) =>
  finite(price) ? candles.find((candle) => candle.high > price) : undefined;

const premiumDiscountFor = (lastClose?: number, sundayOpen?: number): IctSessionRaidReversalPremiumDiscount => {
  if (!finite(lastClose) || !finite(sundayOpen)) return "unknown";
  const distance = Math.abs(lastClose - sundayOpen);
  if (distance <= Math.max(1, sundayOpen * 0.00005)) return "equilibrium";
  return lastClose > sundayOpen ? "premium" : "discount";
};

const targetCandidatesForShort = (
  reference: {
    sundayOpen?: IctSessionRaidReversalLevel;
    asiaRange: IctSessionRaidReversalRange;
    londonRange: IctSessionRaidReversalRange;
    priorDayLow?: IctSessionRaidReversalLevel;
  },
  candles: CompactCandle[],
  entry?: number
) => {
  const swingLow = lowestCandle(candles);
  const targets: Array<IctSessionRaidReversalLevel | undefined> = [
    reference.asiaRange.low ? { label: "Asia Low", price: reference.asiaRange.low, source: "asia_low" } : undefined,
    reference.priorDayLow?.price ? { label: "Prior Day Low", price: reference.priorDayLow.price, source: "prior_day_low" } : undefined,
    reference.sundayOpen?.price ? { label: "Sunday Open", price: reference.sundayOpen.price, source: "sunday_open_equilibrium" } : undefined,
    reference.londonRange.low ? { label: "London Low", price: reference.londonRange.low, source: "london_low" } : undefined,
    swingLow ? { label: "Intraday Swing Low", price: swingLow.low, timestamp: swingLow.timestamp, source: "intraday_swing_low" } : undefined
  ];
  return targets
    .filter((item): item is IctSessionRaidReversalLevel => Boolean(item && finite(item.price)))
    .filter((item) => !finite(entry) || (item.price ?? Number.POSITIVE_INFINITY) < entry!)
    .sort((left, right) => (right.price ?? Number.NEGATIVE_INFINITY) - (left.price ?? Number.NEGATIVE_INFINITY));
};

export const evaluateIctSessionRaidReversal = (input: IctSessionRaidReversalInput): IctSessionRaidReversalNarrative => {
  const timingZone = input.timingZone ?? defaultZone;
  const candles = sortCandles(input.candles5m);
  const candles15m = sortCandles(input.candles15m ?? []);
  const requestedSymbol = input.requestedSymbol ?? "MNQ";
  const brokerSymbol = input.brokerSymbol ?? requestedSymbol;
  const sourceProvider = input.sourceProvider ?? "unavailable";
  const sourceFingerprint = input.sourceFingerprint;
  const primaryTimeframe = input.primaryTimeframe ?? "5m";
  const entryTimeframe = input.entryTimeframe ?? "15m";
  const htfTimeframes = Object.keys(input.htfContext ?? {});
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const insufficient = candles.length < 48;
  const last = candles.at(-1);
  const tradingDate = input.tradingDate ?? (last ? tradingDateFor(last.timestamp, timingZone) : undefined);

  const emptyRange = { candleCount: 0 };
  if (insufficient || !tradingDate) {
    return {
      narrativeId: "nasdaq_london_raid_ny_reversal_v1",
      strategyId: "session_raid_reversal_v1",
      status: "needs_more_data",
      side: "neutral",
      requestedSymbol,
      brokerSymbol,
      sourceProvider,
      sourceFingerprint,
      primaryTimeframe,
      entryTimeframe,
      htfTimeframes,
      timingZone,
      tradingDate,
      referenceLevels: {
        asiaRange: emptyRange,
        londonRange: emptyRange,
        nyRange: emptyRange,
        currentPremiumDiscount: "unknown",
        sellSideLiquidityTargets: [],
        buySideLiquidityTargets: []
      },
      steps: [],
      tradeConstructionBlockers: [],
      blockers: ["insufficient_candles"],
      missingConditions: ["needs_at_least_48_tactical_candles"],
      bullishScenario: "Insufficient session data; no bullish weekly scenario is inferred.",
      bearishScenario: "Insufficient session data; no bearish delivery scenario is inferred.",
      nextAction: "Load MT5 read-only M5/M15 candles before evaluating the NASDAQ London raid narrative.",
      canCreateValidationChainEntry: false,
      confidence: 0,
      researchOnly: true,
      authority,
      safety
    };
  }

  const previousTradingDate = addDays(tradingDate, -1);
  const dayCandles = candles.filter((candle) => tradingDateFor(candle.timestamp, timingZone) === tradingDate);
  const priorDayCandles = candles.filter((candle) => tradingDateFor(candle.timestamp, timingZone) === previousTradingDate);
  const asia = dayCandles.filter((candle) => {
    const parts = localParts(candle.timestamp, timingZone);
    return parts.minuteOfDay >= 20 * 60 || parts.minuteOfDay < 1 * 60;
  });
  const london = dayCandles.filter((candle) => inMinutes(candle.timestamp, timingZone, 2 * 60, 5 * 60));
  const earlyLondonToNy = dayCandles.filter((candle) => inMinutes(candle.timestamp, timingZone, 2 * 60, 9 * 60 + 30));
  const nyAm = dayCandles.filter((candle) => inMinutes(candle.timestamp, timingZone, 9 * 60 + 30, 12 * 60));
  const afterNyOpen = dayCandles.filter((candle) => inMinutes(candle.timestamp, timingZone, 9 * 60 + 30, 16 * 60));
  const asiaRange = rangeOf(asia);
  const londonRange = rangeOf(london);
  const nyRange = rangeOf(nyAm);
  const midnightOpen = resolveMidnightOpen(candles, tradingDate, timingZone);
  const sundayOpen = resolveSundayOpen(candles, timingZone, input.sundayOpenOverride, tradingDate);
  const priorHighCandle = highestCandle(priorDayCandles);
  const priorLowCandle = lowestCandle(priorDayCandles);
  const londonHighCandle = highestCandle(london.length ? london : earlyLondonToNy);
  const londonLowCandle = lowestCandle(london.length ? london : earlyLondonToNy);
  const nyHighCandle = highestCandle(nyAm);
  const nyLowCandle = lowestCandle(nyAm);
  const avgDayRange = averageRange(dayCandles);
  const avgBody = averageBody(dayCandles);
  const asiaConsolidates = asiaRange.candleCount >= 6 && finite(asiaRange.high) && finite(asiaRange.low)
    ? (asiaRange.high - asiaRange.low) <= Math.max(avgDayRange * 12, avgDayRange + 1)
    : false;
  const londonAboveMidnight = sweepAbove(london, midnightOpen?.price);
  const around345 = london.find((candle) => {
    const minute = localParts(candle.timestamp, timingZone).minuteOfDay;
    return minute >= 3 * 60 + 30 && minute <= 4 * 60 && finite(midnightOpen?.price) && candle.high > midnightOpen!.price!;
  });
  const londonExpansionCandle = around345 ?? londonAboveMidnight;
  const asiaHighSweep = sweepAbove(earlyLondonToNy, asiaRange.high);
  const priorDayHighSweep = sweepAbove(earlyLondonToNy, priorHighCandle?.high);
  const nyRaid = sweepAbove(nyAm, londonHighCandle?.high);
  const nyRaidIndex = nyRaid ? dayCandles.findIndex((candle) => candle.timestamp === nyRaid.timestamp) : -1;
  const priorSwingLow = nyRaidIndex > 0
    ? Math.min(...dayCandles.slice(Math.max(0, nyRaidIndex - 8), nyRaidIndex).map((candle) => candle.low))
    : undefined;
  const bearishMss = nyRaidIndex >= 0
    ? dayCandles.slice(nyRaidIndex + 1).find((candle) =>
        finite(priorSwingLow) &&
        candle.close < priorSwingLow &&
        candle.close < candle.open &&
        Math.abs(candle.close - candle.open) >= Math.max(avgBody * 1.1, avgDayRange * 0.35)
      )
    : undefined;
  const bearishMssIndex = bearishMss ? dayCandles.findIndex((candle) => candle.timestamp === bearishMss.timestamp) : -1;
  const breakerCandle = bearishMssIndex > 0
    ? dayCandles.slice(Math.max(0, nyRaidIndex), bearishMssIndex).reverse().find((candle) => candle.close > candle.open) ?? nyRaid
    : undefined;
  const breaker: IctSessionRaidReversalZone | undefined = breakerCandle
    ? {
        high: round(Math.max(breakerCandle.open, breakerCandle.close)),
        low: round(Math.min(breakerCandle.open, breakerCandle.close)),
        midpoint: round((breakerCandle.open + breakerCandle.close) / 2),
        createdAt: breakerCandle.timestamp,
        source: "failed_bullish_candle_before_bearish_mss"
      }
    : undefined;
  const fvgCandles = candles15m.length ? candles15m : dayCandles;
  const fvgStart = bearishMss
    ? fvgCandles.findIndex((candle) => new Date(candle.timestamp).getTime() >= new Date(bearishMss.timestamp).getTime())
    : 0;
  const fairValueGap = bearishMss ? findFirstFvg(fvgCandles, Math.max(2, fvgStart), "bearish") : undefined;
  const retrace = fairValueGap
    ? findRetraceIntoZone(
        fvgCandles,
        Math.max(0, fvgCandles.findIndex((candle) => candle.timestamp === fairValueGap.createdAt) + 1),
        fairValueGap
      )
    : undefined;
  const entry = retrace && fairValueGap?.midpoint;
  const rawStop = Math.max(
    ...[nyRaid?.high, londonHighCandle?.high, breaker?.high, fairValueGap?.high].filter(finite)
  );
  const invalidation = finite(entry) && finite(rawStop) ? round(rawStop + Math.max(0.25, avgDayRange * 0.1)) : undefined;
  const sellSideLiquidityTargets = targetCandidatesForShort(
    {
      sundayOpen,
      asiaRange,
      londonRange,
      priorDayLow: level("Prior Day Low", priorLowCandle, priorLowCandle?.low, "prior_trading_day_low", timingZone)
    },
    afterNyOpen.length ? afterNyOpen : dayCandles,
    entry
  );
  const preferredTarget = finite(entry) && finite(invalidation)
    ? sellSideLiquidityTargets.find((item) => finite(item.price) && (entry - item.price!) / (invalidation - entry) >= 2) ?? sellSideLiquidityTargets.at(-1)
    : sellSideLiquidityTargets[0];
  const target = preferredTarget?.price;
  const construction = buildIctTradeConstruction({
    side: "short",
    entry,
    stop: invalidation,
    target,
    entryModelType: fairValueGap ? "fvg" : breaker ? "breaker" : "generic",
    structureBounds: {
      fvgLow: fairValueGap?.low,
      fvgHigh: fairValueGap?.high,
      breakerLow: breaker?.low,
      breakerHigh: breaker?.high,
      sweptHigh: nyRaid?.high,
      rangeLow: asiaRange.low,
      rangeHigh: londonHighCandle?.high
    },
    symbol: requestedSymbol,
    brokerSymbol,
    timeframe: primaryTimeframe,
    sourceFingerprint,
    strategyId: "nasdaq_london_raid_ny_reversal_v1",
    minimumRR: 2,
    preferredRR: 3,
    maxStopDistance: brokerSymbol.toUpperCase().includes("USTECH") ? 120 : undefined,
    authority
  });
  const sellSideDelivery = finite(target) && retrace
    ? afterNyOpen.find((candle) => new Date(candle.timestamp) > new Date(retrace.timestamp) && candle.low <= target)
    : undefined;

  const currentPremiumDiscount = premiumDiscountFor(last?.close, sundayOpen?.price);
  const priorDayHigh = level("Prior Day High", priorHighCandle, priorHighCandle?.high, "prior_trading_day_high", timingZone);
  const priorDayLow = level("Prior Day Low", priorLowCandle, priorLowCandle?.low, "prior_trading_day_low", timingZone);
  const referenceLevels = {
    sundayOpen,
    midnightOpen,
    asiaRange,
    londonRange,
    nyRange,
    priorDayHigh,
    priorDayLow,
    londonHigh: level("London High", londonHighCandle, londonHighCandle?.high, "london_liquidity_high", timingZone),
    londonLow: level("London Low", londonLowCandle, londonLowCandle?.low, "london_session_low", timingZone),
    nySessionHigh: level("NY AM High", nyHighCandle, nyHighCandle?.high, "ny_am_high", timingZone),
    nySessionLow: level("NY AM Low", nyLowCandle, nyLowCandle?.low, "ny_am_low", timingZone),
    currentPremiumDiscount,
    sellSideLiquidityTargets,
    buySideLiquidityTargets: [
      level("Asia High", highestCandle(asia), asiaRange.high, "asia_high", timingZone),
      priorDayHigh,
      level("London High", londonHighCandle, londonHighCandle?.high, "london_liquidity_high", timingZone)
    ].filter((item): item is IctSessionRaidReversalLevel => Boolean(item))
  };

  const steps: IctSessionRaidReversalStep[] = [
    step("asia_consolidation", asiaConsolidates, asiaConsolidates ? "Asia formed a bounded range before London." : "Asia range is missing or too wide.", { high: asiaRange.high, low: asiaRange.low }),
    step("london_expansion", Boolean(londonAboveMidnight), londonAboveMidnight ? "London expanded above the 12AM New York open." : "London did not trade above the 12AM New York open.", {
      timestamp: londonExpansionCandle?.timestamp,
      localTime: londonExpansionCandle ? localParts(londonExpansionCandle.timestamp, timingZone).label : undefined,
      price: londonExpansionCandle?.high,
      confidence: around345 ? 0.9 : londonAboveMidnight ? 0.72 : 0.25
    }),
    step("asia_high_sweep", Boolean(asiaHighSweep), asiaHighSweep ? "London/early session swept Asia High." : "Asia High sweep not confirmed.", { timestamp: asiaHighSweep?.timestamp, localTime: asiaHighSweep ? localParts(asiaHighSweep.timestamp, timingZone).label : undefined, price: asiaHighSweep?.high }),
    step("prior_day_high_sweep", Boolean(priorDayHighSweep), priorDayHighSweep ? "Prior day high liquidity was captured." : "Prior day high sweep not confirmed or prior day high unavailable.", { timestamp: priorDayHighSweep?.timestamp, localTime: priorDayHighSweep ? localParts(priorDayHighSweep.timestamp, timingZone).label : undefined, price: priorDayHighSweep?.high }),
    step("london_high_created", Boolean(londonHighCandle), londonHighCandle ? "London High reference was created after the liquidity capture window." : "London High reference missing.", { timestamp: londonHighCandle?.timestamp, localTime: londonHighCandle ? localParts(londonHighCandle.timestamp, timingZone).label : undefined, price: londonHighCandle?.high }),
    step("ny_london_high_raid", Boolean(nyRaid), nyRaid ? "NY AM raided above London High." : "NY AM has not raided London High.", { timestamp: nyRaid?.timestamp, localTime: nyRaid ? localParts(nyRaid.timestamp, timingZone).label : undefined, price: nyRaid?.high }),
    step("bearish_mss", Boolean(bearishMss), bearishMss ? "Bearish market structure break/displacement followed the NY raid." : "Bearish MSS after the NY raid is missing.", { timestamp: bearishMss?.timestamp, localTime: bearishMss ? localParts(bearishMss.timestamp, timingZone).label : undefined, price: bearishMss?.close }),
    step("breaker_detected", Boolean(breaker), breaker ? "15m/5m breaker reference detected from failed bullish delivery." : "Breaker reference not available yet.", { timestamp: breaker?.createdAt, localTime: breaker?.createdAt ? localParts(breaker.createdAt, timingZone).label : undefined, high: breaker?.high, low: breaker?.low }),
    step("fvg_detected", Boolean(fairValueGap), fairValueGap ? "Bearish FVG detected after displacement." : "Bearish FVG after MSS is missing.", { timestamp: fairValueGap?.createdAt, localTime: fairValueGap?.createdAt ? localParts(fairValueGap.createdAt, timingZone).label : undefined, high: fairValueGap?.high, low: fairValueGap?.low }),
    step("fvg_retrace", Boolean(retrace), retrace ? "Price retraced into the bearish FVG entry zone." : "FVG exists but retrace has not confirmed.", { timestamp: retrace?.timestamp, localTime: retrace ? localParts(retrace.timestamp, timingZone).label : undefined, price: entry }),
    step("sell_side_delivery", Boolean(sellSideDelivery), sellSideDelivery ? "Price delivered into sell-side liquidity after the FVG mitigation." : "Sell-side delivery after retrace is not complete.", { timestamp: sellSideDelivery?.timestamp, localTime: sellSideDelivery ? localParts(sellSideDelivery.timestamp, timingZone).label : undefined, price: sellSideDelivery?.low })
  ];

  const missingConditions = unique(steps.filter((item) => !item.detected).map((item) => item.step));
  const sourceBlocked = sourceProvider === "mock" || sourceProvider === "sample";
  const blockers = unique([
    sourceBlocked ? "source_mock_sample" : undefined,
    !sourceFingerprint ? "source_fingerprint_missing" : undefined,
    !sundayOpen ? "sunday_open_missing" : undefined,
    ...(!construction.valid && retrace ? construction.blockers : [])
  ]);
  const coreSequenceComplete =
    asiaConsolidates &&
    Boolean(londonAboveMidnight) &&
    Boolean(asiaHighSweep) &&
    Boolean(londonHighCandle) &&
    Boolean(nyRaid) &&
    Boolean(bearishMss) &&
    Boolean(fairValueGap) &&
    Boolean(retrace);
  const status =
    sourceBlocked ? "rejected" :
    coreSequenceComplete && construction.valid ? "complete_bearish_reversal_candidate" :
    !asiaConsolidates ? "near_miss" :
    !nyRaid || !bearishMss ? "forming" :
    fairValueGap && !retrace ? "near_miss" :
    missingConditions.length ? "near_miss" :
    "context_only";
  const weeklyBias = input.weeklyBiasDirection ?? "unknown";
  const bullishScenario = sundayOpen?.price
    ? `If weekly bias is bullish, Sunday Open ${sundayOpen.price} is equilibrium/support to monitor after premium expansion; a return there can reset for higher continuation.`
    : "Bullish scenario unavailable until Sunday Open/equilibrium is resolved.";
  const bearishScenario = sundayOpen?.price
    ? `If weekly bias is bearish, price built premium above Sunday Open ${sundayOpen.price}; bearish delivery below that reference keeps sell-side liquidity in focus.`
    : "Bearish scenario requires Sunday Open plus sell-side target confirmation.";
  const nextAction =
    status === "complete_bearish_reversal_candidate"
      ? "Queue replay validation for NASDAQ London Raid -> NY Reversal. Recognition is not evidence."
      : !nyRaid
        ? "Monitor NY AM for a raid above London High before looking for bearish shift."
        : !bearishMss
          ? "Wait for bearish MSS/displacement after the NY raid."
          : fairValueGap && !retrace
            ? "Wait for retrace into the 15m FVG; no entry is confirmed yet."
            : construction.blockers.includes("target_missing")
              ? "Define sell-side liquidity target before replay validation."
              : "Keep as research-only narrative until all sequence steps and trade construction pass.";

  return {
    narrativeId: "nasdaq_london_raid_ny_reversal_v1",
    strategyId: "session_raid_reversal_v1",
    status,
    side: status === "context_only" ? "scenario" : "short",
    requestedSymbol,
    brokerSymbol,
    sourceProvider,
    sourceFingerprint,
    primaryTimeframe,
    entryTimeframe,
    htfTimeframes,
    timingZone,
    tradingDate,
    referenceLevels,
    steps,
    breaker,
    fairValueGap,
    entry: construction.entry,
    invalidation: construction.stop,
    target: construction.target,
    rr: construction.rr,
    tradeConstructionBlockers: construction.blockers,
    blockers,
    missingConditions: unique([
      ...missingConditions,
      !finite(entry) && fairValueGap ? "entry_missing" : undefined,
      !finite(target) ? "target_missing" : undefined,
      !finite(invalidation) ? "invalidation_missing" : undefined
    ]),
    bullishScenario: `${bullishScenario} Weekly bias: ${weeklyBias}.`,
    bearishScenario: `${bearishScenario} Weekly bias: ${weeklyBias}.`,
    nextAction,
    canCreateValidationChainEntry: status === "complete_bearish_reversal_candidate" && construction.valid && !sourceBlocked,
    validationChainSeed: status === "complete_bearish_reversal_candidate"
      ? {
          strategyId: "nasdaq_london_raid_ny_reversal_v1",
          setupLabel: "NASDAQ London Raid -> NY Reversal",
          side: "short",
          entry: construction.entry,
          invalidation: construction.stop,
          target: construction.target,
          rr: construction.rr,
          sourceFingerprint
        }
      : undefined,
    confidence: round(steps.filter((item) => item.detected).length / steps.length, 2),
    researchOnly: true,
    authority,
    safety
  };
};

export const summarizeIctSessionRaidReversal = (narrative?: IctSessionRaidReversalNarrative) => {
  if (!narrative) return "NASDAQ London raid narrative has not run.";
  const detected = narrative.steps.filter((item) => item.detected).length;
  return `${narrative.status.replace(/_/g, " ")} / ${detected}/${narrative.steps.length} steps / ${narrative.side}. Next: ${narrative.nextAction}`;
};
