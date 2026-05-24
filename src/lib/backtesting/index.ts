export type {
  BacktestAgentAttributionSummary,
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
export { runBacktest, signalText } from "@/lib/backtesting/runBacktest";
export { createReplayState, getReplayFrame, jumpReplay, setReplayPlaying, stepReplay } from "@/lib/backtesting/replayEngine";
