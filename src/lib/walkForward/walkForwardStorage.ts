import { safeArray, safeTopN } from "@/lib/utils";
import type { WalkForwardRun, WalkForwardState } from "@/lib/walkForward/walkForwardTypes";

export const WALK_FORWARD_STORAGE_KEY = "gotrader_ai_lab_walk_forward_state";
export const WALK_FORWARD_UPDATED_EVENT = "gotrader-ai-lab-walk-forward-updated";

const safetyNotice: WalkForwardState["safetyNotice"] =
  "Walk-forward validation is simulation-only. It cannot execute trades, enable demo/live mode, or override readiness.";

const initialState = (): WalkForwardState => ({
  runs: [],
  safetyNotice
});

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const publish = (state: WalkForwardState) => {
  if (isBrowser()) {
    const compactState = {
      ...state,
      runs: safeTopN(state.runs, 5)
    };
    try {
      window.localStorage.setItem(WALK_FORWARD_STORAGE_KEY, JSON.stringify(compactState));
    } catch (error) {
      try {
        window.localStorage.setItem(WALK_FORWARD_STORAGE_KEY, JSON.stringify({ ...compactState, runs: safeTopN(compactState.runs, 1) }));
      } catch (retryError) {
        console.warn("Walk-forward storage write skipped after pruning.", {
          error: retryError instanceof Error ? retryError.message : String(retryError)
        });
      }
    }
    window.dispatchEvent(new CustomEvent(WALK_FORWARD_UPDATED_EVENT, { detail: compactState }));
  }
  return state;
};

export function loadWalkForwardState(): WalkForwardState {
  if (!isBrowser()) {
    return initialState();
  }
  const raw = window.localStorage.getItem(WALK_FORWARD_STORAGE_KEY);
  if (!raw) {
    return publish(initialState());
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WalkForwardState>;
    return {
      ...initialState(),
      ...parsed,
      runs: safeArray(parsed.runs)
    };
  } catch {
    return publish(initialState());
  }
}

export function saveWalkForwardRun(run: WalkForwardRun) {
  const state = loadWalkForwardState();
  return publish({
    ...state,
    latestRunId: run.runId,
    activeProgress: run.status === "running" ? run.progress : undefined,
    runs: safeTopN([run, ...state.runs.filter((item) => item.runId !== run.runId)], 5)
  });
}

export function saveWalkForwardProgress(run: WalkForwardRun) {
  const state = loadWalkForwardState();
  return publish({
    ...state,
    latestRunId: run.runId,
    activeProgress: run.progress,
    runs: safeTopN([run, ...state.runs.filter((item) => item.runId !== run.runId)], 5)
  });
}

export function latestWalkForwardRun(state = loadWalkForwardState()) {
  return state.runs.find((run) => run.runId === state.latestRunId) ?? state.runs[0];
}

export function clearWalkForwardHistory() {
  return publish(initialState());
}
