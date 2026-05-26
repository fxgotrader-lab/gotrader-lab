import type { InternalAgentId } from "@/lib/agents";
import type { AgentLayer, MarketBias, TradeThesis } from "@/lib/types";

export type DebateMessageType = "challenge" | "support" | "concede" | "qualify" | "add_context";

export type DebateConvictionChange = "higher" | "lower" | "same";

export type DebatePosition = "long" | "short" | "flat";

export type DebateProviderMode = "deterministic_fallback" | "mock_llm" | "local_command";

export interface OpeningStatement {
  agentId: InternalAgentId | string;
  agentName: string;
  layer: AgentLayer | "llm";
  initialBias: MarketBias | "no_opinion";
  initialProbability: number;
  evidence: string[];
  warnings: string[];
  assumptions: string[];
  confidence: number;
}

export interface DebateMessage {
  messageId: string;
  round: number;
  fromAgent: string;
  fromAgentName: string;
  toAgent: string | "all";
  messageType: DebateMessageType;
  content: string;
  evidenceReferenced: string[];
  updatedProbability: number;
  convictionChange: DebateConvictionChange;
  safetyNotes: string[];
}

export interface DebateModeratorOutput {
  consensusReached: boolean;
  position: DebatePosition;
  probability: number;
  agreementPoints: string[];
  disagreements: string[];
  invalidation: string;
  minorityView: string;
  deskReasoning: string;
  noConsensusReason?: string;
  alignmentThreshold: number;
  alignedAgentCount: number;
  safetyNotes: string[];
}

export interface AgentDebateSession {
  sessionId: string;
  thesisId: string;
  sourceDebateSessionId?: string;
  timestamp: string;
  symbol: TradeThesis["symbol"];
  timeframe: TradeThesis["timeframe"];
  mode: DebateProviderMode;
  roundCount: number;
  consensusThreshold: number;
  immutableFacts: string[];
  openingStatements: OpeningStatement[];
  rounds: Array<{
    round: number;
    messages: DebateMessage[];
  }>;
  moderatorOutput: DebateModeratorOutput;
  safetyNotice: "Agent debate is research-only. It cannot execute trades, approve trades, or override readiness gates.";
}

export interface AgentDebateState {
  latestSessionId?: string;
  sessions: AgentDebateSession[];
  safetyNotice: "Agent debate is research-only. It cannot execute trades, approve trades, or override readiness gates.";
}

export interface AgentDebateSummary {
  latestSession?: AgentDebateSession;
  consensusReached: boolean;
  position: DebatePosition;
  probability: number;
  strongestDisagreement: string;
  minorityView: string;
  latestTimestamp?: string;
}
