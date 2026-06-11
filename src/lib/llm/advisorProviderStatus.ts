/**
 * Advisor provider status model.
 *
 * Distinguishes deterministic local chat, the local LLM bridge, the phone
 * OpenClaw bridge stub, full skill-routed OpenClaw advisory, offline,
 * timeout, not-configured, and unsafe-response states so the UI never shows
 * a stub or offline provider as ordinary success.
 *
 * Keep this file free of value imports outside this module so
 * scripts/test-advisor-provider-status.mjs can transpile it standalone.
 */

export type AdvisorProviderStatusLevel =
  | "disabled"
  | "deterministic_local"
  | "local_llm_config_missing"
  | "local_llm_online"
  | "local_llm_timeout"
  | "openclaw_not_configured"
  | "openclaw_bridge_offline"
  | "openclaw_bridge_stub"
  | "openclaw_skill_routed"
  | "openclaw_timeout"
  | "unsafe_response_rejected";

export interface AdvisorProviderStatusInfo {
  status: AdvisorProviderStatusLevel;
  label: string;
  tone: "success" | "warning" | "danger" | "muted";
  /** Only fully-working providers count as ordinary success. */
  isOrdinarySuccess: boolean;
  detail: string;
}

export const ADVISOR_PROVIDER_AUTHORITY = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
} as const;

/** Markers the phone bridge stub response always carries. */
export const OPENCLAW_STUB_SUMMARY_MARKER = "skill routing is not wired";
export const OPENCLAW_STUB_BLOCKER_MARKER = "openclaw_skill_routing_not_wired";

export type OpenClawAdvisoryUnavailableReasonInput =
  | "disabled"
  | "not_configured"
  | "offline"
  | "timeout"
  | "invalid_response"
  | "unsafe_response"
  | "request_failed";

export interface OpenClawAdvisoryOutcomeInput {
  /** Advisory endpoint URL; empty/undefined means not configured. */
  endpoint?: string;
  /** Reason when the advisory run did not complete. */
  unavailableReason?: OpenClawAdvisoryUnavailableReasonInput;
  /** Summary text from a completed advisory response. */
  responseSummary?: string;
  /** Top blockers from a completed advisory response. */
  responseTopBlockers?: string[];
  /** From the bridge /health payload, when checked. */
  healthOpenClawAgentEndpointConfigured?: boolean;
  /** From the bridge /health payload: "connected" | "stub". */
  healthAdvisoryStatus?: string;
}

export const openClawResponseLooksLikeStub = (input: Pick<OpenClawAdvisoryOutcomeInput, "responseSummary" | "responseTopBlockers">): boolean =>
  Boolean(
    input.responseSummary?.toLowerCase().includes(OPENCLAW_STUB_SUMMARY_MARKER) ||
      input.responseTopBlockers?.some((blocker) => blocker === OPENCLAW_STUB_BLOCKER_MARKER)
  );

/**
 * Normalize an OpenClaw advisory outcome into a provider status level.
 * Stub responses (skill routing not wired / openClawAgentEndpointConfigured
 * false) are never classified as ordinary success.
 */
export const classifyOpenClawAdvisoryOutcome = (input: OpenClawAdvisoryOutcomeInput): AdvisorProviderStatusLevel => {
  if (!input.endpoint?.trim()) {
    return "openclaw_not_configured";
  }
  switch (input.unavailableReason) {
    case "disabled":
      return "disabled";
    case "not_configured":
      return "openclaw_not_configured";
    case "unsafe_response":
      return "unsafe_response_rejected";
    case "timeout":
      return "openclaw_timeout";
    case "offline":
    case "invalid_response":
    case "request_failed":
      return "openclaw_bridge_offline";
    default:
      break;
  }
  if (
    input.healthOpenClawAgentEndpointConfigured === false ||
    input.healthAdvisoryStatus === "stub" ||
    openClawResponseLooksLikeStub(input)
  ) {
    return "openclaw_bridge_stub";
  }
  return "openclaw_skill_routed";
};

/** Map the local LLM bridge capability status into the provider model. */
export const classifyLocalLlmCapability = (capability?: string): AdvisorProviderStatusLevel => {
  switch (capability) {
    case "ready":
      return "local_llm_online";
    case "timeout":
      return "local_llm_timeout";
    default:
      return "local_llm_config_missing";
  }
};

export const advisorProviderStatusInfo = (status: AdvisorProviderStatusLevel): AdvisorProviderStatusInfo => {
  switch (status) {
    case "disabled":
      return {
        status,
        label: "Advisory disabled",
        tone: "muted",
        isOrdinarySuccess: false,
        detail: "Advisory provider is disabled. Deterministic research remains available."
      };
    case "deterministic_local":
      return {
        status,
        label: "Local deterministic guidance",
        tone: "muted",
        isOrdinarySuccess: false,
        detail: "Replies come from deterministic local rules, not an LLM or OpenClaw."
      };
    case "local_llm_config_missing":
      return {
        status,
        label: "Local LLM bridge - config missing",
        tone: "warning",
        isOrdinarySuccess: false,
        detail: "The local LLM bridge is not configured or not ready. Deterministic research remains available."
      };
    case "local_llm_online":
      return {
        status,
        label: "Local LLM bridge online",
        tone: "success",
        isOrdinarySuccess: true,
        detail: "Local LLM advisory bridge is ready. Advisory only; no execution authority."
      };
    case "local_llm_timeout":
      return {
        status,
        label: "Local LLM timeout",
        tone: "warning",
        isOrdinarySuccess: false,
        detail: "The local LLM bridge timed out on the last request."
      };
    case "openclaw_not_configured":
      return {
        status,
        label: "OpenClaw not configured",
        tone: "muted",
        isOrdinarySuccess: false,
        detail: "No OpenClaw advisory URL is configured. This is not an app failure."
      };
    case "openclaw_bridge_offline":
      return {
        status,
        label: "OpenClaw bridge offline",
        tone: "warning",
        isOrdinarySuccess: false,
        detail: "The phone OpenClaw bridge did not respond. Deterministic research remains available."
      };
    case "openclaw_bridge_stub":
      return {
        status,
        label: "OpenClaw bridge stub - not skill-routed",
        tone: "warning",
        isOrdinarySuccess: false,
        detail:
          "The phone bridge answered, but OpenClaw skill routing is not wired (OPENCLAW_AGENT_ENDPOINT unset). Advisory text is a safe stub, not full OpenClaw."
      };
    case "openclaw_skill_routed":
      return {
        status,
        label: "OpenClaw skill-routed",
        tone: "success",
        isOrdinarySuccess: true,
        detail: "Full OpenClaw advisory skill routing is active. Advisory/proposal-only; auto-apply remains disabled."
      };
    case "openclaw_timeout":
      return {
        status,
        label: "OpenClaw timeout",
        tone: "warning",
        isOrdinarySuccess: false,
        detail: "OpenClaw advisory timed out. Deterministic research remains available."
      };
    default:
      return {
        status: "unsafe_response_rejected",
        label: "Unsafe response blocked",
        tone: "danger",
        isOrdinarySuccess: false,
        detail:
          "The advisory response was rejected because authority fields were not locked to none. It cannot influence proposal or validation state."
      };
  }
};

/** Instructions surfaced when the phone bridge runs in stub mode. */
export const OPENCLAW_STUB_SETUP_STEPS = [
  {
    title: "Phone Terminal 1",
    command: "node ~/openclaw-gotrader-advisory-skill-server.mjs"
  },
  {
    title: "Phone Terminal 2",
    command:
      'export OPENCLAW_AGENT_ENDPOINT="http://127.0.0.1:8798/gotrader/advisory-skill"\nexport OPENCLAW_AGENT_TIMEOUT_MS=15000\nnode ~/openclaw-phone-advisory-bridge.mjs'
  }
] as const;

/** Derive the bridge /health URL from an advisory endpoint URL. */
export const openClawHealthUrlFor = (advisoryUrl: string): string | undefined => {
  try {
    const url = new URL(advisoryUrl);
    url.pathname = "/health";
    url.search = "";
    return url.toString();
  } catch {
    return undefined;
  }
};
