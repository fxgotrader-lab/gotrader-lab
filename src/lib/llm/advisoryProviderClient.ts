import {
  classifyOpenClawAdvisoryOutcome,
  openClawHealthUrlFor,
  openClawResponseLooksLikeStub,
  type AdvisorProviderStatusLevel
} from "@/lib/llm/advisorProviderStatus";
import type {
  GoTraderAdvisoryPacket,
  GoTraderAdvisoryProviderMode,
  OpenClawAdvisoryResponse
} from "@/lib/llm/llmTypes";

export const ADVISORY_PROVIDER_SETTINGS_STORAGE_KEY = "gotrader-ai-lab-advisory-provider-settings";
export const OPENCLAW_ADVISORY_DEFAULT_URL = "http://127.0.0.1:8797/gotrader/advisory";

const parsePositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};

export const openClawAdvisoryTimeoutMsFromEnv = () =>
  parsePositiveInteger(
    import.meta.env?.OPENCLAW_ADVISORY_TIMEOUT_MS ??
      import.meta.env?.VITE_OPENCLAW_ADVISORY_TIMEOUT_MS,
    30_000
  );

export const OPENCLAW_ADVISORY_TIMEOUT_MS = openClawAdvisoryTimeoutMsFromEnv();

export interface AdvisoryProviderSettings {
  providerMode: GoTraderAdvisoryProviderMode;
  openClawAdvisoryUrl: string;
}

export type OpenClawAdvisoryUnavailableReason =
  | "disabled"
  | "not_configured"
  | "offline"
  | "timeout"
  | "invalid_response"
  | "unsafe_response"
  | "request_failed";

export type OpenClawAdvisoryRunResult =
  | {
      advisoryStatus: "available";
      response: OpenClawAdvisoryResponse;
      providerStatus: Extract<AdvisorProviderStatusLevel, "openclaw_bridge_stub" | "openclaw_skill_routed">;
      skillRouted: boolean;
      endpoint: string;
      timeoutMs: number;
    }
  | {
      advisoryStatus: "unavailable";
      reason: OpenClawAdvisoryUnavailableReason;
      providerStatus: AdvisorProviderStatusLevel;
      warnings: string[];
      details?: string[];
      endpoint: string;
      timeoutMs: number;
    };

export interface OpenClawBridgeHealthResult {
  reachable: boolean;
  /** Bridge-reported advisory status: "connected" | "stub". */
  advisoryStatus?: string;
  openClawAgentEndpointConfigured?: boolean;
  openClawAgentEndpointHost?: string;
  openClawAgentTimeoutMs?: number;
  providerStatus: AdvisorProviderStatusLevel;
  checkedAt: string;
  detail?: string;
}

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const openClawAdvisoryUrlFromEnv = () =>
  import.meta.env?.OPENCLAW_ADVISORY_URL ??
  import.meta.env?.VITE_OPENCLAW_ADVISORY_URL ??
  OPENCLAW_ADVISORY_DEFAULT_URL;

export const openClawEndpointHostLabel = (endpoint: string) => {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return endpoint ? "custom endpoint" : "not configured";
  }
};

export function loadAdvisoryProviderSettings(): AdvisoryProviderSettings {
  const defaults: AdvisoryProviderSettings = {
    providerMode: "local_llm_bridge",
    openClawAdvisoryUrl: openClawAdvisoryUrlFromEnv()
  };
  if (!isBrowser()) {
    return defaults;
  }
  try {
    const raw = window.localStorage.getItem(ADVISORY_PROVIDER_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<AdvisoryProviderSettings>;
    return {
      providerMode:
        parsed.providerMode === "openclaw" || parsed.providerMode === "disabled" || parsed.providerMode === "local_llm_bridge"
          ? parsed.providerMode
          : defaults.providerMode,
      openClawAdvisoryUrl: parsed.openClawAdvisoryUrl?.trim() || defaults.openClawAdvisoryUrl
    };
  } catch {
    return defaults;
  }
}

export function saveAdvisoryProviderSettings(settings: AdvisoryProviderSettings): AdvisoryProviderSettings {
  const normalized: AdvisoryProviderSettings = {
    providerMode: settings.providerMode,
    openClawAdvisoryUrl: settings.openClawAdvisoryUrl.trim() || OPENCLAW_ADVISORY_DEFAULT_URL
  };
  if (isBrowser()) {
    window.localStorage.setItem(ADVISORY_PROVIDER_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

const abortErrorName = "AbortError";

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

const unwrapResponseCandidate = (payload: unknown): Partial<OpenClawAdvisoryResponse> | undefined => {
  const maybeWrapped = payload as { response?: unknown };
  const candidate = (maybeWrapped?.response ?? payload) as Partial<OpenClawAdvisoryResponse>;
  return candidate && typeof candidate === "object" ? candidate : undefined;
};

const responseHasUnsafeAuthority = (candidate: Partial<OpenClawAdvisoryResponse>): boolean => {
  const authority = candidate.authority;
  return (
    authority?.executionAuthority !== "none" ||
    authority?.brokerAuthority !== "none" ||
    authority?.readinessOverrideAuthority !== "none"
  );
};

const normalizeResponse = (payload: unknown): OpenClawAdvisoryResponse | undefined => {
  const candidate = unwrapResponseCandidate(payload);
  if (!candidate) {
    return undefined;
  }
  const advisoryStatus = candidate.advisoryStatus;
  if (advisoryStatus !== "complete" && advisoryStatus !== "unavailable" && advisoryStatus !== "error" && advisoryStatus !== "timeout") {
    return undefined;
  }
  if (responseHasUnsafeAuthority(candidate)) {
    return {
      advisoryStatus: "error",
      summary: "OpenClaw response was rejected because authority fields were not locked to none.",
      topBlockers: ["unsafe_authority"],
      nextActions: ["Fix the OpenClaw adapter so it returns advisory-only authority fields."],
      calibrationRecommendations: [],
      riskNotes: ["Rejected unsafe OpenClaw response."],
      questions: [],
      authority: {
        executionAuthority: "none",
        brokerAuthority: "none",
        readinessOverrideAuthority: "none"
      }
    };
  }
  return {
    advisoryStatus,
    summary: String(candidate.summary ?? "OpenClaw returned no summary."),
    topBlockers: Array.isArray(candidate.topBlockers) ? candidate.topBlockers.map(String).slice(0, 8) : [],
    nextActions: Array.isArray(candidate.nextActions) ? candidate.nextActions.map(String).slice(0, 8) : [],
    calibrationRecommendations: Array.isArray(candidate.calibrationRecommendations)
      ? candidate.calibrationRecommendations.map(String).slice(0, 8)
      : [],
    selfImprovementProposalIntent: candidate.selfImprovementProposalIntent
      ? {
          createProposal: Boolean(candidate.selfImprovementProposalIntent.createProposal),
          proposalTitle: candidate.selfImprovementProposalIntent.proposalTitle,
          targetSubsystem: candidate.selfImprovementProposalIntent.targetSubsystem,
          candidateFamilies: Array.isArray(candidate.selfImprovementProposalIntent.candidateFamilies)
            ? candidate.selfImprovementProposalIntent.candidateFamilies.map(String).slice(0, 8)
            : [],
          requiresWalkForward: Boolean(candidate.selfImprovementProposalIntent.requiresWalkForward),
          autoApplyAllowed: false
        }
      : undefined,
    riskNotes: Array.isArray(candidate.riskNotes) ? candidate.riskNotes.map(String).slice(0, 8) : [],
    questions: Array.isArray(candidate.questions) ? candidate.questions.map(String).slice(0, 8) : [],
    authority: {
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    }
  };
};

export async function runOpenClawAdvisory(
  packet: GoTraderAdvisoryPacket,
  endpoint = loadAdvisoryProviderSettings().openClawAdvisoryUrl,
  timeoutMs = OPENCLAW_ADVISORY_TIMEOUT_MS
): Promise<OpenClawAdvisoryRunResult> {
  const unavailable = (
    reason: OpenClawAdvisoryUnavailableReason,
    warnings: string[],
    details?: string[]
  ): OpenClawAdvisoryRunResult => ({
    advisoryStatus: "unavailable",
    reason,
    providerStatus: classifyOpenClawAdvisoryOutcome({ endpoint, unavailableReason: reason }),
    warnings,
    details,
    endpoint,
    timeoutMs
  });

  if (!endpoint.trim()) {
    return unavailable("not_configured", [
      "OpenClaw advisory URL is not configured. This is not an app failure; deterministic research remains available."
    ]);
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(packet)
    }, timeoutMs);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === abortErrorName;
    return unavailable(
      timedOut ? "timeout" : "offline",
      [
        timedOut
          ? `OpenClaw advisory timed out after ${Math.round(timeoutMs / 1000)} seconds.`
          : "OpenClaw advisory offline; deterministic research remains available."
      ],
      [error instanceof Error ? error.message : "OpenClaw advisory request failed."]
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return unavailable("invalid_response", ["OpenClaw advisory returned a non-JSON response."]);
  }

  if (!response.ok) {
    const errorPayload = payload as { error?: string; message?: string };
    return unavailable(
      response.status === 504 ? "timeout" : "request_failed",
      [errorPayload.message ?? errorPayload.error ?? "OpenClaw advisory request failed."]
    );
  }

  const candidate = unwrapResponseCandidate(payload);
  if (candidate && responseHasUnsafeAuthority(candidate)) {
    return unavailable(
      "unsafe_response",
      [
        "OpenClaw response was rejected because authority fields were not locked to none. It cannot influence proposal or validation state."
      ],
      ["unsafe_authority"]
    );
  }

  const normalized = normalizeResponse(payload);
  if (!normalized) {
    return unavailable("invalid_response", ["OpenClaw advisory response did not match the GoTrader response contract."]);
  }
  if (normalized.advisoryStatus !== "complete") {
    return unavailable(
      normalized.advisoryStatus === "timeout" ? "timeout" : "request_failed",
      [normalized.summary],
      [...normalized.riskNotes, ...normalized.topBlockers]
    );
  }
  const stub = openClawResponseLooksLikeStub({
    responseSummary: normalized.summary,
    responseTopBlockers: normalized.topBlockers
  });
  return {
    advisoryStatus: "available",
    response: normalized,
    providerStatus: stub ? "openclaw_bridge_stub" : "openclaw_skill_routed",
    skillRouted: !stub,
    endpoint,
    timeoutMs
  };
}

/**
 * Read-only GET against the phone bridge /health endpoint to distinguish
 * stub vs skill-routed OpenClaw without sending an advisory packet.
 */
export async function checkOpenClawBridgeHealth(
  advisoryUrl = loadAdvisoryProviderSettings().openClawAdvisoryUrl,
  timeoutMs = 8_000
): Promise<OpenClawBridgeHealthResult> {
  const checkedAt = new Date().toISOString();
  if (!advisoryUrl.trim()) {
    return {
      reachable: false,
      providerStatus: "openclaw_not_configured",
      checkedAt,
      detail: "No OpenClaw advisory URL configured."
    };
  }
  const healthUrl = openClawHealthUrlFor(advisoryUrl);
  if (!healthUrl) {
    return {
      reachable: false,
      providerStatus: "openclaw_not_configured",
      checkedAt,
      detail: "OpenClaw advisory URL is not a valid URL."
    };
  }
  try {
    const response = await fetchWithTimeout(healthUrl, { method: "GET", headers: { Accept: "application/json" } }, timeoutMs);
    if (!response.ok) {
      return {
        reachable: false,
        providerStatus: "openclaw_bridge_offline",
        checkedAt,
        detail: `Bridge health returned HTTP ${response.status}.`
      };
    }
    const payload = (await response.json()) as {
      advisoryStatus?: string;
      openClawAgentEndpointConfigured?: boolean;
      openClawAgentEndpointHost?: string;
      openClawAgentTimeoutMs?: number;
    };
    const providerStatus = classifyOpenClawAdvisoryOutcome({
      endpoint: advisoryUrl,
      healthAdvisoryStatus: payload.advisoryStatus,
      healthOpenClawAgentEndpointConfigured: payload.openClawAgentEndpointConfigured
    });
    return {
      reachable: true,
      advisoryStatus: payload.advisoryStatus,
      openClawAgentEndpointConfigured: payload.openClawAgentEndpointConfigured,
      openClawAgentEndpointHost: payload.openClawAgentEndpointHost,
      openClawAgentTimeoutMs: payload.openClawAgentTimeoutMs,
      providerStatus,
      checkedAt
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === abortErrorName;
    return {
      reachable: false,
      providerStatus: timedOut ? "openclaw_timeout" : "openclaw_bridge_offline",
      checkedAt,
      detail: error instanceof Error ? error.message : "Bridge health check failed."
    };
  }
}
