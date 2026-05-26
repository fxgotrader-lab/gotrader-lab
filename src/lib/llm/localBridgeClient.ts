import type { LLMAgentResponse, LLMResearchContextPacket } from "@/lib/llm/llmTypes";

export const LLM_LOCAL_BRIDGE_BASE_URL = "http://127.0.0.1:8787";
export const LLM_LOCAL_BRIDGE_HEALTH_URL = `${LLM_LOCAL_BRIDGE_BASE_URL}/health`;
export const LLM_LOCAL_BRIDGE_URL = `${LLM_LOCAL_BRIDGE_BASE_URL}/llm/run-advisory`;

export interface LocalBridgeHealthResult {
  status: "ok";
  service: "gotrader_llm_bridge";
  mode: "advisory_only";
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface LocalBridgeRunResult {
  responses: LLMAgentResponse[];
  responseFile?: string;
}

export async function checkLocalBridgeHealth(
  endpoint = LLM_LOCAL_BRIDGE_HEALTH_URL
): Promise<LocalBridgeHealthResult> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });
  } catch {
    throw new Error("Local LLM bridge server is not running.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Local LLM bridge health check returned a non-JSON response.");
  }

  if (!response.ok) {
    const errorPayload = payload as { error?: string; message?: string };
    throw new Error(
      errorPayload.message ??
        errorPayload.error ??
        "Local LLM bridge health check failed. Opening / in browser is not the advisory endpoint. Use /health to verify bridge status."
    );
  }

  const health = payload as Partial<LocalBridgeHealthResult>;
  if (
    health.status !== "ok" ||
    health.service !== "gotrader_llm_bridge" ||
    health.mode !== "advisory_only" ||
    health.executionAuthority !== "none" ||
    health.brokerAuthority !== "none" ||
    health.readinessOverrideAuthority !== "none"
  ) {
    throw new Error("Local LLM bridge health check returned an unsafe or unexpected payload.");
  }

  return health as LocalBridgeHealthResult;
}

export async function runLocalBridgeAdvisory(
  packet: LLMResearchContextPacket,
  endpoint = LLM_LOCAL_BRIDGE_URL
): Promise<LocalBridgeRunResult> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(packet)
    });
  } catch {
    throw new Error("Local LLM bridge server is not running. Opening / in browser is not the advisory endpoint. Use /health to verify bridge status.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Local LLM bridge returned a non-JSON response.");
  }

  if (!response.ok) {
    const errorPayload = payload as { error?: string };
    throw new Error(errorPayload.error ?? "Local LLM bridge request failed.");
  }

  const bridgePayload = payload as {
    responses?: LLMAgentResponse[];
    responseFile?: string;
  };
  if (!Array.isArray(bridgePayload.responses)) {
    throw new Error("Local LLM bridge response did not include responses[].");
  }

  return {
    responses: bridgePayload.responses,
    responseFile: bridgePayload.responseFile
  };
}
