import type {
  AgentDebateSession,
  DebateModeratorOutput,
  DebatePosition,
  OpeningStatement
} from "@/lib/agentDebate/debateTypes";
import type { TradeThesis } from "@/lib/types";
import { clamp, safeArray, safeTopN } from "@/lib/utils";

const positionForBias = (bias: OpeningStatement["initialBias"]): DebatePosition =>
  bias === "bullish" ? "long" : bias === "bearish" ? "short" : "flat";

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function moderateDebateConsensus({
  thesis,
  openingStatements,
  rounds,
  consensusThreshold = 3
}: {
  thesis: TradeThesis;
  openingStatements: OpeningStatement[];
  rounds: AgentDebateSession["rounds"];
  consensusThreshold?: number;
}): DebateModeratorOutput {
  const latestProbabilityByAgent = new Map<string, number>();
  safeArray(rounds)
    .flatMap((round) => safeArray(round.messages))
    .forEach((message) => latestProbabilityByAgent.set(message.fromAgent, message.updatedProbability));

  const longAgents = openingStatements.filter((statement) => statement.initialBias === "bullish");
  const shortAgents = openingStatements.filter((statement) => statement.initialBias === "bearish");
  const flatAgents = openingStatements.filter(
    (statement) => statement.initialBias === "neutral" || statement.initialBias === "no_opinion"
  );
  const leadingGroup = longAgents.length >= shortAgents.length ? longAgents : shortAgents;
  const position = longAgents.length >= consensusThreshold && longAgents.length > shortAgents.length
    ? "long"
    : shortAgents.length >= consensusThreshold && shortAgents.length > longAgents.length
      ? "short"
      : "flat";
  const alignedAgentCount = position === "long" ? longAgents.length : position === "short" ? shortAgents.length : flatAgents.length;
  const consensusReached = position !== "flat" && alignedAgentCount >= consensusThreshold;
  const alignedProbabilities = leadingGroup.map((statement) =>
    latestProbabilityByAgent.get(statement.agentId) ?? statement.initialProbability
  );
  const probability = consensusReached ? clamp(average(alignedProbabilities), 0.05, 0.95) : clamp(average(openingStatements.map((statement) => statement.initialProbability)) * 0.65, 0.05, 0.62);

  const technicalConflict =
    openingStatements.some((statement) => statement.agentName.includes("Structure") && positionForBias(statement.initialBias) !== position && position !== "flat") ||
    openingStatements.some((statement) => statement.agentName.includes("Risk/Reward") && positionForBias(statement.initialBias) !== position && position !== "flat") ||
    openingStatements.some((statement) => statement.agentName.includes("Volatility") && statement.initialBias === "neutral" && position !== "flat");

  const agreementPoints = consensusReached
    ? safeTopN(leadingGroup.flatMap((statement) => statement.evidence), 5)
    : ["No required 3-agent directional alignment was reached."];
  const disagreements = [
    ...safeTopN(openingStatements.filter((statement) => !leadingGroup.includes(statement)).map((statement) => `${statement.agentName}: ${statement.initialBias}`), 5),
    ...(technicalConflict ? ["Technical/structure and risk/regime evidence conflict; desk must keep this explicit."] : [])
  ];
  const minorityView = disagreements.length
    ? disagreements.join("; ")
    : "No meaningful minority view recorded.";
  const noConsensusReason = consensusReached
    ? undefined
    : "No consensus because fewer than the required agents aligned, or long/short evidence remained deadlocked.";

  return {
    consensusReached,
    position,
    probability: Number(probability.toFixed(2)),
    agreementPoints,
    disagreements,
    invalidation: consensusReached
      ? `Use CIO simulated invalidation at ${thesis.invalidationLevel}; debate cannot alter this deterministic level.`
      : "Flat/no thesis until new deterministic facts or stronger agent alignment appears.",
    minorityView,
    deskReasoning: consensusReached
      ? `Moderator sees ${alignedAgentCount} agent(s) aligned for ${position}; probability reflects post-round conviction and immutable ICT facts.`
      : "Moderator declares flat because debate did not produce a tradeable research consensus.",
    noConsensusReason,
    alignmentThreshold: consensusThreshold,
    alignedAgentCount,
    safetyNotes: [
      "Consensus is research-only.",
      "No trade execution.",
      "No broker control.",
      "No readiness override.",
      "Minority view remains preserved."
    ]
  };
}
