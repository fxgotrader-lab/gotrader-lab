import type { CIOSynthesisResult, InternalAgentOpinion } from "@/lib/agents";
import type { InternalAgentId } from "@/lib/agents";
import type { GrinchActiveProfile, GrinchFalsePositiveBlocker, GrinchStrategyScore } from "@/lib/strategyLibrary";
import type {
  Candle,
  ICTContext,
  MarketBias,
  MarketRegime,
  SimulatedTradePlan,
  ThesisInput,
  Timeframe,
  TradeThesis,
  TradingSession,
  FuturesSymbol
} from "@/lib/types";

export type SimulatedTradeOutcome = "target_hit" | "stop_hit" | "expired" | "neutral";
export type BacktestSessionFilter = "all" | "Asia" | "London" | "New York" | "NY AM Kill Zone" | "NY PM Kill Zone";
export type BacktestStopModel = "latest swing" | "fixed ticks" | "FVG invalidation";
export type BacktestAgentWeightId = Exclude<InternalAgentId, "cio-agent">;
export type BacktestAgentWeights = Record<BacktestAgentWeightId, number>;

export interface BacktestConfig {
  symbol?: FuturesSymbol;
  timeframe?: Timeframe;
  session?: TradingSession;
  sessionFilter?: BacktestSessionFilter;
  marketRegime?: MarketRegime;
  minimumConfluenceThreshold?: number;
  minimumConfidenceThreshold?: number;
  targetRMultiple?: number;
  stopModel?: BacktestStopModel;
  fixedTickStopSize?: number;
  maxBarsToResolveTrade?: number;
  allowLong?: boolean;
  allowShort?: boolean;
  agentWeights?: Partial<BacktestAgentWeights>;
  warmupCandles?: number;
  decisionInterval?: number;
  lookaheadCandles?: number;
  visibleWindow?: number;
}

export interface ResolvedBacktestConfig {
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  session?: TradingSession;
  sessionFilter: BacktestSessionFilter;
  marketRegime: MarketRegime;
  minimumConfluenceThreshold: number;
  minimumConfidenceThreshold: number;
  targetRMultiple: number;
  stopModel: BacktestStopModel;
  fixedTickStopSize: number;
  maxBarsToResolveTrade: number;
  allowLong: boolean;
  allowShort: boolean;
  agentWeights: BacktestAgentWeights;
  warmupCandles: number;
  decisionInterval: number;
  lookaheadCandles: number;
  visibleWindow: number;
}

export interface BacktestDecisionPoint {
  id: string;
  decisionIndex: number;
  candle: Candle;
  input: ThesisInput;
  ictContext: ICTContext;
  agentOpinions: InternalAgentOpinion[];
  cioSynthesis: CIOSynthesisResult;
  thesis: TradeThesis;
  grinchScore?: GrinchStrategyScore;
}

export interface SimulatedTradeAgentAttribution {
  agentId: string;
  name: string;
  bias: MarketBias;
  confidence: number;
  weight: number;
  alignsWithCIO: boolean;
}

export interface SimulatedTradeRecord {
  id: string;
  decisionId: string;
  thesisId: string;
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  session: TradingSession;
  marketRegime: MarketRegime;
  bias: MarketBias;
  confidence: number;
  decisionIndex: number;
  entryIndex?: number;
  exitIndex: number;
  openedAt: string;
  resolvedAt: string;
  entryZone: [number, number];
  entryPrice: number;
  invalidation: number;
  target: number;
  targetHit: boolean;
  stopHit: boolean;
  expired: boolean;
  outcome: SimulatedTradeOutcome;
  maxFavorableExcursion: number;
  maxAdverseExcursion: number;
  rMultiple: number;
  riskReward: number;
  reason: string;
  simulatedTradePlan: SimulatedTradePlan;
  agentAttribution: SimulatedTradeAgentAttribution[];
  grinchScore?: GrinchStrategyScore;
}

export interface EquityCurvePoint {
  index: number;
  timestamp: string;
  equityR: number;
  rMultiple: number;
}

export interface BacktestAgentAttributionSummary {
  agentId: string;
  name: string;
  averageConfidence: number;
  averageWeight: number;
  totalOpinions: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  cioAlignmentRate: number;
}

export interface BacktestSkippedSignal {
  id: string;
  decisionIndex: number;
  timestamp: string;
  reason: string;
  bias: MarketBias;
  confidence: number;
  confluenceScore: number;
  sessionLabel: string;
  grinchRuleBlock?: string;
  grinchHardGateReason?: GrinchStrategyScore["hardGateReason"];
  grinchFalsePositiveBlockers?: GrinchFalsePositiveBlocker[];
}

export interface BacktestSkipReasonSummary {
  reason: string;
  count: number;
}

export interface BacktestSummary {
  totalTrades: number;
  directionalTrades: number;
  skippedSignals: number;
  skipReasons: BacktestSkipReasonSummary[];
  wins: number;
  losses: number;
  unresolved: number;
  winRate: number;
  realizedR: number;
  averageR: number;
  maxDrawdown: number;
  profitFactor: number | null;
  bestTrade?: SimulatedTradeRecord;
  worstTrade?: SimulatedTradeRecord;
  equityCurve: EquityCurvePoint[];
  agentAttribution: BacktestAgentAttributionSummary[];
  grinchSummary?: BacktestGrinchSummary;
}

export interface BacktestGrinchSummary {
  averageGrinchModelScore: number;
  averageFalsePositiveRisk: number;
  averageProfileValidity: number;
  latestScore?: GrinchStrategyScore;
  activeProfile: GrinchActiveProfile;
  activeProfileCounts: Partial<Record<GrinchActiveProfile, number>>;
  dominantRuleBlock?: string;
  ruleBlocks: string[];
  missingEvidence: string[];
  grinchImprovedLatestRun?: boolean;
  hardBlockedSignals: number;
  falsePositiveBlockerCounts: Partial<Record<GrinchFalsePositiveBlocker, number>>;
}

export interface BacktestResult {
  config: ResolvedBacktestConfig;
  candles: Candle[];
  decisions: BacktestDecisionPoint[];
  skippedSignals: BacktestSkippedSignal[];
  trades: SimulatedTradeRecord[];
  summary: BacktestSummary;
}

export interface ReplayState {
  currentIndex: number;
  isPlaying: boolean;
  windowSize: number;
}

export interface ReplayFrame {
  currentIndex: number;
  currentCandle?: Candle;
  visibleCandles: Candle[];
  activeDecision?: BacktestDecisionPoint;
  activeThesis?: TradeThesis;
  activeTrade?: SimulatedTradeRecord;
  completedTrades: SimulatedTradeRecord[];
}
