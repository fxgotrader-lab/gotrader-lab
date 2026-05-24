import { researchAgentRegistry } from "@/lib/agents/agentRegistry";
import type { InternalAgentOpinion } from "@/lib/agents/agentTypes";
import type { ICTContext, ThesisInput } from "@/lib/types";

export function runAgents(input: ThesisInput, ictContext: ICTContext): InternalAgentOpinion[] {
  return researchAgentRegistry.map((agent) => agent.run({ input, ictContext }));
}
