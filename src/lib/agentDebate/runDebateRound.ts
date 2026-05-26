import type {
  DebateMessage,
  DebateMessageType,
  OpeningStatement
} from "@/lib/agentDebate/debateTypes";
import type { TradeThesis } from "@/lib/types";
import { clamp, safeArray, uid } from "@/lib/utils";
import { validateDebateMessage } from "@/lib/agentDebate/validateDebateMessage";

const biasToPosition = (bias: OpeningStatement["initialBias"]) =>
  bias === "bullish" ? "long" : bias === "bearish" ? "short" : "flat";

const directionForRound = (openingStatements: OpeningStatement[]) => {
  const longCount = openingStatements.filter((statement) => statement.initialBias === "bullish").length;
  const shortCount = openingStatements.filter((statement) => statement.initialBias === "bearish").length;
  if (longCount > shortCount) {
    return "bullish" as const;
  }
  if (shortCount > longCount) {
    return "bearish" as const;
  }
  return "neutral" as const;
};

const messageTypeFor = (
  statement: OpeningStatement,
  direction: "bullish" | "bearish" | "neutral",
  round: number
): DebateMessageType => {
  if (statement.initialBias === "no_opinion" || statement.initialBias === "neutral" || direction === "neutral") {
    return "qualify";
  }
  if (statement.initialBias === direction) {
    return round === 1 ? "support" : "add_context";
  }
  if (statement.confidence < 0.5 && round > 1) {
    return "concede";
  }
  return "challenge";
};

const probabilityFor = (statement: OpeningStatement, type: DebateMessageType, thesis: TradeThesis) => {
  const confluenceNudge = thesis.ictContext.confluenceBreakdown.confidence * 0.08;
  if (type === "support" || type === "add_context") {
    return clamp(statement.confidence + confluenceNudge, 0.05, 0.95);
  }
  if (type === "concede") {
    return clamp(statement.confidence - 0.12, 0.05, 0.95);
  }
  if (type === "challenge") {
    return clamp(statement.confidence - 0.05, 0.05, 0.95);
  }
  return clamp(statement.confidence - 0.02, 0.05, 0.95);
};

const contentFor = (
  statement: OpeningStatement,
  type: DebateMessageType,
  thesis: TradeThesis,
  direction: "bullish" | "bearish" | "neutral"
) => {
  const facts = [
    `ICT bias ${thesis.ictContext.bias}`,
    `confluence ${(thesis.ictContext.confluenceScore * 100).toFixed(0)}%`,
    `kill zone ${thesis.ictContext.killZone}`,
    `premium/discount ${thesis.ictContext.premiumDiscount}`
  ].join(", ");

  if (type === "support") {
    return `${statement.agentName} supports the ${direction} interpretation because its opening evidence aligns with ${facts}.`;
  }
  if (type === "challenge") {
    return `${statement.agentName} challenges the ${direction} read because its evidence points ${statement.initialBias} and warnings remain unresolved.`;
  }
  if (type === "concede") {
    return `${statement.agentName} concedes lower conviction because its evidence is weaker than the broader desk alignment.`;
  }
  if (type === "add_context") {
    return `${statement.agentName} adds context without changing immutable facts: ${safeArray(statement.evidence)[0] ?? facts}.`;
  }
  return `${statement.agentName} qualifies the desk view because evidence is mixed or incomplete; immutable facts remain ${facts}.`;
};

export function runDebateRound(
  thesis: TradeThesis,
  openingStatements: OpeningStatement[],
  round: number
): DebateMessage[] {
  const direction = directionForRound(openingStatements);

  return openingStatements.map((statement) => {
    const messageType = messageTypeFor(statement, direction, round);
    const updatedProbability = probabilityFor(statement, messageType, thesis);
    const convictionChange =
      updatedProbability > statement.confidence + 0.02
        ? "higher"
        : updatedProbability < statement.confidence - 0.02
          ? "lower"
          : "same";
    const message: DebateMessage = {
      messageId: uid("debate_msg"),
      round,
      fromAgent: statement.agentId,
      fromAgentName: statement.agentName,
      toAgent: "all",
      messageType,
      content: contentFor(statement, messageType, thesis, direction),
      evidenceReferenced: [
        ...safeArray(statement.evidence).slice(0, 2),
        `ICT confluence ${(thesis.ictContext.confluenceScore * 100).toFixed(0)}%`,
        `position ${biasToPosition(statement.initialBias)}`
      ],
      updatedProbability,
      convictionChange,
      safetyNotes: [
        "No execution authority.",
        "No broker control.",
        "No readiness override.",
        "Deterministic facts remain immutable."
      ]
    };
    const validation = validateDebateMessage(message);
    return validation.valid
      ? message
      : {
          ...message,
          messageType: "qualify",
          content: `${statement.agentName} message was constrained after validation; advisory-only interpretation remains.`,
          safetyNotes: [...message.safetyNotes, `Validation adjusted: ${validation.errors.join("; ")}`]
        };
  });
}
