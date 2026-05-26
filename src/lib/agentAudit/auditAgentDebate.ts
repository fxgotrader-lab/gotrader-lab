import type { AgentDebateSession } from "@/lib/agentDebate";
import { createAgentDecisionTrace } from "@/lib/agentAudit/createAgentDecisionTrace";
import type { AgentDecisionTrace } from "@/lib/agentAudit/agentAuditTypes";
import { safeArray, safeTopN } from "@/lib/utils";

export function auditAgentDebateSession(session?: AgentDebateSession): AgentDecisionTrace[] {
  if (!session) {
    return [];
  }

  const moderator = session.moderatorOutput;
  const allMessages = safeArray(session.rounds).flatMap((round) => safeArray(round.messages));
  const challenged = allMessages.filter((message) => message.messageType === "challenge");
  const conceded = allMessages.filter((message) => message.messageType === "concede");

  return [
    createAgentDecisionTrace({
      agentId: "agent-debate-moderator",
      agentName: "Agent Debate Moderator",
      decisionType: "agent_debate",
      inputFacts: safeTopN(session.immutableFacts, 8),
      evidenceUsed: [
        ...safeTopN(moderator.agreementPoints, 5),
        `aligned agents ${moderator.alignedAgentCount}/${moderator.alignmentThreshold}`,
        `rounds ${session.roundCount}`
      ],
      evidenceMissing: moderator.consensusReached
        ? moderator.disagreements
        : [
            moderator.noConsensusReason ?? "No consensus reason was not specified.",
            ...moderator.disagreements
          ],
      evidenceIgnored: [],
      assumptions: [
        "Deterministic facts are immutable.",
        "Debate can update interpretation confidence only.",
        "No consensus means flat/no thesis."
      ],
      thresholdsUsed: [`consensus threshold ${moderator.alignmentThreshold}+ agents`],
      confidenceAfter: moderator.probability,
      finalBias: moderator.position === "long" ? "bullish" : moderator.position === "short" ? "bearish" : "neutral",
      finalRecommendation: moderator.consensusReached
        ? `Debate consensus is ${moderator.position} with probability ${Math.round(moderator.probability * 100)}%.`
        : "No tradeable consensus; keep research position flat.",
      riskWarnings: [
        ...safeTopN(moderator.disagreements, 6),
        ...safeTopN(challenged.map((message) => message.content), 3)
      ],
      decisionRulesApplied: [
        "Collect independent opening statements.",
        "Run bounded debate rounds.",
        "Require configured alignment threshold.",
        "Preserve minority view.",
        "Declare flat if consensus is absent."
      ],
      safetyConstraintsChecked: moderator.safetyNotes,
      possibleFailureModes: [
        "Agents may agree on weak evidence.",
        "Minority risk may be underweighted.",
        "Mock debate messages are deterministic until real LLM debate provider is wired."
      ],
      relatedEntityId: session.sessionId,
      relatedPage: "/agent-debate"
    }),
    ...safeTopN(conceded, 3).map((message) =>
      createAgentDecisionTrace({
        agentId: `agent-debate-${message.fromAgent}`,
        agentName: `${message.fromAgentName} Debate Update`,
        decisionType: "agent_debate",
        inputFacts: safeTopN(session.immutableFacts, 5),
        evidenceUsed: message.evidenceReferenced,
        evidenceMissing: [`Concession noted: ${message.content}`],
        evidenceIgnored: [],
        assumptions: ["Agent changed probability but not deterministic facts."],
        thresholdsUsed: [`updated probability ${(message.updatedProbability * 100).toFixed(0)}%`],
        confidenceAfter: message.updatedProbability,
        finalRecommendation: message.content,
        riskWarnings: [],
        decisionRulesApplied: [`message type ${message.messageType}`, `conviction ${message.convictionChange}`],
        safetyConstraintsChecked: message.safetyNotes,
        possibleFailureModes: ["Concession may hide a useful minority warning."],
        relatedEntityId: session.sessionId,
        relatedPage: "/agent-debate"
      })
    )
  ];
}
