import type { GoTraderSignalExport, TradeThesis } from "@/lib/types";
import { biasToSignal } from "@/lib/utils";

const futuresSpecs = {
  ES: { tick_size: 0.25, tick_value: 12.5, multiplier: 50, margin: 15400 },
  NQ: { tick_size: 0.25, tick_value: 5, multiplier: 20, margin: 21000 },
  MES: { tick_size: 0.25, tick_value: 1.25, multiplier: 5, margin: 1540 },
  MNQ: { tick_size: 0.25, tick_value: 0.5, multiplier: 2, margin: 2100 }
} as const;

export function exportGoTraderSignal(thesis: TradeThesis): GoTraderSignalExport {
  const entryMid = (thesis.simulatedTradePlan.entryZone[0] + thesis.simulatedTradePlan.entryZone[1]) / 2;

  return {
    strategy: "ict_ai_lab",
    symbol: thesis.symbol,
    timeframe: thesis.timeframe,
    signal: biasToSignal(thesis.finalBias),
    price: Number(entryMid.toFixed(2)),
    confidence: thesis.confidence,
    entry_zone: thesis.simulatedTradePlan.entryZone,
    invalidation: thesis.invalidationLevel,
    target: thesis.targetLiquidity,
    risk_notes: thesis.riskNotes,
    indicators: {
      confidence: thesis.confidence,
      risk_reward: thesis.simulatedTradePlan.riskReward,
      invalidation: thesis.invalidationLevel,
      target_liquidity: thesis.targetLiquidity,
      liquidity_sweep: thesis.ictContext.liquiditySweep,
      market_structure_shift: thesis.ictContext.marketStructureShift,
      displacement: thesis.ictContext.displacement,
      fair_value_gap: thesis.ictContext.fairValueGap,
      premium_discount: thesis.ictContext.premiumDiscount,
      higher_timeframe_bias: thesis.ictContext.higherTimeframeBias,
      kill_zone: thesis.ictContext.killZoneTag
    },
    regime: thesis.marketRegime,
    platform: "ai_lab",
    market_open: true,
    mode: "simulation",
    timestamp: thesis.createdAt,
    contract_spec: futuresSpecs[thesis.symbol]
  };
}
