import { createOpeningStatements } from "@/lib/agentDebate/createOpeningStatements";
import { moderateDebateConsensus } from "@/lib/agentDebate/moderateDebateConsensus";
import { runDebateRound } from "@/lib/agentDebate/runDebateRound";
import type {
  AgentDebateSession,
  AgentDebateState,
  AgentDebateSummary,
  DebateProviderMode
} from "@/lib/agentDebate/debateTypes";
import type { AgentDebateMessage, DebateSession, TradeThesis } from "@/lib/types";
import { safeArray, safeTopN, uid } from "@/lib/utils";

export const AGENT_DEBATE_STORAGE_KEY = "gotrader_ai_lab_agent_debate_state";
export const AGENT_DEBATE_UPDATED_EVENT = "gotrader-ai-lab-agent-debate-updated";

const safetyNotice = "Agent debate is research-only. It cannot execute trades, approve trades, or override readiness gates." as const;

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const initialState = (): AgentDebateState => ({
  sessions: [],
  safetyNotice
});

const publish = (state: AgentDebateState) => {
  if (isBrowser()) {
    window.localStorage.setItem(AGENT_DEBATE_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(AGENT_DEBATE_UPDATED_EVENT, { detail: state }));
  }
  return state;
};

export function loadAgentDebateState(): AgentDebateState {
  if (!isBrowser()) {
    return initialState();
  }

  const raw = window.localStorage.getItem(AGENT_DEBATE_STORAGE_KEY);
  if (!raw) {
    return publish(initialState());
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AgentDebateState>;
    return {
      ...initialState(),
      ...parsed,
      sessions: safeArray(parsed.sessions)
    };
  } catch {
    return publish(initialState());
  }
}

export function saveAgentDebateSession(session: AgentDebateSession): AgentDebateState {
  const state = loadAgentDebateState();
  return publish({
    ...state,
    latestSessionId: session.sessionId,
    sessions: safeTopN([session, ...safeArray(state.sessions).filter((item) => item.sessionId !== session.sessionId)], 10)
  });
}

export function clearAgentDebateHistory(): AgentDebateState {
  return publish(initialState());
}

export function latestAgentDebateSession(state = loadAgentDebateState()) {
  return safeArray(state.sessions).find((session) => session.sessionId === state.latestSessionId) ?? safeArray(state.sessions)[0];
}

export function summarizeAgentDebate(state = loadAgentDebateState()): AgentDebateSummary {
  const latestSession = latestAgentDebateSession(state);
  return {
    latestSession,
    consensusReached: Boolean(latestSession?.moderatorOutput.consensusReached),
    position: latestSession?.moderatorOutput.position ?? "flat",
    probability: latestSession?.moderatorOutput.probability ?? 0,
    strongestDisagreement: latestSession?.moderatorOutput.disagreements[0] ?? "No debate session yet.",
    minorityView: latestSession?.moderatorOutput.minorityView ?? "No minority view recorded.",
    latestTimestamp: latestSession?.timestamp
  };
}

export function runAgentDebateSession({
  thesis,
  sourceDebate,
  messages,
  mode = "deterministic_fallback",
  roundCount = 2,
  consensusThreshold = 3
}: {
  thesis: TradeThesis;
  sourceDebate?: DebateSession;
  messages?: AgentDebateMessage[];
  mode?: DebateProviderMode;
  roundCount?: number;
  consensusThreshold?: number;
}): AgentDebateSession {
  const sourceMessages = safeArray(messages?.length ? messages : sourceDebate?.messages);
  const openingStatements = createOpeningStatements(thesis, sourceMessages);
  const boundedRoundCount = Math.max(2, Math.min(3, roundCount));
  const rounds = Array.from({ length: boundedRoundCount }, (_, index) => {
    const round = index + 1;
    return {
      round,
      messages: runDebateRound(thesis, openingStatements, round)
    };
  });
  const moderatorOutput = moderateDebateConsensus({
    thesis,
    openingStatements,
    rounds,
    consensusThreshold
  });

  return {
    sessionId: uid("agent_debate"),
    thesisId: thesis.id,
    sourceDebateSessionId: sourceDebate?.id,
    timestamp: new Date().toISOString(),
    symbol: thesis.symbol,
    timeframe: thesis.timeframe,
    mode,
    roundCount: boundedRoundCount,
    consensusThreshold,
    immutableFacts: [
      `symbol ${thesis.symbol}`,
      `timeframe ${thesis.timeframe}`,
      `ICT bias ${thesis.ictContext.bias}`,
      `CIO thesis bias ${thesis.finalBias}`,
      thesis.regimeClassification
        ? `composite regime ${thesis.regimeClassification.stableLabel} (${Math.round(thesis.regimeClassification.confidence * 100)}%)`
        : "composite regime unavailable",
      `confluence ${(thesis.ictContext.confluenceScore * 100).toFixed(0)}%`,
      `invalidation ${thesis.invalidationLevel}`,
      `target ${thesis.targetLiquidity}`
    ],
    openingStatements,
    rounds,
    moderatorOutput,
    safetyNotice
  };
}
