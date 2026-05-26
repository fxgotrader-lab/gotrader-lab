import { researchAgentRegistry } from "@/lib/agents/agentRegistry";
import type { InternalAgentOpinion } from "@/lib/agents/agentTypes";
import type { ICTContext, ThesisInput } from "@/lib/types";
import { buildMarketContext } from "@/lib/marketData";

export function runAgents(input: ThesisInput, ictContext: ICTContext): InternalAgentOpinion[] {
  const marketContext = buildMarketContext({ symbol: input.symbol, timeframe: input.timeframe, mode: "mock" });
  return researchAgentRegistry.map((agent) => agent.run({ input, ictContext, marketContext }));
}
