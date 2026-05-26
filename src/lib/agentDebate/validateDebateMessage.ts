import type { DebateMessage } from "@/lib/agentDebate/debateTypes";

const unsafePhrases = [
  "execute trade",
  "place trade",
  "send order",
  "open position",
  "close position",
  "approve readiness",
  "override readiness",
  "enable broker",
  "broker control",
  "live trading"
];

export interface DebateMessageValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateDebateMessage(message: DebateMessage): DebateMessageValidationResult {
  const errors: string[] = [];
  const content = message.content.toLowerCase();
  const unsafePhrase = unsafePhrases.find((phrase) => content.includes(phrase));

  if (unsafePhrase) {
    errors.push(`content includes unsafe phrase "${unsafePhrase}"`);
  }
  if (!Number.isFinite(message.updatedProbability)) {
    errors.push("updatedProbability must be a finite number");
  }
  if (message.updatedProbability < 0 || message.updatedProbability > 1) {
    errors.push("updatedProbability must stay between 0 and 1");
  }
  if (!message.safetyNotes.some((note) => note.toLowerCase().includes("no execution"))) {
    errors.push("safetyNotes must state no execution authority");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
