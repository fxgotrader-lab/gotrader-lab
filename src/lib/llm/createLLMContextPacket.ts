import {
  buildLLMResearchContextPacket
} from "@/lib/llm/llmAgentOrchestrator";
import type {
  LLMProviderMode,
  LLMResearchContextPacket
} from "@/lib/llm/llmTypes";
import type { ReadinessGateSnapshot } from "@/lib/readiness";
import type { ResearchQualityReview } from "@/lib/researchQuality";
import type { SimulationRunbookState } from "@/lib/simulationRunbook";
import type { LabState } from "@/lib/types";
import type { ValidationSuiteReport } from "@/lib/validation";

export interface CreateLLMContextPacketInput {
  state: LabState;
  validation?: ValidationSuiteReport;
  quality?: ResearchQualityReview;
  readiness?: ReadinessGateSnapshot;
  runbook?: SimulationRunbookState;
  providerMode: LLMProviderMode;
}

export function createLLMContextPacket(input: CreateLLMContextPacketInput): LLMResearchContextPacket {
  return buildLLMResearchContextPacket(input);
}

export function serializeLLMContextPacket(packet: LLMResearchContextPacket) {
  return JSON.stringify(packet, null, 2);
}
