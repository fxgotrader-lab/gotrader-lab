import { createMockMarketContext } from "@/lib/marketData/mockMarketContext";
import type { MarketContext, MarketDataMode } from "@/lib/marketData/marketDataTypes";
import type { FuturesSymbol, Timeframe } from "@/lib/types";

export function buildMarketContext({
  symbol = "NQ",
  timeframe = "5m",
  mode = "mock"
}: {
  symbol?: FuturesSymbol;
  timeframe?: Timeframe;
  mode?: MarketDataMode;
} = {}): MarketContext {
  return createMockMarketContext(symbol, timeframe);
}

export function summarizeMarketContext(context: MarketContext) {
  return {
    mode: context.mode,
    symbol: context.symbol,
    timeframe: context.timeframe,
    availableModules: context.availableModules.map((module) => module.name),
    missingModules: context.missingModules.map((module) => module.name),
    vwap: context.priceVolume.volumeProfile.vwap,
    vpoc: context.priceVolume.volumeProfile.vpoc,
    vah: context.priceVolume.volumeProfile.vah,
    val: context.priceVolume.volumeProfile.val,
    overnightHigh: context.priceVolume.overnight.high,
    overnightLow: context.priceVolume.overnight.low,
    globexHigh: context.priceVolume.globexRange.high,
    globexLow: context.priceVolume.globexRange.low,
    macroRiskBias: context.macro.macroRiskBias,
    intermarketStatus: context.intermarket.status,
    positioningBias: context.positioning.netPositioningBias,
    orderFlowStatus: context.orderFlow.domStatus,
    safetyNotice: context.safetyNotice
  };
}
