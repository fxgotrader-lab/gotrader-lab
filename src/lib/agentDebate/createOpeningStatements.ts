import type { OpeningStatement } from "@/lib/agentDebate/debateTypes";
import type { AgentDebateMessage, TradeThesis } from "@/lib/types";
import { safeArray } from "@/lib/utils";

export function createOpeningStatements(
  thesis: TradeThesis,
  messages: AgentDebateMessage[]
): OpeningStatement[] {
  return safeArray(messages).map((message) => ({
    agentId: message.agentId,
    agentName: message.agentName,
    layer: message.layer,
    initialBias: message.stance,
    initialProbability: message.confidence,
    evidence: safeArray(message.supportingFactors),
    warnings: safeArray(message.warningFactors),
    assumptions: [
      `Immutable ICT bias is ${thesis.ictContext.bias}.`,
      `Immutable CIO thesis bias is ${thesis.finalBias}.`,
      "Debate may update interpretation confidence only."
    ],
    confidence: message.confidence
  }));
}
