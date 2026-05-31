import { detectConsolidationProfile } from "@/lib/ict/consolidationProfile";
import { analyzeGrinchPhase1 } from "@/lib/strategyLibrary/grinchPhase1Model";
import type {
  GrinchConsolidationProfileResult,
  GrinchPhase3ConsolidationContextInput,
  GrinchPhase3ConsolidationModelOutput
} from "@/lib/strategyLibrary/grinchStrategyTypes";
import type { Candle } from "@/lib/types";

const filterCandles = (candles: Candle[], options?: GrinchPhase3ConsolidationContextInput["options"]) => {
  const scoped = candles
    .filter((candle) => !options?.symbol || candle.symbol === options.symbol)
    .filter((candle) => !options?.timeframe || candle.timeframe === options.timeframe);
  const source = scoped.length ? scoped : candles;
  return source.slice(-Math.max(40, options?.lookbackCandles ?? 320));
};

export function analyzeGrinchPhase3Consolidation(input: GrinchPhase3ConsolidationContextInput): GrinchPhase3ConsolidationModelOutput {
  const candles = filterCandles(input.candles, input.options);
  const latestCandle = candles[candles.length - 1];
  const phase1 =
    input.phase1 ??
    analyzeGrinchPhase1({
      ...input,
      candles
    });
  const consolidation = detectConsolidationProfile({ candles, phase1 });

  return {
    modelId: "grinch_phase_3_consolidation_profile",
    generatedAt: new Date().toISOString(),
    symbol: input.options?.symbol ?? latestCandle?.symbol ?? phase1.symbol,
    timeframe: input.options?.timeframe ?? latestCandle?.timeframe ?? phase1.timeframe,
    phase1ModelId: phase1.modelId,
    htfBias: phase1.htfBias,
    htfDrawOnLiquidity: phase1.htfDrawOnLiquidity,
    marketCycle: phase1.marketCycle,
    twelveAmOpenState: phase1.twelveAmOpenState,
    activePdArray: phase1.activePdArrays[0]?.label,
    ...consolidation,
    safetyNotice: "Research-only consolidation profile. No broker execution, no order placement, no readiness override."
  };
}

export const summarizeGrinchConsolidationProfile = (summary?: GrinchConsolidationProfileResult) => {
  if (!summary) {
    return "Grinch Consolidation Profile unavailable.";
  }
  return [
    `Consolidation ${summary.consolidationProfileState}`,
    `12AM ${summary.twelveAmRelationship}`,
    `raid ${summary.liquidityRaidState}`,
    `direction ${summary.expectedExpansionDirection}`,
    `entry ${summary.entryIntent}`,
    `timing ${summary.timingGrade}`
  ].join(" / ");
};
