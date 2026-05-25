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
  latestResearchPipelineAt?: string;
  latestResearchCycleId?: string;
  latestResearchPipelineStatus?: "completed" | "completed_with_warnings" | "failed";
  symbol: string;
  timeframe: string;
  signal: SimulationRunbookSignal;
  mode: string;
  platform: string;
  notes: string;
  checklist: Record<SimulationRunbookChecklistId, boolean>;
}
