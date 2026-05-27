import type { SeriesMarker, Time } from "lightweight-charts";

import type {
  FairValueGap,
  LiquiditySweep,
  MarketBias,
  MarketStructureEvent,
  PremiumDiscountZone,
  SwingPoint,
  TradeThesis
} from "@/lib/types";
import type {
  TradingChartCandle,
  TradingChartLineOverlay,
  TradingChartMarker,
  TradingChartZoneOverlay
} from "@/lib/charting/chartTypes";
import type { Candle } from "@/lib/types";

export const toChartTime = (timestamp: string): Time => {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return Math.floor(Date.now() / 1000) as Time;
  }
  return Math.floor(parsed / 1000) as Time;
};

export const candlesToChartData = (candles: Candle[]): TradingChartCandle[] =>
  candles.map((candle) => ({
    close: candle.close,
    high: candle.high,
    low: candle.low,
    open: candle.open,
    sourceCandle: candle,
    time: toChartTime(candle.timestamp),
    volume: candle.volume
  }));

export const horizontalOverlay = (
  candles: Candle[],
  price: number | undefined,
  id: string,
  label: string,
  color: string,
  type: TradingChartLineOverlay["type"],
  options: Partial<Pick<TradingChartLineOverlay, "lineStyle" | "lineWidth" | "visibleByDefault">> = {}
): TradingChartLineOverlay | undefined => {
  if (!candles.length || typeof price !== "number" || !Number.isFinite(price)) {
    return undefined;
  }

  const first = candles[0];
  const last = candles[candles.length - 1];
  return {
    color,
    data: [
      { time: toChartTime(first.timestamp), value: price },
      { time: toChartTime(last.timestamp), value: price }
    ],
    id,
    label,
    lineStyle: options.lineStyle ?? "dashed",
    lineWidth: options.lineWidth ?? 1,
    type,
    visibleByDefault: options.visibleByDefault ?? true
  };
};

export const buildVwapOverlay = (candles: Candle[]): TradingChartLineOverlay | undefined => {
  if (!candles.length) {
    return undefined;
  }

  let cumulativeVolume = 0;
  let cumulativeTypicalValue = 0;
  const data = candles
    .map((candle) => {
      const volume = Math.max(1, candle.volume ?? 1);
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      cumulativeVolume += volume;
      cumulativeTypicalValue += typicalPrice * volume;
      return {
        time: toChartTime(candle.timestamp),
        value: cumulativeTypicalValue / cumulativeVolume
      };
    })
    .filter((point) => Number.isFinite(point.value));

  return {
    color: "#38bdf8",
    data,
    id: "vwap",
    label: "VWAP",
    lineStyle: "solid",
    lineWidth: 2,
    type: "vwap",
    visibleByDefault: true
  };
};

export const buildPremiumDiscountOverlays = (candles: Candle[], zone?: PremiumDiscountZone): TradingChartLineOverlay[] => {
  if (!zone) {
    return [];
  }

  return [
    horizontalOverlay(candles, zone.rangeHigh, "pd-range-high", "Range high", "#fbbf24", "liquidity_level", {
      visibleByDefault: false
    }),
    horizontalOverlay(candles, zone.equilibrium, "pd-equilibrium", "Equilibrium", "#facc15", "liquidity_level"),
    horizontalOverlay(candles, zone.rangeLow, "pd-range-low", "Range low", "#2dd4bf", "liquidity_level", {
      visibleByDefault: false
    })
  ].filter((overlay): overlay is TradingChartLineOverlay => Boolean(overlay));
};

export const buildSwingLevelOverlays = (candles: Candle[], swings: SwingPoint[], limit = 6): TradingChartLineOverlay[] =>
  swings
    .slice(-limit)
    .map((swing) =>
      horizontalOverlay(
        candles,
        swing.price,
        `swing-${swing.id}`,
        swing.type === "high" ? "Swing high" : "Swing low",
        swing.type === "high" ? "#facc15" : "#38bdf8",
        "liquidity_level",
        { visibleByDefault: false }
      )
    )
    .filter((overlay): overlay is TradingChartLineOverlay => Boolean(overlay));

export const buildTradePlanOverlays = (candles: Candle[], thesis?: TradeThesis): TradingChartLineOverlay[] => {
  if (!thesis) {
    return [];
  }

  const entry = (thesis.simulatedTradePlan.entryZone[0] + thesis.simulatedTradePlan.entryZone[1]) / 2;
  return [
    horizontalOverlay(candles, thesis.targetLiquidity, "trade-target", "Target", "#34d399", "target", { lineWidth: 2 }),
    horizontalOverlay(candles, thesis.invalidationLevel, "trade-invalidation", "Invalidation", "#fb7185", "invalidation", {
      lineWidth: 2
    }),
    horizontalOverlay(candles, entry, "trade-entry", "Entry", "#facc15", "entry", { lineWidth: 2 })
  ].filter((overlay): overlay is TradingChartLineOverlay => Boolean(overlay));
};

export const buildFvgZoneOverlays = (candles: Candle[], gaps: FairValueGap[], limit = 8): TradingChartZoneOverlay[] =>
  gaps
    .filter((gap) => gap.createdByDisplacement)
    .slice(-limit)
    .map((gap) => {
      const color = gap.direction === "bullish" ? "#2dd4bf" : "#fb7185";
      const top = Math.max(gap.start, gap.end);
      const bottom = Math.min(gap.start, gap.end);
      const common = {
        lineStyle: "dashed" as const,
        lineWidth: 1 as const,
        visibleByDefault: !gap.mitigated
      };
      return {
        bottom: horizontalOverlay(candles, bottom, `fvg-${gap.id}-bottom`, `${gap.direction} FVG low`, color, "liquidity_level", common)!,
        id: `fvg-${gap.id}`,
        label: `${gap.direction} FVG${gap.mitigated ? " mitigated" : ""}`,
        top: horizontalOverlay(candles, top, `fvg-${gap.id}-top`, `${gap.direction} FVG high`, color, "liquidity_level", common)!,
        type: "fvg",
        visibleByDefault: !gap.mitigated
      };
    });

export const buildIctMarkers = ({
  structureEvents,
  sweeps,
  thesis,
  currentCandle
}: {
  structureEvents?: MarketStructureEvent[];
  sweeps?: LiquiditySweep[];
  thesis?: TradeThesis;
  currentCandle?: Candle;
}): TradingChartMarker[] => {
  const structureMarkers = (structureEvents ?? []).map((event) => ({
    direction: event.direction === "bullish" ? ("bullish" as const) : ("bearish" as const),
    id: event.id,
    label: event.type,
    price: event.price,
    time: toChartTime(event.timestamp),
    type: event.type
  }));

  const sweepMarkers = (sweeps ?? []).map((sweep) => ({
    direction: sweep.direction === "sell-side" ? ("bullish" as const) : ("bearish" as const),
    id: sweep.id,
    label: "SWEEP",
    price: sweep.sweptLevel,
    time: toChartTime(sweep.timestamp),
    type: "sweep" as const
  }));

  const thesisMarkers: TradingChartMarker[] = thesis
    ? [
        {
          direction: thesis.finalBias,
          id: `${thesis.id}-entry`,
          label: "ENTRY",
          price: (thesis.simulatedTradePlan.entryZone[0] + thesis.simulatedTradePlan.entryZone[1]) / 2,
          time: toChartTime(thesis.createdAt),
          type: "entry"
        }
      ]
    : [];

  const currentMarker: TradingChartMarker[] = currentCandle
    ? [
        {
          direction: "neutral",
          id: `current-${currentCandle.id}`,
          label: "NOW",
          price: currentCandle.close,
          time: toChartTime(currentCandle.timestamp),
          type: "current"
        }
      ]
    : [];

  return [...structureMarkers, ...sweepMarkers, ...thesisMarkers, ...currentMarker];
};

export const toLightweightMarker = (marker: TradingChartMarker): SeriesMarker<Time> => {
  const direction: MarketBias = marker.direction ?? "neutral";
  const isBullish = direction === "bullish";
  const isBearish = direction === "bearish";
  const color = marker.type === "current" ? "#facc15" : isBullish ? "#22c55e" : isBearish ? "#ef4444" : "#38bdf8";
  const shape = marker.type === "current" ? "circle" : isBullish ? "arrowUp" : isBearish ? "arrowDown" : "square";

  if (typeof marker.price === "number" && Number.isFinite(marker.price)) {
    return {
      color,
      id: marker.id,
      position: marker.type === "current" ? "atPriceMiddle" : isBullish ? "atPriceBottom" : "atPriceTop",
      price: marker.price,
      shape,
      text: marker.label,
      time: marker.time
    };
  }

  return {
    color,
    id: marker.id,
    position: isBullish ? "belowBar" : "aboveBar",
    shape,
    text: marker.label,
    time: marker.time
  };
};

export const safeBiasLabel = (bias?: MarketBias) => (bias ? bias.toUpperCase() : "NEUTRAL");
