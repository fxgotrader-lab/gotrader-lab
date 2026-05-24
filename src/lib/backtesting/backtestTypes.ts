import type { CIOSynthesisResult, InternalAgentOpinion } from "@/lib/agents";
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

export interface BacktestConfig {
  symbol?: FuturesSymbol;
  timeframe?: Timeframe;
  session?: TradingSession;
  marketRegime?: MarketRegime;
  warmupCandles?: number;
  decisionInterval?: number;
  lookaheadCandles?: number;
  visibleWindow?: number;
}

export interface ResolvedBacktestConfig {
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  session?: TradingSession;
  marketRegime: MarketRegime;
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

export interface BacktestSummary {
  totalTrades: number;
  directionalTrades: number;
  wins: number;
  losses: number;
  unresolved: number;
  winRate: number;
  averageR: number;
  maxDrawdown: number;
  bestTrade?: SimulatedTradeRecord;
  worstTrade?: SimulatedTradeRecord;
  equityCurve: EquityCurvePoint[];
  agentAttribution: BacktestAgentAttributionSummary[];
}

export interface BacktestResult {
  config: ResolvedBacktestConfig;
  candles: Candle[];
  decisions: BacktestDecisionPoint[];
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
