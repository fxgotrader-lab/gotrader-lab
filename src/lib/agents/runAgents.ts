import { researchAgentRegistry } from "@/lib/agents/agentRegistry";
import type { InternalAgentOpinion } from "@/lib/agents/agentTypes";
import type { Candle, ICTContext, ThesisInput } from "@/lib/types";
import { buildMarketContext } from "@/lib/marketData";
import { classifyMarketRegime, regimeAdjustedAgentWeight } from "@/lib/regime";

export function runAgents(input: ThesisInput, ictContext: ICTContext, candles?: Candle[]): InternalAgentOpinion[] {
  const marketContext = buildMarketContext({
    symbol: input.symbol,
    timeframe: input.timeframe,
    mode: candles?.length ? "imported" : "mock",
    candles
  });
  const regimeClassification = classifyMarketRegime({
    candles,
    marketContext,
    symbol: input.symbol,
    timeframe: input.timeframe
  });
  return researchAgentRegistry.map((agent) => {
    const opinion = agent.run({ input, ictContext, marketContext, regimeClassification });
    return {
      ...opinion,
      weight: regimeAdjustedAgentWeight(opinion.agentId, opinion.weight, regimeClassification)
    };
  });
}
