import type { Candle } from "../types";
import {
  DEFAULT_ICT_RISK_GOVERNOR_CONFIG,
  applyRiskGovernor,
  calculateCentralBankDealersRange,
  calculateDealingRange,
  classifyPremiumDiscount,
  detectConsolidation,
  detectDisplacement,
  detectFairValueGap,
  detectLiquidityPools,
  detectLiquiditySweep,
  detectLowResistanceLiquidityRun,
  detectMarketReversal,
  detectMitigationBlock,
  detectOrderBlock,
  detectReclaimedOrderBlock,
  detectRejectionBlock,
  detectBreakerBlock,
  detectPropulsionBlock,
  detectVacuumBlock,
  estimateRewardRisk,
  findNearestDrawOnLiquidity,
  normalizeCandles,
  projectDailyHighLow
} from "./ictStrategySuiteHelpers";
import type {
  BiasDirection,
  IctDailyRangeProjection,
  IctDisplacement,
  IctLiquidityPool,
  IctPdArray,
  IctRiskGovernorConfig,
  IctStrategyId,
  IctStrategySignal,
  IctStrategySuiteEvaluation,
  IctStrategySuiteMarketSnapshot,
  IctStrategySetup,
  IctTimeframeBias,
  ResearchDecision,
  TradeSide
} from "./ictStrategySuiteTypes";
import { buildIctStrategyJournalEvent } from "./ictStrategySuiteJournal";

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));
const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const emptyBias: IctTimeframeBias = {
  monthly: "neutral",
  weekly: "neutral",
  daily: "neutral",
  h4: "neutral",
  h1: "neutral",
  m15: "neutral",
  m5: "neutral"
};

const createSignal = ({
  confidence = 0,
  decision = "no_trade",
  noTradeReasons = [],
  riskNotes = [],
  setup = "no_trade",
  side = "flat",
  snapshot,
  strategyId,
  timeframeBias = emptyBias,
  ...rest
}: {
  confidence?: number;
  decision?: ResearchDecision;
  noTradeReasons?: string[];
  riskNotes?: string[];
  setup?: IctStrategySetup;
  side?: TradeSide;
  snapshot: IctStrategySuiteMarketSnapshot;
  strategyId: IctStrategyId;
  timeframeBias?: IctTimeframeBias;
} & Partial<Omit<IctStrategySignal, "confidence" | "decision" | "noTradeReasons" | "provenance" | "riskNotes" | "setup" | "side" | "strategyId" | "symbol" | "timeframeBias">>): IctStrategySignal => ({
  strategyId,
  symbol: snapshot.symbol,
  side,
  decision,
  confidence: round(clamp(confidence), 2),
  timeframeBias,
  setup,
  noTradeReasons,
  riskNotes: Array.from(new Set(["Research-only signal. No broker execution authority.", ...riskNotes])),
  provenance: {
    methodology: "ICT",
    sourceSet: "ICT Mentorship Core Content",
    generatedAt: new Date().toISOString(),
    researchOnly: true
  },
  ...rest
});

const latestClose = (candles: Candle[]) => normalizeCandles(candles).at(-1)?.close ?? 0;

const candleBias = (candles: Candle[] = []): BiasDirection => {
  const normalized = normalizeCandles(candles);
  const first = normalized[0];
  const last = normalized.at(-1);
  if (!first || !last) return "neutral";
  const change = (last.close - first.open) / Math.max(Math.abs(first.open), 0.01);
  if (change > 0.001) return "bullish";
  if (change < -0.001) return "bearish";
  return "neutral";
};

const resolveTimeframeBias = (snapshot: IctStrategySuiteMarketSnapshot): IctTimeframeBias => {
  const htf = snapshot.higherTimeframeCandles ?? {};
  return {
    monthly: candleBias(htf.monthly ?? htf.weekly ?? snapshot.candles),
    weekly: candleBias(htf.weekly ?? snapshot.candles),
    daily: candleBias(htf.daily ?? snapshot.candles),
    h4: candleBias(htf.h4 ?? snapshot.candles),
    h1: candleBias(htf.h1 ?? snapshot.candles),
    m15: candleBias(htf.m15 ?? snapshot.candles),
    m5: candleBias(htf.m5 ?? snapshot.candles)
  };
};

const directionalConflict = (bias: IctTimeframeBias, direction: BiasDirection) => {
  const htf = [bias.monthly, bias.weekly, bias.daily, bias.h4].filter(Boolean) as BiasDirection[];
  const opposite = direction === "bullish" ? "bearish" : direction === "bearish" ? "bullish" : "neutral";
  return htf.filter((item) => item === opposite).length >= 2;
};

const majorityBias = (bias: IctTimeframeBias): BiasDirection => {
  const htf = [bias.monthly, bias.weekly, bias.daily, bias.h4].filter(Boolean) as BiasDirection[];
  const bullish = htf.filter((item) => item === "bullish").length;
  const bearish = htf.filter((item) => item === "bearish").length;
  if (bullish >= 2 && bullish > bearish) return "bullish";
  if (bearish >= 2 && bearish > bullish) return "bearish";
  return "neutral";
};

const poolAsSweep = (sweep: ReturnType<typeof detectLiquiditySweep> | undefined) => sweep?.pool;

const choosePdArray = (candles: Candle[], direction?: "bullish" | "bearish"): IctPdArray | undefined => {
  const arrays = [
    detectFairValueGap(candles),
    detectOrderBlock(candles),
    detectReclaimedOrderBlock(candles),
    detectMitigationBlock(candles),
    detectRejectionBlock(candles),
    detectBreakerBlock(candles),
    detectPropulsionBlock(candles),
    detectVacuumBlock(candles)
  ].filter((array): array is IctPdArray => Boolean(array));
  return arrays.reverse().find((array) => !direction || array.direction === direction);
};

const pdArrayEntry = (pdArray?: IctPdArray) =>
  pdArray
    ? {
        type: pdArray.type,
        high: pdArray.high,
        low: pdArray.low,
        midpoint: pdArray.midpoint
      }
    : undefined;

const invalidationFrom = (side: TradeSide, candles: Candle[], pdArray?: IctPdArray, sweepPrice?: number) => {
  const normalized = normalizeCandles(candles);
  if (side === "long") {
    return round(Math.min(sweepPrice ?? Number.POSITIVE_INFINITY, pdArray?.low ?? Number.POSITIVE_INFINITY, ...normalized.slice(-10).map((candle) => candle.low)));
  }
  if (side === "short") {
    return round(Math.max(sweepPrice ?? Number.NEGATIVE_INFINITY, pdArray?.high ?? Number.NEGATIVE_INFINITY, ...normalized.slice(-10).map((candle) => candle.high)));
  }
  return undefined;
};

const sideForDirection = (direction: BiasDirection | undefined): TradeSide => (direction === "bullish" ? "long" : direction === "bearish" ? "short" : "flat");

const selectDirectionalDrawOnLiquidity = (candles: Candle[], direction: BiasDirection): IctLiquidityPool | undefined => {
  const pools = detectLiquidityPools(candles);
  const current = latestClose(candles);
  const directionalTargets = pools.filter((pool) => (direction === "bullish" ? pool.price > current : direction === "bearish" ? pool.price < current : true));
  return (
    directionalTargets.find((pool) => detectLowResistanceLiquidityRun(candles, pool).valid) ??
    findNearestDrawOnLiquidity(pools, current, direction)
  );
};

export const evaluateIctHtfBias = (snapshot: IctStrategySuiteMarketSnapshot): IctStrategySignal => {
  const candles = normalizeCandles(snapshot.candles);
  const timeframeBias = resolveTimeframeBias(snapshot);
  const dealingRange = calculateDealingRange(candles);
  const pools = detectLiquidityPools(candles);
  const sweep = detectLiquiditySweep(candles, pools);
  const displacement = detectDisplacement(candles);
  const current = latestClose(candles);
  const htfMajority = majorityBias(timeframeBias);
  const sweepDirection = sweep?.direction === "bullish" ? "bullish" : sweep?.direction === "bearish" ? "bearish" : "neutral";
  const directionalBias =
    sweepDirection !== "neutral" && displacement?.direction === sweepDirection && !directionalConflict(timeframeBias, sweepDirection)
      ? sweepDirection
      : htfMajority;
  const drawOnLiquidity = findNearestDrawOnLiquidity(pools, current, directionalBias);
  const noTradeReasons: string[] = [];
  if (!candles.length) noTradeReasons.push("Missing candle data.");
  if (!sweep) noTradeReasons.push("No liquidity sweep confirms the draw.");
  if (!displacement) noTradeReasons.push("No displacement confirms post-sweep intent.");
  if (!dealingRange || dealingRange.currentLocation === "equilibrium") noTradeReasons.push("Price is at equilibrium or dealing range is unclear.");
  if (!drawOnLiquidity) noTradeReasons.push("Nearest draw-on-liquidity is unclear.");
  if (directionalBias === "neutral") noTradeReasons.push("Higher-timeframe bias is mixed or neutral.");
  const valid =
    directionalBias !== "neutral" &&
    Boolean(drawOnLiquidity) &&
    Boolean(dealingRange) &&
    Boolean(sweep) &&
    Boolean(displacement) &&
    ((directionalBias === "bullish" && dealingRange?.currentLocation === "discount") || (directionalBias === "bearish" && dealingRange?.currentLocation === "premium"));
  return createSignal({
    snapshot,
    strategyId: "ict-htf-bias",
    side: sideForDirection(directionalBias),
    decision: valid ? "research_only" : "no_trade",
    confidence: valid ? 0.66 : 0.25,
    timeframeBias,
    dealingRange,
    liquiditySwept: poolAsSweep(sweep),
    drawOnLiquidity,
    displacement,
    target: drawOnLiquidity?.price,
    setup: valid ? "htf_bias_only" : "no_trade",
    noTradeReasons: valid ? [] : noTradeReasons,
    riskNotes: [
      "Monthly and weekly context define macro draw-on-liquidity; lower timeframes only refine context.",
      directionalConflict(timeframeBias, directionalBias) ? "Lower-timeframe context cannot override higher-timeframe conflict." : "No HTF override was applied."
    ]
  });
};

export const evaluateIctDailyRange = (snapshot: IctStrategySuiteMarketSnapshot): IctStrategySignal & { dailyRangeProjection: IctDailyRangeProjection } => {
  const candles = normalizeCandles(snapshot.candles);
  const timeframeBias = resolveTimeframeBias(snapshot);
  const pools = detectLiquidityPools(candles);
  const projected = projectDailyHighLow(candles);
  const cbdr = calculateCentralBankDealersRange(candles);
  const consolidation = detectConsolidation(candles);
  const reversal = detectMarketReversal(candles);
  const htfBias = majorityBias(timeframeBias);
  const current = latestClose(candles);
  const likelyDraw = findNearestDrawOnLiquidity(pools, current, htfBias);
  const dailyProfile: IctDailyRangeProjection["dailyProfile"] = consolidation.consolidated
    ? "consolidation_day"
    : reversal.valid
      ? "reversal_day"
      : htfBias === "bullish"
        ? "bullish_expansion_day"
        : htfBias === "bearish"
          ? "bearish_expansion_day"
          : cbdr
            ? "seek_and_destroy_day"
            : "low_probability_day";
  const projection: IctDailyRangeProjection = {
    dailyProfile,
    projectedHigh: projected.projectedHigh,
    projectedLow: projected.projectedLow,
    likelyDraw,
    invalidation: htfBias === "bullish" ? projected.priorLow : htfBias === "bearish" ? projected.priorHigh : undefined,
    sessionWindow: cbdr ? "CBDR detected; London/NY expansion context can be evaluated." : "CBDR unavailable; daily range projection confidence reduced.",
    noTradeReasons:
      dailyProfile === "low_probability_day"
        ? ["No high-probability daily range profile was detected."]
        : dailyProfile === "consolidation_day"
          ? ["Consolidation day requires breakout/sweep conditions before a research setup."]
          : []
  };
  const signal = createSignal({
    snapshot,
    strategyId: "ict-daily-range",
    side: sideForDirection(htfBias),
    decision: projection.noTradeReasons.length ? "no_trade" : "research_only",
    confidence: projection.noTradeReasons.length ? 0.3 : dailyProfile === "seek_and_destroy_day" ? 0.48 : 0.58,
    timeframeBias,
    drawOnLiquidity: likelyDraw,
    invalidation: projection.invalidation,
    target: likelyDraw?.price ?? (htfBias === "bullish" ? projected.projectedHigh : projected.projectedLow),
    setup: projection.noTradeReasons.length ? "no_trade" : "daily_range_projection",
    noTradeReasons: projection.noTradeReasons,
    riskNotes: [
      `Daily profile classified as ${dailyProfile}.`,
      cbdr ? `CBDR high ${cbdr.high} / low ${cbdr.low} detected.` : "CBDR is unavailable for this candle window."
    ]
  });
  return { ...signal, dailyRangeProjection: projection };
};

export const evaluateIctLiquidityRun = (snapshot: IctStrategySuiteMarketSnapshot, biasSignal = evaluateIctHtfBias(snapshot)): IctStrategySignal => {
  const candles = normalizeCandles(snapshot.candles);
  const pools = detectLiquidityPools(candles);
  const sweep = detectLiquiditySweep(candles, pools);
  const displacement = detectDisplacement(candles);
  const directionalBias = majorityBias(biasSignal.timeframeBias);
  const current = latestClose(candles);
  const direction = sweep?.direction ?? directionalBias;
  const directionalTargets = pools.filter((pool) => (direction === "bullish" ? pool.price > current : direction === "bearish" ? pool.price < current : true));
  const drawOnLiquidity =
    directionalTargets.find((pool) => detectLowResistanceLiquidityRun(candles, pool).valid) ??
    findNearestDrawOnLiquidity(pools, current, direction);
  const run = detectLowResistanceLiquidityRun(candles, drawOnLiquidity);
  const valid =
    run.valid &&
    direction !== "neutral" &&
    Boolean(sweep) &&
    Boolean(displacement) &&
    displacement?.direction === direction &&
    !directionalConflict(biasSignal.timeframeBias, direction);
  return createSignal({
    snapshot,
    strategyId: "ict-liquidity-run",
    side: sideForDirection(direction),
    decision: valid ? "research_only" : "no_trade",
    confidence: valid ? 0.61 : 0.28,
    timeframeBias: biasSignal.timeframeBias,
    dealingRange: biasSignal.dealingRange,
    liquiditySwept: poolAsSweep(sweep),
    drawOnLiquidity,
    displacement,
    target: drawOnLiquidity?.price,
    setup:
      valid && direction === "bullish"
        ? "sellside_sweep_bullish_displacement"
        : valid && direction === "bearish"
          ? "buyside_sweep_bearish_displacement"
          : "no_trade",
    noTradeReasons: valid
      ? []
      : [
          !sweep ? "No raid of external liquidity was detected." : "",
          !displacement ? "No displacement after raid." : "",
          !run.valid ? run.reason : "",
          directionalConflict(biasSignal.timeframeBias, direction) ? "Higher-timeframe bias conflict." : ""
        ].filter(Boolean),
    riskNotes: ["Liquidity voids and low-resistance paths are treated as magnets/targets, not entries by themselves."]
  });
};

export const evaluateIctFvgDisplacement = (snapshot: IctStrategySuiteMarketSnapshot, biasSignal = evaluateIctHtfBias(snapshot)): IctStrategySignal => {
  const candles = normalizeCandles(snapshot.candles);
  const sweep = detectLiquiditySweep(candles);
  const displacement = detectDisplacement(candles);
  const fvg = detectFairValueGap(candles);
  const dealingRange = calculateDealingRange(candles);
  const direction = displacement?.direction ?? sweep?.direction ?? majorityBias(biasSignal.timeframeBias);
  const currentLocation = dealingRange?.currentLocation ?? "equilibrium";
  const correctLocation = (direction === "bullish" && currentLocation === "discount") || (direction === "bearish" && currentLocation === "premium");
  const targetPool = selectDirectionalDrawOnLiquidity(candles, direction);
  const target = targetPool?.price;
  const invalidation = invalidationFrom(sideForDirection(direction), candles, fvg, sweep?.sweptLevel);
  const rrEstimate = estimateRewardRisk({ entry: fvg?.midpoint, invalidation, target });
  const valid =
    Boolean(sweep) &&
    Boolean(displacement) &&
    Boolean(fvg) &&
    fvg?.direction === direction &&
    displacement?.createdFvg &&
    correctLocation &&
    !fvg?.mitigated &&
    !directionalConflict(biasSignal.timeframeBias, direction);
  return createSignal({
    snapshot,
    strategyId: "ict-fvg-displacement",
    side: sideForDirection(direction),
    decision: valid ? "research_only" : "no_trade",
    confidence: valid ? 0.68 : 0.24,
    timeframeBias: biasSignal.timeframeBias,
    dealingRange,
    liquiditySwept: poolAsSweep(sweep),
    drawOnLiquidity: targetPool,
    displacement,
    pdArray: fvg,
    entryZone: pdArrayEntry(fvg),
    invalidation,
    target,
    rrEstimate,
    setup: valid ? "fvg_retracement" : "no_trade",
    noTradeReasons: valid
      ? []
      : [
          !sweep ? "FVG requires a prior liquidity sweep." : "",
          !displacement ? "FVG is not associated with displacement." : "",
          !fvg ? "No three-candle fair value gap detected." : "",
          fvg?.mitigated ? "FVG has already been mitigated." : "",
          !correctLocation ? "FVG is in the wrong premium/discount location." : "",
          directionalConflict(biasSignal.timeframeBias, direction) ? "No HTF alignment." : ""
        ].filter(Boolean),
    riskNotes: ["FVG model is a retracement research setup only; no execution route is created."]
  });
};

export const evaluateIctOrderBlock = (snapshot: IctStrategySuiteMarketSnapshot, biasSignal = evaluateIctHtfBias(snapshot)): IctStrategySignal => {
  const candles = normalizeCandles(snapshot.candles);
  const sweep = detectLiquiditySweep(candles);
  const displacement = detectDisplacement(candles);
  const direction = displacement?.direction ?? sweep?.direction ?? majorityBias(biasSignal.timeframeBias);
  const pdArray = choosePdArray(candles, direction === "neutral" ? undefined : direction) ?? detectOrderBlock(candles);
  const dealingRange = calculateDealingRange(candles);
  const targetPool = selectDirectionalDrawOnLiquidity(candles, direction);
  const invalidation = invalidationFrom(sideForDirection(direction), candles, pdArray, sweep?.sweptLevel);
  const rrEstimate = estimateRewardRisk({ entry: pdArray?.midpoint, invalidation, target: targetPool?.price });
  const valid =
    Boolean(pdArray) &&
    Boolean(sweep) &&
    Boolean(displacement) &&
    pdArray?.direction === direction &&
    Boolean(targetPool) &&
    ((direction === "bullish" && dealingRange?.currentLocation === "discount") || (direction === "bearish" && dealingRange?.currentLocation === "premium"));
  return createSignal({
    snapshot,
    strategyId: "ict-order-block",
    side: sideForDirection(direction),
    decision: valid ? "research_only" : "no_trade",
    confidence: valid ? 0.62 : 0.25,
    timeframeBias: biasSignal.timeframeBias,
    dealingRange,
    liquiditySwept: poolAsSweep(sweep),
    drawOnLiquidity: targetPool,
    displacement,
    pdArray,
    entryZone: pdArrayEntry(pdArray),
    invalidation,
    target: targetPool?.price,
    rrEstimate,
    setup: valid ? "order_block_retracement" : "no_trade",
    noTradeReasons: valid
      ? []
      : [
          !pdArray ? "No usable PD array/order-block family member detected." : "",
          !sweep ? "Order-block model requires a liquidity sweep." : "",
          !displacement ? "Order-block model requires displacement." : "",
          !targetPool ? "Clear draw-on-liquidity is missing." : ""
        ].filter(Boolean),
    riskNotes: ["Order-block family is used as confluence unless HTF, sweep, displacement, PD location, and draw align."]
  });
};

const evaluateBreadAndButter = (
  snapshot: IctStrategySuiteMarketSnapshot,
  expectedDirection: "bullish" | "bearish",
  strategyId: "ict-bread-and-butter-buy" | "ict-bread-and-butter-sell"
): IctStrategySignal => {
  const bias = evaluateIctHtfBias(snapshot);
  const daily = evaluateIctDailyRange(snapshot);
  const fvg = evaluateIctFvgDisplacement(snapshot, bias);
  const ob = evaluateIctOrderBlock(snapshot, bias);
  const directionalBias = majorityBias(bias.timeframeBias);
  const candidateArray = fvg.pdArray?.direction === expectedDirection ? fvg.pdArray : ob.pdArray?.direction === expectedDirection ? ob.pdArray : undefined;
  const sweepAligned =
    expectedDirection === "bullish" ? fvg.liquiditySwept?.type.includes("low") || ob.liquiditySwept?.type.includes("low") : fvg.liquiditySwept?.type.includes("high") || ob.liquiditySwept?.type.includes("high");
  const dailyAligned =
    expectedDirection === "bullish"
      ? ["bullish_expansion_day", "reversal_day"].includes(daily.dailyRangeProjection.dailyProfile)
      : ["bearish_expansion_day", "reversal_day"].includes(daily.dailyRangeProjection.dailyProfile);
  const htfAligned = directionalBias === expectedDirection || dailyAligned;
  const targetPool = fvg.drawOnLiquidity ?? ob.drawOnLiquidity;
  const invalidation = invalidationFrom(expectedDirection === "bullish" ? "long" : "short", normalizeCandles(snapshot.candles), candidateArray, fvg.liquiditySwept?.price ?? ob.liquiditySwept?.price);
  const rrEstimate = estimateRewardRisk({ entry: candidateArray?.midpoint, invalidation, target: targetPool?.price });
  const valid = htfAligned && dailyAligned && Boolean(sweepAligned) && Boolean(candidateArray) && Boolean(fvg.displacement ?? ob.displacement) && (rrEstimate ?? 0) >= 1.2;
  return createSignal({
    snapshot,
    strategyId,
    side: expectedDirection === "bullish" ? "long" : "short",
    decision: valid ? "research_only" : "no_trade",
    confidence: valid ? 0.7 : 0.22,
    timeframeBias: bias.timeframeBias,
    dealingRange: fvg.dealingRange ?? ob.dealingRange,
    liquiditySwept: fvg.liquiditySwept ?? ob.liquiditySwept,
    drawOnLiquidity: targetPool,
    displacement: fvg.displacement ?? ob.displacement,
    pdArray: candidateArray,
    entryZone: pdArrayEntry(candidateArray),
    invalidation,
    target: targetPool?.price,
    rrEstimate,
    setup: valid ? (expectedDirection === "bullish" ? "bread_and_butter_buy" : "bread_and_butter_sell") : "no_trade",
    noTradeReasons: valid
      ? []
      : [
          !htfAligned ? "HTF or daily profile is not aligned." : "",
          !dailyAligned ? "Daily profile is not aligned." : "",
          !sweepAligned ? "Required liquidity raid is missing." : "",
          !candidateArray ? "FVG or PD array entry is missing." : "",
          !(fvg.displacement ?? ob.displacement) ? "Displacement is missing." : "",
          (rrEstimate ?? 0) < 1.2 ? "Reward/risk is too low for research candidate." : ""
        ].filter(Boolean),
    riskNotes: ["Bread & Butter candidate is still research-only and must pass news/session/risk filters."]
  });
};

export const evaluateIctBreadAndButterBuy = (snapshot: IctStrategySuiteMarketSnapshot) => evaluateBreadAndButter(snapshot, "bullish", "ict-bread-and-butter-buy");

export const evaluateIctBreadAndButterSell = (snapshot: IctStrategySuiteMarketSnapshot) => evaluateBreadAndButter(snapshot, "bearish", "ict-bread-and-butter-sell");

export const evaluateIctOneShotOneKill = (snapshot: IctStrategySuiteMarketSnapshot): IctStrategySignal => {
  const buy = evaluateIctBreadAndButterBuy(snapshot);
  const sell = evaluateIctBreadAndButterSell(snapshot);
  const best = buy.confidence >= sell.confidence ? buy : sell;
  const daily = evaluateIctDailyRange(snapshot);
  const noHighNews = !(snapshot.newsEvents ?? []).some((event) => event.impact === "high");
  const allConfluence =
    best.decision === "research_only" &&
    daily.decision === "research_only" &&
    Boolean(best.pdArray) &&
    Boolean(best.drawOnLiquidity) &&
    (best.rrEstimate ?? 0) >= DEFAULT_ICT_RISK_GOVERNOR_CONFIG.minRewardRisk &&
    noHighNews;
  return createSignal({
    snapshot,
    strategyId: "ict-one-shot-one-kill",
    side: allConfluence ? best.side : "flat",
    decision: allConfluence ? "research_only" : "no_trade",
    confidence: allConfluence ? Math.min(0.88, best.confidence + 0.12) : 0.18,
    timeframeBias: best.timeframeBias,
    dealingRange: best.dealingRange,
    liquiditySwept: best.liquiditySwept,
    drawOnLiquidity: best.drawOnLiquidity,
    displacement: best.displacement,
    pdArray: best.pdArray,
    entryZone: best.entryZone,
    invalidation: best.invalidation,
    target: best.target,
    rrEstimate: best.rrEstimate,
    setup: allConfluence ? "one_shot_one_kill" : "no_trade",
    noTradeReasons: allConfluence
      ? []
      : [
          "OSOK requires HTF bias, daily profile, sweep, displacement, clean PD array, correct premium/discount, clear draw, RR >= 2, valid session, and no high-impact news.",
          ...best.noTradeReasons.slice(0, 4)
        ],
    riskNotes: ["One Shot One Kill is intentionally strict and low-frequency."]
  });
};

export const evaluateIctIndexFuturesRelativeStrength = (snapshot: IctStrategySuiteMarketSnapshot): IctStrategySignal => {
  const related = snapshot.relatedMarkets ?? {};
  const ownBias = candleBias(snapshot.candles);
  const nqBias = candleBias(related.NQ ?? related.NASDAQ ?? []);
  const esBias = candleBias(related.ES ?? related.SPX ?? []);
  const ymBias = candleBias(related.YM ?? related.US30 ?? []);
  const indexes = [nqBias, esBias, ymBias].filter((bias) => bias !== "neutral");
  const bullish = indexes.filter((bias) => bias === "bullish").length;
  const bearish = indexes.filter((bias) => bias === "bearish").length;
  const coherent = indexes.length >= 2 && (bullish === indexes.length || bearish === indexes.length);
  const conflicting = bullish > 0 && bearish > 0;
  const direction = coherent ? (bullish > bearish ? "bullish" : "bearish") : ownBias;
  const confidence = coherent ? 0.6 : conflicting ? 0.25 : 0.42;
  return createSignal({
    snapshot,
    strategyId: "ict-index-futures-rs",
    side: sideForDirection(direction),
    decision: coherent && !conflicting ? "research_only" : "no_trade",
    confidence,
    timeframeBias: resolveTimeframeBias(snapshot),
    setup: coherent && !conflicting ? "index_relative_strength" : "no_trade",
    noTradeReasons: coherent && !conflicting ? [] : [conflicting ? "Index futures are conflicting." : "Not enough related index context for relative strength."],
    riskNotes: [
      `Relative strength context: NQ ${nqBias}, ES ${esBias}, YM ${ymBias}.`,
      "Relative strength confirms or rejects candidates; it is not an entry model by itself."
    ]
  });
};

export const evaluateIctRiskGovernor = (
  snapshot: IctStrategySuiteMarketSnapshot,
  signal: IctStrategySignal,
  config?: Partial<IctRiskGovernorConfig>,
  allSignalsForDay: IctStrategySignal[] = []
): IctStrategySignal =>
  createSignal({
    snapshot,
    strategyId: "ict-risk-governor",
    side: applyRiskGovernor({ allSignalsForDay, candles: snapshot.candles, config, newsEvents: snapshot.newsEvents, signal }).side,
    decision: applyRiskGovernor({ allSignalsForDay, candles: snapshot.candles, config, newsEvents: snapshot.newsEvents, signal }).decision,
    confidence: applyRiskGovernor({ allSignalsForDay, candles: snapshot.candles, config, newsEvents: snapshot.newsEvents, signal }).confidence,
    timeframeBias: signal.timeframeBias,
    dealingRange: signal.dealingRange,
    liquiditySwept: signal.liquiditySwept,
    drawOnLiquidity: signal.drawOnLiquidity,
    pdArray: signal.pdArray,
    displacement: signal.displacement,
    entryZone: signal.entryZone,
    invalidation: signal.invalidation,
    target: signal.target,
    rrEstimate: signal.rrEstimate,
    setup: applyRiskGovernor({ allSignalsForDay, candles: snapshot.candles, config, newsEvents: snapshot.newsEvents, signal }).setup,
    noTradeReasons: applyRiskGovernor({ allSignalsForDay, candles: snapshot.candles, config, newsEvents: snapshot.newsEvents, signal }).noTradeReasons,
    riskNotes: applyRiskGovernor({ allSignalsForDay, candles: snapshot.candles, config, newsEvents: snapshot.newsEvents, signal }).riskNotes
  });

export const evaluateIctStrategySuite = (
  snapshot: IctStrategySuiteMarketSnapshot,
  options: { riskConfig?: Partial<IctRiskGovernorConfig> } = {}
): IctStrategySuiteEvaluation => {
  const normalizedSnapshot: IctStrategySuiteMarketSnapshot = {
    ...snapshot,
    candles: normalizeCandles(snapshot.candles)
  };
  const htf = evaluateIctHtfBias(normalizedSnapshot);
  const daily = evaluateIctDailyRange(normalizedSnapshot);
  const liquidityRun = evaluateIctLiquidityRun(normalizedSnapshot, htf);
  const fvg = evaluateIctFvgDisplacement(normalizedSnapshot, htf);
  const orderBlock = evaluateIctOrderBlock(normalizedSnapshot, htf);
  const breadBuy = evaluateIctBreadAndButterBuy(normalizedSnapshot);
  const breadSell = evaluateIctBreadAndButterSell(normalizedSnapshot);
  const osok = evaluateIctOneShotOneKill(normalizedSnapshot);
  const indexRs = evaluateIctIndexFuturesRelativeStrength(normalizedSnapshot);
  const candidates = [htf, daily, liquidityRun, fvg, orderBlock, breadBuy, breadSell, osok, indexRs];
  const bestCandidate =
    candidates
      .filter((candidate) => candidate.decision === "research_only")
      .sort((a, b) => b.confidence - a.confidence || (b.rrEstimate ?? 0) - (a.rrEstimate ?? 0))[0] ?? htf;
  const riskDecision = evaluateIctRiskGovernor(normalizedSnapshot, bestCandidate, options.riskConfig, candidates);
  const allSignals = [...candidates, riskDecision];
  const journalEvents = allSignals.map((signal) =>
    buildIctStrategyJournalEvent(signal, {
      dailyProfile: daily.dailyRangeProjection.dailyProfile,
      marketSnapshotId: normalizedSnapshot.snapshotId
    })
  );
  return {
    evaluationId: createId("ict_suite_eval"),
    packageName: "ict-strategy-suite",
    version: "ict_strategy_suite_v1",
    symbol: normalizedSnapshot.symbol,
    provider: normalizedSnapshot.provider,
    sourceFingerprint: normalizedSnapshot.sourceFingerprint,
    candleCount: normalizedSnapshot.candles.length,
    signals: allSignals,
    riskDecision,
    journalEvents,
    generatedAt: new Date().toISOString(),
    authority: {
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    }
  };
};
