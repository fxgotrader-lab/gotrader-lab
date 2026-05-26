import type { BacktestResult } from "@/lib/backtesting";
import type { ResearchCycleRun } from "@/lib/researchCycle";

export type SimulatedAccountDataSource = "simulation" | "tradovate_demo" | "tradovate_live";
export type SimulatedAccountProvider = "none" | "tradovate";

export interface SimulatedAccount {
  startingBalance: number;
  currentBalance: number;
  realizedPnL: number;
  realizedPnLPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageR: number;
  maxDrawdownR: number;
  maxDrawdownDollars: number;
  profitFactor: number | null;
  bestTradeR: number | null;
  worstTradeR: number | null;
  lastUpdated?: string;
  dataSource: SimulatedAccountDataSource;
  accountProvider: SimulatedAccountProvider;
  accountId?: string;
  sourceLabel: string;
  sourceNote: string;
  riskDollarsPerR: number;
  isEmpty: boolean;
}

export const DEFAULT_SIMULATED_STARTING_BALANCE = 50000;
export const DEFAULT_SIMULATED_RISK_PER_R = 0.01;

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

const emptyAccount = ({
  startingBalance = DEFAULT_SIMULATED_STARTING_BALANCE,
  sourceLabel = "No simulation data",
  sourceNote = "Run AI Research Cycle to generate simulated account results.",
  lastUpdated
}: {
  startingBalance?: number;
  sourceLabel?: string;
  sourceNote?: string;
  lastUpdated?: string;
} = {}): SimulatedAccount => ({
  startingBalance,
  currentBalance: startingBalance,
  realizedPnL: 0,
  realizedPnLPercent: 0,
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  winRate: 0,
  averageR: 0,
  maxDrawdownR: 0,
  maxDrawdownDollars: 0,
  profitFactor: null,
  bestTradeR: null,
  worstTradeR: null,
  lastUpdated,
  dataSource: "simulation",
  accountProvider: "none",
  sourceLabel,
  sourceNote,
  riskDollarsPerR: round(startingBalance * DEFAULT_SIMULATED_RISK_PER_R),
  isEmpty: true
});

const sourceNoteFor = (mode?: string, label?: string) => {
  const normalized = `${mode ?? ""} ${label ?? ""}`.toLowerCase();
  if (normalized.includes("imported") || normalized.includes("mnq")) {
    return "Based on imported historical MNQ data.";
  }
  if (normalized.includes("mock")) {
    return "Based on mock data.";
  }
  return "Based on simulation backtest data.";
};

export function buildSimulatedAccount({
  startingBalance = DEFAULT_SIMULATED_STARTING_BALANCE,
  realizedR,
  totalTrades,
  winningTrades,
  losingTrades,
  winRate,
  averageR,
  maxDrawdownR,
  profitFactor,
  bestTradeR,
  worstTradeR,
  lastUpdated,
  sourceLabel,
  sourceNote
}: {
  startingBalance?: number;
  realizedR: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageR: number;
  maxDrawdownR: number;
  profitFactor: number | null;
  bestTradeR?: number | null;
  worstTradeR?: number | null;
  lastUpdated?: string;
  sourceLabel: string;
  sourceNote: string;
}): SimulatedAccount {
  const riskDollarsPerR = round(startingBalance * DEFAULT_SIMULATED_RISK_PER_R);
  const realizedPnL = round(realizedR * riskDollarsPerR);
  const currentBalance = round(startingBalance + realizedPnL);
  const maxDrawdownDollars = round(maxDrawdownR * riskDollarsPerR);

  return {
    startingBalance,
    currentBalance,
    realizedPnL,
    realizedPnLPercent: round(realizedPnL / startingBalance, 4),
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    averageR,
    maxDrawdownR,
    maxDrawdownDollars,
    profitFactor,
    bestTradeR: bestTradeR ?? null,
    worstTradeR: worstTradeR ?? null,
    lastUpdated,
    dataSource: "simulation",
    accountProvider: "none",
    sourceLabel,
    sourceNote,
    riskDollarsPerR,
    isEmpty: false
  };
}

export function buildSimulatedAccountFromResearchCycle(
  run?: ResearchCycleRun,
  startingBalance = DEFAULT_SIMULATED_STARTING_BALANCE
): SimulatedAccount {
  const summary = run?.backtestSummary;
  const sourceLabel = run?.dataSourceLabel ?? (run?.dataSourceMode === "imported" ? "Imported historical data" : "Mock candles");
  const sourceNote = sourceNoteFor(run?.dataSourceMode, sourceLabel);

  if (!summary) {
    return emptyAccount({ startingBalance, sourceLabel, sourceNote, lastUpdated: run?.completedAt ?? run?.startedAt });
  }

  const winningTrades = summary.wins ?? Math.round(summary.winRate * summary.totalTrades);
  const unresolvedTrades = summary.unresolved ?? 0;
  const losingTrades = summary.losses ?? Math.max(0, summary.totalTrades - winningTrades - unresolvedTrades);
  const realizedR = summary.realizedR ?? round(summary.averageR * summary.totalTrades);

  return buildSimulatedAccount({
    startingBalance,
    realizedR,
    totalTrades: summary.totalTrades,
    winningTrades,
    losingTrades,
    winRate: summary.winRate,
    averageR: summary.averageR,
    maxDrawdownR: summary.maxDrawdown,
    profitFactor: summary.profitFactor,
    bestTradeR: summary.bestTradeR,
    worstTradeR: summary.worstTradeR,
    lastUpdated: run?.completedAt ?? run?.startedAt,
    sourceLabel,
    sourceNote
  });
}

export function buildSimulatedAccountFromBacktestResult(
  result?: BacktestResult,
  sourceLabel = "Mock candles",
  startingBalance = DEFAULT_SIMULATED_STARTING_BALANCE
): SimulatedAccount {
  if (!result) {
    return emptyAccount({ startingBalance, sourceLabel, sourceNote: sourceNoteFor("mock", sourceLabel) });
  }

  return buildSimulatedAccount({
    startingBalance,
    realizedR: result.summary.realizedR,
    totalTrades: result.summary.totalTrades,
    winningTrades: result.summary.wins,
    losingTrades: result.summary.losses,
    winRate: result.summary.winRate,
    averageR: result.summary.averageR,
    maxDrawdownR: result.summary.maxDrawdown,
    profitFactor: result.summary.profitFactor,
    bestTradeR: result.summary.bestTrade?.rMultiple,
    worstTradeR: result.summary.worstTrade?.rMultiple,
    lastUpdated: new Date().toISOString(),
    sourceLabel,
    sourceNote: sourceNoteFor("mock", sourceLabel)
  });
}
