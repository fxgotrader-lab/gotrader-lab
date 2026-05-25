import type {
  SimulationRunbookChecklistDefinition,
  SimulationRunbookChecklistId,
  SimulationRunbookState
} from "@/lib/simulationRunbook/simulationRunbookTypes";

export const SIMULATION_RUNBOOK_STORAGE_KEY = "gotrader_ai_lab_simulation_runbook";
export const SIMULATION_RUNBOOK_UPDATED_EVENT = "gotrader-ai-lab-simulation-runbook-updated";

export const simulationRunbookChecklist: SimulationRunbookChecklistDefinition[] = [
  { id: "aiLabThesisGenerated", label: "AI Lab thesis generated" },
  { id: "handoffExported", label: "Handoff exported" },
  { id: "savedLatestHandoff", label: "Saved as exports/latest-gotrader-handoff.json" },
  { id: "readerConversionTested", label: "Reader conversion tested" },
  { id: "schedulerOneCycleCompleted", label: "Scheduler one-cycle run completed" },
  { id: "signalLogged", label: "Signal logged" },
  { id: "brokerExecutionSkipped", label: "Broker execution skipped" },
  { id: "positionsZero", label: "Positions = 0" },
  { id: "tradesZero", label: "Trades = 0" },
  { id: "shutdownComplete", label: "Shutdown complete" }
];

const emptyChecklist = (): Record<SimulationRunbookChecklistId, boolean> =>
  simulationRunbookChecklist.reduce(
    (items, item) => ({
      ...items,
      [item.id]: false
    }),
    {} as Record<SimulationRunbookChecklistId, boolean>
  );

export const defaultSimulationRunbookState: SimulationRunbookState = {
  symbol: "",
  timeframe: "5m",
  signal: "",
  mode: "simulation",
  platform: "ai_lab_handoff",
  notes: "",
  checklist: emptyChecklist()
};

const sanitizeRunbookState = (state: Partial<SimulationRunbookState>): SimulationRunbookState => ({
  ...defaultSimulationRunbookState,
  ...state,
  mode: "simulation",
  platform: state.platform?.trim() || defaultSimulationRunbookState.platform,
  checklist: {
    ...emptyChecklist(),
    ...state.checklist
  }
});

export function loadSimulationRunbookState(): SimulationRunbookState {
  if (typeof window === "undefined") {
    return defaultSimulationRunbookState;
  }
  const raw = window.localStorage.getItem(SIMULATION_RUNBOOK_STORAGE_KEY);
  if (!raw) {
    return defaultSimulationRunbookState;
  }
  try {
    return sanitizeRunbookState(JSON.parse(raw) as Partial<SimulationRunbookState>);
  } catch {
    return defaultSimulationRunbookState;
  }
}

export function saveSimulationRunbookState(state: SimulationRunbookState) {
  if (typeof window === "undefined") {
    return;
  }
  const next = sanitizeRunbookState(state);
  window.localStorage.setItem(SIMULATION_RUNBOOK_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(SIMULATION_RUNBOOK_UPDATED_EVENT, { detail: next }));
}

export function completeSimulationRunbookVerification(state: SimulationRunbookState) {
  const next = sanitizeRunbookState({
    ...state,
    verifiedAt: new Date().toISOString()
  });
  saveSimulationRunbookState(next);
  return next;
}

export function resetSimulationRunbookState() {
  saveSimulationRunbookState(defaultSimulationRunbookState);
  return defaultSimulationRunbookState;
}

export function countCompletedRunbookItems(state: SimulationRunbookState) {
  return simulationRunbookChecklist.filter((item) => state.checklist[item.id]).length;
}
