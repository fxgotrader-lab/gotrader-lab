export type {
  BacktestAgentAttributionSummary,
  BacktestAgentWeightId,
  BacktestAgentWeights,
  BacktestConfig,
  BacktestDecisionPoint,
  BacktestGrinchSummary,
  BacktestResult,
  BacktestSessionFilter,
  BacktestSkipReasonSummary,
  BacktestStopModel,
  BacktestSummary,
  EquityCurvePoint,
  ReplayFrame,
  ReplayState,
  ResolvedBacktestConfig,
  SimulatedTradeAgentAttribution,
  SimulatedTradeOutcome,
  SimulatedTradeRecord
} from "@/lib/backtesting/backtestTypes";
export {
  diagnoseTradeGeneration,
  topTradeGenerationDiagnostic
} from "@/lib/backtesting/tradeGenerationDiagnostics";
export {
  diagnoseTradeQuality,
  topTradeQualityDiagnostic
} from "@/lib/backtesting/tradeQualityDiagnostics";
export type {
  TradeQualityCandidateHint,
  TradeQualityDiagnostic,
  TradeQualityDiagnosticSeverity,
  TradeQualityReasonCode
} from "@/lib/backtesting/tradeQualityDiagnostics";
export type {
  TradeGenerationDiagnostic,
  TradeGenerationDiagnosticSeverity,
  TradeGenerationReasonCode
} from "@/lib/backtesting/tradeGenerationDiagnostics";
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
export {
  createMockBacktestCandleSource,
  loadResolvedBacktestCandleSource
} from "@/lib/backtesting/backtestSourceResolver";
export type {
  BacktestSourcePreference,
  ResolvedBacktestCandleSource
} from "@/lib/backtesting/backtestSourceResolver";
export { runBacktest, signalText } from "@/lib/backtesting/runBacktest";
export { createConfiguredReplay, createReplayState, getReplayFrame, jumpReplay, setReplayPlaying, stepReplay } from "@/lib/backtesting/replayEngine";
