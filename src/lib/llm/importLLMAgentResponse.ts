import {
  requiredLLMAgents
} from "@/lib/llm/llmPromptTemplates";
import type {
  LLMAgentResponse,
  LLMAdvisoryRun,
  LLMAgentDefinition,
  LLMResponseValidationResult
} from "@/lib/llm/llmTypes";
import { missingRequiredLLMAgents, validateLLMResponse } from "@/lib/llm/validateLLMResponse";
import { uid } from "@/lib/utils";

export interface LLMAgentResponseImportResult {
  run?: LLMAdvisoryRun;
  responses: LLMAgentResponse[];
  valid: boolean;
  errors: string[];
  warnings: string[];
  unsafeResponseRejections: number;
  missingRequiredAgents: LLMAgentDefinition[];
}

const normalizeResponses = (parsed: unknown): LLMAgentResponse[] => {
  if (Array.isArray(parsed)) {
    return parsed as LLMAgentResponse[];
  }

  if (parsed && typeof parsed === "object") {
    const candidate = parsed as {
      responses?: unknown;
      agentResponses?: unknown;
      agentId?: unknown;
    };
    if (Array.isArray(candidate.responses)) {
      return candidate.responses as LLMAgentResponse[];
    }
    if (Array.isArray(candidate.agentResponses)) {
      return candidate.agentResponses as LLMAgentResponse[];
    }
    if (candidate.agentId) {
      return [candidate as LLMAgentResponse];
    }
  }

  return [];
};

export function importLLMAgentResponse(rawJson: string, contextPacketId = "manual_file_import"): LLMAgentResponseImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      responses: [],
      valid: false,
      errors: ["response is not valid JSON"],
      warnings,
      unsafeResponseRejections: 1,
      missingRequiredAgents: requiredLLMAgents
    };
  }

  const responses = normalizeResponses(parsed);
  if (!responses.length) {
    errors.push("response must be an array, { responses: [...] }, or a single agent response");
  }

  const validationResults: Record<string, LLMResponseValidationResult> = {};
  for (const response of responses) {
    const result = validateLLMResponse(response);
    validationResults[response.agentId ?? uid("unknown_llm_response")] = result;
    errors.push(...result.errors.map((error) => `${response.agentId ?? "unknown"}: ${error}`));
    warnings.push(...result.warnings.map((warning) => `${response.agentId ?? "unknown"}: ${warning}`));
  }

  const missingRequiredAgents = missingRequiredLLMAgents(responses);
  for (const agent of missingRequiredAgents) {
    errors.push(`${agent.agentName} (${agent.agentId}): required futures-context reviewer response is missing`);
  }

  const unsafeResponseRejections = Object.values(validationResults).filter((result) => !result.valid).length;
  const valid = errors.length === 0 && missingRequiredAgents.length === 0 && responses.length === requiredLLMAgents.length;
  const run: LLMAdvisoryRun | undefined = responses.length
    ? {
        runId: uid("llm_run_import"),
        timestamp: new Date().toISOString(),
        researchMode: "llm_required",
        providerMode: "local_command",
        providerConfigured: true,
        status: valid ? "complete" : "rejected",
        realProvider: valid,
        advisoryPassed: valid,
        contextPacketId,
        responses,
        validationResults,
        unsafeResponseRejections,
        readinessImpact: valid
          ? "Imported local-command LLM advisory response passed validation."
          : "Imported LLM response was rejected because one or more advisory-only checks failed.",
        safetyNotice: "LLM agents are advisory only. They cannot execute trades or override readiness gates."
      }
    : undefined;

  return {
    run,
    responses,
    valid,
    errors,
    warnings,
    unsafeResponseRejections: responses.length ? unsafeResponseRejections : 1,
    missingRequiredAgents
  };
}
