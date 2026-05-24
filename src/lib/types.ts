export type FuturesSymbol = "ES" | "NQ" | "MES" | "MNQ";

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export type TradingSession =
  | "Globex"
  | "London"
  | "New York AM"
  | "New York Lunch"
  | "New York PM";

export type MarketRegime =
  | "trend"
  | "balanced"
  | "volatile"
  | "range"
  | "news-driven"
  | "risk-off"
  | "risk-on";

export type AgentLayer = "macro" | "sector" | "strategy" | "cio";

export type MarketBias = "bullish" | "bearish" | "neutral";

export type PromptStatus = "active" | "candidate" | "accepted" | "rejected" | "rolled_back";

export type MutationStatus = "pending" | "accepted" | "rejected" | "reverted";

export type ICTConcept =
  | "liquidity sweep"
  | "market structure shift"
  | "displacement"
  | "fair value gap"
  | "premium/discount"
  | "session timing"
  | "higher-timeframe bias"
  | "kill-zone tagging";

export type StructureDirection = "bullish" | "bearish";

export type CandleSession = "Asia" | "London" | "New York" | "Off hours";

export type ICTKillZone = "Asia range" | "London open" | "NY AM" | "NY Lunch" | "NY PM" | "none";

export interface Candle {
  id: string;
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface SwingPoint {
  id: string;
  candleId: string;
  timestamp: string;
  index: number;
  type: "high" | "low";
  price: number;
  strength: number;
}

export interface MarketStructureEvent {
  id: string;
  candleId: string;
  timestamp: string;
  index: number;
  type: "MSS" | "BOS";
  direction: StructureDirection;
  price: number;
  brokenSwingId: string;
  displacement: "mild" | "strong";
  description: string;
}

export interface LiquiditySweep {
  id: string;
  candleId: string;
  timestamp: string;
  index: number;
  direction: "buy-side" | "sell-side";
  sweptSwingId: string;
  sweptLevel: number;
  rejectionClose: number;
  reclaimed: boolean;
  description: string;
}

export interface FairValueGap {
  id: string;
  candleId: string;
  timestamp: string;
  index: number;
  direction: StructureDirection;
  start: number;
  end: number;
  midpoint: number;
  mitigated: boolean;
  createdByDisplacement: boolean;
  description: string;
}

export interface PremiumDiscountZone {
  rangeHigh: number;
  rangeLow: number;
  equilibrium: number;
  premium: [number, number];
  discount: [number, number];
  currentPrice: number;
  currentZone: "premium" | "discount" | "equilibrium";
}

export interface SessionContext {
  candleId: string;
  timestamp: string;
  session: CandleSession;
  killZone: ICTKillZone;
  minutesFromSessionOpen: number;
  label: string;
}

export interface ICTScoringWeights {
  bullishMSS: number;
  bearishMSS: number;
  bullishBOS: number;
  bearishBOS: number;
  liquiditySweep: number;
  fvgAlignment: number;
  premiumDiscountAlignment: number;
  sessionKillZone: number;
  latestSwingStructure: number;
  riskRewardQuality: number;
}

export interface ICTConfluenceFactor {
  id: string;
  label: string;
  bias: MarketBias;
  score: number;
  weight: number;
  explanation: string;
}

export interface ICTConfluenceBreakdown {
  totalScore: number;
  bullishScore: number;
  bearishScore: number;
  neutralScore: number;
  finalBias: MarketBias;
  confidence: number;
  explanation: string;
  positiveFactors: ICTConfluenceFactor[];
  negativeFactors: ICTConfluenceFactor[];
  neutralFactors: ICTConfluenceFactor[];
  bullishFactors: ICTConfluenceFactor[];
  bearishFactors: ICTConfluenceFactor[];
}

export interface PerformanceSnapshot {
  hitRate: number;
  drawdown: number;
  sharpeLike: number;
  confidenceCalibration: number;
  sampleSize: number;
}

export interface PerformanceScore extends PerformanceSnapshot {
  id: string;
  agentId: string;
  createdAt: string;
  window: "7d" | "30d" | "all";
  averageRecommendationScore: number;
}

export interface Agent {
  id: string;
  name: string;
  layer: AgentLayer;
  domain: string;
  description: string;
  active: boolean;
  weight: number;
  currentPromptVersionId: string;
  currentSystemPrompt: string;
  confidence: number;
  confidenceHistory: Array<{ date: string; value: number }>;
  hitRate: number;
  wins: number;
  losses: number;
  drawdown: number;
  sharpeLike: number;
  confidenceCalibration: number;
  tags: string[];
}

export interface AgentPromptVersion {
  id: string;
  agentId: string;
  version: string;
  prompt: string;
  createdAt: string;
  mutationReason: string;
  status: PromptStatus;
  approvedByUser: boolean;
  activatedAt?: string;
  supersedesVersionId?: string;
  performanceBefore?: PerformanceSnapshot;
  performanceAfter?: PerformanceSnapshot;
}

export interface Recommendation {
  id: string;
  agentId: string;
  debateSessionId?: string;
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  bias: MarketBias;
  confidence: number;
  reasoning: string;
  entryZone?: [number, number];
  invalidation?: number;
  target?: number;
  ictTags: ICTConcept[];
  createdAt: string;
  simulatedOutcomeId?: string;
  score?: number;
}

export interface MarketOutcome {
  id: string;
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  session: TradingSession;
  resolvedAt: string;
  actualBias: MarketBias;
  priceMove: number;
  maxAdverseExcursion: number;
  maxFavorableExcursion: number;
  liquidityTargetReached: boolean;
  invalidationHit: boolean;
  notes: string;
}

export interface PromptMutation {
  id: string;
  agentId: string;
  fromPromptVersionId: string;
  candidatePromptVersionId: string;
  createdAt: string;
  reason: string;
  proposedDiffSummary: string;
  status: MutationStatus;
  requiresUserConfirmation: boolean;
  oldPerformance: PerformanceSnapshot;
  candidatePerformance?: PerformanceSnapshot;
  userDecisionAt?: string;
}

export interface ICTContext {
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  session: TradingSession;
  bias: MarketBias;
  latestSwingHigh?: SwingPoint;
  latestSwingLow?: SwingPoint;
  hasBullishMSS: boolean;
  hasBearishMSS: boolean;
  hasBullishBOS: boolean;
  hasBearishBOS: boolean;
  liquiditySweeps: LiquiditySweep[];
  fairValueGaps: FairValueGap[];
  premiumDiscountZone: PremiumDiscountZone;
  killZone: ICTKillZone;
  confluenceScore: number;
  confluenceBreakdown: ICTConfluenceBreakdown;
  scoringWeightsUsed: ICTScoringWeights;
  narrativeSummary: string;
  liquiditySweep: boolean;
  marketStructureShift: boolean;
  displacement: "none" | "mild" | "strong";
  fairValueGap: "none" | "bullish" | "bearish";
  premiumDiscount: "premium" | "discount" | "equilibrium";
  sessionTiming: TradingSession;
  higherTimeframeBias: MarketBias;
  killZoneTag: ICTKillZone;
}

export interface SimulatedTradePlan {
  id: string;
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  bias: MarketBias;
  entryZone: [number, number];
  invalidation: number;
  targetLiquidity: number;
  stopRiskNotes: string;
  riskReward: number;
  mode: "simulation";
}

export interface AgentDebateMessage {
  id: string;
  agentId: string;
  agentName: string;
  layer: AgentLayer;
  stance: MarketBias;
  confidence: number;
  weight?: number;
  message: string;
  supportingFactors?: string[];
  warningFactors?: string[];
  recommendation?: string;
  ictTags: ICTConcept[];
  createdAt: string;
}

export interface TradeThesis {
  id: string;
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  session: TradingSession;
  marketRegime: MarketRegime;
  notes?: string;
  finalBias: MarketBias;
  confidence: number;
  thesisSummary: string;
  invalidationLevel: number;
  targetLiquidity: number;
  riskNotes: string;
  reasoningSummary: string;
  ictContext: ICTContext;
  simulatedTradePlan: SimulatedTradePlan;
  createdAt: string;
  disclaimer: string;
}

export interface DebateSession {
  id: string;
  createdAt: string;
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  session: TradingSession;
  marketRegime: MarketRegime;
  notes?: string;
  messages: AgentDebateMessage[];
  recommendationIds: string[];
  cioThesisId: string;
}

export interface GoTraderSignalExport {
  strategy: "ict_ai_lab";
  source: "gotrader_ai_lab";
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  signal: -1 | 0 | 1;
  price: number;
  confidence: number;
  entry_zone: [number, number];
  invalidation: number;
  target: number;
  risk_notes: string;
  indicators: {
    confidence: number;
    risk_reward: number;
    invalidation: number;
    target_liquidity: number;
    liquidity_sweep: boolean;
    market_structure_shift: boolean;
    displacement: ICTContext["displacement"];
    fair_value_gap: ICTContext["fairValueGap"];
    premium_discount: ICTContext["premiumDiscount"];
    higher_timeframe_bias: MarketBias;
    kill_zone: ICTContext["killZoneTag"];
  };
  regime: MarketRegime;
  platform: "ai_lab";
  market_open: boolean;
  mode: "simulation";
  timestamp: string;
  contract_spec?: {
    tick_size: number;
    tick_value: number;
    multiplier: number;
    margin: number;
  };
}

export interface GoTraderBridgeValidationResult {
  valid: boolean;
  errors: string[];
}

export interface LabState {
  agents: Agent[];
  promptVersions: AgentPromptVersion[];
  recommendations: Recommendation[];
  outcomes: MarketOutcome[];
  performanceScores: PerformanceScore[];
  promptMutations: PromptMutation[];
  debateSessions: DebateSession[];
  tradeTheses: TradeThesis[];
  userApprovals: Array<{
    id: string;
    createdAt: string;
    entityType: "prompt_mutation" | "signal_export";
    entityId: string;
    decision: "approved" | "rejected";
  }>;
}

export interface ThesisInput {
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  session: TradingSession;
  marketRegime: MarketRegime;
  notes?: string;
}
