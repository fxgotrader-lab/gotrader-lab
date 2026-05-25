import type {
  AdvisoryProceedRecommendation,
  AdvisoryResponse,
  AdvisoryResponseValidationResult
} from "@/lib/integrations/openclawHermesTypes";

const allowedProceedRecommendations = new Set<AdvisoryProceedRecommendation>([
  "continue_research",
  "rerun_validation",
  "paper_demo_candidate_review"
]);

const validAgents = new Set(["OpenClaw", "Hermes"]);

export function validateAdvisoryResponse(
  response: Partial<AdvisoryResponse>
): AdvisoryResponseValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response.packetId) {
    errors.push("packetId is required");
  }

  if (!response.responseId) {
    errors.push("responseId is required");
  }

  if (!response.timestamp) {
    errors.push("timestamp is required");
  }

  if (!validAgents.has(response.advisoryAgent ?? "")) {
    errors.push('advisoryAgent must be "OpenClaw" or "Hermes"');
  }

  if (response.mode !== "advisory_only") {
    errors.push('mode must remain "advisory_only"');
  }

  if (response.executionAuthority !== "none") {
    errors.push('executionAuthority must remain "none"');
  }

  if (response.brokerAuthority !== "none") {
    errors.push('brokerAuthority must remain "none"');
  }

  if (response.readinessOverrideAuthority !== "none") {
    errors.push('readinessOverrideAuthority must remain "none"');
  }

  if (!allowedProceedRecommendations.has(response.proceedRecommendation as AdvisoryProceedRecommendation)) {
    errors.push(
      "proceedRecommendation must be advisory-only: continue_research, rerun_validation, or paper_demo_candidate_review"
    );
  }

  if (typeof response.advisoryConfidence !== "number" || !Number.isFinite(response.advisoryConfidence)) {
    errors.push("advisoryConfidence is required");
  } else if (response.advisoryConfidence < 0 || response.advisoryConfidence > 1) {
    errors.push("advisoryConfidence must be between 0 and 1");
  }

  if (
    response.agreeWithThesis !== true &&
    response.agreeWithThesis !== false &&
    response.agreeWithThesis !== null
  ) {
    errors.push("agreeWithThesis must be true, false, or null");
  }

  if (!Array.isArray(response.riskWarnings)) {
    errors.push("riskWarnings must be an array");
  } else if (!response.riskWarnings.length) {
    warnings.push("riskWarnings is empty; advisory review may be shallow");
  }

  if (!Array.isArray(response.missingEvidence)) {
    errors.push("missingEvidence must be an array");
  }

  if (!Array.isArray(response.recommendedCalibration)) {
    errors.push("recommendedCalibration must be an array");
  }

  if (!response.notes) {
    warnings.push("notes are missing");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
