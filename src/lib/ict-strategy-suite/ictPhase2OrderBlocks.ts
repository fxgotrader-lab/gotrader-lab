import type { Candle } from "../types";
import {
  calculateDealingRange,
  detectBreakerBlock,
  detectDisplacement,
  detectFairValueGap,
  detectLiquidityPools,
  detectLiquiditySweep,
  detectMitigationBlock,
  detectOrderBlock,
  detectPropulsionBlock,
  detectReclaimedOrderBlock,
  detectRejectionBlock,
  detectVacuumBlock,
  estimateRewardRisk,
  findNearestDrawOnLiquidity,
  normalizeCandles
} from "./ictStrategySuiteHelpers";
import type { IctPdArray } from "./ictStrategySuiteTypes";
import {
  evaluateApprovedSetupProfile,
  getDefaultApprovedSetupProfiles
} from "./ictApprovedSetupProfile";
import type {
  IctAdvisorDealingRange,
  IctAdvisorDisplacement,
  IctAdvisorFairValueGap,
  IctAdvisorLiquidityPool,
  IctAdvisorSignal,
  IctBias
} from "./ictAdvisorTypes";
import type {
  IctOrderBlockClassification,
  IctOrderBlockVariant
} from "./ictPhase2Types";

const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export interface IctPhase2SignalContext {
  brokerSymbol: string;
  candles: Candle[];
  htfCandles: Record<string, Candle[]>;
  primaryTimeframe: string;
  requestedSymbol: string;
  symbol: string;
}

export interface IctPhase2MarketContext extends IctPhase2SignalContext {
  bias: {
    primary: IctBias;
    htf: Record<string, IctBias>;
    composite: IctBias;
  };
}

export interface IctPhase2OrderBlockContext {
  candles: Candle[];
  primaryTimeframe: string;
}

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const candleBias = (candles: Candle[] = []): IctBias => {
  const normalized = normalizeCandles(candles);
  const first = normalized[0];
  const last = normalized.at(-1);
  if (!first || !last) return "neutral";
  const change = (last.close - first.open) / Math.max(Math.abs(first.open), 0.01);
  if (change > 0.001) return "bullish";
  if (change < -0.001) return "bearish";
  return "neutral";
};

const compositeBiasFor = (primary: IctBias, htf: Record<string, IctBias>): IctBias => {
  const votes = Object.values(htf);
  if (!votes.length) return "neutral";
  const bullish = votes.filter((bias) => bias === "bullish").length + (primary === "bullish" ? 0.5 : 0);
  const bearish = votes.filter((bias) => bias === "bearish").length + (primary === "bearish" ? 0.5 : 0);
  if (bullish > bearish && bullish >= 1.5) return "bullish";
  if (bearish > bullish && bearish >= 1.5) return "bearish";
  return "neutral";
};

export const buildPhase2MarketContext = (context: IctPhase2SignalContext): IctPhase2MarketContext => {
  const primary = candleBias(context.candles);
  const htf = Object.fromEntries(Object.entries(context.htfCandles).map(([timeframe, candles]) => [timeframe, candleBias(candles)]));
  return {
    ...context,
    bias: {
      primary,
      htf,
      composite: compositeBiasFor(primary, htf)
    }
  };
};

const toAdvisorDealingRange = (range?: ReturnType<typeof calculateDealingRange>, sourceTimeframe = "5m"): IctAdvisorDealingRange | undefined =>
  range
    ? {
        high: range.high,
        low: range.low,
        midpoint: range.midpoint,
        currentLocation: range.currentLocation,
        sourceTimeframe
      }
    : undefined;

const toAdvisorDisplacement = (displacement?: ReturnType<typeof detectDisplacement>): IctAdvisorDisplacement | undefined =>
  displacement
    ? {
        direction: displacement.direction,
        candleTime: displacement.candleTime,
        impulseHigh: displacement.impulseHigh,
        impulseLow: displacement.impulseLow,
        bodySize: displacement.bodySize,
        createdFvg: displacement.createdFvg
      }
    : undefined;

const toAdvisorFvg = (fvg?: ReturnType<typeof detectFairValueGap>, timeframe = "5m"): IctAdvisorFairValueGap | undefined =>
  fvg
    ? {
        direction: fvg.direction,
        high: fvg.high,
        low: fvg.low,
        midpoint: fvg.midpoint ?? round((fvg.high + fvg.low) / 2),
        timeframe,
        mitigated: fvg.mitigated,
        createdAt: fvg.createdAt
      }
    : undefined;

const toAdvisorLiquidityPool = (pool?: ReturnType<typeof detectLiquidityPools>[number]): IctAdvisorLiquidityPool | undefined =>
  pool
    ? {
        type: pool.type as IctAdvisorLiquidityPool["type"],
        price: pool.price,
        timeframe: pool.timeframe,
        swept: pool.swept,
        distanceFromCurrent: pool.distanceFromCurrent
      }
    : undefined;

const blockHigh = (block: IctPdArray) => Math.max(block.high, block.low);
const blockLow = (block: IctPdArray) => Math.min(block.high, block.low);

const classifyPdArray = ({
  block,
  candles,
  primaryTimeframe,
  variant
}: {
  block?: IctPdArray;
  candles: Candle[];
  primaryTimeframe: string;
  variant: IctOrderBlockVariant;
}): IctOrderBlockClassification | undefined => {
  const normalized = normalizeCandles(candles);
  const latest = normalized.at(-1);
  if (!block || !latest) return undefined;
  const displacement = detectDisplacement(normalized);
  const pools = detectLiquidityPools(normalized);
  const sweep = detectLiquiditySweep(normalized, pools);
  const dealingRange = calculateDealingRange(normalized);
  const high = blockHigh(block);
  const low = blockLow(block);
  const invalidated = block.direction === "bullish" ? latest.close < low : latest.close > high;
  const bodyConfluence = displacement?.direction === block.direction ? 0.25 : 0;
  const sweepConfluence = sweep?.direction === block.direction ? 0.2 : 0;
  const rangeConfluence =
    dealingRange?.currentLocation === "equilibrium"
      ? 0.04
      : block.direction === "bullish" && dealingRange?.currentLocation === "discount"
        ? 0.18
        : block.direction === "bearish" && dealingRange?.currentLocation === "premium"
          ? 0.18
          : 0.08;
  const confidence = clamp(0.32 + bodyConfluence + sweepConfluence + rangeConfluence + (block.mitigated ? 0.05 : 0) - (invalidated ? 0.3 : 0));
  return {
    variant,
    direction: block.direction,
    high,
    low,
    midpoint: block.midpoint ?? round((high + low) / 2),
    createdAt: block.createdAt,
    timeframe: block.timeframe ?? primaryTimeframe,
    mitigated: block.mitigated,
    invalidated,
    displacementConfirmed: displacement?.direction === block.direction,
    liquiditySweepConfirmed: sweep?.direction === block.direction,
    premiumDiscountLocation: dealingRange?.currentLocation,
    confidence,
    reason: `${variant.replace(/_/g, " ")} classified with ${displacement?.direction === block.direction ? "matching" : "missing"} displacement and ${sweep?.direction === block.direction ? "matching" : "missing"} liquidity sweep.`
  };
};

export const detectStandardOrderBlock = (context: IctPhase2OrderBlockContext) =>
  classifyPdArray({
    block: detectOrderBlock(context.candles),
    candles: context.candles,
    primaryTimeframe: context.primaryTimeframe,
    variant: "standard_order_block"
  });

export const detectReclaimedOrderBlockClassification = (context: IctPhase2OrderBlockContext) =>
  classifyPdArray({
    block: detectReclaimedOrderBlock(context.candles),
    candles: context.candles,
    primaryTimeframe: context.primaryTimeframe,
    variant: "reclaimed_order_block"
  });

export const detectMitigationBlockClassification = (context: IctPhase2OrderBlockContext) =>
  classifyPdArray({
    block: detectMitigationBlock(context.candles),
    candles: context.candles,
    primaryTimeframe: context.primaryTimeframe,
    variant: "mitigation_block"
  });

export const detectRejectionBlockClassification = (context: IctPhase2OrderBlockContext) =>
  classifyPdArray({
    block: detectRejectionBlock(context.candles),
    candles: context.candles,
    primaryTimeframe: context.primaryTimeframe,
    variant: "rejection_block"
  });

export const detectBreakerBlockClassification = (context: IctPhase2OrderBlockContext) =>
  classifyPdArray({
    block: detectBreakerBlock(context.candles),
    candles: context.candles,
    primaryTimeframe: context.primaryTimeframe,
    variant: "breaker_block"
  });

export const detectPropulsionBlockClassification = (context: IctPhase2OrderBlockContext) =>
  classifyPdArray({
    block: detectPropulsionBlock(context.candles),
    candles: context.candles,
    primaryTimeframe: context.primaryTimeframe,
    variant: "propulsion_block"
  });

export const detectVacuumBlockClassification = (context: IctPhase2OrderBlockContext) =>
  classifyPdArray({
    block: detectVacuumBlock(context.candles),
    candles: context.candles,
    primaryTimeframe: context.primaryTimeframe,
    variant: "vacuum_block"
  });

export const classifyOrderBlocks = (context: IctPhase2OrderBlockContext): IctOrderBlockClassification[] =>
  [
    detectStandardOrderBlock(context),
    detectReclaimedOrderBlockClassification(context),
    detectMitigationBlockClassification(context),
    detectRejectionBlockClassification(context),
    detectBreakerBlockClassification(context),
    detectPropulsionBlockClassification(context),
    detectVacuumBlockClassification(context)
  ]
    .filter((block): block is IctOrderBlockClassification => Boolean(block))
    .sort((left, right) => right.confidence - left.confidence);

export const selectBestOrderBlockCandidate = (context: IctPhase2OrderBlockContext) => classifyOrderBlocks(context)[0];

export const addApprovedProfileDecision = (signal: IctAdvisorSignal): IctAdvisorSignal => {
  const profile = getDefaultApprovedSetupProfiles()[0];
  return {
    ...signal,
    approvedProfileDecision: evaluateApprovedSetupProfile(signal, profile)
  };
};

const targetTooClose = (currentPrice: number, target?: IctAdvisorLiquidityPool, range?: IctAdvisorDealingRange) => {
  if (!target || !range) return true;
  const distance = Math.abs(target.price - currentPrice);
  return distance <= Math.abs(range.high - range.low) * 0.05;
};

export const buildPhase2BaseSignal = ({
  confidence,
  context,
  decision,
  noTradeReasons,
  orderBlock,
  setup,
  side,
  strategyId,
  summary,
  riskNotes
}: {
  confidence: number;
  context: IctPhase2MarketContext;
  decision: IctAdvisorSignal["decision"];
  noTradeReasons: string[];
  orderBlock?: IctOrderBlockClassification;
  setup: IctAdvisorSignal["setup"];
  side: IctAdvisorSignal["side"];
  strategyId: IctAdvisorSignal["strategyId"];
  summary: string;
  riskNotes: string[];
}): IctAdvisorSignal => {
  const normalized = normalizeCandles(context.candles);
  const currentPrice = normalized.at(-1)?.close ?? 0;
  const pools = detectLiquidityPools(normalized);
  const sweep = detectLiquiditySweep(normalized, pools);
  const displacement = detectDisplacement(normalized);
  const fvg = detectFairValueGap(normalized);
  const dealingRange = toAdvisorDealingRange(calculateDealingRange(normalized), context.primaryTimeframe);
  const drawOnLiquidity = toAdvisorLiquidityPool(findNearestDrawOnLiquidity(pools, currentPrice, context.bias.composite));
  const liquiditySwept = toAdvisorLiquidityPool(sweep?.pool);
  const advisorFvg = toAdvisorFvg(fvg, context.primaryTimeframe);
  const invalidation =
    orderBlock?.direction === "bullish"
      ? Math.min(orderBlock.low, ...normalized.slice(-8).map((candle) => candle.low))
      : orderBlock?.direction === "bearish"
        ? Math.max(orderBlock.high, ...normalized.slice(-8).map((candle) => candle.high))
        : undefined;
  const target = drawOnLiquidity?.price;
  const entryZone = orderBlock
    ? {
        type: orderBlock.variant,
        high: orderBlock.high,
        low: orderBlock.low,
        midpoint: orderBlock.midpoint
      }
    : undefined;
  const rrEstimate = estimateRewardRisk({ entry: entryZone?.midpoint, invalidation, target });
  const signal: IctAdvisorSignal = {
    strategyId,
    phase: "phase_2",
    symbol: context.symbol,
    requestedSymbol: context.requestedSymbol,
    brokerSymbol: context.brokerSymbol,
    primaryTimeframe: context.primaryTimeframe,
    htfTimeframes: Object.keys(context.bias.htf),
    researchOnly: true,
    side,
    decision,
    confidence,
    bias: context.bias,
    dealingRange,
    liquiditySwept,
    drawOnLiquidity,
    displacement: toAdvisorDisplacement(displacement),
    fairValueGap: advisorFvg,
    orderBlock,
    entryZone,
    invalidation,
    target,
    rrEstimate,
    setup,
    summary,
    noTradeReasons: Array.from(new Set(noTradeReasons)),
    riskNotes: Array.from(
      new Set([
        ...riskNotes,
        "Phase 2 ICT model is research-only and produces no execution intent.",
        "Approved setup profile gates remain authoritative."
      ])
    ),
    provenance: {
      methodology: "ICT",
      phase: "phase_2",
      sourceSet: "ICT Mentorship Core Content",
      researchOnly: true,
      generatedAt: new Date().toISOString()
    }
  };
  const withProfile = addApprovedProfileDecision(signal);
  const blockedByProfile =
    withProfile.approvedProfileDecision?.status === "rejected_candidate" ||
    withProfile.approvedProfileDecision?.status === "no_trade";
  return {
    ...withProfile,
    decision: blockedByProfile ? withProfile.decision : withProfile.decision,
    noTradeReasons: Array.from(
      new Set([
        ...withProfile.noTradeReasons,
        targetTooClose(currentPrice, drawOnLiquidity, dealingRange) ? "Draw-on-liquidity target is too close or missing." : ""
      ].filter(Boolean))
    )
  };
};
