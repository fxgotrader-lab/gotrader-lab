import { detectBOS } from "@/lib/ict/detectBOS";
import { detectFairValueGaps } from "@/lib/ict/detectFVG";
import { detectLiquiditySweeps } from "@/lib/ict/detectLiquiditySweeps";
import { detectMSS } from "@/lib/ict/detectMSS";
import { detectSwings } from "@/lib/ict/detectSwings";
import { resolveDealingRange } from "@/lib/ict/dealingRangePremiumDiscount";
import { evaluateEntryConfirmation } from "@/lib/ict/entryConfirmationFramework";
import { resolveHigherTimeframeBias } from "@/lib/ict/higherTimeframeBias";
import { classifyMarketCycle } from "@/lib/ict/marketCycleClassifier";
import { detectModelOnePowerThree } from "@/lib/ict/modelOnePowerThree";
import { findSundayOpenState, findTwelveAmOpenState } from "@/lib/ict/openingPriceEquilibrium";
import { buildPdArrayHierarchy } from "@/lib/ict/pdArrayHierarchy";
import { classifyTimePriceAlignment } from "@/lib/ict/timePriceAlignment";
import { resolveSessionTimeMapping } from "@/lib/sessions";
import type {
  GrinchInvalidationPlan,
  GrinchPhase1ContextInput,
  GrinchPhase1ModelOutput,
  GrinchTargetHierarchy
} from "@/lib/strategyLibrary/grinchStrategyTypes";
import type { Candle } from "@/lib/types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const numericLevel = (label: string, value?: number) => (typeof value === "number" ? `${label} ${value.toFixed(2)}` : `${label} unavailable`);

const targetHierarchyFor = (output: {
  twelveAmOpen?: number;
  rangeHigh: number;
  rangeLow: number;
  htfDraw: string;
  strongestPdArray?: string;
}): GrinchTargetHierarchy => {
  const directionalExtreme = output.htfDraw === "sellside" ? output.rangeLow : output.rangeHigh;
  return {
    target1:
      typeof output.twelveAmOpen === "number"
        ? numericLevel("12AM Open", output.twelveAmOpen)
        : numericLevel(output.htfDraw === "sellside" ? "Range low" : "Range high", directionalExtreme),
    target2: output.strongestPdArray ?? "Next respected PD array in delivery path",
    target3:
      output.htfDraw === "sellside"
        ? numericLevel("External sellside liquidity", output.rangeLow)
        : output.htfDraw === "buyside"
          ? numericLevel("External buyside liquidity", output.rangeHigh)
          : "External liquidity objective unclear"
  };
};

const invalidationFor = (output: {
  rangeHigh: number;
  rangeLow: number;
  htfDraw: string;
  timingReason: string;
  modelState: string;
  strongestPdArray?: string;
}): GrinchInvalidationPlan => ({
  primaryInvalidation:
    output.htfDraw === "sellside"
      ? numericLevel("Close back above range high", output.rangeHigh)
      : output.htfDraw === "buyside"
        ? numericLevel("Close back below range low", output.rangeLow)
        : "Material violation of active dealing range",
  secondaryInvalidation: output.strongestPdArray ? `Material violation of ${output.strongestPdArray}` : "PD array mean-threshold violation",
  timeInvalidation: output.timingReason,
  narrativeInvalidation:
    output.modelState === "valid"
      ? "Model 1 invalidates if PD array respect fails before displacement continuation."
      : "Narrative invalidates if missing Model 1 evidence remains unresolved."
});

const filterCandles = (candles: Candle[], options?: GrinchPhase1ContextInput["options"]) => {
  const scoped = candles
    .filter((candle) => !options?.symbol || candle.symbol === options.symbol)
    .filter((candle) => !options?.timeframe || candle.timeframe === options.timeframe);
  const source = scoped.length ? scoped : candles;
  return source.slice(-Math.max(40, options?.lookbackCandles ?? 320));
};

export function analyzeGrinchPhase1(input: GrinchPhase1ContextInput): GrinchPhase1ModelOutput {
  const candles = filterCandles(input.candles, input.options);
  const latestCandle = candles[candles.length - 1];
  const generatedAt = new Date().toISOString();
  const sessionTimeMapping =
    input.options?.sessionTimeMapping ??
    resolveSessionTimeMapping({
      provider: input.options?.sourceProvider,
      requestedSymbol: input.options?.requestedSymbol ?? input.options?.symbol,
      brokerSymbol: input.options?.brokerSymbol ?? latestCandle?.symbol,
      symbol: input.options?.symbol ?? latestCandle?.symbol,
      candles
    });
  const swings = input.swings ?? detectSwings(candles, 2);
  const fairValueGaps = input.fairValueGaps ?? detectFairValueGaps(candles);
  const liquiditySweeps = input.liquiditySweeps ?? detectLiquiditySweeps(candles, swings);
  const mss = detectMSS(candles, swings);
  const bos = detectBOS(candles, swings);
  const structureEvents = input.structureEvents ?? [...mss, ...bos].sort((a, b) => a.index - b.index);
  const dealingRange = resolveDealingRange(candles, swings, input.options?.lookbackCandles);
  const sundayOpenState = findSundayOpenState(candles, sessionTimeMapping);
  const twelveAmOpenState = findTwelveAmOpenState(candles, sessionTimeMapping);
  const pdHierarchy = buildPdArrayHierarchy({
    candles,
    fairValueGaps,
    liquiditySweeps,
    structureEvents,
    sundayOpenState,
    twelveAmOpenState
  });
  const htfBias = resolveHigherTimeframeBias(dealingRange, liquiditySweeps);
  const marketCycle = classifyMarketCycle(candles, dealingRange);
  const timePriceAlignment = classifyTimePriceAlignment(input.options?.currentTimestamp ?? input.options?.referenceTimestamp ?? latestCandle?.timestamp, sessionTimeMapping);
  const modelOne = detectModelOnePowerThree({
    candles,
    dealingRange,
    pdArrays: pdHierarchy.rankedPdArrays,
    timePriceAlignment,
    twelveAmOpenState,
    sessionTimeMapping
  });
  const entryConfirmation = evaluateEntryConfirmation({
    candles,
    fairValueGaps,
    modelOne,
    pdArrays: pdHierarchy.rankedPdArrays,
    structureEvents,
    timePriceAlignment
  });
  const targetHierarchy = targetHierarchyFor({
    twelveAmOpen: twelveAmOpenState.price,
    rangeHigh: dealingRange.rangeHigh,
    rangeLow: dealingRange.rangeLow,
    htfDraw: htfBias.htfDrawOnLiquidity,
    strongestPdArray: pdHierarchy.strongestActive?.label
  });
  const invalidation = invalidationFor({
    rangeHigh: dealingRange.rangeHigh,
    rangeLow: dealingRange.rangeLow,
    htfDraw: htfBias.htfDrawOnLiquidity,
    timingReason: timePriceAlignment.reason,
    modelState: modelOne.modelOneState,
    strongestPdArray: pdHierarchy.strongestActive?.label
  });
  const confidenceAdjustment = clamp(
    htfBias.confidence * 0.3 +
      marketCycle.confidence * 0.18 +
      entryConfirmation.confirmationScore * 0.28 +
      (modelOne.modelOneState === "valid" ? 0.18 : modelOne.modelOneState === "weak" ? 0.08 : 0) +
      (timePriceAlignment.timingGrade === "ideal" ? 0.08 : timePriceAlignment.timingGrade === "acceptable" ? 0.04 : -0.05),
    -0.2,
    0.9
  );
  const reasons = [
    ...htfBias.reasons,
    ...marketCycle.reasons,
    ...modelOne.reasons,
    ...entryConfirmation.reasons,
    `HTF liquidity objective: ${htfBias.liquidityObjective}`,
    `Timing: ${timePriceAlignment.reason}`
  ];
  const missingEvidence = [
    ...htfBias.missingEvidence,
    ...pdHierarchy.missingEvidence,
    ...modelOne.missingEvidence,
    ...entryConfirmation.missingEvidence
  ];

  return {
    modelId: "grinch_phase_1_model_1",
    generatedAt,
    symbol: input.options?.symbol ?? latestCandle?.symbol,
    timeframe: input.options?.timeframe ?? latestCandle?.timeframe,
    sessionTimeMapping,
    htfBias: htfBias.htfBias,
    htfDrawOnLiquidity: htfBias.htfDrawOnLiquidity,
    dealingRange,
    activePdArrays: pdHierarchy.activePdArrays,
    rankedPdArrays: pdHierarchy.rankedPdArrays,
    sundayOpenState,
    twelveAmOpenState,
    marketCycle: marketCycle.marketCycle,
    modelOneState: modelOne.modelOneState,
    tradeIntent: modelOne.tradeIntent,
    timingGrade: timePriceAlignment.timingGrade,
    targetHierarchy,
    invalidation,
    entryConfirmation,
    confidenceAdjustment: Number(confidenceAdjustment.toFixed(2)),
    reasons: Array.from(new Set(reasons)).slice(0, 16),
    missingEvidence: Array.from(new Set(missingEvidence)).slice(0, 16),
    safetyNotice: "Research-only ICT profile. No broker execution, no order placement, no readiness override."
  };
}

export const summarizeGrinchPhase1 = (summary?: GrinchPhase1ModelOutput) => {
  if (!summary) {
    return "Grinch Phase 1 unavailable.";
  }
  return [
    `Bias ${summary.htfBias}`,
    `draw ${summary.htfDrawOnLiquidity}`,
    `${summary.dealingRange.premiumDiscountState} of range`,
    `cycle ${summary.marketCycle}`,
    `Model 1 ${summary.modelOneState}`,
    `timing ${summary.timingGrade}`
  ].join(" / ");
};
