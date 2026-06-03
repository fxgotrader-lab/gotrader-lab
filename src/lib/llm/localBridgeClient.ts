import type { LLMAgentResponse, LLMResearchContextPacket } from "@/lib/llm/llmTypes";

export const LLM_LOCAL_BRIDGE_BASE_URL = "http://127.0.0.1:8787";
export const LLM_LOCAL_BRIDGE_HEALTH_URL = `${LLM_LOCAL_BRIDGE_BASE_URL}/health`;
export const LLM_LOCAL_BRIDGE_URL = `${LLM_LOCAL_BRIDGE_BASE_URL}/llm/run-advisory`;
const DEFAULT_LLM_ADVISORY_TIMEOUT_MS = 20_000;
const readAdvisoryTimeoutMs = () => {
  const raw = import.meta.env?.LLM_ADVISORY_TIMEOUT_MS ?? import.meta.env?.VITE_LLM_ADVISORY_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 2_000 ? Math.round(parsed) : DEFAULT_LLM_ADVISORY_TIMEOUT_MS;
};
export const LLM_LOCAL_BRIDGE_ADVISORY_TIMEOUT_MS = readAdvisoryTimeoutMs();
export const LLM_LOCAL_BRIDGE_HEALTH_TIMEOUT_MS = 2_000;
export const LLM_LOCAL_BRIDGE_OFFLINE_COOLDOWN_MS = 60_000;

export type LocalBridgeProcessStatus = "online" | "offline" | "unknown";
export type LocalBridgeAdvisoryCapabilityStatus =
  | "ready"
  | "unavailable"
  | "timeout"
  | "config_missing"
  | "error"
  | "cooldown";
export type LocalBridgeCircuitBreakerStatus = "open" | "closed" | "cooldown";

export interface LocalBridgeHealthResult {
  status: "ok";
  service: "gotrader_llm_bridge";
  mode: "advisory_only";
  bridgeProcessStatus: LocalBridgeProcessStatus;
  advisoryCapabilityStatus: LocalBridgeAdvisoryCapabilityStatus;
  advisoryEndpointAvailable: boolean;
  advisoryProviderConfigured: boolean;
  advisoryTimeoutMs?: number;
  healthTimeoutMs?: number;
  modelConfigured: boolean;
  model?: string;
  statusMessage?: string;
  healthCheckedAt?: string;
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export type LocalBridgeUnavailableReason =
  | "bridge_offline"
  | "timeout"
  | "circuit_open"
  | "config_missing"
  | "request_failed"
  | "invalid_response";

export interface LocalBridgeStatusSnapshot {
  status: "available" | "offline" | "unknown";
  bridgeProcessStatus: LocalBridgeProcessStatus;
  advisoryCapabilityStatus: LocalBridgeAdvisoryCapabilityStatus | "unknown";
  circuitBreakerStatus: LocalBridgeCircuitBreakerStatus;
  reason?: LocalBridgeUnavailableReason;
  message?: string;
  lastCheckedAt?: string;
  offlineUntil?: string;
  cooldownRemainingMs?: number;
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
  details?: string[];
  offlineUntil?: string;
  timeoutMs?: number;
}

export type LocalBridgeRunResult = LocalBridgeRunSuccessResult | LocalBridgeRunUnavailableResult;

let offlineUntilMs = 0;
let offlineReason: LocalBridgeUnavailableReason | undefined;
let offlineMessage: string | undefined;
let lastCheckedAt: string | undefined;
let lastKnownBridgeProcessStatus: LocalBridgeProcessStatus = "unknown";
let lastKnownAdvisoryCapabilityStatus: LocalBridgeAdvisoryCapabilityStatus | "unknown" = "unknown";

const nowMs = () => Date.now();

const isoOrUndefined = (value: number) => (value > 0 ? new Date(value).toISOString() : undefined);

const isCircuitOpen = () => offlineUntilMs > nowMs();

const abortErrorName = "AbortError";

const userWarningFor = (reason: LocalBridgeUnavailableReason, message: string, timeoutMs = LLM_LOCAL_BRIDGE_ADVISORY_TIMEOUT_MS) => {
  switch (reason) {
    case "bridge_offline":
      return "LLM advisory bridge offline. Start npm.cmd run llm:bridge.";
    case "timeout":
      return `LLM advisory timed out after ${Math.round(timeoutMs / 1000)} seconds. Deterministic research remains available.`;
    case "circuit_open":
      return "LLM bridge advisory retry is paused after a recent failure.";
    case "config_missing":
      return "LLM bridge online, but advisory provider/model is not configured.";
    case "invalid_response":
      return "LLM bridge online, but advisory response was invalid.";
    case "request_failed":
      return "LLM bridge online, but advisory request failed.";
    default:
      return message;
  }
};

const unavailableResult = (
  reason: LocalBridgeUnavailableReason,
  message: string,
  cooldownMs = LLM_LOCAL_BRIDGE_OFFLINE_COOLDOWN_MS,
  options: { timeoutMs?: number } = {}
): LocalBridgeRunUnavailableResult => {
  lastCheckedAt = new Date().toISOString();
  if (reason === "bridge_offline" || reason === "timeout" || reason === "circuit_open") {
    offlineUntilMs = Math.max(offlineUntilMs, nowMs() + cooldownMs);
    offlineReason = reason;
    offlineMessage = message;
    lastKnownAdvisoryCapabilityStatus = reason === "timeout" ? "timeout" : reason === "circuit_open" ? "cooldown" : "unavailable";
    lastKnownBridgeProcessStatus = reason === "bridge_offline" ? "offline" : lastKnownBridgeProcessStatus;
  } else {
    offlineReason = reason;
    offlineMessage = message;
    lastKnownBridgeProcessStatus = "online";
    lastKnownAdvisoryCapabilityStatus = reason === "config_missing" ? "config_missing" : reason === "invalid_response" ? "error" : "error";
  }
  const displayMessage = userWarningFor(reason, message, options.timeoutMs);
  return {
    advisoryStatus: "unavailable",
    reason,
    confidence: 0,
    warnings: [displayMessage],
    details: message && message !== displayMessage ? [message] : [],
    offlineUntil: isoOrUndefined(offlineUntilMs),
    timeoutMs: options.timeoutMs
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
  const cooldownRemainingMs = Math.max(0, offlineUntilMs - nowMs());
  if (isCircuitOpen()) {
    return {
      status: "offline",
      bridgeProcessStatus: lastKnownBridgeProcessStatus,
      advisoryCapabilityStatus: "cooldown",
      circuitBreakerStatus: "cooldown",
      reason: offlineReason ?? "circuit_open",
      message: offlineMessage ?? "Local LLM advisory bridge is in offline cooldown.",
      lastCheckedAt,
      offlineUntil: isoOrUndefined(offlineUntilMs),
      cooldownRemainingMs
    };
  }
  return {
    status: lastKnownAdvisoryCapabilityStatus === "ready" ? "available" : offlineReason ? "unknown" : "unknown",
    bridgeProcessStatus: lastKnownBridgeProcessStatus,
    advisoryCapabilityStatus: lastKnownAdvisoryCapabilityStatus,
    circuitBreakerStatus: "closed",
    reason: offlineReason,
    message: offlineMessage,
    lastCheckedAt,
    offlineUntil: isoOrUndefined(offlineUntilMs),
    cooldownRemainingMs
  };
}

export function resetLocalBridgeCircuitBreaker() {
  offlineUntilMs = 0;
  offlineReason = undefined;
  offlineMessage = undefined;
  if (lastKnownAdvisoryCapabilityStatus === "cooldown") {
    lastKnownAdvisoryCapabilityStatus = "unknown";
  }
}

export async function checkLocalBridgeHealth(
  endpoint = LLM_LOCAL_BRIDGE_HEALTH_URL,
  options: { bypassCircuitBreaker?: boolean } = {}
): Promise<LocalBridgeHealthResult> {
  if (isCircuitOpen() && !options.bypassCircuitBreaker) {
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
    lastCheckedAt = new Date().toISOString();
    offlineReason = timedOut ? "timeout" : "bridge_offline";
    offlineMessage = timedOut ? "Local LLM bridge health check timed out after 2 seconds." : "Local LLM bridge server is not running.";
    lastKnownBridgeProcessStatus = timedOut ? "unknown" : "offline";
    lastKnownAdvisoryCapabilityStatus = timedOut ? "timeout" : "unavailable";
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

  const advisoryProviderConfigured = Boolean(health.advisoryProviderConfigured);
  const advisoryEndpointAvailable = health.advisoryEndpointAvailable !== false;
  const modelConfigured = health.modelConfigured !== false;
  const advisoryCapabilityStatus =
    health.advisoryCapabilityStatus ??
    (health.advisoryProviderConfigured === undefined
      ? "unavailable"
      : !advisoryProviderConfigured || !modelConfigured
        ? "config_missing"
        : advisoryEndpointAvailable
          ? "ready"
          : "unavailable");
  const normalizedHealth: LocalBridgeHealthResult = {
    ...health,
    status: "ok",
    service: "gotrader_llm_bridge",
    mode: "advisory_only",
    bridgeProcessStatus: "online",
    advisoryCapabilityStatus,
    advisoryEndpointAvailable,
    advisoryProviderConfigured,
    modelConfigured,
    advisoryTimeoutMs: health.advisoryTimeoutMs,
    healthTimeoutMs: health.healthTimeoutMs,
    model: health.model,
    statusMessage:
      health.statusMessage ??
      (advisoryCapabilityStatus === "ready"
        ? "LLM bridge process is online and advisory provider is configured."
        : health.advisoryProviderConfigured === undefined
          ? "LLM bridge process is online, but this bridge did not report advisory readiness. Restart npm.cmd run llm:bridge to expose provider diagnostics."
          : "LLM bridge process is online, but advisory provider/model is not configured."),
    healthCheckedAt: health.healthCheckedAt ?? new Date().toISOString(),
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  };

  lastKnownBridgeProcessStatus = "online";
  lastKnownAdvisoryCapabilityStatus = normalizedHealth.advisoryCapabilityStatus;
  if (normalizedHealth.advisoryCapabilityStatus === "ready") {
    resetLocalBridgeCircuitBreaker();
  } else {
    offlineReason = normalizedHealth.advisoryCapabilityStatus === "config_missing" ? "config_missing" : "request_failed";
    offlineMessage = normalizedHealth.statusMessage;
  }
  lastCheckedAt = new Date().toISOString();
  return normalizedHealth;
}

export async function runLocalBridgeAdvisory(
  packet: LLMResearchContextPacket,
  endpoint = LLM_LOCAL_BRIDGE_URL,
  options: { bypassCircuitBreaker?: boolean } = {}
): Promise<LocalBridgeRunResult> {
  if (options.bypassCircuitBreaker) {
    resetLocalBridgeCircuitBreaker();
  }
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
        ? `Local LLM bridge advisory request timed out after ${Math.round(LLM_LOCAL_BRIDGE_ADVISORY_TIMEOUT_MS / 1000)} seconds.`
        : "Local LLM bridge server is not running. Start it with npm.cmd run llm:bridge when advisory review is needed.",
      LLM_LOCAL_BRIDGE_OFFLINE_COOLDOWN_MS,
      timedOut ? { timeoutMs: LLM_LOCAL_BRIDGE_ADVISORY_TIMEOUT_MS } : {}
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
    const errorPayload = payload as {
      error?: string;
      message?: string;
      advisoryCapabilityStatus?: LocalBridgeAdvisoryCapabilityStatus;
      advisoryTimeoutMs?: number;
    };
    const message = errorPayload.message ?? errorPayload.error ?? "Local LLM bridge request failed.";
    const reason: LocalBridgeUnavailableReason =
      response.status === 504 || errorPayload.advisoryCapabilityStatus === "timeout"
        ? "timeout"
        : response.status === 503 && /OPENAI_API_KEY|provider|model|configured/i.test(message)
        ? "config_missing"
        : "request_failed";
    return unavailableResult(
      reason,
      message,
      reason === "timeout" ? LLM_LOCAL_BRIDGE_OFFLINE_COOLDOWN_MS : 0,
      reason === "timeout"
        ? { timeoutMs: errorPayload.advisoryTimeoutMs ?? LLM_LOCAL_BRIDGE_ADVISORY_TIMEOUT_MS }
        : {}
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
  lastKnownBridgeProcessStatus = "online";
  lastKnownAdvisoryCapabilityStatus = "ready";
  lastCheckedAt = new Date().toISOString();
  return {
    advisoryStatus: "available",
    responses: bridgePayload.responses,
    responseFile: bridgePayload.responseFile
  };
}
