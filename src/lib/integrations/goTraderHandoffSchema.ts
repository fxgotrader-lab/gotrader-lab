import type {
  AgentLayer,
  FuturesSymbol,
  ICTContext,
  MarketBias,
  MarketRegime,
  Timeframe,
  TradingSession
} from "@/lib/types";

export const GO_TRADER_HANDOFF_SCHEMA_VERSION = "gotrader_ai_lab_handoff_v1" as const;
export const GO_TRADER_HANDOFF_SOURCE = "gotrader_ai_lab" as const;
export const GO_TRADER_HANDOFF_MODE = "simulation" as const;
export const GO_TRADER_HANDOFF_STRATEGY = "ict_ai_lab" as const;

export interface GoTraderHandoffICTSummary {
  narrativeSummary: string;
  bias: MarketBias;
  confluenceScore: number;
  killZone: ICTContext["killZoneTag"];
  premiumDiscount: ICTContext["premiumDiscount"];
  displacement: ICTContext["displacement"];
  fairValueGap: ICTContext["fairValueGap"];
  latestSwingHigh?: number;
  latestSwingLow?: number;
  liquiditySweepCount: number;
  fairValueGapCount: number;
  hasBullishMSS: boolean;
  hasBearishMSS: boolean;
  hasBullishBOS: boolean;
  hasBearishBOS: boolean;
}

export interface GoTraderHandoffAgentSummary {
  agentId: string;
  agentName: string;
  layer: AgentLayer;
  bias: MarketBias;
  confidence: number;
  weight?: number;
  reasoning: string;
  recommendation?: string;
  supportingFactors: string[];
  warningFactors: string[];
}

export interface GoTraderHandoffCIOThesis {
  thesisId: string;
  bias: MarketBias;
  summary: string;
  reasoningSummary: string;
  confidence: number;
  session: TradingSession;
  marketRegime: MarketRegime;
}

export interface GoTraderHandoffReplayBacktestMetadata {
  sourceModule: "research_workbench" | "replay" | "backtest_lab";
  mockDataOnly: true;
  replayIndex?: number;
  backtestConfig?: {
    symbol: FuturesSymbol;
    timeframe: Timeframe;
    sessionFilter: string;
    minimumConfluenceThreshold: number;
    minimumConfidenceThreshold: number;
    targetRMultiple: number;
    stopModel: string;
    maxBarsToResolveTrade: number;
  };
}

export interface GoTraderHandoff {
  schemaVersion: typeof GO_TRADER_HANDOFF_SCHEMA_VERSION;
  handoffId: string;
  timestamp: string;
  source: typeof GO_TRADER_HANDOFF_SOURCE;
  mode: typeof GO_TRADER_HANDOFF_MODE;
  strategy: typeof GO_TRADER_HANDOFF_STRATEGY;
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  signal: -1 | 0 | 1;
  confidence: number;
  confluenceScore: number;
  ictSummary: GoTraderHandoffICTSummary;
  agentSummaries: GoTraderHandoffAgentSummary[];
  cioThesis: GoTraderHandoffCIOThesis;
  entryZone: [number, number];
  invalidation: number;
  target: number;
  riskNotes: string;
  replayBacktestMetadata: GoTraderHandoffReplayBacktestMetadata;
  safety: {
    label: "Simulation-only handoff. No broker execution.";
    brokerConnection: false;
    liveTrading: false;
    orderExecution: false;
    externalApi: false;
  };
}

export const goTraderHandoffSchema = {
  schemaVersion: GO_TRADER_HANDOFF_SCHEMA_VERSION,
  requiredFields: [
    "handoffId",
    "timestamp",
    "source",
    "mode",
    "strategy",
    "symbol",
    "timeframe",
    "signal",
    "confidence",
    "confluenceScore",
    "ictSummary",
    "agentSummaries",
    "cioThesis",
    "entryZone",
    "invalidation",
    "target",
    "riskNotes",
    "replayBacktestMetadata"
  ],
  lockedFields: {
    source: GO_TRADER_HANDOFF_SOURCE,
    mode: GO_TRADER_HANDOFF_MODE,
    strategy: GO_TRADER_HANDOFF_STRATEGY
  },
  signalValues: [-1, 0, 1],
  safetyLabel: "Simulation-only handoff. No broker execution."
} as const;

export interface GoTraderHandoffValidationResult {
  valid: boolean;
  errors: string[];
}
