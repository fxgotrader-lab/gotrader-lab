import type { Candle, FairValueGap, LiquiditySweep, MarketStructureEvent } from "@/lib/types";
import type {
  GrinchOpeningPriceReference,
  GrinchPdArray,
  GrinchPdArrayHierarchyResult,
  GrinchPdArrayType
} from "@/lib/strategyLibrary/grinchStrategyTypes";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const midpoint = (a: number, b: number) => round((a + b) / 2);
const span = (a: number, b: number) => Math.abs(a - b);

const hierarchyRank: Record<GrinchPdArrayType, number> = {
  sunday_open: 1,
  twelve_am_open: 2,
  balanced_price_range: 3,
  volume_imbalance: 4,
  fair_value_gap: 5,
  breaker_mitigation_block: 6,
  order_block: 7
};

const isNear = (price: number, level: number, tolerance: number) => Math.abs(price - level) <= tolerance;

const activeFor = (current: number, start: number, end: number, range: number) => {
  const top = Math.max(start, end);
  const bottom = Math.min(start, end);
  const tolerance = Math.max(0.01, range * 0.03);
  return current >= bottom - tolerance && current <= top + tolerance;
};

const respectFor = (candles: Candle[], start: number, end: number) => {
  const current = candles[candles.length - 1]?.close;
  if (typeof current !== "number") {
    return false;
  }
  const top = Math.max(start, end);
  const bottom = Math.min(start, end);
  const mean = midpoint(top, bottom);
  const recent = candles.slice(-8);
  const tradedInto = recent.some((candle) => candle.low <= top && candle.high >= bottom);
  const meanHeld = recent.every((candle) => candle.close >= bottom && candle.close <= top ? Math.abs(candle.close - mean) <= span(top, bottom) : true);
  const rejected = recent.length > 1 && (current > top || current < bottom);
  return tradedInto && (meanHeld || rejected);
};

const violationFor = (candles: Candle[], start: number, end: number) => {
  const recent = candles.slice(-5);
  const top = Math.max(start, end);
  const bottom = Math.min(start, end);
  return recent.length >= 3 && recent.every((candle) => candle.close > top || candle.close < bottom);
};

const openingPriceArray = (
  state: GrinchOpeningPriceReference,
  candles: Candle[],
  type: Extract<GrinchPdArrayType, "sunday_open" | "twelve_am_open">
): GrinchPdArray | undefined => {
  if (typeof state.price !== "number") {
    return undefined;
  }
  const latest = candles[candles.length - 1];
  const range = latest ? Math.max(1, latest.high - latest.low) : 1;
  const band = Math.max(range, Math.abs(state.price) * 0.0015);
  return {
    id: `grinch-${type}-${state.timestamp ?? "latest"}`,
    type,
    label: state.label,
    hierarchyRank: hierarchyRank[type],
    direction: "neutral",
    startPrice: round(state.price - band),
    endPrice: round(state.price + band),
    midpoint: state.price,
    timestamp: state.timestamp,
    source: "opening_price",
    respected: state.touchedAfterOpen && state.sensitivityScore >= 0.25,
    violated: state.touchedAfterOpen && !state.reclaimed && state.sensitivityScore < 0.15,
    active: state.currentRelation === "at" || activeFor(latest?.close ?? state.price, state.price - band, state.price + band, band),
    strength: type === "sunday_open" ? 1 : 0.95,
    reason: state.expectation
  };
};

const fairValueGapArrays = (candles: Candle[], gaps: FairValueGap[]): GrinchPdArray[] =>
  gaps.slice(-8).map((gap) => ({
    id: `grinch-fvg-${gap.id}`,
    type: "fair_value_gap",
    label: `${gap.direction} FVG`,
    hierarchyRank: hierarchyRank.fair_value_gap,
    direction: gap.direction,
    startPrice: gap.start,
    endPrice: gap.end,
    midpoint: gap.midpoint,
    timestamp: gap.timestamp,
    source: "calculated_ict",
    respected: respectFor(candles, gap.start, gap.end),
    violated: violationFor(candles, gap.start, gap.end),
    active: activeFor(candles[candles.length - 1]?.close ?? gap.midpoint, gap.start, gap.end, span(gap.start, gap.end)),
    strength: gap.createdByDisplacement ? 0.7 : 0.52,
    reason: gap.description
  }));

const balancedPriceRanges = (candles: Candle[], gaps: FairValueGap[]): GrinchPdArray[] => {
  const arrays: GrinchPdArray[] = [];
  for (let index = 1; index < gaps.length; index += 1) {
    const prior = gaps[index - 1];
    const current = gaps[index];
    if (prior.direction === current.direction) {
      continue;
    }
    const top = Math.min(Math.max(prior.start, prior.end), Math.max(current.start, current.end));
    const bottom = Math.max(Math.min(prior.start, prior.end), Math.min(current.start, current.end));
    if (top <= bottom) {
      continue;
    }
    arrays.push({
      id: `grinch-bpr-${prior.id}-${current.id}`,
      type: "balanced_price_range",
      label: "Balanced Price Range",
      hierarchyRank: hierarchyRank.balanced_price_range,
      direction: "neutral",
      startPrice: bottom,
      endPrice: top,
      midpoint: midpoint(bottom, top),
      timestamp: current.timestamp,
      source: "calculated_ict",
      respected: respectFor(candles, bottom, top),
      violated: violationFor(candles, bottom, top),
      active: activeFor(candles[candles.length - 1]?.close ?? midpoint(bottom, top), bottom, top, span(bottom, top)),
      strength: 0.82,
      reason: "Old opposing FVGs overlap, creating a balanced price range."
    });
  }
  return arrays.slice(-3);
};

const volumeImbalances = (candles: Candle[]): GrinchPdArray[] => {
  const arrays: GrinchPdArray[] = [];
  for (let index = Math.max(1, candles.length - 80); index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    const bodyGapUp = Math.min(current.open, current.close) > Math.max(previous.open, previous.close);
    const bodyGapDown = Math.max(current.open, current.close) < Math.min(previous.open, previous.close);
    if (!bodyGapUp && !bodyGapDown) {
      continue;
    }
    const start = bodyGapUp ? Math.max(previous.open, previous.close) : Math.max(current.open, current.close);
    const end = bodyGapUp ? Math.min(current.open, current.close) : Math.min(previous.open, previous.close);
    arrays.push({
      id: `grinch-volume-imbalance-${current.id}`,
      type: "volume_imbalance",
      label: "Volume Imbalance",
      hierarchyRank: hierarchyRank.volume_imbalance,
      direction: bodyGapUp ? "bullish" : "bearish",
      startPrice: start,
      endPrice: end,
      midpoint: midpoint(start, end),
      timestamp: current.timestamp,
      source: "derived_from_structure",
      respected: respectFor(candles, start, end),
      violated: violationFor(candles, start, end),
      active: activeFor(candles[candles.length - 1]?.close ?? midpoint(start, end), start, end, span(start, end)),
      strength: 0.72,
      reason: "Consecutive candle bodies leave an imbalance reference."
    });
  }
  return arrays.slice(-4);
};

const breakerMitigationArrays = (candles: Candle[], sweeps: LiquiditySweep[], structureEvents: MarketStructureEvent[]): GrinchPdArray[] => {
  const arrays: GrinchPdArray[] = [];
  const recentSweeps = sweeps.slice(-4);
  for (const sweep of recentSweeps) {
    const structure = structureEvents.find((event) => event.index > sweep.index);
    const candle = candles[sweep.index];
    if (!candle || !structure) {
      continue;
    }
    arrays.push({
      id: `grinch-breaker-${sweep.id}`,
      type: "breaker_mitigation_block",
      label: "Breaker / Mitigation Block",
      hierarchyRank: hierarchyRank.breaker_mitigation_block,
      direction: structure.direction,
      startPrice: Math.min(candle.open, candle.close),
      endPrice: Math.max(candle.open, candle.close),
      midpoint: midpoint(candle.open, candle.close),
      timestamp: candle.timestamp,
      source: "derived_from_structure",
      respected: respectFor(candles, candle.open, candle.close),
      violated: violationFor(candles, candle.open, candle.close),
      active: activeFor(candles[candles.length - 1]?.close ?? candle.close, candle.open, candle.close, span(candle.open, candle.close)),
      strength: 0.62,
      reason: "Sweep followed by structure shift creates a breaker/mitigation reference."
    });
  }
  return arrays;
};

const orderBlocks = (candles: Candle[], structureEvents: MarketStructureEvent[]): GrinchPdArray[] =>
  structureEvents.slice(-4).flatMap((event) => {
    const index = Math.max(0, event.index - 1);
    const candle = candles[index];
    if (!candle) {
      return [];
    }
    return [{
      id: `grinch-order-block-${event.id}`,
      type: "order_block" as const,
      label: "Order Block",
      hierarchyRank: hierarchyRank.order_block,
      direction: event.direction,
      startPrice: Math.min(candle.open, candle.close),
      endPrice: Math.max(candle.open, candle.close),
      midpoint: midpoint(candle.open, candle.close),
      timestamp: candle.timestamp,
      source: "derived_from_structure" as const,
      respected: respectFor(candles, candle.open, candle.close),
      violated: violationFor(candles, candle.open, candle.close),
      active: activeFor(candles[candles.length - 1]?.close ?? candle.close, candle.open, candle.close, span(candle.open, candle.close)),
      strength: 0.45,
      reason: "Last opposing candle before structure displacement."
    }];
  });

export function buildPdArrayHierarchy({
  candles,
  fairValueGaps,
  liquiditySweeps,
  structureEvents,
  sundayOpenState,
  twelveAmOpenState
}: {
  candles: Candle[];
  fairValueGaps: FairValueGap[];
  liquiditySweeps: LiquiditySweep[];
  structureEvents: MarketStructureEvent[];
  sundayOpenState: GrinchOpeningPriceReference;
  twelveAmOpenState: GrinchOpeningPriceReference;
}): GrinchPdArrayHierarchyResult {
  const missingEvidence: string[] = [];
  const arrays = [
    openingPriceArray(sundayOpenState, candles, "sunday_open"),
    openingPriceArray(twelveAmOpenState, candles, "twelve_am_open"),
    ...balancedPriceRanges(candles, fairValueGaps),
    ...volumeImbalances(candles),
    ...fairValueGapArrays(candles, fairValueGaps),
    ...breakerMitigationArrays(candles, liquiditySweeps, structureEvents),
    ...orderBlocks(candles, structureEvents)
  ].filter((item): item is GrinchPdArray => Boolean(item));

  if (!arrays.some((array) => array.type === "sunday_open")) {
    missingEvidence.push("Sunday Open PD array unavailable in active window.");
  }
  if (!arrays.some((array) => array.type === "twelve_am_open")) {
    missingEvidence.push("12AM Open PD array unavailable in active window.");
  }
  if (!fairValueGaps.length) {
    missingEvidence.push("No FVG data available for lower hierarchy PD arrays.");
  }

  const rankedPdArrays = [...arrays].sort((a, b) => a.hierarchyRank - b.hierarchyRank || b.strength - a.strength);
  const activePdArrays = rankedPdArrays.filter((array) => array.active || array.respected).slice(0, 8);

  return {
    activePdArrays,
    rankedPdArrays,
    strongestActive: activePdArrays[0],
    missingEvidence
  };
}
