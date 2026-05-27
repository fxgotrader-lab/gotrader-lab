import type { AutonomousResearchRun, AutonomousResearchState } from "@/lib/autonomousResearch/autonomousResearchTypes";
import { safeArray, safeTopN } from "@/lib/utils";

export const AUTONOMOUS_RESEARCH_STORAGE_KEY = "gotrader_ai_lab_autonomous_research_state";
export const AUTONOMOUS_RESEARCH_UPDATED_EVENT = "gotrader-ai-lab-autonomous-research-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const initialState = (): AutonomousResearchState => ({
  runs: [],
  calibrationDriftHistory: [],
  safetyNotice: "Autonomous research is simulation-only. It cannot execute trades, approve Paper-Demo Candidate, send go-trader handoffs, or override readiness."
});

const progressForRun = (run: AutonomousResearchRun) => {
  const startedAt = run.startedAt ?? new Date().toISOString();
  const terminalStage =
    run.status === "failed" ? "failed" :
    run.status === "canceled" ? "canceled" :
    run.status === "paused" ? "paused" :
    run.status === "completed" || run.status === "completed_with_warnings" ? "completed" :
    "idle";
  return run.progress ?? {
    status: run.status,
    activeStage: run.status === "running" ? "resolving_runtime" : terminalStage,
    activeStageLabel: run.status === "running" ? "Resolving runtime" : run.status.replace(/_/g, " "),
    currentIteration: run.currentIteration ?? 0,
    maxIterations: run.settings?.maxIterations ?? 3,
    progressPercent: run.status === "completed" ? 100 : 0,
    startedAt,
    updatedAt: run.completedAt ?? startedAt,
    currentTask: run.status === "running" ? "Autonomous loop checkpoint recovered." : "Autonomous loop is idle.",
    stopReason: run.stopReason,
    stopReasonDetail: run.stopReasonDetail,
    events: []
  };
};

const compactRun = (run: AutonomousResearchRun): AutonomousResearchRun => ({
  ...run,
  progress: {
    ...progressForRun(run),
    events: safeTopN(progressForRun(run).events, 20)
  },
  iterations: safeTopN(run.iterations, 12),
  calibrationDriftHistory: safeTopN(run.calibrationDriftHistory, 12)
});

const compactState = (state: AutonomousResearchState): AutonomousResearchState => ({
  ...state,
  runs: safeTopN(state.runs, 5).map(compactRun),
  activeRun: state.activeRun ? compactRun(state.activeRun) : undefined,
  calibrationDriftHistory: safeTopN(state.calibrationDriftHistory, 20),
  safetyNotice: "Autonomous research is simulation-only. It cannot execute trades, approve Paper-Demo Candidate, send go-trader handoffs, or override readiness."
});

export function loadAutonomousResearchState(): AutonomousResearchState {
  if (!isBrowser()) {
    return initialState();
  }
  const raw = window.localStorage.getItem(AUTONOMOUS_RESEARCH_STORAGE_KEY);
  if (!raw) {
    return initialState();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AutonomousResearchState>;
    return compactState({
      ...initialState(),
      ...parsed,
      runs: safeArray(parsed.runs),
      calibrationDriftHistory: safeArray(parsed.calibrationDriftHistory)
    });
  } catch {
    return initialState();
  }
}

export function saveAutonomousResearchState(state: AutonomousResearchState): AutonomousResearchState {
  const compact = compactState(state);
  if (isBrowser()) {
    window.localStorage.setItem(AUTONOMOUS_RESEARCH_STORAGE_KEY, JSON.stringify(compact));
    window.dispatchEvent(new CustomEvent(AUTONOMOUS_RESEARCH_UPDATED_EVENT, { detail: compact }));
  }
  return compact;
}

export function saveAutonomousResearchRun(run: AutonomousResearchRun): AutonomousResearchState {
  const state = loadAutonomousResearchState();
  return saveAutonomousResearchState({
    ...state,
    latestRunId: run.runId,
    activeRun: run.status === "running" ? run : undefined,
    runs: safeTopN([run, ...state.runs.filter((item) => item.runId !== run.runId)], 5),
    calibrationDriftHistory: safeTopN([...run.calibrationDriftHistory, ...state.calibrationDriftHistory], 20)
  });
}

export function latestAutonomousResearchRun(state = loadAutonomousResearchState()) {
  return state.runs.find((run) => run.runId === state.latestRunId) ?? state.runs[0];
}

export function discardAutonomousResearchCheckpoint(): AutonomousResearchState {
  const state = loadAutonomousResearchState();
  const activeRunId = state.activeRun?.runId;
  if (!activeRunId) {
    return saveAutonomousResearchState({
      ...state,
      activeRun: undefined
    });
  }
  const now = new Date().toISOString();
  return saveAutonomousResearchState({
    ...state,
    activeRun: undefined,
    runs: safeArray(state.runs).map((run) =>
      run.runId === activeRunId && run.status === "running"
        ? {
            ...run,
            status: "canceled",
            completedAt: run.completedAt ?? now,
            stopReason: "user_canceled",
            stopReasonDetail: "Previous autonomous loop checkpoint was discarded from Mission Control.",
            progress: {
              ...run.progress,
              status: "canceled",
              activeStage: "canceled",
              activeStageLabel: "Canceled",
              progressPercent: Math.max(run.progress?.progressPercent ?? 0, 0),
              updatedAt: now,
              currentTask: "Previous autonomous loop checkpoint discarded.",
              stopReason: "user_canceled",
              stopReasonDetail: "Previous autonomous loop checkpoint was discarded from Mission Control.",
              events: [
                {
                  eventId: `autonomy_event_${Date.now()}`,
                  timestamp: now,
                  stage: "canceled",
                  title: "Previous loop checkpoint discarded",
                  detail: "Mission Control cleared an incomplete autonomous loop checkpoint."
                },
                ...safeArray(run.progress?.events)
              ]
            }
          }
        : run
    )
  });
}

export function clearAutonomousResearchHistory(): AutonomousResearchState {
  return saveAutonomousResearchState(initialState());
}
