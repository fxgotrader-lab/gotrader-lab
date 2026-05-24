import type {
  FuturesSymbol,
  GoTraderBridgeValidationResult,
  GoTraderSignalExport,
  MarketBias,
  MarketRegime,
  Timeframe,
  TradeThesis
} from "@/lib/types";
import { biasToSignal } from "@/lib/utils";

type EquivalentResearchOutput = Partial<TradeThesis> & {
  symbol?: FuturesSymbol;
  timeframe?: Timeframe;
  finalBias?: MarketBias;
  confidence?: number;
  invalidationLevel?: number;
  targetLiquidity?: number;
  riskNotes?: string;
  marketRegime?: MarketRegime;
  createdAt?: string;
};

const futuresSpecs = {
  ES: { tick_size: 0.25, tick_value: 12.5, multiplier: 50, margin: 15400 },
  NQ: { tick_size: 0.25, tick_value: 5, multiplier: 20, margin: 21000 },
  MES: { tick_size: 0.25, tick_value: 1.25, multiplier: 5, margin: 1540 },
  MNQ: { tick_size: 0.25, tick_value: 0.5, multiplier: 2, margin: 2100 }
} as const;

export class GoTraderBridgeValidationError extends Error {
  constructor(public readonly validation: GoTraderBridgeValidationResult) {
    super(validation.errors.join("; "));
    this.name = "GoTraderBridgeValidationError";
  }
}

export function validateGoTraderBridgeInput(thesis: EquivalentResearchOutput): GoTraderBridgeValidationResult {
  const errors: string[] = [];

  if (!thesis.symbol) {
    errors.push("symbol is required");
  }

  if (typeof thesis.confidence !== "number" || !Number.isFinite(thesis.confidence)) {
    errors.push("confidence is required");
  }

  if (thesis.simulatedTradePlan?.mode !== "simulation") {
    errors.push('mode must be "simulation"');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function createGoTraderSimulationSignal(thesis: EquivalentResearchOutput): GoTraderSignalExport {
  const validation = validateGoTraderBridgeInput(thesis);
  if (!validation.valid) {
    throw new GoTraderBridgeValidationError(validation);
  }

  const plan = thesis.simulatedTradePlan;
  const entryZone = plan?.entryZone ?? [0, 0];
  const entryMid = (entryZone[0] + entryZone[1]) / 2;
  const finalBias = thesis.finalBias ?? "neutral";
  const confidence = thesis.confidence ?? 0;
  const invalidation = thesis.invalidationLevel ?? plan?.invalidation ?? 0;
  const target = thesis.targetLiquidity ?? plan?.targetLiquidity ?? 0;
  const timestamp = thesis.createdAt ?? new Date().toISOString();

  return {
    strategy: "ict_ai_lab",
    source: "gotrader_ai_lab",
    symbol: thesis.symbol as FuturesSymbol,
    timeframe: thesis.timeframe ?? "5m",
    signal: biasToSignal(finalBias),
    price: Number(entryMid.toFixed(2)),
    confidence,
    entry_zone: entryZone,
    invalidation,
    target,
    risk_notes: thesis.riskNotes ?? plan?.stopRiskNotes ?? "",
    indicators: {
      confidence,
      risk_reward: plan?.riskReward ?? 0,
      invalidation,
      target_liquidity: target,
      liquidity_sweep: thesis.ictContext?.liquiditySweep ?? false,
      market_structure_shift: thesis.ictContext?.marketStructureShift ?? false,
      displacement: thesis.ictContext?.displacement ?? "none",
      fair_value_gap: thesis.ictContext?.fairValueGap ?? "none",
      premium_discount: thesis.ictContext?.premiumDiscount ?? "equilibrium",
      higher_timeframe_bias: thesis.ictContext?.higherTimeframeBias ?? finalBias,
      kill_zone: thesis.ictContext?.killZoneTag ?? "none"
    },
    regime: thesis.marketRegime ?? "balanced",
    platform: "ai_lab",
    market_open: true,
    mode: "simulation",
    timestamp,
    contract_spec: thesis.symbol ? futuresSpecs[thesis.symbol] : undefined
  };
}
