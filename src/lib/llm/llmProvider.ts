import type {
  LLMAdvisoryRun,
  LLMProviderMode,
  LLMProviderStatus,
  LLMResearchState
} from "@/lib/llm/llmTypes";

export const LLM_RESEARCH_STORAGE_KEY = "gotrader_ai_lab_llm_research_state";
export const LLM_RESEARCH_UPDATED_EVENT = "gotrader-ai-lab-llm-research-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const initialState = (): LLMResearchState => ({
  researchMode: "llm_required",
  providerMode: "local_command",
  runs: [],
  unsafeResponseRejections: 0,
  deterministicFallbackEnabled: true,
  mockModeAllowed: true,
  safetyNotice: "LLM agents are required for real research mode, but advisory only."
});

const publish = (state: LLMResearchState) => {
  if (isBrowser()) {
    window.localStorage.setItem(LLM_RESEARCH_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(LLM_RESEARCH_UPDATED_EVENT, { detail: state }));
  }
  return state;
};

export function loadLLMResearchState(): LLMResearchState {
  if (!isBrowser()) {
    return initialState();
  }
  const raw = window.localStorage.getItem(LLM_RESEARCH_STORAGE_KEY);
  if (!raw) {
    return publish(initialState());
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LLMResearchState>;
    return {
      ...initialState(),
      ...parsed,
      researchMode: "llm_required",
      providerMode: parsed.providerMode ?? "local_command",
      runs: parsed.runs ?? [],
      unsafeResponseRejections: parsed.unsafeResponseRejections ?? 0,
      deterministicFallbackEnabled: true,
      mockModeAllowed: true,
      safetyNotice: "LLM agents are required for real research mode, but advisory only."
    };
  } catch {
    return publish(initialState());
  }
}

export function saveLLMResearchState(state: LLMResearchState): LLMResearchState {
  return publish({
    ...initialState(),
    ...state,
    researchMode: "llm_required",
    deterministicFallbackEnabled: true,
    mockModeAllowed: true,
    safetyNotice: "LLM agents are required for real research mode, but advisory only."
  });
}

export function saveLLMAdvisoryRun(run: LLMAdvisoryRun, providerMode?: LLMProviderMode): LLMResearchState {
  const state = loadLLMResearchState();
  return saveLLMResearchState({
    ...state,
    providerMode: providerMode ?? run.providerMode,
    latestRunId: run.runId,
    runs: [run, ...state.runs].slice(0, 20),
    unsafeResponseRejections: state.unsafeResponseRejections + run.unsafeResponseRejections
  });
}

export function latestLLMAdvisoryRun(state = loadLLMResearchState()) {
  return state.runs.find((run) => run.runId === state.latestRunId) ?? state.runs[0];
}

export function isLLMAdvisoryReviewPassed(state = loadLLMResearchState()) {
  const latest = latestLLMAdvisoryRun(state);
  return Boolean(latest?.advisoryPassed && latest.realProvider && latest.status === "complete");
}

export function getLLMReadinessImpact(state = loadLLMResearchState()) {
  const latest = latestLLMAdvisoryRun(state);
  if (isLLMAdvisoryReviewPassed(state)) {
    return "LLM advisory review passed through a configured secure provider boundary.";
  }
  if (!latest) {
    return "LLM advisory review required before Paper-Demo Candidate.";
  }
  if (!latest.realProvider) {
    return "Latest LLM run was mock or fallback only; deterministic fallback may support Research Ready but cannot unlock Paper-Demo Candidate.";
  }
  return latest.readinessImpact;
}

export function providerStatusForMode(providerMode: LLMProviderMode): LLMProviderStatus {
  if (providerMode === "local_command") {
    return {
      providerMode,
      configured: false,
      statusMessage:
        "Local command mode must run through a secure local bridge. Configure GOTRADER_LLM_AGENT_COMMAND outside frontend code, for example node scripts/gpt55-llm-agent-provider.mjs.",
      secureBoundary: "local_command"
    };
  }
  if (providerMode === "mock_llm") {
    return {
      providerMode,
      configured: true,
      statusMessage: "Mock LLM is available for UI testing only and cannot satisfy real research readiness.",
      secureBoundary: "none"
    };
  }
  if (providerMode === "deterministic_fallback") {
    return {
      providerMode,
      configured: true,
      statusMessage: "Deterministic fallback is available for offline tests and baseline comparison only.",
      secureBoundary: "none"
    };
  }
  return {
    providerMode,
    configured: false,
    statusMessage: "Future API provider is planning-only until a secure backend, edge function, or provider service exists.",
    secureBoundary: "future_secure_service"
  };
}
