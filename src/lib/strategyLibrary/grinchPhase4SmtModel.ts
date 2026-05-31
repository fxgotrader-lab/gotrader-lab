import { detectSmtIntermarketDivergence, normalizeSmtInstrument } from "@/lib/ict/smtIntermarketDivergence";
import { analyzeGrinchPhase1 } from "@/lib/strategyLibrary/grinchPhase1Model";
import { analyzeGrinchPhase2Reversal } from "@/lib/strategyLibrary/grinchPhase2ReversalModel";
import { analyzeGrinchPhase3Consolidation } from "@/lib/strategyLibrary/grinchPhase3ConsolidationModel";
import type {
  GrinchPhase4SmtContextInput,
  GrinchPhase4SmtModelOutput,
  GrinchSmtIntermarketResult
} from "@/lib/strategyLibrary/grinchStrategyTypes";
import type { Candle } from "@/lib/types";

const filterCandles = (candles: Candle[], options?: GrinchPhase4SmtContextInput["options"]) => {
  const scoped = candles
    .filter((candle) => !options?.symbol || candle.symbol === options.symbol)
    .filter((candle) => !options?.timeframe || candle.timeframe === options.timeframe);
  const source = scoped.length ? scoped : candles;
  return source.slice(-Math.max(40, options?.lookbackCandles ?? 320));
};

const resolveActiveProfile = ({
  consolidation,
  phase1,
  reversal
}: {
  consolidation?: GrinchPhase4SmtContextInput["consolidation"];
  phase1: NonNullable<GrinchPhase4SmtContextInput["phase1"]>;
  reversal?: GrinchPhase4SmtContextInput["reversal"];
}): Pick<GrinchPhase4SmtModelOutput, "activeProfile" | "activeProfileState"> => {
  if (consolidation?.consolidationProfileState === "valid" || consolidation?.consolidationProfileState === "weak") {
    return {
      activeProfile: "consolidation",
      activeProfileState: consolidation.consolidationProfileState
    };
  }
  if (reversal?.reversalProfileState === "valid" || reversal?.reversalProfileState === "weak") {
    return {
      activeProfile: "reversal",
      activeProfileState: reversal.reversalProfileState
    };
  }
  if (phase1.modelOneState === "valid" || phase1.modelOneState === "weak") {
    return {
      activeProfile: "model_1",
      activeProfileState: phase1.modelOneState
    };
  }
  return {
    activeProfile: "none",
    activeProfileState: "not_present"
  };
};

export function analyzeGrinchPhase4Smt(input: GrinchPhase4SmtContextInput): GrinchPhase4SmtModelOutput {
  const candles = filterCandles(input.candles, input.options);
  const latestCandle = candles[candles.length - 1];
  const phase1 =
    input.phase1 ??
    analyzeGrinchPhase1({
      ...input,
      candles
    });
  const reversal =
    input.reversal ??
    analyzeGrinchPhase2Reversal({
      ...input,
      candles,
      phase1
    });
  const consolidation =
    input.consolidation ??
    analyzeGrinchPhase3Consolidation({
      ...input,
      candles,
      phase1
    });
  const smt = detectSmtIntermarketDivergence({
    primaryCandles: candles,
    primaryInstrument: normalizeSmtInstrument(input.options?.symbol ?? latestCandle?.symbol ?? phase1.symbol),
    correlatedCandles: input.correlatedCandles,
    phase1,
    reversal,
    consolidation
  });
  const activeProfile = resolveActiveProfile({ consolidation, phase1, reversal });

  return {
    modelId: "grinch_phase_4_smt_intermarket_confirmation",
    generatedAt: new Date().toISOString(),
    symbol: input.options?.symbol ?? latestCandle?.symbol ?? phase1.symbol,
    timeframe: input.options?.timeframe ?? latestCandle?.timeframe ?? phase1.timeframe,
    phase1ModelId: phase1.modelId,
    reversalModelId: reversal.modelId,
    consolidationModelId: consolidation.modelId,
    ...activeProfile,
    ...smt,
    safetyNotice: "Research-only SMT confirmation. No standalone signal, no broker execution, no order placement, no readiness override."
  };
}

export const summarizeGrinchSmtIntermarket = (summary?: GrinchSmtIntermarketResult) => {
  if (!summary) {
    return "Grinch SMT unavailable.";
  }
  return [
    `SMT ${summary.smtState}`,
    `pair ${summary.primaryPair}`,
    `divergence ${summary.divergenceType}`,
    `leader ${summary.leaderInstrument}`,
    `supports bias ${String(summary.supportsBias)}`,
    `supports profile ${String(summary.supportsActiveProfile)}`
  ].join(" / ");
};
