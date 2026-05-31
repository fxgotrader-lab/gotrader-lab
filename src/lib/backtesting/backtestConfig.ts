import type {
  BacktestAgentWeights,
  BacktestConfig,
  BacktestSessionFilter,
  BacktestStopModel,
  ResolvedBacktestConfig
} from "@/lib/backtesting/backtestTypes";
import type { FuturesSymbol, MarketRegime, Timeframe } from "@/lib/types";
import { clamp } from "@/lib/utils";

const STORAGE_KEY = "gotrader-ai-lab-backtest-config";
export const BACKTEST_CONFIG_UPDATED_EVENT = "gotrader-ai-lab-backtest-config-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const backtestSessionFilters: BacktestSessionFilter[] = [
  "all",
  "Asia",
  "London",
  "New York",
  "NY AM Kill Zone",
  "NY PM Kill Zone"
];

export const backtestStopModels: BacktestStopModel[] = ["latest swing", "fixed ticks", "FVG invalidation"];

export const defaultBacktestAgentWeights: BacktestAgentWeights = {
  "ict-liquidity-agent": 0.15,
  "ict-structure-agent": 0.16,
  "grinch-htf-bias-agent": 0.08,
  "grinch-pd-array-hierarchy-agent": 0.06,
  "grinch-opening-price-equilibrium-agent": 0.06,
  "grinch-dealing-range-agent": 0.06,
  "grinch-market-cycle-agent": 0.05,
  "grinch-model-one-power-three-agent": 0.07,
  "grinch-reversal-profile-agent": 0.06,
  "grinch-time-price-alignment-agent": 0.04,
  "grinch-entry-confirmation-agent": 0.05,
  "session-timing-agent": 0.08,
  "risk-reward-agent": 0.13,
  "session-levels-agent": 0.1,
  "auction-volume-profile-agent": 0.1,
  "macro-event-risk-agent": 0.08,
  "intermarket-confirmation-agent": 0.08,
  "positioning-gamma-agent": 0.05,
  "volatility-regime-agent": 0.08,
  "order-flow-agent": 0.02
};

export const defaultBacktestConfig: ResolvedBacktestConfig = {
  symbol: "NQ",
  timeframe: "5m",
  sessionFilter: "all",
  marketRegime: "trend",
  minimumConfluenceThreshold: 0.35,
  minimumConfidenceThreshold: 0.42,
  targetRMultiple: 2,
  stopModel: "latest swing",
  fixedTickStopSize: 48,
  maxBarsToResolveTrade: 8,
  allowLong: true,
  allowShort: true,
  agentWeights: defaultBacktestAgentWeights,
  warmupCandles: 14,
  decisionInterval: 4,
  lookaheadCandles: 8,
  visibleWindow: 18
};

const validSymbols: FuturesSymbol[] = ["ES", "NQ", "MES", "MNQ"];
const validTimeframes: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
const validRegimes: MarketRegime[] = ["trend", "balanced", "volatile", "range", "news-driven", "risk-off", "risk-on"];

const coerceChoice = <T extends string>(value: unknown, choices: T[], fallback: T): T =>
  typeof value === "string" && choices.includes(value as T) ? (value as T) : fallback;

const numberOr = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, min, max) : fallback;
};

const boolOr = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

export function sanitizeBacktestConfig(config: BacktestConfig = {}): ResolvedBacktestConfig {
  const fallback = defaultBacktestConfig;
  const agentWeights = Object.fromEntries(
    Object.entries(defaultBacktestAgentWeights).map(([agentId, defaultWeight]) => [
      agentId,
      numberOr(config.agentWeights?.[agentId as keyof BacktestAgentWeights], defaultWeight, 0, 1.5)
    ])
  ) as BacktestAgentWeights;
  const maxBarsToResolveTrade = Math.round(numberOr(
    config.maxBarsToResolveTrade ?? config.lookaheadCandles,
    fallback.maxBarsToResolveTrade,
    1,
    48
  ));

  return {
    symbol: coerceChoice(config.symbol, validSymbols, fallback.symbol),
    timeframe: coerceChoice(config.timeframe, validTimeframes, fallback.timeframe),
    session: config.session,
    sessionFilter: coerceChoice(config.sessionFilter, backtestSessionFilters, fallback.sessionFilter),
    marketRegime: coerceChoice(config.marketRegime, validRegimes, fallback.marketRegime),
    minimumConfluenceThreshold: numberOr(config.minimumConfluenceThreshold, fallback.minimumConfluenceThreshold, 0, 1),
    minimumConfidenceThreshold: numberOr(config.minimumConfidenceThreshold, fallback.minimumConfidenceThreshold, 0, 1),
    targetRMultiple: numberOr(config.targetRMultiple, fallback.targetRMultiple, 0.25, 8),
    stopModel: coerceChoice(config.stopModel, backtestStopModels, fallback.stopModel),
    fixedTickStopSize: Math.round(numberOr(config.fixedTickStopSize, fallback.fixedTickStopSize, 1, 400)),
    maxBarsToResolveTrade,
    allowLong: boolOr(config.allowLong, fallback.allowLong),
    allowShort: boolOr(config.allowShort, fallback.allowShort),
    agentWeights,
    warmupCandles: Math.round(numberOr(config.warmupCandles, fallback.warmupCandles, 6, 100)),
    decisionInterval: Math.round(numberOr(config.decisionInterval, fallback.decisionInterval, 1, 24)),
    lookaheadCandles: maxBarsToResolveTrade,
    visibleWindow: Math.round(numberOr(config.visibleWindow, fallback.visibleWindow, 8, 80))
  };
}

export function loadBacktestConfig(): ResolvedBacktestConfig {
  if (!isBrowser()) {
    return defaultBacktestConfig;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    saveBacktestConfig(defaultBacktestConfig);
    return defaultBacktestConfig;
  }

  try {
    return sanitizeBacktestConfig(JSON.parse(raw) as BacktestConfig);
  } catch {
    saveBacktestConfig(defaultBacktestConfig);
    return defaultBacktestConfig;
  }
}

export function saveBacktestConfig(config: BacktestConfig): ResolvedBacktestConfig {
  const sanitized = sanitizeBacktestConfig(config);
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent(BACKTEST_CONFIG_UPDATED_EVENT, { detail: sanitized }));
  }
  return sanitized;
}

export function resetBacktestConfig(): ResolvedBacktestConfig {
  return saveBacktestConfig(defaultBacktestConfig);
}

export function describeBacktestConfig(config: ResolvedBacktestConfig) {
  return [
    `${config.symbol} ${config.timeframe}`,
    `${config.sessionFilter} filter`,
    `conf >= ${(config.minimumConfidenceThreshold * 100).toFixed(0)}%`,
    `ICT >= ${(config.minimumConfluenceThreshold * 100).toFixed(0)}%`,
    `${config.targetRMultiple.toFixed(2)}R target`,
    config.stopModel
  ].join(" / ");
}
