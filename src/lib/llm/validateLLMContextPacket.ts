import type { LLMResearchContextPacket } from "@/lib/llm/llmTypes";

export interface LLMContextPacketValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const isStringArray = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string");

export function validateLLMContextPacket(
  packet: Partial<LLMResearchContextPacket>
): LLMContextPacketValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!packet.packetId) {
    errors.push("packetId is required");
  }
  if (!packet.timestamp) {
    errors.push("timestamp is required");
  }
  if (packet.source !== "gotrader_ai_lab") {
    errors.push('source must be "gotrader_ai_lab"');
  }
  if (packet.mode !== "advisory_only") {
    errors.push('mode must be "advisory_only"');
  }
  if (packet.executionAuthority !== "none") {
    errors.push('executionAuthority must be "none"');
  }
  if (packet.brokerAuthority !== "none") {
    errors.push('brokerAuthority must be "none"');
  }
  if (packet.readinessOverrideAuthority !== "none") {
    errors.push('readinessOverrideAuthority must be "none"');
  }
  if (packet.researchMode !== "llm_required") {
    errors.push('researchMode must be "llm_required"');
  }
  if (!packet.providerMode) {
    errors.push("providerMode is required");
  }
  if (!isStringArray(packet.safetyConstraints)) {
    errors.push("safetyConstraints must be an array of strings");
  }
  if (!packet.symbol) {
    warnings.push("symbol is missing; generate a thesis before final LLM review");
  }
  if (!packet.timeframe) {
    warnings.push("timeframe is missing; generate a thesis before final LLM review");
  }
  if (!packet.cioThesis) {
    warnings.push("CIO thesis is missing");
  }
  if (!packet.validationSummary) {
    warnings.push("validation summary is missing");
  }
  if (!packet.researchQualityGrade) {
    warnings.push("research quality review is missing");
  }
  if (!packet.readinessState) {
    warnings.push("readiness gate snapshot is missing");
  }
  if (!packet.simulationRunbookStatus) {
    warnings.push("simulation runbook status is missing");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
