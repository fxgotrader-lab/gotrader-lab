import type { LLMAgentResponse, LLMResearchContextPacket } from "@/lib/llm/llmTypes";

export const LLM_LOCAL_BRIDGE_BASE_URL = "http://127.0.0.1:8787";
export const LLM_LOCAL_BRIDGE_HEALTH_URL = `${LLM_LOCAL_BRIDGE_BASE_URL}/health`;
export const LLM_LOCAL_BRIDGE_URL = `${LLM_LOCAL_BRIDGE_BASE_URL}/llm/run-advisory`;
export const LLM_LOCAL_BRIDGE_ADVISORY_TIMEOUT_MS = 2000;
export const LLM_LOCAL_BRIDGE_HEALTH_TIMEOUT_MS = 1200;
export const LLM_LOCAL_BRIDGE_OFFLINE_COOLDOWN_MS = 60_000;

export interface LocalBridgeHealthResult {
  status: "ok";
  service: "gotrader_llm_bridge";
  mode: "advisory_only";
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export type LocalBridgeUnavailableReason =
  | "bridge_offline"
  | "timeout"
  | "circuit_open"
  | "request_failed"
  | "invalid_response";

export interface LocalBridgeStatusSnapshot {
  status: "available" | "offline" | "unknown";
  reason?: LocalBridgeUnavailableReason;
  message?: string;
  lastCheckedAt?: string;
  offlineUntil?: string;
}

export interface LocalBridgeRunSuccessResult {
  advisoryStatus: "available";
  responses: LLMAgentResponse[];
  responseFile?: string;
}

export interface LocalBridgeRunUnavailableResult {
  advisoryStatus: "unavailable";
  reason: LocalBridgeUnavailableReason;
  confidence: 0;
  warnings: string[];
  offlineUntil?: string;
}

export type LocalBridgeRunResult = LocalBridgeRunSuccessResult | LocalBridgeRunUnavailableResult;

let offlineUntilMs = 0;
let offlineReason: LocalBridgeUnavailableReason | undefined;
let offlineMessage: string | undefined;
let lastCheckedAt: string | undefined;

const nowMs = () => Date.now();

const isoOrUndefined = (value: number) => (value > 0 ? new Date(value).toISOString() : undefined);

const isCircuitOpen = () => offlineUntilMs > nowMs();

const abortErrorName = "AbortError";

const unavailableResult = (
  reason: LocalBridgeUnavailableReason,
  message: string,
  cooldownMs = LLM_LOCAL_BRIDGE_OFFLINE_COOLDOWN_MS
): LocalBridgeRunUnavailableResult => {
  lastCheckedAt = new Date().toISOString();
  if (reason === "bridge_offline" || reason === "timeout" || reason === "circuit_open") {
    offlineUntilMs = Math.max(offlineUntilMs, nowMs() + cooldownMs);
    offlineReason = reason;
    offlineMessage = message;
  }
  return {
    advisoryStatus: "unavailable",
    reason,
    confidence: 0,
    warnings: [
      "LLM advisory bridge offline. Deterministic research continued; advisory unavailable.",
      message
    ],
    offlineUntil: isoOrUndefined(offlineUntilMs)
  };
};

const fetchWithTimeout = async (endpoint: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(endpoint, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
};

export function getLocalBridgeStatusSnapshot(): LocalBridgeStatusSnapshot {
  if (isCircuitOpen()) {
    return {
      status: "offline",
      reason: offlineReason ?? "circuit_open",
      message: offlineMessage ?? "Local LLM advisory bridge is in offline cooldown.",
      lastCheckedAt,
      offlineUntil: isoOrUndefined(offlineUntilMs)
    };
  }
  return {
    status: offlineReason ? "unknown" : "unknown",
    reason: offlineReason,
    message: offlineMessage,
    lastCheckedAt,
    offlineUntil: isoOrUndefined(offlineUntilMs)
  };
}

export function resetLocalBridgeCircuitBreaker() {
  offlineUntilMs = 0;
  offlineReason = undefined;
  offlineMessage = undefined;
}

export async function checkLocalBridgeHealth(
  endpoint = LLM_LOCAL_BRIDGE_HEALTH_URL
): Promise<LocalBridgeHealthResult> {
  if (isCircuitOpen()) {
    throw new Error(
      `Local LLM bridge is offline; skipping health check until ${isoOrUndefined(offlineUntilMs) ?? "cooldown ends"}.`
    );
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    }, LLM_LOCAL_BRIDGE_HEALTH_TIMEOUT_MS);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === abortErrorName;
    unavailableResult(
      timedOut ? "timeout" : "bridge_offline",
      timedOut
        ? "Local LLM bridge health check timed out."
        : "Local LLM bridge server is not running."
    );
    throw new Error(timedOut ? "Local LLM bridge health check timed out." : "Local LLM bridge server is not running.");
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

  resetLocalBridgeCircuitBreaker();
  lastCheckedAt = new Date().toISOString();
  return health as LocalBridgeHealthResult;
}

export async function runLocalBridgeAdvisory(
  packet: LLMResearchContextPacket,
  endpoint = LLM_LOCAL_BRIDGE_URL
): Promise<LocalBridgeRunResult> {
  if (isCircuitOpen()) {
    return unavailableResult(
      "circuit_open",
      `Local LLM advisory bridge is in offline cooldown until ${isoOrUndefined(offlineUntilMs) ?? "the cooldown expires"}.`,
      Math.max(1, offlineUntilMs - nowMs())
    );
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(packet)
    }, LLM_LOCAL_BRIDGE_ADVISORY_TIMEOUT_MS);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === abortErrorName;
    return unavailableResult(
      timedOut ? "timeout" : "bridge_offline",
      timedOut
        ? "Local LLM bridge advisory request timed out after 2 seconds."
        : "Local LLM bridge server is not running. Start it with npm.cmd run llm:bridge when advisory review is needed."
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return unavailableResult(
      "invalid_response",
      "Local LLM bridge returned a non-JSON response.",
      0
    );
  }

  if (!response.ok) {
    const errorPayload = payload as { error?: string; message?: string };
    return unavailableResult(
      "request_failed",
      errorPayload.message ?? errorPayload.error ?? "Local LLM bridge request failed.",
      0
    );
  }

  const bridgePayload = payload as {
    responses?: LLMAgentResponse[];
    responseFile?: string;
  };
  if (!Array.isArray(bridgePayload.responses)) {
    return unavailableResult(
      "invalid_response",
      "Local LLM bridge response did not include responses[].",
      0
    );
  }

  resetLocalBridgeCircuitBreaker();
  lastCheckedAt = new Date().toISOString();
  return {
    advisoryStatus: "available",
    responses: bridgePayload.responses,
    responseFile: bridgePayload.responseFile
  };
}
