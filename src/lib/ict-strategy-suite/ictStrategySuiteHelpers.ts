import type { Candle } from "../types";
import type {
  BiasDirection,
  IctDealingRange,
  IctDisplacement,
  IctLiquidityPool,
  IctNewsRiskEvent,
  IctPdArray,
  IctRiskGovernorConfig,
  IctStrategySignal,
  IctSuiteTimeframe,
  LiquidityType,
  PdArrayType,
  PdLocation
} from "./ictStrategySuiteTypes";

const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));
const isoDay = (timestamp: string) => timestamp.slice(0, 10);
const oneHourMs = 60 * 60 * 1000;

export const DEFAULT_ICT_RISK_GOVERNOR_CONFIG: IctRiskGovernorConfig = {
  minRewardRisk: 2,
  minConfidence: 0.55,
  maxSignalsPerDay: 3,
  maxRiskPerIdeaR: 1,
  blockHighImpactNews: true,
  validSessions: ["London", "New York"]
};

export interface IctSessionGroup {
  session: "Asia" | "London" | "New York" | "Off hours";
  candles: Candle[];
  high?: number;
  low?: number;
  start?: string;
  end?: string;
}

export interface IctSwingPoint {
  id: string;
  candleId: string;
  timestamp: string;
  index: number;
  type: "high" | "low";
  price: number;
  strength: number;
}

export interface IctOpeningGap {
  type: "new_day_opening_gap" | "new_week_opening_gap";
  high: number;
  low: number;
  midpoint: number;
  timestamp: string;
  gapSize: number;
}

export interface IctLiquiditySweepResult {
  pool: IctLiquidityPool;
  candle: Candle;
  index: number;
  direction: "bullish" | "bearish";
  sweptLevel: number;
  reclaimed: boolean;
}

export interface IctMarketReversal {
  direction: "bullish" | "bearish";
  sweep?: IctLiquiditySweepResult;
  displacement?: IctDisplacement;
  valid: boolean;
  reason: string;
}

export interface IctRiskGovernorInput {
  signal: IctStrategySignal;
  allSignalsForDay?: IctStrategySignal[];
  candles?: Candle[];
  newsEvents?: IctNewsRiskEvent[];
  config?: Partial<IctRiskGovernorConfig>;
  htfBiasConflict?: boolean;
}

export const normalizeCandles = (candles: Candle[] = []): Candle[] =>
  candles
    .filter(
      (candle) =>
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.high >= Math.max(candle.open, candle.close, candle.low) &&
        candle.low <= Math.min(candle.open, candle.close, candle.high) &&
        !Number.isNaN(Date.parse(candle.timestamp))
    )
    .slice()
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

const sessionForHourUtc = (hour: number): IctSessionGroup["session"] => {
  if (hour >= 0 && hour < 7) return "Asia";
  if (hour >= 7 && hour < 13) return "London";
  if (hour >= 13 && hour < 21) return "New York";
  return "Off hours";
};

export const groupCandlesBySession = (candles: Candle[] = []): IctSessionGroup[] => {
  const groups = new Map<IctSessionGroup["session"], Candle[]>();
  for (const candle of normalizeCandles(candles)) {
    const hour = new Date(candle.timestamp).getUTCHours();
    const session = sessionForHourUtc(hour);
    groups.set(session, [...(groups.get(session) ?? []), candle]);
  }
  return (["Asia", "London", "New York", "Off hours"] as const).map((session) => {
    const sessionCandles = groups.get(session) ?? [];
    return {
      session,
      candles: sessionCandles,
      high: sessionCandles.length ? Math.max(...sessionCandles.map((candle) => candle.high)) : undefined,
      low: sessionCandles.length ? Math.min(...sessionCandles.map((candle) => candle.low)) : undefined,
      start: sessionCandles[0]?.timestamp,
      end: sessionCandles.at(-1)?.timestamp
    };
  });
};

export const detectSwingHighs = (candles: Candle[], lookback = 2): IctSwingPoint[] => {
  const normalized = normalizeCandles(candles);
  const swings: IctSwingPoint[] = [];
  for (let index = lookback; index < normalized.length - lookback; index += 1) {
    const candle = normalized[index];
    const neighbors = [...normalized.slice(index - lookback, index), ...normalized.slice(index + 1, index + lookback + 1)];
    if (neighbors.every((item) => candle.high > item.high)) {
      swings.push({
        id: `ict_swing_high_${candle.id}`,
        candleId: candle.id,
        timestamp: candle.timestamp,
        index,
        type: "high",
        price: candle.high,
        strength: round(candle.high - Math.max(...neighbors.map((item) => item.high)))
      });
    }
  }
  return swings;
};

export const detectSwingLows = (candles: Candle[], lookback = 2): IctSwingPoint[] => {
  const normalized = normalizeCandles(candles);
  const swings: IctSwingPoint[] = [];
  for (let index = lookback; index < normalized.length - lookback; index += 1) {
    const candle = normalized[index];
    const neighbors = [...normalized.slice(index - lookback, index), ...normalized.slice(index + 1, index + lookback + 1)];
    if (neighbors.every((item) => candle.low < item.low)) {
      swings.push({
        id: `ict_swing_low_${candle.id}`,
        candleId: candle.id,
        timestamp: candle.timestamp,
        index,
        type: "low",
        price: candle.low,
        strength: round(Math.min(...neighbors.map((item) => item.low)) - candle.low)
      });
    }
  }
  return swings;
};

const priceTolerance = (price: number, toleranceBps: number) => Math.max(0.01, Math.abs(price) * (toleranceBps / 10_000));

export const detectEqualHighs = (candles: Candle[], toleranceBps = 4): IctLiquidityPool[] => {
  const highs = detectSwingHighs(candles);
  const latestClose = normalizeCandles(candles).at(-1)?.close ?? 0;
  const pools: IctLiquidityPool[] = [];
  for (let index = 1; index < highs.length; index += 1) {
    const prior = highs[index - 1];
    const current = highs[index];
    if (Math.abs(prior.price - current.price) <= priceTolerance(current.price, toleranceBps)) {
      const price = round((prior.price + current.price) / 2);
      pools.push({
        type: "equal_highs",
        price,
        timeframe: "m5",
        swept: false,
        distanceFromCurrent: round(price - latestClose)
      });
    }
  }
  return pools;
};

export const detectEqualLows = (candles: Candle[], toleranceBps = 4): IctLiquidityPool[] => {
  const lows = detectSwingLows(candles);
  const latestClose = normalizeCandles(candles).at(-1)?.close ?? 0;
  const pools: IctLiquidityPool[] = [];
  for (let index = 1; index < lows.length; index += 1) {
    const prior = lows[index - 1];
    const current = lows[index];
    if (Math.abs(prior.price - current.price) <= priceTolerance(current.price, toleranceBps)) {
      const price = round((prior.price + current.price) / 2);
      pools.push({
        type: "equal_lows",
        price,
        timeframe: "m5",
        swept: false,
        distanceFromCurrent: round(latestClose - price)
      });
    }
  }
  return pools;
};

const previousGroupExtreme = (
  candles: Candle[],
  groupKey: (timestamp: string) => string,
  type: LiquidityType,
  pick: "high" | "low",
  timeframe: IctSuiteTimeframe
): IctLiquidityPool | undefined => {
  const normalized = normalizeCandles(candles);
  const latestClose = normalized.at(-1)?.close;
  if (!normalized.length || latestClose === undefined) return undefined;
  const grouped = new Map<string, Candle[]>();
  for (const candle of normalized) {
    const key = groupKey(candle.timestamp);
    grouped.set(key, [...(grouped.get(key) ?? []), candle]);
  }
  const keys = [...grouped.keys()].sort();
  const latestKey = groupKey(normalized.at(-1)?.timestamp ?? "");
  const priorKey = keys.filter((key) => key < latestKey).at(-1);
  const priorCandles = priorKey ? grouped.get(priorKey) ?? [] : [];
  if (!priorCandles.length) return undefined;
  const price = pick === "high" ? Math.max(...priorCandles.map((candle) => candle.high)) : Math.min(...priorCandles.map((candle) => candle.low));
  const swept = pick === "high" ? normalized.some((candle) => candle.high > price) : normalized.some((candle) => candle.low < price);
  return {
    type,
    price: round(price),
    timeframe,
    swept,
    distanceFromCurrent: round(pick === "high" ? price - latestClose : latestClose - price)
  };
};

const weekKey = (timestamp: string) => {
  const date = new Date(timestamp);
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return `${date.getUTCFullYear()}-${Math.floor((date.getTime() - start.getTime()) / (7 * 24 * oneHourMs)).toString().padStart(2, "0")}`;
};

const monthKey = (timestamp: string) => timestamp.slice(0, 7);

export const detectLiquidityPools = (candles: Candle[]): IctLiquidityPool[] => {
  const normalized = normalizeCandles(candles);
  const latestClose = normalized.at(-1)?.close ?? 0;
  const swingHighPools = detectSwingHighs(normalized).slice(-4).map<IctLiquidityPool>((swing) => ({
    type: "old_swing_high",
    price: swing.price,
    timeframe: "m5",
    swept: normalized.some((candle) => candle.high > swing.price && candle.timestamp > swing.timestamp),
    distanceFromCurrent: round(swing.price - latestClose)
  }));
  const swingLowPools = detectSwingLows(normalized).slice(-4).map<IctLiquidityPool>((swing) => ({
    type: "old_swing_low",
    price: swing.price,
    timeframe: "m5",
    swept: normalized.some((candle) => candle.low < swing.price && candle.timestamp > swing.timestamp),
    distanceFromCurrent: round(latestClose - swing.price)
  }));
  const previousPools = [
    previousGroupExtreme(normalized, isoDay, "previous_day_high", "high", "daily"),
    previousGroupExtreme(normalized, isoDay, "previous_day_low", "low", "daily"),
    previousGroupExtreme(normalized, weekKey, "previous_week_high", "high", "weekly"),
    previousGroupExtreme(normalized, weekKey, "previous_week_low", "low", "weekly"),
    previousGroupExtreme(normalized, monthKey, "previous_month_high", "high", "monthly"),
    previousGroupExtreme(normalized, monthKey, "previous_month_low", "low", "monthly")
  ].filter((pool): pool is IctLiquidityPool => Boolean(pool));
  const sessionPools = groupCandlesBySession(normalized)
    .filter((session) => session.high !== undefined && session.low !== undefined)
    .flatMap<IctLiquidityPool>((session) => [
      {
        type: "session_high",
        price: round(session.high ?? 0),
        timeframe: "m5",
        swept: false,
        distanceFromCurrent: round((session.high ?? 0) - latestClose)
      },
      {
        type: "session_low",
        price: round(session.low ?? 0),
        timeframe: "m5",
        swept: false,
        distanceFromCurrent: round(latestClose - (session.low ?? 0))
      }
    ]);
  const cbdr = calculateCentralBankDealersRange(normalized);
  const gapPools = [calculateNewDayOpeningGap(normalized), calculateNewWeekOpeningGap(normalized)].filter((gap): gap is IctOpeningGap => Boolean(gap));
  return [
    ...previousPools,
    ...detectEqualHighs(normalized),
    ...detectEqualLows(normalized),
    ...swingHighPools,
    ...swingLowPools,
    ...sessionPools,
    ...(cbdr
      ? [
          {
            type: "central_bank_dealers_range_high" as const,
            price: cbdr.high,
            timeframe: "m5" as const,
            swept: false,
            distanceFromCurrent: round(cbdr.high - latestClose)
          },
          {
            type: "central_bank_dealers_range_low" as const,
            price: cbdr.low,
            timeframe: "m5" as const,
            swept: false,
            distanceFromCurrent: round(latestClose - cbdr.low)
          }
        ]
      : []),
    ...gapPools.map<IctLiquidityPool>((gap) => ({
      type: gap.type,
      price: gap.midpoint,
      timeframe: gap.type === "new_week_opening_gap" ? "weekly" : "daily",
      swept: false,
      distanceFromCurrent: round(Math.abs(gap.midpoint - latestClose))
    }))
  ].filter((pool) => Number.isFinite(pool.price));
};

export const detectLiquiditySweep = (candles: Candle[], pools = detectLiquidityPools(candles)): IctLiquiditySweepResult | undefined => {
  const normalized = normalizeCandles(candles);
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const candle = normalized[index];
    const buySide = pools
      .filter((pool) => ["previous_day_high", "previous_week_high", "previous_month_high", "equal_highs", "old_swing_high", "session_high", "central_bank_dealers_range_high"].includes(pool.type))
      .find((pool) => candle.high > pool.price && candle.close < pool.price);
    if (buySide) {
      return { pool: buySide, candle, index, direction: "bearish", sweptLevel: buySide.price, reclaimed: true };
    }
    const sellSide = pools
      .filter((pool) => ["previous_day_low", "previous_week_low", "previous_month_low", "equal_lows", "old_swing_low", "session_low", "central_bank_dealers_range_low"].includes(pool.type))
      .find((pool) => candle.low < pool.price && candle.close > pool.price);
    if (sellSide) {
      return { pool: sellSide, candle, index, direction: "bullish", sweptLevel: sellSide.price, reclaimed: true };
    }
  }
  return undefined;
};

const averageBodyBefore = (candles: Candle[], index: number, sample = 10) => {
  const window = candles.slice(Math.max(0, index - sample), index);
  if (!window.length) return Math.abs(candles[index]?.close - candles[index]?.open) || 1;
  return window.reduce((total, candle) => total + Math.abs(candle.close - candle.open), 0) / window.length;
};

export const detectDisplacement = (candles: Candle[], minBodyMultiple = 1.6): IctDisplacement | undefined => {
  const normalized = normalizeCandles(candles);
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const candle = normalized[index];
    const body = Math.abs(candle.close - candle.open);
    const avgBody = averageBodyBefore(normalized, index);
    if (body >= avgBody * minBodyMultiple) {
      const direction = candle.close >= candle.open ? "bullish" : "bearish";
      const gap = detectFairValueGap(normalized.slice(Math.max(0, index - 2), index + 2));
      return {
        direction,
        candleTime: candle.timestamp,
        impulseHigh: candle.high,
        impulseLow: candle.low,
        bodySize: round(body),
        atrMultiple: round(body / Math.max(avgBody, 0.01), 2),
        createdFvg: gap?.direction === direction
      };
    }
  }
  return undefined;
};

export const detectFairValueGap = (candles: Candle[]): IctPdArray | undefined => {
  const normalized = normalizeCandles(candles);
  const arrays: IctPdArray[] = [];
  for (let index = 2; index < normalized.length; index += 1) {
    const first = normalized[index - 2];
    const third = normalized[index];
    if (first.high < third.low) {
      arrays.push({
        type: "fair_value_gap",
        direction: "bullish",
        high: third.low,
        low: first.high,
        midpoint: round((third.low + first.high) / 2),
        createdAt: third.timestamp,
        timeframe: "m5",
        mitigated: normalized.slice(index + 1).some((candle) => candle.low <= third.low && candle.high >= first.high)
      });
    }
    if (first.low > third.high) {
      arrays.push({
        type: "fair_value_gap",
        direction: "bearish",
        high: first.low,
        low: third.high,
        midpoint: round((first.low + third.high) / 2),
        createdAt: third.timestamp,
        timeframe: "m5",
        mitigated: normalized.slice(index + 1).some((candle) => candle.low <= first.low && candle.high >= third.high)
      });
    }
  }
  return arrays.at(-1);
};

export const detectLiquidityVoid = (candles: Candle[]): IctPdArray | undefined => {
  const normalized = normalizeCandles(candles);
  const displacement = detectDisplacement(normalized, 2.1);
  if (!displacement) return undefined;
  return {
    type: "liquidity_void",
    direction: displacement.direction,
    high: displacement.impulseHigh,
    low: displacement.impulseLow,
    midpoint: round((displacement.impulseHigh + displacement.impulseLow) / 2),
    createdAt: displacement.candleTime,
    timeframe: "m5",
    mitigated: false
  };
};

export const detectOrderBlock = (candles: Candle[]): IctPdArray | undefined => {
  const normalized = normalizeCandles(candles);
  const displacement = detectDisplacement(normalized);
  if (!displacement) return undefined;
  const index = normalized.findIndex((candle) => candle.timestamp === displacement.candleTime);
  const opposite = normalized
    .slice(Math.max(0, index - 8), index)
    .reverse()
    .find((candle) => (displacement.direction === "bullish" ? candle.close < candle.open : candle.close > candle.open));
  if (!opposite) return undefined;
  return {
    type: "order_block",
    direction: displacement.direction,
    high: opposite.high,
    low: opposite.low,
    midpoint: round((opposite.high + opposite.low) / 2),
    createdAt: opposite.timestamp,
    timeframe: "m5",
    mitigated: normalized.slice(index + 1).some((candle) => candle.low <= opposite.high && candle.high >= opposite.low)
  };
};

const blockVariant = (candles: Candle[], type: PdArrayType, predicate: (block: IctPdArray, latest: Candle) => boolean): IctPdArray | undefined => {
  const block = detectOrderBlock(candles);
  const latest = normalizeCandles(candles).at(-1);
  if (!block || !latest || !predicate(block, latest)) return undefined;
  return { ...block, type };
};

export const detectReclaimedOrderBlock = (candles: Candle[]) =>
  blockVariant(candles, "reclaimed_order_block", (block, latest) =>
    block.direction === "bullish" ? latest.close > block.high : latest.close < block.low
  );

export const detectMitigationBlock = (candles: Candle[]) =>
  blockVariant(candles, "mitigation_block", (block, latest) => latest.low <= block.high && latest.high >= block.low);

export const detectRejectionBlock = (candles: Candle[]) =>
  blockVariant(candles, "rejection_block", (block, latest) =>
    block.direction === "bullish" ? latest.low <= block.high && latest.close > block.midpoint! : latest.high >= block.low && latest.close < block.midpoint!
  );

export const detectBreakerBlock = (candles: Candle[]) =>
  blockVariant(candles, "breaker_block", (block, latest) =>
    block.direction === "bullish" ? latest.close < block.low : latest.close > block.high
  );

export const detectPropulsionBlock = (candles: Candle[]) =>
  blockVariant(candles, "propulsion_block", (block, latest) =>
    block.direction === "bullish" ? latest.close > block.high : latest.close < block.low
  );

export const detectVacuumBlock = (candles: Candle[]) => {
  const voidArray = detectLiquidityVoid(candles);
  if (!voidArray) return undefined;
  return { ...voidArray, type: "vacuum_block" as const };
};

export const calculateDealingRange = (candles: Candle[], sourceTimeframe: IctSuiteTimeframe = "m5"): IctDealingRange | undefined => {
  const normalized = normalizeCandles(candles);
  const latest = normalized.at(-1);
  if (!normalized.length || !latest) return undefined;
  const high = Math.max(...normalized.map((candle) => candle.high));
  const low = Math.min(...normalized.map((candle) => candle.low));
  const midpoint = round((high + low) / 2);
  return {
    high: round(high),
    low: round(low),
    midpoint,
    currentLocation: classifyPremiumDiscount(latest.close, high, low),
    sourceTimeframe
  };
};

export const classifyPremiumDiscount = (price: number, high: number, low: number): PdLocation => {
  const midpoint = (high + low) / 2;
  const band = (high - low) * 0.05;
  if (price > midpoint + band) return "premium";
  if (price < midpoint - band) return "discount";
  return "equilibrium";
};

export const findNearestDrawOnLiquidity = (
  pools: IctLiquidityPool[],
  currentPrice: number,
  bias: BiasDirection = "neutral"
): IctLiquidityPool | undefined => {
  const directional = pools.filter((pool) => {
    if (bias === "bullish") return pool.price > currentPrice;
    if (bias === "bearish") return pool.price < currentPrice;
    return true;
  });
  return directional
    .slice()
    .sort((a, b) => {
      const timeframeWeight = (pool: IctLiquidityPool) => ({ monthly: 5, weekly: 4, daily: 3, h4: 2, h1: 2, m15: 1, m5: 1 })[pool.timeframe];
      return Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice) || timeframeWeight(b) - timeframeWeight(a);
    })[0];
};

export const projectDailyHighLow = (candles: Candle[]) => {
  const normalized = normalizeCandles(candles);
  const priorHigh = previousGroupExtreme(normalized, isoDay, "previous_day_high", "high", "daily")?.price;
  const priorLow = previousGroupExtreme(normalized, isoDay, "previous_day_low", "low", "daily")?.price;
  const currentDay = normalized.filter((candle) => isoDay(candle.timestamp) === isoDay(normalized.at(-1)?.timestamp ?? ""));
  const currentRange = currentDay.length ? Math.max(...currentDay.map((candle) => candle.high)) - Math.min(...currentDay.map((candle) => candle.low)) : 0;
  return {
    projectedHigh: priorHigh !== undefined ? round(priorHigh + currentRange * 0.5) : undefined,
    projectedLow: priorLow !== undefined ? round(priorLow - currentRange * 0.5) : undefined,
    priorHigh,
    priorLow
  };
};

export const calculateCentralBankDealersRange = (candles: Candle[]) => {
  const normalized = normalizeCandles(candles);
  const latestDay = isoDay(normalized.at(-1)?.timestamp ?? "");
  const cbdrCandles = normalized.filter((candle) => {
    const hour = new Date(candle.timestamp).getUTCHours();
    return isoDay(candle.timestamp) === latestDay && (hour >= 19 || hour < 1);
  });
  if (cbdrCandles.length < 2) return undefined;
  const high = Math.max(...cbdrCandles.map((candle) => candle.high));
  const low = Math.min(...cbdrCandles.map((candle) => candle.low));
  return { high: round(high), low: round(low), midpoint: round((high + low) / 2), candleCount: cbdrCandles.length };
};

export const calculateNewDayOpeningGap = (candles: Candle[]): IctOpeningGap | undefined => {
  const normalized = normalizeCandles(candles);
  for (let index = normalized.length - 1; index > 0; index -= 1) {
    const current = normalized[index];
    const previous = normalized[index - 1];
    if (isoDay(current.timestamp) !== isoDay(previous.timestamp) && Math.abs(current.open - previous.close) > 0) {
      const high = Math.max(current.open, previous.close);
      const low = Math.min(current.open, previous.close);
      return { type: "new_day_opening_gap", high, low, midpoint: round((high + low) / 2), timestamp: current.timestamp, gapSize: round(high - low) };
    }
  }
  return undefined;
};

export const calculateNewWeekOpeningGap = (candles: Candle[]): IctOpeningGap | undefined => {
  const normalized = normalizeCandles(candles);
  for (let index = normalized.length - 1; index > 0; index -= 1) {
    const current = normalized[index];
    const previous = normalized[index - 1];
    if (weekKey(current.timestamp) !== weekKey(previous.timestamp) && Math.abs(current.open - previous.close) > 0) {
      const high = Math.max(current.open, previous.close);
      const low = Math.min(current.open, previous.close);
      return { type: "new_week_opening_gap", high, low, midpoint: round((high + low) / 2), timestamp: current.timestamp, gapSize: round(high - low) };
    }
  }
  return undefined;
};

export const detectLowResistanceLiquidityRun = (candles: Candle[], target?: IctLiquidityPool) => {
  const normalized = normalizeCandles(candles);
  const latest = normalized.at(-1);
  const voidArray = detectLiquidityVoid(normalized);
  if (!latest || !target) {
    return { valid: false, reason: "Missing latest candle or liquidity target.", target, voidArray };
  }
  const distance = Math.abs(target.price - latest.close);
  const recentRange = Math.max(...normalized.slice(-20).map((candle) => candle.high)) - Math.min(...normalized.slice(-20).map((candle) => candle.low));
  const cleanPath = Boolean(voidArray) || distance > recentRange * 0.35;
  return {
    valid: cleanPath && distance > recentRange * 0.15,
    reason: cleanPath ? "Clean delivery path toward liquidity target detected." : "Path to liquidity target is choppy or too close.",
    target,
    voidArray,
    distance: round(distance)
  };
};

export const detectConsolidation = (candles: Candle[], window = 24) => {
  const normalized = normalizeCandles(candles).slice(-window);
  if (normalized.length < Math.min(8, window)) return { consolidated: false, range: 0, reason: "Not enough candles for consolidation detection." };
  const range = Math.max(...normalized.map((candle) => candle.high)) - Math.min(...normalized.map((candle) => candle.low));
  const averageBody = Math.max(0.01, normalized.reduce((total, candle) => total + Math.abs(candle.close - candle.open), 0) / normalized.length);
  const consolidated = range <= averageBody * 3;
  return { consolidated, range: round(range), reason: consolidated ? "Recent range is compressed relative to average candle body." : "Recent range is broad enough to avoid consolidation classification." };
};

export const detectMarketReversal = (candles: Candle[]): IctMarketReversal => {
  const sweep = detectLiquiditySweep(candles);
  const displacement = detectDisplacement(candles);
  const valid = Boolean(sweep && displacement && sweep.direction === displacement.direction);
  return {
    direction: displacement?.direction ?? sweep?.direction ?? "bullish",
    sweep,
    displacement,
    valid,
    reason: valid ? "Sweep and displacement agree for a reversal attempt." : "Reversal requires a sweep followed by matching displacement."
  };
};

export const detectDoubleTopBottomSweep = (candles: Candle[]) => {
  const equalHighs = detectEqualHighs(candles);
  const equalLows = detectEqualLows(candles);
  const sweep = detectLiquiditySweep(candles, [...equalHighs, ...equalLows]);
  return {
    type: sweep?.pool.type === "equal_highs" ? "double_top_sweep" : sweep?.pool.type === "equal_lows" ? "double_bottom_sweep" : "none",
    sweep
  };
};

export const estimateRewardRisk = ({ entry, invalidation, target }: { entry?: number; invalidation?: number; target?: number }) => {
  if (entry === undefined || invalidation === undefined || target === undefined) return undefined;
  const risk = Math.abs(entry - invalidation);
  const reward = Math.abs(target - entry);
  if (risk <= 0) return undefined;
  return round(reward / risk, 2);
};

export const applyNewsRiskFilter = (signal: IctStrategySignal, events: IctNewsRiskEvent[] = [], now = new Date()): IctStrategySignal => {
  const highImpact = events.find((event) => {
    const deltaHours = Math.abs(Date.parse(event.scheduledAt) - now.getTime()) / oneHourMs;
    return event.impact === "high" && deltaHours <= 2;
  });
  if (!highImpact) return signal;
  return {
    ...signal,
    side: "flat",
    decision: "no_trade",
    confidence: Math.min(signal.confidence, 0.2),
    setup: "no_trade",
    noTradeReasons: [...signal.noTradeReasons, `High-impact news risk is active: ${highImpact.reason}`],
    riskNotes: [...signal.riskNotes, "High-impact economic/news context can reject risk but cannot create a trade."]
  };
};

export const applySessionFilter = (
  signal: IctStrategySignal,
  candles: Candle[],
  validSessions: IctRiskGovernorConfig["validSessions"] = DEFAULT_ICT_RISK_GOVERNOR_CONFIG.validSessions
): IctStrategySignal => {
  const latest = normalizeCandles(candles).at(-1);
  if (!latest) return signal;
  const session = sessionForHourUtc(new Date(latest.timestamp).getUTCHours());
  if (validSessions.includes(session)) return signal;
  return {
    ...signal,
    side: "flat",
    decision: "no_trade",
    confidence: Math.min(signal.confidence, 0.3),
    setup: "no_trade",
    noTradeReasons: [...signal.noTradeReasons, `Session ${session} is outside configured research window.`],
    riskNotes: [...signal.riskNotes, "Session filter blocked this research setup."]
  };
};

export const applyRiskGovernor = ({
  allSignalsForDay = [],
  candles = [],
  config,
  htfBiasConflict = false,
  newsEvents = [],
  signal
}: IctRiskGovernorInput): IctStrategySignal => {
  const riskConfig = { ...DEFAULT_ICT_RISK_GOVERNOR_CONFIG, ...config };
  let governed = applySessionFilter(applyNewsRiskFilter(signal, newsEvents), candles, riskConfig.validSessions);
  const reasons = [...governed.noTradeReasons];
  const riskNotes = [...governed.riskNotes, `Max risk per idea is ${riskConfig.maxRiskPerIdeaR}R; execution authority remains none.`];
  if (!candles.length) reasons.push("Missing candle data.");
  if ((governed.rrEstimate ?? 0) < riskConfig.minRewardRisk) reasons.push(`Reward/risk ${governed.rrEstimate ?? "n/a"} is below ${riskConfig.minRewardRisk}.`);
  if (governed.confidence < riskConfig.minConfidence) reasons.push(`Confidence ${round(governed.confidence, 2)} is below ${riskConfig.minConfidence}.`);
  if (htfBiasConflict) reasons.push("Higher-timeframe bias conflict blocks the setup.");
  if (allSignalsForDay.filter((item) => item.decision === "research_only").length >= riskConfig.maxSignalsPerDay) {
    reasons.push(`Daily signal frequency limit ${riskConfig.maxSignalsPerDay} reached.`);
  }
  const highNews = newsEvents.some((event) => event.impact === "high");
  if (riskConfig.blockHighImpactNews && highNews) {
    reasons.push("High-impact news exists in the research window.");
  }
  if (!governed.drawOnLiquidity || governed.target === undefined) {
    reasons.push("Clear draw-on-liquidity or target is missing.");
  } else {
    const latest = normalizeCandles(candles).at(-1);
    if (latest && Math.abs(governed.target - latest.close) < (governed.dealingRange ? (governed.dealingRange.high - governed.dealingRange.low) * 0.05 : 0)) {
      reasons.push("Price is too close to target liquidity.");
    }
  }
  if (reasons.length > governed.noTradeReasons.length) {
    governed = {
      ...governed,
      side: "flat",
      decision: "no_trade",
      setup: "no_trade",
      confidence: Math.min(governed.confidence, 0.3),
      noTradeReasons: Array.from(new Set(reasons)),
      riskNotes
    };
  }
  return governed;
};
