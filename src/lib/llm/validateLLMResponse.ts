import type {
  LLMAgentResponse,
  LLMProceedRecommendation,
  LLMResponseValidationResult
} from "@/lib/llm/llmTypes";
import { requiredLLMAgents, requiredLLMAgentIds } from "@/lib/llm/llmPromptTemplates";

const allowedBiases = new Set(["bullish", "bearish", "neutral", "no_opinion"]);
const allowedAgentIds = new Set(requiredLLMAgentIds);
const allowedRecommendations = new Set<LLMProceedRecommendation>([
  "continue_research",
  "rerun_validation",
  "paper_demo_candidate_review"
]);

const unsafeTextMatchers = [
  { reason: "direct trade execution", pattern: /\b(?:execute|place|send)\s+(?:a\s+|an\s+|the\s+)?(?:trade|order)s?\b/i },
  { reason: "position control", pattern: /\b(?:open|close)\s+(?:a\s+|an\s+|the\s+)?position\b/i },
  { reason: "broker connection or control", pattern: /\b(?:connect|route|submit|control)\s+(?:to\s+)?(?:a\s+)?broker\b/i },
  { reason: "broker connection or control", pattern: /\bbroker\s+(?:connection|control|execution|routing)\b/i },
  { reason: "readiness bypass", pattern: /\b(?:bypass|override|ignore|skip)\s+(?:the\s+)?readiness\b/i },
  { reason: "readiness bypass", pattern: /\breadiness\s+(?:bypass|override)\b/i },
  { reason: "approval authority", pattern: /\bapprove\s+(?:the\s+)?(?:trade|order|paper|demo|live|execution)\b/i },
  { reason: "trading enablement", pattern: /\benable\s+(?:paper\s+|demo\s+|live\s+)?trading\b/i },
  { reason: "API key handling", pattern: /\b(?:api\s*key|secret\s+key|openai_api_key)\b/i }
];

const arrayOfStrings = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string");

const freeTextFieldsFor = (response: Partial<LLMAgentResponse>) => {
  const fields: Array<[string, string]> = [];
  if (typeof response.reasoningSummary === "string") {
    fields.push(["reasoningSummary", response.reasoningSummary]);
  }
  for (const field of ["riskWarnings", "missingEvidence", "suggestedCalibration", "safetyNotes"] as const) {
    const value = response[field];
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "string") {
          fields.push([`${field}[${index}]`, item]);
        }
      });
    }
  }
  return fields;
};

const isSafelyNegated = (text: string, matchIndex: number) => {
  const prefix = text.slice(Math.max(0, matchIndex - 32), matchIndex).toLowerCase();
  return /\b(?:no|not|cannot|can not|must not|do not|does not|without)\s+[\w\s-]*$/.test(prefix);
};

const unsafeLanguageFindings = (response: Partial<LLMAgentResponse>) => {
  const findings: string[] = [];
  for (const [field, text] of freeTextFieldsFor(response)) {
    for (const matcher of unsafeTextMatchers) {
      matcher.pattern.lastIndex = 0;
      const match = matcher.pattern.exec(text);
      if (match && !isSafelyNegated(text, match.index)) {
        findings.push(`${field} contains unsafe phrase "${match[0]}" (${matcher.reason})`);
      }
    }
  }
  return findings;
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
  } else if (!allowedAgentIds.has(response.agentId)) {
    errors.push(`agentId must be one of the ${requiredLLMAgents.length} required futures-context reviewers`);
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
  errors.push(...unsafeLanguageFindings(response));

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function missingRequiredLLMAgents(responses: Array<Partial<LLMAgentResponse>>) {
  const receivedIds = new Set(responses.map((response) => response.agentId).filter(Boolean));
  return requiredLLMAgents.filter((agent) => !receivedIds.has(agent.agentId));
}

export function validateLLMResponseSet(responses: Array<Partial<LLMAgentResponse>>): LLMResponseValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(responses)) {
    return {
      valid: false,
      errors: ["responses must be an array"],
      warnings
    };
  }

  const seenIds = new Set<string>();
  for (const response of responses) {
    if (response.agentId && seenIds.has(response.agentId)) {
      errors.push(`${response.agentId}: duplicate LLM reviewer response`);
    }
    if (response.agentId) {
      seenIds.add(response.agentId);
    }
    const result = validateLLMResponse(response);
    errors.push(...result.errors.map((error) => `${response.agentId ?? "unknown"}: ${error}`));
    warnings.push(...result.warnings.map((warning) => `${response.agentId ?? "unknown"}: ${warning}`));
  }

  for (const agent of missingRequiredLLMAgents(responses)) {
    errors.push(`${agent.agentName} (${agent.agentId}): required futures-context reviewer response is missing`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
