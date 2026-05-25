import type {
  AdvisoryRequestPacket,
  AdvisoryRequestPacketValidationResult
} from "@/lib/integrations/openclawHermesTypes";

export function validateAdvisoryRequestPacket(
  packet: Partial<AdvisoryRequestPacket>
): AdvisoryRequestPacketValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (packet.mode !== "advisory_only") {
    errors.push('mode must remain "advisory_only"');
  }

  if (packet.executionAuthority !== "none") {
    errors.push('executionAuthority must remain "none"');
  }

  if (packet.brokerAuthority !== "none") {
    errors.push('brokerAuthority must remain "none"');
  }

  if (packet.readinessOverrideAuthority !== "none") {
    errors.push('readinessOverrideAuthority must remain "none"');
  }

  if (packet.source !== "gotrader_ai_lab") {
    errors.push('source must remain "gotrader_ai_lab"');
  }

  if (!packet.packetId) {
    errors.push("packetId is required");
  }

  if (!packet.timestamp) {
    errors.push("timestamp is required");
  }

  if (!packet.thesisId) {
    errors.push("thesisId is required");
  }

  if (packet.thesisId && !packet.symbol) {
    errors.push("symbol is required when thesis exists");
  }

  if (packet.thesisId && !packet.timeframe) {
    errors.push("timeframe is required when thesis exists");
  }

  if (!packet.validationSummary) {
    warnings.push("validation summary is missing; run /validation for stronger advisory context");
  }

  if (!packet.researchQualityGrade) {
    warnings.push("research quality grade is missing; run /research-quality before advisory review");
  }

  if (!packet.readinessStatus) {
    warnings.push("readiness gate status is missing; run /readiness-gate before advisory review");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
