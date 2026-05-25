import type {
  BacktestAgentAttributionSummary,
  BacktestConfig,
  BacktestSkipReasonSummary,
  ResolvedBacktestConfig,
  SimulatedTradeRecord
} from "@/lib/backtesting";

export type ValidationReadinessStatus = "red" | "yellow" | "green";

export type ValidationScenarioCategory =
  | "threshold"
  | "session"
  | "direction"
  | "stop"
  | "confidence";

export type ValidationScenarioId =
  | "conservative-confluence"
  | "aggressive-confluence"
  | "ny-am-only"
  | "london-only"
  | "long-only"
  | "short-only"
  | "swing-stop"
  | "fixed-tick-stop"
  | "fvg-invalidation"
  | "high-confidence-only";

export interface ValidationScenarioDefinition {
  id: ValidationScenarioId;
  name: string;
  description: string;
  category: ValidationScenarioCategory;
  config: BacktestConfig;
}

export interface ValidationConfidenceCalibration {
  score: number;
  averageConfidence: number;
  realizedWinRate: number;
  calibrationGap: number;
  sampleSize: number;
}

export interface ValidationAgentContribution extends BacktestAgentAttributionSummary {
  recommendation: "increase" | "decrease" | "hold";
  reason: string;
}

export interface ValidationScenarioResult {
  id: ValidationScenarioId;
  name: string;
  description: string;
  category: ValidationScenarioCategory;
  config: ResolvedBacktestConfig;
  totalTrades: number;
  winRate: number;
  averageR: number;
  maxDrawdown: number;
  bestTrade?: SimulatedTradeRecord;
  worstTrade?: SimulatedTradeRecord;
  bestTradeR: number;
  worstTradeR: number;
  skippedSignals: number;
  skipReasons: BacktestSkipReasonSummary[];
  profitFactor: number | null;
  confidenceCalibration: ValidationConfidenceCalibration;
  agentContributionSummary: ValidationAgentContribution[];
  score: number;
  readiness: ValidationReadinessStatus;
}

export interface ValidationAgentWeightRecommendation {
  agentId: string;
  name: string;
  reason: string;
  averageAlignment: number;
  averageConfidence: number;
}

export interface CalibrationReport {
  strongestScenario: string;
  weakestScenario: string;
  bestSession: string;
  worstSession: string;
  bestBiasDirection: string;
  worstBiasDirection: string;
  recommendedConfluenceThreshold: number;
  recommendedConfidenceThreshold: number;
  agentWeightsToIncrease: ValidationAgentWeightRecommendation[];
  agentWeightsToDecrease: ValidationAgentWeightRecommendation[];
  weakICTRules: string[];
  readinessStatus: ValidationReadinessStatus;
  readinessScore: number;
  recommendedNextStep: string;
  generatedAt: string;
}

export interface ValidationSuiteReport {
  id: string;
  generatedAt: string;
  scenarios: ValidationScenarioResult[];
  calibration: CalibrationReport;
  safetyNotice: "Simulation validation only. No broker connection. No real trades.";
}
