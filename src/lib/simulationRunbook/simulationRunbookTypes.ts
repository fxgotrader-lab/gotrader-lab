export type SimulationRunbookChecklistId =
  | "aiLabThesisGenerated"
  | "handoffExported"
  | "savedLatestHandoff"
  | "readerConversionTested"
  | "schedulerOneCycleCompleted"
  | "signalLogged"
  | "brokerExecutionSkipped"
  | "positionsZero"
  | "tradesZero"
  | "shutdownComplete";

export type SimulationRunbookSignal = "" | "BUY" | "SELL" | "NEUTRAL";

export interface SimulationRunbookChecklistDefinition {
  id: SimulationRunbookChecklistId;
  label: string;
}

export interface SimulationRunbookState {
  verifiedAt?: string;
  symbol: string;
  timeframe: string;
  signal: SimulationRunbookSignal;
  mode: string;
  platform: string;
  notes: string;
  checklist: Record<SimulationRunbookChecklistId, boolean>;
}
