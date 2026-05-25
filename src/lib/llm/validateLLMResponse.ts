import type {
  LLMAgentResponse,
  LLMProceedRecommendation,
  LLMResponseValidationResult
} from "@/lib/llm/llmTypes";

const allowedBiases = new Set(["bullish", "bearish", "neutral", "no_opinion"]);
const allowedRecommendations = new Set<LLMProceedRecommendation>([
  "continue_research",
  "rerun_validation",
  "paper_demo_candidate_review"
]);

const unsafePatterns = [
  /place\s+(an\s+)?order/i,
  /execute\s+(the\s+)?trade/i,
  /send\s+(the\s+)?order/i,
  /connect\s+to\s+(a\s+)?broker/i,
  /bypass\s+(the\s+)?readiness/i,
  /override\s+(the\s+)?readiness/i,
  /approve\s+(paper|demo|live)/i,
  /enable\s+(paper|demo|live)\s+trading/i,
  /modify\s+broker/i,
  /increase\s+contracts/i,
  /api\s*key/i
];

const arrayOfStrings = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string");

const includesUnsafeLanguage = (response: Partial<LLMAgentResponse>) => {
  const text = JSON.stringify(response).toLowerCase();
  return unsafePatterns.some((pattern) => pattern.test(text));
};

export function parseLLMResponseJson(raw: string): { response?: Partial<LLMAgentResponse>; error?: string } {
  try {
    return { response: JSON.parse(raw) as Partial<LLMAgentResponse> };
  } catch {
    return { error: "response is not valid JSON" };
  }
}

export function validateLLMResponse(response: Partial<LLMAgentResponse>): LLMResponseValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response.agentId) {
    errors.push("agentId is required");
  }
  if (!response.agentName) {
    errors.push("agentName is required");
  }
  if (response.mode !== "advisory_only") {
    errors.push('mode must be "advisory_only"');
  }
  if (response.executionAuthority !== "none") {
    errors.push('executionAuthority must be "none"');
  }
  if (response.brokerAuthority !== "none") {
    errors.push('brokerAuthority must be "none"');
  }
  if (response.readinessOverrideAuthority !== "none") {
    errors.push('readinessOverrideAuthority must be "none"');
  }
  if (!allowedBiases.has(response.bias ?? "")) {
    errors.push("bias must be bullish, bearish, neutral, or no_opinion");
  }
  if (typeof response.confidence !== "number" || !Number.isFinite(response.confidence)) {
    errors.push("confidence is required");
  } else if (response.confidence < 0 || response.confidence > 1) {
    errors.push("confidence must be between 0 and 1");
  }
  if (
    response.agreesWithBaseline !== true &&
    response.agreesWithBaseline !== false &&
    response.agreesWithBaseline !== null
  ) {
    errors.push("agreesWithBaseline must be true, false, or null");
  }
  if (!response.reasoningSummary) {
    warnings.push("reasoningSummary is missing");
  }
  if (!arrayOfStrings(response.riskWarnings)) {
    errors.push("riskWarnings must be an array of strings");
  }
  if (!arrayOfStrings(response.missingEvidence)) {
    errors.push("missingEvidence must be an array of strings");
  }
  if (!arrayOfStrings(response.suggestedCalibration)) {
    errors.push("suggestedCalibration must be an array of strings");
  }
  if (!allowedRecommendations.has(response.proceedRecommendation as LLMProceedRecommendation)) {
    errors.push("proceedRecommendation must be advisory-only");
  }
  if (!arrayOfStrings(response.safetyNotes)) {
    errors.push("safetyNotes must be an array of strings");
  }
  if (includesUnsafeLanguage(response)) {
    errors.push("response suggests execution, broker control, key handling, or readiness bypass");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
