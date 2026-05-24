import type { AgentLayer, ICTConcept, ICTContext, MarketBias, ThesisInput } from "@/lib/types";

export type InternalAgentId =
  | "ict-liquidity-agent"
  | "ict-structure-agent"
  | "session-timing-agent"
  | "risk-reward-agent"
  | "volatility-regime-agent"
  | "cio-agent";

export interface InternalAgentRunContext {
  input: ThesisInput;
  ictContext: ICTContext;
}

export interface InternalAgentOpinion {
  agentId: InternalAgentId;
  name: string;
  layer: AgentLayer;
  bias: MarketBias;
  confidence: number;
  weight: number;
  reasoning: string;
  supportingFactors: string[];
  warningFactors: string[];
  recommendation: string;
  ictTags: ICTConcept[];
}

export interface InternalAgentDefinition {
  agentId: Exclude<InternalAgentId, "cio-agent">;
  name: string;
  layer: AgentLayer;
  weight: number;
  run(context: InternalAgentRunContext): InternalAgentOpinion;
}

export interface CIOSynthesisResult {
  finalBias: MarketBias;
  confidence: number;
  thesisSummary: string;
  reasoningSummary: string;
  riskNotes: string;
  invalidationLevel: number;
  targetLiquidity: number;
  entryZone: [number, number];
  riskReward: number;
  cioOpinion: InternalAgentOpinion;
}
