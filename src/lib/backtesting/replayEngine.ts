import type { BacktestConfig, BacktestResult, ReplayFrame, ReplayState } from "@/lib/backtesting/backtestTypes";
import { runBacktest } from "@/lib/backtesting/runBacktest";
import type { Candle } from "@/lib/types";

export function createConfiguredReplay(candles: Candle[], config: BacktestConfig = {}, initialIndex?: number) {
  const result = runBacktest(candles, config);
  return {
    result,
    state: createReplayState(result, initialIndex)
  };
}

export function createReplayState(result: BacktestResult, initialIndex?: number): ReplayState {
  const firstDecisionIndex = result.decisions[0]?.decisionIndex ?? 0;
  return {
    currentIndex: initialIndex ?? firstDecisionIndex,
    isPlaying: false,
    windowSize: result.config.visibleWindow
  };
}

export function setReplayPlaying(state: ReplayState, isPlaying: boolean): ReplayState {
  return { ...state, isPlaying };
}

export function stepReplay(state: ReplayState, result: BacktestResult, step: number): ReplayState {
  const maxIndex = Math.max(0, result.candles.length - 1);
  const nextIndex = Math.min(maxIndex, Math.max(0, state.currentIndex + step));
  return {
    ...state,
    currentIndex: nextIndex,
    isPlaying: nextIndex >= maxIndex ? false : state.isPlaying
  };
}

export function jumpReplay(state: ReplayState, result: BacktestResult, targetIndex: number): ReplayState {
  const maxIndex = Math.max(0, result.candles.length - 1);
  return {
    ...state,
    currentIndex: Math.min(maxIndex, Math.max(0, targetIndex))
  };
}

export function getReplayFrame(result: BacktestResult, state: ReplayState): ReplayFrame {
  const currentIndex = Math.min(Math.max(0, state.currentIndex), Math.max(0, result.candles.length - 1));
  const windowStart = Math.max(0, currentIndex - state.windowSize + 1);
  const visibleCandles = result.candles.slice(windowStart, currentIndex + 1);
  const activeDecision = [...result.decisions]
    .filter((decision) => decision.decisionIndex <= currentIndex)
    .sort((a, b) => b.decisionIndex - a.decisionIndex)[0];
  const activeTrade = activeDecision
    ? result.trades.find((trade) => trade.decisionId === activeDecision.id && trade.exitIndex > currentIndex)
    : undefined;

  return {
    currentIndex,
    currentCandle: result.candles[currentIndex],
    visibleCandles,
    activeDecision,
    activeThesis: activeDecision?.thesis,
    activeTrade,
    completedTrades: result.trades.filter((trade) => trade.exitIndex <= currentIndex)
  };
}
