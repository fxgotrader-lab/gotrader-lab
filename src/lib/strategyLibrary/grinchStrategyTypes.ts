import type {
  Candle,
  FairValueGap,
  FuturesSymbol,
  LiquiditySweep,
  MarketBias,
  MarketStructureEvent,
  SwingPoint,
  Timeframe
} from "@/lib/types";

export type GrinchHtfBias = "bullish" | "bearish" | "neutral" | "unclear";
export type GrinchDrawOnLiquidity = "buyside" | "sellside" | "internal_range" | "external_range" | "unclear";
export type GrinchPremiumDiscountState = "premium" | "discount" | "equilibrium" | "outside_range" | "unclear";
export type GrinchMarketCycle = "consolidation" | "expansion" | "retracement" | "reversal" | "unclear";
export type GrinchModelOneState = "valid" | "weak" | "invalid" | "not_present";
export type GrinchReversalProfileState = "valid" | "weak" | "invalid" | "not_present";
export type GrinchConsolidationProfileState = "valid" | "weak" | "invalid" | "not_present";
export type GrinchTradeIntent = "retracement_entry" | "continuation_entry" | "reversal_entry" | "no_trade";
export type GrinchReversalEntryIntent = "reversal_entry" | "no_trade" | "wait_for_confirmation";
export type GrinchConsolidationEntryIntent = "continuation_entry" | "reversal_entry" | "wait_for_confirmation" | "no_trade";
export type GrinchTimingGrade = "ideal" | "acceptable" | "early" | "late" | "expired";
export type GrinchRangeDirection = "bullish_range" | "bearish_range" | "balanced_range" | "unclear";
export type GrinchTwelveAmInteractionState = "interacted" | "failed_to_interact" | "unclear";
export type GrinchLondonBehavior = "above_12am" | "below_12am" | "around_12am" | "expanded_away" | "unclear";
export type GrinchNyReversalWindow = "expected" | "active" | "missed" | "expired";
export type GrinchContinuationBeyond12Am = "supported" | "weak" | "rejected" | "unclear";
export type GrinchTwelveAmConsolidationRelationship =
  | "above"
  | "below"
  | "around"
  | "acting_as_support"
  | "acting_as_resistance"
  | "unclear";
export type GrinchLiquidityRaidState = "buySideRaided" | "sellSideRaided" | "none" | "both" | "unclear";
export type GrinchExpectedExpansionDirection = "bullish" | "bearish" | "neutral" | "unclear";
export type GrinchSmtState = "bullish_confirmation" | "bearish_confirmation" | "conflict" | "none" | "unavailable";
export type GrinchSmtPrimaryPair = "NQ_ES" | "ES_YM" | "NQ_YM" | "unavailable";
export type GrinchSmtInstrument = "NQ" | "ES" | "YM" | "unknown";
export type GrinchSmtLiquidityTaken = "buyside" | "sellside" | "none" | "unclear";
export type GrinchSmtDivergenceType =
  | "higher_high_nonconfirmation"
  | "lower_low_nonconfirmation"
  | "none";
export type GrinchSmtSupportState = boolean | "unclear";
export type GrinchActiveProfile = "model_1" | "reversal" | "consolidation" | "none";

export type GrinchPdArrayType =
  | "sunday_open"
  | "twelve_am_open"
  | "balanced_price_range"
  | "volume_imbalance"
  | "fair_value_gap"
  | "breaker_mitigation_block"
  | "order_block";

export interface GrinchPhase1AnalysisOptions {
  symbol?: FuturesSymbol;
  timeframe?: Timeframe;
  referenceTimestamp?: string;
  lookbackCandles?: number;
  currentTimestamp?: string;
}

export interface GrinchOpeningPriceReference {
  type: "sunday_open" | "twelve_am_open";
  label: string;
  price?: number;
  timestamp?: string;
  openingGapDirection?: "gap_up" | "gap_down" | "flat" | "unknown";
  gapReferenceClose?: number;
  currentRelation: "above" | "below" | "at" | "unknown";
  touchedAfterOpen: boolean;
  reclaimed: boolean;
  sensitivityScore: number;
  expectation: string;
  missingEvidence: string[];
}

export interface GrinchDealingRange {
  rangeHigh: number;
  rangeLow: number;
  equilibrium: number;
  premium: [number, number];
  discount: [number, number];
  premiumDiscountState: GrinchPremiumDiscountState;
  currentPrice: number;
  rangeDirection: GrinchRangeDirection;
  anchorLow?: SwingPoint;
  anchorHigh?: SwingPoint;
  reasoning: string;
}

export interface GrinchPdArray {
  id: string;
  type: GrinchPdArrayType;
  label: string;
  hierarchyRank: number;
  direction: MarketBias | "neutral";
  startPrice: number;
  endPrice: number;
  midpoint: number;
  timestamp?: string;
  source: "opening_price" | "calculated_ict" | "derived_from_structure";
  respected: boolean;
  violated: boolean;
  active: boolean;
  strength: number;
  reason: string;
}

export interface GrinchPdArrayHierarchyResult {
  activePdArrays: GrinchPdArray[];
  rankedPdArrays: GrinchPdArray[];
  strongestActive?: GrinchPdArray;
  missingEvidence: string[];
}

export interface GrinchHtfBiasResult {
  htfBias: GrinchHtfBias;
  htfDrawOnLiquidity: GrinchDrawOnLiquidity;
  liquidityObjective: string;
  confidence: number;
  reasons: string[];
  missingEvidence: string[];
}

export interface GrinchMarketCycleResult {
  marketCycle: GrinchMarketCycle;
  confidence: number;
  reasons: string[];
}

export interface GrinchTimePriceAlignment {
  timingGrade: GrinchTimingGrade;
  currentWindow:
    | "london_observation"
    | "ny_setup"
    | "ny_confirmation"
    | "delayed_profile"
    | "outside_model_window"
    | "unknown";
  isLondonObservationWindow: boolean;
  isNySetupWindow: boolean;
  isNyConfirmationWindow: boolean;
  reason: string;
}

export interface GrinchModelOnePowerThreeResult {
  modelOneState: GrinchModelOneState;
  tradeIntent: GrinchTradeIntent;
  londonRelationToTwelveAm: "above" | "below" | "around" | "missing";
  accumulationIdentified: boolean;
  displacementIdentified: boolean;
  accumulationExtreme?: number;
  displacementExtreme?: number;
  abRange?: GrinchDealingRange;
  reasons: string[];
  missingEvidence: string[];
}

export interface GrinchEntryConfirmationResult {
  pdArrayRespect: boolean;
  meanThresholdRespect: boolean;
  displacementAway: boolean;
  mssOrBos: boolean;
  newFvgAfterDisplacement: boolean;
  timeWindowAlignment: boolean;
  confirmationScore: number;
  reasons: string[];
  missingEvidence: string[];
}

export interface GrinchReversalProfileResult {
  reversalProfileState: GrinchReversalProfileState;
  twelveAmInteractionState: GrinchTwelveAmInteractionState;
  londonBehavior: GrinchLondonBehavior;
  reversalBias: "bullish" | "bearish" | "unclear";
  nyReversalWindow: GrinchNyReversalWindow;
  firstTarget: "12am_open";
  firstTargetPrice?: number;
  continuationBeyond12am: GrinchContinuationBeyond12Am;
  timingGrade: GrinchTimingGrade;
  entryIntent: GrinchReversalEntryIntent;
  confidenceAdjustment: number;
  invalidation: GrinchInvalidationPlan;
  reasons: string[];
  missingEvidence: string[];
}

export interface GrinchConsolidationRange {
  rangeHigh?: number;
  rangeLow?: number;
  rangeMidpoint?: number;
  rangeWidth?: number;
  isTight: boolean;
}

export interface GrinchConsolidationProfileResult {
  consolidationProfileState: GrinchConsolidationProfileState;
  consolidationRange: GrinchConsolidationRange;
  twelveAmRelationship: GrinchTwelveAmConsolidationRelationship;
  liquidityRaidState: GrinchLiquidityRaidState;
  expectedExpansionDirection: GrinchExpectedExpansionDirection;
  entryIntent: GrinchConsolidationEntryIntent;
  timingGrade: GrinchTimingGrade;
  targetHierarchy: GrinchTargetHierarchy;
  invalidation: GrinchInvalidationPlan;
  confidenceAdjustment: number;
  reasons: string[];
  missingEvidence: string[];
}

export interface GrinchSmtIntermarketResult {
  smtState: GrinchSmtState;
  primaryPair: GrinchSmtPrimaryPair;
  leaderInstrument: GrinchSmtInstrument;
  nonConfirmingInstrument: GrinchSmtInstrument;
  liquidityTaken: GrinchSmtLiquidityTaken;
  divergenceType: GrinchSmtDivergenceType;
  supportsBias: GrinchSmtSupportState;
  supportsActiveProfile: GrinchSmtSupportState;
  confidenceAdjustment: number;
  conflictWarning?: string;
  reasons: string[];
  missingEvidence: string[];
}

export interface GrinchTargetHierarchy {
  target1: string;
  target2: string;
  target3: string;
}

export interface GrinchInvalidationPlan {
  primaryInvalidation: string;
  secondaryInvalidation: string;
  timeInvalidation: string;
  narrativeInvalidation: string;
}

export interface GrinchPhase1ModelOutput {
  modelId: "grinch_phase_1_model_1";
  generatedAt: string;
  symbol?: FuturesSymbol;
  timeframe?: Timeframe;
  htfBias: GrinchHtfBias;
  htfDrawOnLiquidity: GrinchDrawOnLiquidity;
  dealingRange: GrinchDealingRange;
  activePdArrays: GrinchPdArray[];
  rankedPdArrays: GrinchPdArray[];
  sundayOpenState: GrinchOpeningPriceReference;
  twelveAmOpenState: GrinchOpeningPriceReference;
  marketCycle: GrinchMarketCycle;
  modelOneState: GrinchModelOneState;
  tradeIntent: GrinchTradeIntent;
  timingGrade: GrinchTimingGrade;
  targetHierarchy: GrinchTargetHierarchy;
  invalidation: GrinchInvalidationPlan;
  entryConfirmation: GrinchEntryConfirmationResult;
  confidenceAdjustment: number;
  reasons: string[];
  missingEvidence: string[];
  safetyNotice: "Research-only ICT profile. No broker execution, no order placement, no readiness override.";
}

export interface GrinchPhase1ContextInput {
  candles: Candle[];
  swings?: SwingPoint[];
  fairValueGaps?: FairValueGap[];
  liquiditySweeps?: LiquiditySweep[];
  structureEvents?: MarketStructureEvent[];
  options?: GrinchPhase1AnalysisOptions;
}

export interface GrinchPhase2ReversalContextInput extends GrinchPhase1ContextInput {
  phase1?: GrinchPhase1ModelOutput;
}

export interface GrinchPhase2ReversalModelOutput extends GrinchReversalProfileResult {
  modelId: "grinch_phase_2_reversal_profile";
  generatedAt: string;
  symbol?: FuturesSymbol;
  timeframe?: Timeframe;
  phase1ModelId: GrinchPhase1ModelOutput["modelId"];
  htfBias: GrinchHtfBias;
  htfDrawOnLiquidity: GrinchDrawOnLiquidity;
  marketCycle: GrinchMarketCycle;
  twelveAmOpenState: GrinchOpeningPriceReference;
  activePdArray?: string;
  safetyNotice: "Research-only reversal profile. No broker execution, no order placement, no readiness override.";
}

export interface GrinchPhase3ConsolidationContextInput extends GrinchPhase1ContextInput {
  phase1?: GrinchPhase1ModelOutput;
}

export interface GrinchPhase3ConsolidationModelOutput extends GrinchConsolidationProfileResult {
  modelId: "grinch_phase_3_consolidation_profile";
  generatedAt: string;
  symbol?: FuturesSymbol;
  timeframe?: Timeframe;
  phase1ModelId: GrinchPhase1ModelOutput["modelId"];
  htfBias: GrinchHtfBias;
  htfDrawOnLiquidity: GrinchDrawOnLiquidity;
  marketCycle: GrinchMarketCycle;
  twelveAmOpenState: GrinchOpeningPriceReference;
  activePdArray?: string;
  safetyNotice: "Research-only consolidation profile. No broker execution, no order placement, no readiness override.";
}

export interface GrinchPhase4SmtContextInput extends GrinchPhase1ContextInput {
  phase1?: GrinchPhase1ModelOutput;
  reversal?: GrinchPhase2ReversalModelOutput;
  consolidation?: GrinchPhase3ConsolidationModelOutput;
  correlatedCandles?: Partial<Record<Exclude<GrinchSmtInstrument, "unknown">, Candle[]>>;
}

export interface GrinchPhase4SmtModelOutput extends GrinchSmtIntermarketResult {
  modelId: "grinch_phase_4_smt_intermarket_confirmation";
  generatedAt: string;
  symbol?: FuturesSymbol;
  timeframe?: Timeframe;
  phase1ModelId: GrinchPhase1ModelOutput["modelId"];
  reversalModelId?: GrinchPhase2ReversalModelOutput["modelId"];
  consolidationModelId?: GrinchPhase3ConsolidationModelOutput["modelId"];
  activeProfile: "model_1" | "reversal" | "consolidation" | "none";
  activeProfileState: string;
  safetyNotice: "Research-only SMT confirmation. No standalone signal, no broker execution, no order placement, no readiness override.";
}

export interface GrinchStrategyScore {
  generatedAt: string;
  grinchModelScore: number;
  activeProfile: GrinchActiveProfile;
  htfBiasAlignment: number;
  pdArrayHierarchyAlignment: number;
  openingPriceAlignment: number;
  timingAlignment: number;
  entryConfirmationScore: number;
  smtConfirmationScore: number;
  falsePositiveRisk: number;
  profileValidity: number;
  profileState: string;
  smtState: GrinchSmtState;
  ruleBlocks: string[];
  primaryRuleBlock?: string;
  reasons: string[];
  missingEvidence: string[];
  safetyNotice: "Research-only Grinch score. Supporting evidence only; no broker execution, order placement, or readiness override.";
}
