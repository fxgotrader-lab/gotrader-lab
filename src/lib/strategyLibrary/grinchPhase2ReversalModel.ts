import { analyzeGrinchPhase1 } from "@/lib/strategyLibrary/grinchPhase1Model";
import { detectReversalProfile } from "@/lib/ict/reversalProfile";
import type {
  GrinchPhase2ReversalContextInput,
  GrinchPhase2ReversalModelOutput,
  GrinchReversalProfileResult
} from "@/lib/strategyLibrary/grinchStrategyTypes";
import type { Candle } from "@/lib/types";

const filterCandles = (candles: Candle[], options?: GrinchPhase2ReversalContextInput["options"]) => {
  const scoped = candles
    .filter((candle) => !options?.symbol || candle.symbol === options.symbol)
    .filter((candle) => !options?.timeframe || candle.timeframe === options.timeframe);
  const source = scoped.length ? scoped : candles;
  return source.slice(-Math.max(40, options?.lookbackCandles ?? 320));
};

export function analyzeGrinchPhase2Reversal(input: GrinchPhase2ReversalContextInput): GrinchPhase2ReversalModelOutput {
  const candles = filterCandles(input.candles, input.options);
  const latestCandle = candles[candles.length - 1];
  const phase1 =
    input.phase1 ??
    analyzeGrinchPhase1({
      ...input,
      candles
    });
  const reversal = detectReversalProfile({ candles, phase1 });

  return {
    modelId: "grinch_phase_2_reversal_profile",
    generatedAt: new Date().toISOString(),
    symbol: input.options?.symbol ?? latestCandle?.symbol ?? phase1.symbol,
    timeframe: input.options?.timeframe ?? latestCandle?.timeframe ?? phase1.timeframe,
    phase1ModelId: phase1.modelId,
    htfBias: phase1.htfBias,
    htfDrawOnLiquidity: phase1.htfDrawOnLiquidity,
    marketCycle: phase1.marketCycle,
    twelveAmOpenState: phase1.twelveAmOpenState,
    activePdArray: phase1.activePdArrays[0]?.label,
    ...reversal,
    safetyNotice: "Research-only reversal profile. No broker execution, no order placement, no readiness override."
  };
}

export const summarizeGrinchReversalProfile = (summary?: GrinchReversalProfileResult) => {
  if (!summary) {
    return "Grinch Reversal Profile unavailable.";
  }
  return [
    `Reversal ${summary.reversalProfileState}`,
    `12AM ${summary.twelveAmInteractionState}`,
    `London ${summary.londonBehavior}`,
    `NY ${summary.nyReversalWindow}`,
    `continuation ${summary.continuationBeyond12am}`,
    `entry ${summary.entryIntent}`
  ].join(" / ");
};
