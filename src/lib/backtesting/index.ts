export type {
  BacktestAgentAttributionSummary,
  BacktestAgentWeightId,
  BacktestAgentWeights,
  BacktestConfig,
  BacktestDecisionPoint,
  BacktestResult,
  BacktestSummary,
  EquityCurvePoint,
  ReplayFrame,
  ReplayState,
  ResolvedBacktestConfig,
  SimulatedTradeAgentAttribution,
  SimulatedTradeOutcome,
  SimulatedTradeRecord
} from "@/lib/backtesting/backtestTypes";
export { scoreSimulatedTradeOutcome } from "@/lib/backtesting/outcomeScoring";
export {
  backtestSessionFilters,
  backtestStopModels,
  defaultBacktestAgentWeights,
  defaultBacktestConfig,
  describeBacktestConfig,
  loadBacktestConfig,
  resetBacktestConfig,
  sanitizeBacktestConfig,
  saveBacktestConfig
} from "@/lib/backtesting/backtestConfig";
export { runBacktest, signalText } from "@/lib/backtesting/runBacktest";
export { createConfiguredReplay, createReplayState, getReplayFrame, jumpReplay, setReplayPlaying, stepReplay } from "@/lib/backtesting/replayEngine";
