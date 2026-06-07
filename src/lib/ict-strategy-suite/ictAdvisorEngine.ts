import {
  listCanonicalCandleSourceSummaries,
  loadCanonicalCandleSource,
  type CanonicalCandleSource,
  type CanonicalCandleSourceSummary
} from "../candleSources";
import { hydrateActiveMt5ReadOnlyCandleFeed } from "../integrations/mt5/mt5ReadOnlyClient";
import { mt5ReadOnlyCandlesToGoTraderCandles } from "../integrations/mt5/mt5ReadOnlyNormalizer";
import type { ResearchRuntimeSnapshot } from "../runtime";
import type { Candle } from "../types";
import { buildIctMarketAnalysisContextFromSnapshot } from "./ictMarketAnalysisContext";
import type { IctMarketAnalysisContextBundle } from "./ictMarketAnalysisContextTypes";
import {
  calculateDealingRange,
  detectDisplacement,
  detectFairValueGap,
  detectLiquidityPools,
  detectLiquiditySweep,
  estimateRewardRisk,
  findNearestDrawOnLiquidity,
  normalizeCandles
} from "./ictStrategySuiteHelpers";
import {
  appendIctAdvisorJournalEvents,
  buildIctAdvisorJournalEvent
} from "./ictAdvisorJournal";
import {
  evaluateIctPhase2BreadAndButterBuy,
  evaluateIctPhase2BreadAndButterSell,
  evaluateIctPhase2OrderBlockTaxonomy
} from "./ictPhase2BreadAndButter";
import { evaluateIctPhase2OneShotOneKill } from "./ictPhase2OneShotOneKill";
import {
  evaluateApprovedSetupProfile,
  getDefaultApprovedSetupProfiles
} from "./ictApprovedSetupProfile";
import {
  ICT_INDEX_SMT_INSTRUMENTS,
  appendIctIndexSmtJournalEvents,
  applySmtToApprovedDecision,
  buildIctIndexSmtJournalEvent,
  evaluateIndexSmt,
  smtSymbolMatchesIndexGroup
} from "./ictIndexSmt";
import {
  appendIctNewsSessionRiskJournalEvents,
  applyNewsSessionRiskToApprovedDecision,
  applyNewsSessionRiskToSignal,
  buildIctNewsSessionRiskJournalEvent,
  evaluateNewsSessionRisk
} from "./ictNewsSessionRisk";
import type {
  IctAdvisorDealingRange,
  IctAdvisorDisplacement,
  IctAdvisorFairValueGap,
  IctAdvisorLiquidityPool,
  IctAdvisorPacket,
  IctAdvisorSignal,
  IctBias,
  IctDecision,
  IctLiquidityType,
  IctSide
} from "./ictAdvisorTypes";
import type { IctIndexComparisonCandles } from "./ictIndexSmtTypes";
import type { IctNewsSessionRiskContextInput } from "./ictNewsSessionRiskTypes";
import { buildIctSessionNarrative } from "./ictSessionNarrative";
import type { IctSessionNarrative } from "./ictSessionNarrativeTypes";
import type { IctLiquidityPool as SuiteLiquidityPool } from "./ictStrategySuiteTypes";

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const phaseOneStrategyIds = [
  "ict-htf-bias",
  "ict-daily-range",
  "ict-liquidity-pool",
  "ict-fvg-displacement"
] as const;

const phaseTwoStrategyIds = [
  "ict-order-block-taxonomy",
  "ict-bread-and-butter-buy",
  "ict-bread-and-butter-sell",
  "ict-one-shot-one-kill"
] as const;

const allowedLiquidityTypes = new Set<IctLiquidityType>([
  "previous_day_high",
  "previous_day_low",
  "session_high",
  "session_low",
  "equal_highs",
  "equal_lows",
  "old_swing_high",
  "old_swing_low"
]);

const toAdvisorLiquidityPool = (pool?: SuiteLiquidityPool): IctAdvisorLiquidityPool | undefined => {
  if (!pool || !allowedLiquidityTypes.has(pool.type as IctLiquidityType)) {
    return undefined;
  }
  return {
    type: pool.type as IctLiquidityType,
    price: pool.price,
    timeframe: pool.timeframe,
    swept: pool.swept,
    distanceFromCurrent: pool.distanceFromCurrent
  };
};

const toAdvisorDealingRange = (range?: ReturnType<typeof calculateDealingRange>, sourceTimeframe = "5m"): IctAdvisorDealingRange | undefined =>
  range
    ? {
        high: range.high,
        low: range.low,
        midpoint: range.midpoint,
        currentLocation: range.currentLocation,
        sourceTimeframe
      }
    : undefined;

const toAdvisorDisplacement = (displacement?: ReturnType<typeof detectDisplacement>): IctAdvisorDisplacement | undefined =>
  displacement
    ? {
        direction: displacement.direction,
        candleTime: displacement.candleTime,
        impulseHigh: displacement.impulseHigh,
        impulseLow: displacement.impulseLow,
        bodySize: displacement.bodySize,
        createdFvg: displacement.createdFvg
      }
    : undefined;

const toAdvisorFvg = (fvg?: ReturnType<typeof detectFairValueGap>, timeframe = "5m"): IctAdvisorFairValueGap | undefined =>
  fvg
    ? {
        direction: fvg.direction,
        high: fvg.high,
        low: fvg.low,
        midpoint: fvg.midpoint ?? round((fvg.high + fvg.low) / 2),
        timeframe,
        mitigated: fvg.mitigated,
        createdAt: fvg.createdAt
      }
    : undefined;

const candleBias = (candles: Candle[] = []): IctBias => {
  const normalized = normalizeCandles(candles);
  const first = normalized[0];
  const last = normalized.at(-1);
  if (!first || !last) return "neutral";
  const change = (last.close - first.open) / Math.max(Math.abs(first.open), 0.01);
  if (change > 0.001) return "bullish";
  if (change < -0.001) return "bearish";
  return "neutral";
};

const compositeBiasFor = (primary: IctBias, htf: Record<string, IctBias>): IctBias => {
  const votes = Object.values(htf);
  if (!votes.length) return "neutral";
  const bullish = votes.filter((bias) => bias === "bullish").length + (primary === "bullish" ? 0.5 : 0);
  const bearish = votes.filter((bias) => bias === "bearish").length + (primary === "bearish" ? 0.5 : 0);
  if (bullish > bearish && bullish >= 1.5) return "bullish";
  if (bearish > bullish && bearish >= 1.5) return "bearish";
  return "neutral";
};

const sideForBias = (bias: IctBias): IctSide => (bias === "bullish" ? "long" : bias === "bearish" ? "short" : "flat");

type CompactLevelCandidate = { price?: number; reason: string };

const signalBase = ({
  brokerSymbol,
  htfTimeframes,
  primaryTimeframe,
  requestedSymbol,
  signal,
  symbol
}: {
  brokerSymbol: string;
  htfTimeframes: string[];
  primaryTimeframe: string;
  requestedSymbol: string;
  signal: Omit<IctAdvisorSignal, "brokerSymbol" | "htfTimeframes" | "phase" | "primaryTimeframe" | "provenance" | "requestedSymbol" | "researchOnly" | "symbol"> & {
    phase?: IctAdvisorSignal["phase"];
  };
  symbol: string;
}): IctAdvisorSignal => ({
  ...signal,
  phase: signal.phase ?? "phase_1",
  symbol,
  requestedSymbol,
  brokerSymbol,
  primaryTimeframe,
  htfTimeframes,
  researchOnly: true,
  provenance: {
    methodology: "ICT",
    phase: signal.phase ?? "phase_1",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true,
    generatedAt: new Date().toISOString()
  }
});

const compactSummaryFor = (signal: IctAdvisorSignal) => `${signal.setup.replace(/_/g, " ")} / ${signal.decision.replace(/_/g, " ")} / ${signal.side} / ${Math.round(signal.confidence * 100)}%`;

const htfConflict = (composite: IctBias, primary: IctBias, htf: Record<string, IctBias>) =>
  composite === "neutral" && primary !== "neutral" && Object.values(htf).some((bias) => bias !== "neutral" && bias !== primary);

const targetTooClose = (currentPrice: number, target?: IctAdvisorLiquidityPool, range?: IctAdvisorDealingRange) => {
  if (!target || !range) return true;
  const distance = Math.abs(target.price - currentPrice);
  return distance <= Math.abs(range.high - range.low) * 0.05;
};

const finitePrice = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isDirectionalSide = (side: IctSide): side is "long" | "short" => side === "long" || side === "short";
const logicalTargetForSide = (side: "long" | "short", entry: number, target?: number) =>
  finitePrice(target) && (side === "long" ? target > entry : target < entry);
const logicalInvalidationForSide = (side: "long" | "short", entry: number, invalidation?: number) =>
  finitePrice(invalidation) && (side === "long" ? invalidation < entry : invalidation > entry);
const entryReferenceForSignal = (signal: IctAdvisorSignal, currentPrice: number) =>
  finitePrice(signal.entryZone?.midpoint)
    ? signal.entryZone.midpoint
    : finitePrice(signal.entryZone?.low) && finitePrice(signal.entryZone?.high)
      ? round((signal.entryZone.low + signal.entryZone.high) / 2)
      : currentPrice;

const compactEventPrice = (
  event: IctSessionNarrative["events"][number],
  preference: "high" | "low" | "mid" | "price"
) => {
  if (preference === "high") return event.high ?? event.price;
  if (preference === "low") return event.low ?? event.price;
  if (preference === "mid" && finitePrice(event.high) && finitePrice(event.low)) return round((event.high + event.low) / 2);
  return event.price ?? event.high ?? event.low;
};

const eventCandidates = (
  sessionNarrative: IctSessionNarrative,
  eventTypes: Array<IctSessionNarrative["events"][number]["eventType"]>,
  preference: "high" | "low" | "mid" | "price",
  label: string
) =>
  sessionNarrative.events
    .filter((event) => eventTypes.includes(event.eventType))
    .map((event) => ({
      price: compactEventPrice(event, preference),
      reason: `${label}: ${event.eventType}`
    }));

const rangeFor = (sessionNarrative: IctSessionNarrative, session: IctSessionNarrative["ranges"][number]["session"]) =>
  sessionNarrative.ranges.find((range) => range.session === session);

const selectLevel = (
  candidates: CompactLevelCandidate[],
  side: "long" | "short",
  entry: number,
  purpose: "target" | "invalidation"
) => {
  const filtered = candidates.filter((candidate): candidate is { price: number; reason: string } => {
    if (!finitePrice(candidate.price)) return false;
    return purpose === "target"
      ? logicalTargetForSide(side, entry, candidate.price)
      : logicalInvalidationForSide(side, entry, candidate.price);
  });
  return filtered.sort((left, right) => Math.abs(left.price - entry) - Math.abs(right.price - entry))[0];
};

const targetCandidatesFor = (signal: IctAdvisorSignal, sessionNarrative: IctSessionNarrative, entry: number) => {
  const asia = rangeFor(sessionNarrative, "asia");
  const london = rangeFor(sessionNarrative, "london");
  const candidates = ([
    signal.drawOnLiquidity ? { price: signal.drawOnLiquidity.price, reason: `external liquidity ${signal.drawOnLiquidity.type}` } : undefined,
    sessionNarrative.activeDealingRange
      ? {
          price: signal.side === "long" ? sessionNarrative.activeDealingRange.high : sessionNarrative.activeDealingRange.low,
          reason: "active dealing range extreme"
        }
      : undefined,
    asia ? { price: signal.side === "long" ? asia.high : asia.low, reason: "Asia session extreme" } : undefined,
    london ? { price: signal.side === "long" ? london.high : london.low, reason: "London session extreme" } : undefined,
    sessionNarrative.fvgTarget?.detected
      ? {
          price:
            signal.side === "long" && sessionNarrative.fvgTarget.direction === "premium"
              ? sessionNarrative.fvgTarget.midpoint ?? sessionNarrative.fvgTarget.high
              : signal.side === "short" && sessionNarrative.fvgTarget.direction === "discount"
                ? sessionNarrative.fvgTarget.midpoint ?? sessionNarrative.fvgTarget.low
                : undefined,
          reason: `${sessionNarrative.fvgTarget.direction} FVG target`
        }
      : undefined,
    ...eventCandidates(
      sessionNarrative,
      signal.side === "long" ? ["premium_fvg_target", "bullish_expansion"] : ["discount_fvg_target", "bearish_expansion"],
      signal.side === "long" ? "high" : "low",
      "session model target"
    )
  ] as Array<CompactLevelCandidate | undefined>).filter((candidate): candidate is CompactLevelCandidate => Boolean(candidate));
  return selectLevel(candidates, signal.side as "long" | "short", entry, "target");
};

const invalidationCandidatesFor = (signal: IctAdvisorSignal, sessionNarrative: IctSessionNarrative, entry: number) => {
  const asia = rangeFor(sessionNarrative, "asia");
  const london = rangeFor(sessionNarrative, "london");
  const mitigation = sessionNarrative.mitigationContext;
  const candidates = ([
    mitigation.detected
      ? {
          price: signal.side === "long" ? mitigation.zoneLow : mitigation.zoneHigh,
          reason: "mitigation block boundary"
        }
      : undefined,
    signal.fairValueGap
      ? {
          price: signal.side === "long" ? signal.fairValueGap.low : signal.fairValueGap.high,
          reason: "FVG origin boundary"
        }
      : undefined,
    asia ? { price: signal.side === "long" ? asia.low : asia.high, reason: "Asia session extreme" } : undefined,
    london ? { price: signal.side === "long" ? london.low : london.high, reason: "London raid/session extreme" } : undefined,
    sessionNarrative.activeDealingRange
      ? {
          price: signal.side === "long" ? sessionNarrative.activeDealingRange.low : sessionNarrative.activeDealingRange.high,
          reason: "active dealing range invalidation extreme"
        }
      : undefined,
    ...eventCandidates(
      sessionNarrative,
      signal.side === "long"
        ? ["ny_open_consolidation_low_sweep", "sellside_sweep", "london_swept_asia_low"]
        : ["ny_open_consolidation_high_sweep", "buyside_sweep", "london_swept_asia_high"],
      signal.side === "long" ? "low" : "high",
      "session sweep invalidation"
    )
  ] as Array<CompactLevelCandidate | undefined>).filter((candidate): candidate is CompactLevelCandidate => Boolean(candidate));
  return selectLevel(candidates, signal.side as "long" | "short", entry, "invalidation");
};

const completeSignalTradeStructure = (
  signal: IctAdvisorSignal,
  sessionNarrative: IctSessionNarrative,
  currentPrice: number
): IctAdvisorSignal => {
  if (signal.decision !== "research_only" || !isDirectionalSide(signal.side)) return signal;
  const entry = entryReferenceForSignal(signal, currentPrice);
  const target = logicalTargetForSide(signal.side, entry, signal.target)
    ? { price: signal.target, reason: "existing target" }
    : targetCandidatesFor(signal, sessionNarrative, entry);
  const invalidation = logicalInvalidationForSide(signal.side, entry, signal.invalidation)
    ? { price: signal.invalidation, reason: "existing invalidation" }
    : invalidationCandidatesFor(signal, sessionNarrative, entry);
  const rrEstimate = estimateRewardRisk({ entry, target: target?.price, invalidation: invalidation?.price });
  const completed = finitePrice(target?.price) && finitePrice(invalidation?.price) && finitePrice(rrEstimate);
  const missingReason = completed
    ? undefined
    : "Session structure did not provide a safe target/invalidation/RR fallback.";
  return {
    ...signal,
    target: target?.price ?? signal.target,
    invalidation: invalidation?.price ?? signal.invalidation,
    rrEstimate: rrEstimate ?? signal.rrEstimate,
    noTradeReasons: Array.from(
      new Set(
        [
          ...signal.noTradeReasons.filter((reason) => !/Missing target|Missing invalidation|Missing RR|RR estimate is missing/i.test(reason)),
          missingReason
        ].filter((reason): reason is string => Boolean(reason))
      )
    ),
    riskNotes: Array.from(
      new Set([
        ...signal.riskNotes,
        completed
          ? `Target/invalidation/RR completed from compact session structure (${target.reason}; ${invalidation.reason}).`
          : undefined
      ].filter((reason): reason is string => Boolean(reason)))
    )
  };
};

const resolveHtfSources = async (snapshot: ResearchRuntimeSnapshot) => {
  const sourceSummaries = await listCanonicalCandleSourceSummaries();
  const htfSummaries = snapshot.mt5ReadOnly.higherTimeframeSources ?? [];
  const loaded: Array<{ summary: CanonicalCandleSourceSummary; source: CanonicalCandleSource }> = [];
  for (const htf of htfSummaries) {
    const matching = sourceSummaries.find(
      (source) =>
        source.provider === "mt5_read_only" &&
        source.symbol === htf.requestedSymbol &&
        source.timeframe === htf.timeframe &&
        (source.provenance.providerSymbol ?? htf.brokerSymbol) === htf.brokerSymbol
    );
    if (!matching) continue;
    const source = await loadCanonicalCandleSource(matching.sourceId);
    if (source?.candles?.length) {
      loaded.push({ summary: matching, source });
    }
  }
  return loaded;
};

export const buildIctAdvisorSignals = ({
  brokerSymbol,
  candles,
  htfCandles,
  indexComparisonCandles,
  newsSessionRiskContext,
  primaryTimeframe,
  requestedSymbol,
  sessionNarrative,
  sourceSummary,
  symbol
}: {
  brokerSymbol: string;
  candles: Candle[];
  htfCandles: Record<string, Candle[]>;
  indexComparisonCandles?: IctIndexComparisonCandles;
  newsSessionRiskContext?: IctNewsSessionRiskContextInput;
  primaryTimeframe: string;
  requestedSymbol: string;
  sessionNarrative?: IctSessionNarrative;
  sourceSummary: CanonicalCandleSourceSummary;
  symbol: string;
}): IctAdvisorSignal[] => {
  const normalized = normalizeCandles(candles);
  const currentPrice = normalized.at(-1)?.close ?? 0;
  const primary = candleBias(normalized);
  const htf = Object.fromEntries(Object.entries(htfCandles).map(([timeframe, values]) => [timeframe, candleBias(values)]));
  const htfTimeframes = Object.keys(htf);
  const composite = compositeBiasFor(primary, htf);
  const bias = { primary, htf, composite };
  const pools = detectLiquidityPools(normalized).filter((pool) => allowedLiquidityTypes.has(pool.type as IctLiquidityType));
  const sweep = detectLiquiditySweep(normalized, pools);
  const displacement = detectDisplacement(normalized);
  const fvg = detectFairValueGap(normalized);
  const dealingRange = toAdvisorDealingRange(calculateDealingRange(normalized), primaryTimeframe);
  const drawOnLiquidity = toAdvisorLiquidityPool(findNearestDrawOnLiquidity(pools, currentPrice, composite));
  const liquiditySwept = toAdvisorLiquidityPool(sweep?.pool);
  const advisorDisplacement = toAdvisorDisplacement(displacement);
  const advisorFvg = toAdvisorFvg(fvg, primaryTimeframe);
  const htfMissing = htfTimeframes.length === 0;
  const conflict = htfConflict(composite, primary, htf);
  const htfLongValid =
    composite === "bullish" &&
    sweep?.direction === "bullish" &&
    displacement?.direction === "bullish" &&
    Boolean(drawOnLiquidity && drawOnLiquidity.price > currentPrice) &&
    Boolean(dealingRange && dealingRange.currentLocation !== "premium");
  const htfShortValid =
    composite === "bearish" &&
    sweep?.direction === "bearish" &&
    displacement?.direction === "bearish" &&
    Boolean(drawOnLiquidity && drawOnLiquidity.price < currentPrice) &&
    Boolean(dealingRange && dealingRange.currentLocation !== "discount");
  const htfValid = htfLongValid || htfShortValid;
  const htfNoTradeReasons = [
    htfMissing ? "Missing higher-timeframe context." : "",
    conflict ? "Conflicting HTF direction." : "",
    !sweep ? "No buy-side or sell-side liquidity sweep detected." : "",
    !displacement ? "No displacement after the sweep." : "",
    dealingRange?.currentLocation === "equilibrium" ? "Price is at equilibrium." : "",
    !drawOnLiquidity ? "Draw-on-liquidity is missing." : ""
  ].filter(Boolean);
  const htfSignal = signalBase({
    brokerSymbol,
    htfTimeframes,
    primaryTimeframe,
    requestedSymbol,
    symbol,
    signal: {
      strategyId: "ict-htf-bias",
      side: htfValid ? sideForBias(composite) : "flat",
      decision: htfValid ? "research_only" : "no_trade",
      confidence: htfValid ? 0.66 : 0.22,
      bias,
      dealingRange,
      liquiditySwept,
      drawOnLiquidity,
      displacement: advisorDisplacement,
      target: drawOnLiquidity?.price,
      setup: htfValid ? "htf_bias_only" : "no_trade",
      summary: htfValid ? `Composite ICT bias is ${composite}; price is drawing toward ${drawOnLiquidity?.type}.` : "HTF bias is not actionable yet.",
      noTradeReasons: htfValid ? [] : htfNoTradeReasons,
      riskNotes: [
        "Lower timeframe signals cannot override conflicting HTF context.",
        "Research-only. No broker execution authority."
      ]
    }
  });

  const pdh = pools.find((pool) => pool.type === "previous_day_high");
  const pdl = pools.find((pool) => pool.type === "previous_day_low");
  const likelyDailyDraw =
    composite === "bullish"
      ? toAdvisorLiquidityPool(pdh ?? findNearestDrawOnLiquidity(pools, currentPrice, "bullish"))
      : composite === "bearish"
        ? toAdvisorLiquidityPool(pdl ?? findNearestDrawOnLiquidity(pools, currentPrice, "bearish"))
        : drawOnLiquidity;
  const dailyValid = Boolean(likelyDailyDraw && composite !== "neutral" && !targetTooClose(currentPrice, likelyDailyDraw, dealingRange));
  const dailySignal = signalBase({
    brokerSymbol,
    htfTimeframes,
    primaryTimeframe,
    requestedSymbol,
    symbol,
    signal: {
      strategyId: "ict-daily-range",
      side: dailyValid ? sideForBias(composite) : "flat",
      decision: dailyValid ? "research_only" : "no_trade",
      confidence: dailyValid ? 0.56 : 0.25,
      bias,
      dealingRange,
      liquiditySwept,
      drawOnLiquidity: likelyDailyDraw,
      target: likelyDailyDraw?.price,
      setup: dailyValid ? "daily_range_projection" : "no_trade",
      summary: dailyValid ? `Daily range likely draw is ${likelyDailyDraw?.type} near ${likelyDailyDraw?.price}.` : "Daily range draw is unclear or too close.",
      noTradeReasons: dailyValid
        ? []
        : [
            !likelyDailyDraw ? "No previous day/session/equal-high/equal-low draw found." : "",
            composite === "neutral" ? "Composite bias is neutral." : "",
            targetTooClose(currentPrice, likelyDailyDraw, dealingRange) ? "Price is too close to the likely draw." : ""
          ].filter(Boolean),
      riskNotes: ["Daily range engine uses compact current/session/day levels only; no raw candles leave the browser."]
    }
  });

  const rankedPools = pools
    .slice()
    .sort((left, right) => {
      const weight = (pool: SuiteLiquidityPool) => (pool.timeframe === "daily" ? 0 : pool.type.startsWith("previous_day") ? 1 : pool.type.startsWith("session") ? 2 : 3);
      return weight(left) - weight(right) || Math.abs(left.distanceFromCurrent) - Math.abs(right.distanceFromCurrent);
    });
  const bestPool = toAdvisorLiquidityPool(
    rankedPools.find((pool) => !targetTooClose(currentPrice, toAdvisorLiquidityPool(pool), dealingRange))
  );
  const liquidityValid = Boolean(bestPool && composite !== "neutral");
  const liquiditySignal = signalBase({
    brokerSymbol,
    htfTimeframes,
    primaryTimeframe,
    requestedSymbol,
    symbol,
    signal: {
      strategyId: "ict-liquidity-pool",
      side: liquidityValid ? sideForBias(composite) : "flat",
      decision: liquidityValid ? "research_only" : "no_trade",
      confidence: liquidityValid ? 0.54 : 0.24,
      bias,
      dealingRange,
      liquiditySwept,
      drawOnLiquidity: bestPool,
      target: bestPool?.price,
      setup: liquidityValid ? (sweep?.direction === "bullish" ? "sellside_sweep_bullish_displacement" : sweep?.direction === "bearish" ? "buyside_sweep_bearish_displacement" : "daily_range_projection") : "no_trade",
      summary: liquidityValid ? `Highest priority compact liquidity draw is ${bestPool?.type}.` : "No usable liquidity pool is far enough from current price.",
      noTradeReasons: liquidityValid ? [] : [!bestPool ? "All detected liquidity pools are missing or too close to target." : "", composite === "neutral" ? "Composite bias is neutral." : ""].filter(Boolean),
      riskNotes: ["Equal highs/lows, old swings, session levels, and previous day levels are research targets only."]
    }
  });

  const fvgDirection = fvg?.direction;
  const fvgEntry = advisorFvg
    ? {
        type: "fair_value_gap" as const,
        high: advisorFvg.high,
        low: advisorFvg.low,
        midpoint: advisorFvg.midpoint
      }
    : undefined;
  const invalidation =
    fvgDirection === "bullish"
      ? Math.min(...normalized.slice(-12).map((candle) => candle.low), advisorFvg?.low ?? Number.POSITIVE_INFINITY)
      : fvgDirection === "bearish"
        ? Math.max(...normalized.slice(-12).map((candle) => candle.high), advisorFvg?.high ?? Number.NEGATIVE_INFINITY)
        : undefined;
  const target = likelyDailyDraw?.price ?? bestPool?.price;
  const rrEstimate = estimateRewardRisk({ entry: advisorFvg?.midpoint, invalidation, target });
  const fvgLocationOk =
    !dealingRange ||
    (fvgDirection === "bullish" && dealingRange.currentLocation !== "premium") ||
    (fvgDirection === "bearish" && dealingRange.currentLocation !== "discount");
  const fvgValid =
    Boolean(sweep) &&
    Boolean(displacement) &&
    Boolean(advisorFvg) &&
    advisorFvg?.direction === displacement?.direction &&
    !advisorFvg?.mitigated &&
    fvgLocationOk &&
    !conflict &&
    Boolean(target) &&
    !targetTooClose(currentPrice, likelyDailyDraw ?? bestPool, dealingRange) &&
    (rrEstimate ?? 0) >= 2;
  const fvgSignal = signalBase({
    brokerSymbol,
    htfTimeframes,
    primaryTimeframe,
    requestedSymbol,
    symbol,
    signal: {
      strategyId: "ict-fvg-displacement",
      side: fvgValid ? (fvgDirection === "bullish" ? "long" : "short") : "flat",
      decision: fvgValid ? "research_only" : "no_trade",
      confidence: fvgValid ? 0.7 : 0.2,
      bias,
      dealingRange,
      liquiditySwept,
      drawOnLiquidity: likelyDailyDraw ?? bestPool,
      displacement: advisorDisplacement,
      fairValueGap: advisorFvg,
      entryZone: fvgEntry,
      invalidation,
      target,
      rrEstimate,
      setup: fvgValid ? "fvg_retracement" : "no_trade",
      summary: fvgValid ? `FVG retracement research setup detected with ${rrEstimate}R estimate.` : "FVG/displacement setup is blocked.",
      noTradeReasons: fvgValid
        ? []
        : [
            !normalized.length ? "Missing candle data." : "",
            !sweep ? "No liquidity sweep before FVG." : "",
            !displacement ? "No displacement after sweep." : "",
            !advisorFvg ? "No fair value gap detected." : "",
            advisorFvg?.mitigated ? "FVG is already mitigated." : "",
            !fvgLocationOk ? "FVG is in the wrong premium/discount location." : "",
            conflict ? "HTF bias conflicts." : "",
            targetTooClose(currentPrice, likelyDailyDraw ?? bestPool, dealingRange) ? "Target is too close." : "",
            (rrEstimate ?? 0) < 2 ? "RR estimate below 2.0." : ""
          ].filter(Boolean),
      riskNotes: [
        "FVG/displacement engine is advisor-only; it creates no execution intent.",
        sourceSummary.provider === "mt5_read_only" ? "MT5 source is read-only CFD/proxy/broker data, not execution authority." : "Source remains research-only."
      ]
    }
  });

  const phase2Context = {
    brokerSymbol,
    candles: normalized,
    htfCandles,
    primaryTimeframe,
    requestedSymbol,
    symbol
  };
  const phase2Signals = [
    evaluateIctPhase2OrderBlockTaxonomy(phase2Context),
    evaluateIctPhase2BreadAndButterBuy(phase2Context),
    evaluateIctPhase2BreadAndButterSell(phase2Context),
    evaluateIctPhase2OneShotOneKill(phase2Context)
  ];
  const approvedProfile = getDefaultApprovedSetupProfiles()[0];
  const comparisonCandles: IctIndexComparisonCandles = {
    ...(indexComparisonCandles ?? {}),
    [brokerSymbol]: indexComparisonCandles?.[brokerSymbol] ?? normalized
  };
  const shouldEvaluateSmt = smtSymbolMatchesIndexGroup(brokerSymbol) || smtSymbolMatchesIndexGroup(requestedSymbol);
  return [htfSignal, dailySignal, liquiditySignal, fvgSignal, ...phase2Signals].map((signal) => {
    const signalWithSessionNarrative: IctAdvisorSignal = sessionNarrative
      ? {
          ...signal,
          sessionNarrativeProfile: sessionNarrative.profile,
          sessionDirectionalRead: sessionNarrative.directionalRead,
          sessionNarrativeConfidence: sessionNarrative.confidence,
          modelDetected: Boolean(sessionNarrative.primaryModelDetection?.modelDetected),
          modelName: sessionNarrative.primaryModelDetection?.modelName,
          modelState: sessionNarrative.primaryModelDetection?.modelState,
          modelDirection: sessionNarrative.primaryModelDetection?.modelDirection,
          modelConfidence: sessionNarrative.primaryModelDetection?.modelConfidence,
          modelReasons: sessionNarrative.primaryModelDetection?.modelReasons,
          modelMissingEvidence: sessionNarrative.primaryModelDetection?.missingEvidence,
          sessionMitigationContext: sessionNarrative.mitigationContext,
          fvgTargetDetected: sessionNarrative.fvgTarget?.detected,
          fvgTargetDirection: sessionNarrative.fvgTarget?.direction,
          dataDepthStatus: sessionNarrative.dataDepth.status,
          availableLookbackDays: sessionNarrative.dataDepth.availableLookbackDays,
          requestedLookbackDays: sessionNarrative.dataDepth.requestedLookbackDays,
          sessionTopReasons: sessionNarrative.topReasons
        }
      : signal;
    const signalWithCompletedStructure = sessionNarrative
      ? completeSignalTradeStructure(signalWithSessionNarrative, sessionNarrative, currentPrice)
      : signalWithSessionNarrative;
    const smt = shouldEvaluateSmt
      ? evaluateIndexSmt({
          candidateSide: signalWithCompletedStructure.side,
          candlesByBrokerSymbol: comparisonCandles,
          htfTimeframes,
          primarySymbol: brokerSymbol,
          primaryTimeframe
        })
      : undefined;
    const signalWithSmt: IctAdvisorSignal = smt
      ? {
          ...signalWithCompletedStructure,
          smt,
          confidence: clamp(signalWithCompletedStructure.confidence + smt.confidenceAdjustment)
        }
      : signalWithCompletedStructure;
    const newsSessionRisk = evaluateNewsSessionRisk(signalWithSmt, newsSessionRiskContext);
    const signalWithRisk = applyNewsSessionRiskToSignal(signalWithSmt, newsSessionRisk);
    const approvedProfileDecision = applyNewsSessionRiskToApprovedDecision(
      applySmtToApprovedDecision(evaluateApprovedSetupProfile(signalWithRisk, approvedProfile), smt),
      newsSessionRisk
    );
    return {
      ...signalWithRisk,
      approvedProfileDecision
    };
  });
};

const bestSignal = (signals: IctAdvisorSignal[]) =>
  signals
    .slice()
    .sort((left, right) => {
      const leftDecision = left.decision === "research_only" ? 1 : 0;
      const rightDecision = right.decision === "research_only" ? 1 : 0;
      return rightDecision - leftDecision || right.confidence - left.confidence || (right.rrEstimate ?? 0) - (left.rrEstimate ?? 0);
    })[0] ?? signals[0];

const resolveAnalysisCandles = async ({
  activeSource,
  sourceSummary,
  snapshot
}: {
  activeSource?: CanonicalCandleSource;
  sourceSummary: CanonicalCandleSourceSummary;
  snapshot: ResearchRuntimeSnapshot;
}) => {
  if (activeSource?.candles?.length) {
    return {
      candles: activeSource.candles,
      hydrationSource: "canonical_source_store" as const,
      hydrationWarning: undefined
    };
  }
  if (sourceSummary.provider !== "mt5_read_only") {
    return {
      candles: [] as Candle[],
      hydrationSource: "unavailable" as const,
      hydrationWarning: `${sourceSummary.provider} source summary is metadata-only; no hydrated candles were available for ICT model detection.`
    };
  }

  const mt5Feed = await hydrateActiveMt5ReadOnlyCandleFeed();
  const requestedSymbol = snapshot.marketData.symbol;
  const brokerSymbol =
    snapshot.mt5ReadOnly.brokerSymbol ??
    sourceSummary.provenance.providerSymbol ??
    snapshot.marketData.contract;
  const timeframe = sourceSummary.timeframe ?? snapshot.marketData.timeframe;
  const matchesFeed =
    mt5Feed?.activeForResearch &&
    mt5Feed.candles.length > 0 &&
    mt5Feed.requestedSymbol === requestedSymbol &&
    (mt5Feed.brokerSymbol === brokerSymbol || !brokerSymbol) &&
    mt5Feed.timeframe === timeframe;

  if (!matchesFeed || !mt5Feed) {
    return {
      candles: [] as Candle[],
      hydrationSource: "metadata_only" as const,
      hydrationWarning:
        `MT5 source metadata reports ${sourceSummary.candleCount.toLocaleString()} candles, but the advisor could not hydrate read-only candle data for ${brokerSymbol ?? requestedSymbol} ${timeframe}. Rerun Activate MT5 Research Mode or refresh MT5 candles.`
    };
  }

  return {
    candles: mt5ReadOnlyCandlesToGoTraderCandles(mt5Feed),
    hydrationSource: "active_mt5_readonly_feed" as const,
    hydrationWarning: undefined
  };
};

const resolveIndexSmtSources = async ({
  activeSource,
  primaryTimeframe,
  snapshot
}: {
  activeSource?: CanonicalCandleSource;
  primaryTimeframe: string;
  snapshot: ResearchRuntimeSnapshot;
}): Promise<IctIndexComparisonCandles> => {
  const sourceSummaries = await listCanonicalCandleSourceSummaries();
  const loaded: IctIndexComparisonCandles = {};
  for (const instrument of ICT_INDEX_SMT_INSTRUMENTS) {
    const activeBrokerSymbol = activeSource?.provenance.providerSymbol ?? snapshot.marketData.activeResearchSource.provenance.providerSymbol;
    if (
      activeSource?.candles?.length &&
      activeSource.timeframe === primaryTimeframe &&
      (activeBrokerSymbol === instrument.brokerSymbol || activeSource.symbol === instrument.requestedSymbol)
    ) {
      loaded[instrument.brokerSymbol] = activeSource.candles;
      continue;
    }
    const matching = sourceSummaries.find(
      (source) =>
        source.provider === "mt5_read_only" &&
        source.timeframe === primaryTimeframe &&
        (source.symbol === instrument.requestedSymbol || source.provenance.providerSymbol === instrument.brokerSymbol)
    );
    if (!matching) continue;
    const source = await loadCanonicalCandleSource(matching.sourceId);
    if (source?.candles?.length) loaded[instrument.brokerSymbol] = source.candles;
  }
  return loaded;
};

export interface BuildIctAdvisorPacketFromRuntimeOptions {
  marketAnalysisContextBundle?: IctMarketAnalysisContextBundle;
}

const timeframeLabelForAnalysis = (timeframe?: string) => {
  if (timeframe === "W1") return "1w";
  if (timeframe === "D1") return "1d";
  if (timeframe === "H4") return "4h";
  if (timeframe === "H1") return "1h";
  if (timeframe === "M15") return "15m";
  if (timeframe === "M5") return "5m";
  if (timeframe === "M1") return "1m";
  return undefined;
};

export async function buildIctAdvisorPacketFromRuntime(
  snapshot: ResearchRuntimeSnapshot,
  options: BuildIctAdvisorPacketFromRuntimeOptions = {}
): Promise<IctAdvisorPacket> {
  const sourceSummary = snapshot.marketData.activeResearchSource;
  const activeSource = await loadCanonicalCandleSource(sourceSummary.sourceId);
  const brokerSymbol = snapshot.mt5ReadOnly.brokerSymbol ?? sourceSummary.provenance.providerSymbol ?? snapshot.marketData.contract ?? "n/a";
  const requestedSymbol = snapshot.marketData.symbol;
  const primaryTimeframe = sourceSummary.timeframe ?? snapshot.marketData.timeframe;
  const symbol = sourceSummary.symbol ?? requestedSymbol;
  const marketAnalysisContext =
    options.marketAnalysisContextBundle?.context ??
    buildIctMarketAnalysisContextFromSnapshot({ activeSource, snapshot });
  const htfSources = await resolveHtfSources(snapshot);
  const canonicalHtfCandles = Object.fromEntries(htfSources.map(({ source }) => [source.timeframe, source.candles]));
  const bundledHtfCandles = Object.fromEntries(
    (["W1", "D1", "H4", "H1", "M15"] as const)
      .map((timeframe) => [timeframe, options.marketAnalysisContextBundle?.analysisCandlesByTimeframe[timeframe] ?? []] as const)
      .filter(([, values]) => values.length > 0)
  );
  const htfCandles = {
    ...canonicalHtfCandles,
    ...bundledHtfCandles
  };
  const bundledM5Candles = options.marketAnalysisContextBundle?.analysisCandlesByTimeframe.M5 ?? [];
  const analysis = bundledM5Candles.length
    ? {
        candles: bundledM5Candles,
        hydrationSource: "active_mt5_readonly_feed" as const,
        hydrationWarning: undefined
      }
    : await resolveAnalysisCandles({ activeSource, sourceSummary, snapshot });
  const candles = analysis.candles;
  const indexComparisonCandles = await resolveIndexSmtSources({ activeSource, primaryTimeframe, snapshot });
  const htfTimeframes = Object.keys(htfCandles);
  const sessionCandles =
    options.marketAnalysisContextBundle?.analysisCandlesByTimeframe.M15?.length
      ? options.marketAnalysisContextBundle.analysisCandlesByTimeframe.M15
      : candles;
  const sessionModelTimeframe =
    timeframeLabelForAnalysis(marketAnalysisContext.sessionModelSourceTimeframe) ??
    (sessionCandles === candles ? primaryTimeframe : "15m");
  const sessionNarrative = sessionCandles.length
    ? buildIctSessionNarrative(sessionCandles, {
        requestedSymbol,
        brokerSymbol,
        primaryTimeframe: sessionModelTimeframe,
        requestedLookbackDays: 90,
        depthSource: options.marketAnalysisContextBundle ? "cached_depth" : "current_window"
      })
    : undefined;
  const signals = candles.length
    ? buildIctAdvisorSignals({
        brokerSymbol,
        candles,
        htfCandles,
        indexComparisonCandles,
        newsSessionRiskContext: { syntheticNoRisk: true },
        primaryTimeframe,
        requestedSymbol,
        sessionNarrative,
        sourceSummary,
        symbol
      })
    : [...phaseOneStrategyIds, ...phaseTwoStrategyIds].map((strategyId) =>
        signalBase({
          brokerSymbol,
          htfTimeframes,
          primaryTimeframe,
          requestedSymbol,
          symbol,
          signal: {
            strategyId,
            phase: (phaseTwoStrategyIds as readonly string[]).includes(strategyId) ? "phase_2" : "phase_1",
            side: "flat",
            decision: "no_trade",
            confidence: 0,
            bias: { primary: "neutral", htf: {}, composite: "neutral" },
            setup: "no_trade",
            summary: "Active canonical research source could not be hydrated.",
            noTradeReasons: ["Missing candle data from active canonical research source."],
            riskNotes: ["Research-only. No fallback to mock/imported/TradingView is used by the ICT advisor."]
          }
        })
      );
  const recommendedSignal = bestSignal(signals);
  const approvedProfile = getDefaultApprovedSetupProfiles()[0];
  const approvedProfileDecision = applySmtToApprovedDecision(
    evaluateApprovedSetupProfile(recommendedSignal, approvedProfile),
    recommendedSignal.smt
  );
  const finalApprovedProfileDecision = applyNewsSessionRiskToApprovedDecision(
    approvedProfileDecision,
    recommendedSignal.newsSessionRisk
  );
  const journalEvents = signals.map((signal) => buildIctAdvisorJournalEvent(signal));
  const indexSmtJournalEvents = signals.filter((signal) => signal.smt).map((signal) => buildIctIndexSmtJournalEvent(signal.smt!));
  const newsSessionRiskJournalEvents = signals
    .filter((signal) => signal.newsSessionRisk)
    .map((signal) => buildIctNewsSessionRiskJournalEvent(signal.newsSessionRisk!, signal));
  const journalWrite = appendIctAdvisorJournalEvents(journalEvents);
  appendIctIndexSmtJournalEvents(indexSmtJournalEvents);
  appendIctNewsSessionRiskJournalEvents(newsSessionRiskJournalEvents);
  return {
    packetId: createId("ict_advisor_packet"),
    source: "gotrader_ict_strategy_suite",
    mode: "advisory_only",
    generatedAt: new Date().toISOString(),
    requestedSymbol,
    brokerSymbol,
    primaryTimeframe,
    htfTimeframes,
    activeSource: {
      provider: sourceSummary.provider,
      candleCount: candles.length,
      firstTimestamp: candles[0]?.timestamp ?? activeSource?.firstTimestamp ?? sourceSummary.firstTimestamp,
      lastTimestamp: candles[candles.length - 1]?.timestamp ?? activeSource?.lastTimestamp ?? sourceSummary.lastTimestamp,
      sourceFingerprint: activeSource?.fingerprint ?? sourceSummary.fingerprint,
      sourceLabel: sourceSummary.provenance.sourceLabel
    },
    marketAnalysisContext,
    signals,
    recommendedSignal,
    indexSmt: recommendedSignal.smt,
    sessionNarrative,
    newsSessionRisk: recommendedSignal.newsSessionRisk,
    compactSummary: {
      compositeBias: recommendedSignal.bias.composite,
      drawOnLiquidity: recommendedSignal.drawOnLiquidity
        ? `${recommendedSignal.drawOnLiquidity.type} @ ${recommendedSignal.drawOnLiquidity.price}`
        : undefined,
      setup: recommendedSignal.setup,
      decision: recommendedSignal.decision,
      side: recommendedSignal.side,
      confidence: clamp(recommendedSignal.confidence),
      approvedProfileStatus: finalApprovedProfileDecision.status,
      approvalScore: finalApprovedProfileDecision.approvalScore,
      smtDivergenceType: recommendedSignal.smt?.divergenceType,
      smtConfirmsCandidate: recommendedSignal.smt?.confirmsCandidate,
      smtRejectsCandidate: recommendedSignal.smt?.rejectsCandidate,
      relativeStrengthLeader: recommendedSignal.smt?.relativeStrengthLeader,
      relativeWeaknessLeader: recommendedSignal.smt?.relativeWeaknessLeader,
      smtConfidenceAdjustment: recommendedSignal.smt?.confidenceAdjustment,
      newsRiskLevel: recommendedSignal.newsSessionRisk?.newsRiskLevel,
      sessionRiskState: recommendedSignal.newsSessionRisk?.sessionRiskState,
      riskGovernorAction: recommendedSignal.newsSessionRisk?.riskGovernorAction,
      riskGovernorConfidenceAdjustment: recommendedSignal.newsSessionRisk?.riskGovernorConfidenceAdjustment,
      blockingEventsCount: recommendedSignal.newsSessionRisk?.blockingEventsCount,
      cautionEventsCount: recommendedSignal.newsSessionRisk?.cautionEventsCount,
      newsSessionRiskNotes: recommendedSignal.newsSessionRisk?.newsSessionRiskNotes,
      sessionNarrativeProfile: sessionNarrative?.profile,
      sessionDirectionalRead: sessionNarrative?.directionalRead,
      sessionNarrativeConfidence: sessionNarrative?.confidence,
      primaryModelDetection: sessionNarrative?.primaryModelDetection,
      sessionMitigationDetected: sessionNarrative?.mitigationContext.detected,
      fvgTargetDetected: sessionNarrative?.fvgTarget?.detected,
      fvgTargetDirection: sessionNarrative?.fvgTarget?.direction,
      sessionTopReasons: sessionNarrative?.topReasons,
      dataDepthStatus: sessionNarrative?.dataDepth.status,
      availableLookbackDays: sessionNarrative?.dataDepth.availableLookbackDays,
      requestedLookbackDays: sessionNarrative?.dataDepth.requestedLookbackDays,
      displayTimeframe: marketAnalysisContext.displayTimeframe,
      displayTimeframeRole: marketAnalysisContext.displayTimeframeRole,
      analysisTimeframesRequested: marketAnalysisContext.analysisTimeframesRequested,
      analysisTimeframesLoaded: marketAnalysisContext.analysisTimeframesLoaded,
      requiredTimeframesLoaded: marketAnalysisContext.requiredTimeframesLoaded,
      analysisDepthStatus: marketAnalysisContext.analysisDepthStatus,
      multiTimeframeContextStatus: marketAnalysisContext.multiTimeframeContextStatus,
      analysisTimeframesUsed: marketAnalysisContext.analysisTimeframesUsed,
      missingTimeframes: marketAnalysisContext.missingTimeframes,
      htfBiasSource: marketAnalysisContext.htfBiasSource,
      sessionModelSourceTimeframe: marketAnalysisContext.sessionModelSourceTimeframe,
      confirmationSourceTimeframe: marketAnalysisContext.confirmationSourceTimeframe,
      weeklyBiasStatus: marketAnalysisContext.weeklyBiasStatus,
      weeklyBiasDirection: marketAnalysisContext.weeklyBiasDirection,
      weeklyBiasReason: marketAnalysisContext.weeklyBiasReason,
      hydrationSource: analysis.hydrationSource,
      hydrationWarning: analysis.hydrationWarning,
      noTradeReasonCount: recommendedSignal.noTradeReasons.length + (analysis.hydrationWarning ? 1 : 0)
    },
    approvedProfileDecision: finalApprovedProfileDecision,
    journalEvents,
    indexSmtJournalEvents,
    newsSessionRiskJournalEvents,
    journalStatus: journalWrite.storage === "localStorage" ? "written" : journalWrite.storage === "memory_unavailable" ? "memory_only" : "unavailable",
    safetyLocks: {
      rawCandlesIncluded: false,
      rawSnapshotsIncluded: false,
      secretsIncluded: false,
      accountDataIncluded: false,
      orderDataIncluded: false,
      positionDataIncluded: false
    },
    authority: {
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    }
  };
}

export function assertIctAdvisorPacketIsCompact(packet: IctAdvisorPacket) {
  const { safetyLocks: _safetyLocks, approvedProfileDecision, ...payloadWithoutSafetyLockLabels } = packet;
  const serialized = JSON.stringify({
    ...payloadWithoutSafetyLockLabels,
    approvedProfileDecision: approvedProfileDecision ? { ...approvedProfileDecision, safety: undefined } : undefined
  });
  return {
    ok:
      packet.safetyLocks.rawCandlesIncluded === false &&
      packet.safetyLocks.rawSnapshotsIncluded === false &&
      packet.approvedProfileDecision.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
}

export const summarizeIctAdvisorPacket = (packet?: IctAdvisorPacket) =>
  packet
    ? `${packet.compactSummary.compositeBias} / ${packet.compactSummary.setup.replace(/_/g, " ")} / ${packet.compactSummary.decision.replace(/_/g, " ")}`
    : "ICT advisor pending";

export const formatIctAdvisorSignalSummary = compactSummaryFor;
