import type { LLMAgentResponse, LLMResearchContextPacket } from "@/lib/llm/llmTypes";

export const LLM_LOCAL_BRIDGE_URL = "http://127.0.0.1:8787/llm/run-advisory";

export interface LocalBridgeRunResult {
  responses: LLMAgentResponse[];
  responseFile?: string;
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
    throw new Error("Local LLM bridge server is not running.");
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
