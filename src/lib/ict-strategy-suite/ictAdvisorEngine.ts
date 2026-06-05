import {
  listCanonicalCandleSourceSummaries,
  loadCanonicalCandleSource,
  type CanonicalCandleSource,
  type CanonicalCandleSourceSummary
} from "../candleSources";
import type { ResearchRuntimeSnapshot } from "../runtime";
import type { Candle } from "../types";
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
  signal: Omit<IctAdvisorSignal, "brokerSymbol" | "htfTimeframes" | "phase" | "primaryTimeframe" | "provenance" | "requestedSymbol" | "symbol"> & {
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
  primaryTimeframe,
  requestedSymbol,
  sourceSummary,
  symbol
}: {
  brokerSymbol: string;
  candles: Candle[];
  htfCandles: Record<string, Candle[]>;
  primaryTimeframe: string;
  requestedSymbol: string;
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
  return [htfSignal, dailySignal, liquiditySignal, fvgSignal, ...phase2Signals].map((signal) => ({
    ...signal,
    approvedProfileDecision: signal.approvedProfileDecision ?? evaluateApprovedSetupProfile(signal, approvedProfile)
  }));
};

const bestSignal = (signals: IctAdvisorSignal[]) =>
  signals
    .slice()
    .sort((left, right) => {
      const leftDecision = left.decision === "research_only" ? 1 : 0;
      const rightDecision = right.decision === "research_only" ? 1 : 0;
      return rightDecision - leftDecision || right.confidence - left.confidence || (right.rrEstimate ?? 0) - (left.rrEstimate ?? 0);
    })[0] ?? signals[0];

export async function buildIctAdvisorPacketFromRuntime(snapshot: ResearchRuntimeSnapshot): Promise<IctAdvisorPacket> {
  const sourceSummary = snapshot.marketData.activeResearchSource;
  const activeSource = await loadCanonicalCandleSource(sourceSummary.sourceId);
  const brokerSymbol = snapshot.mt5ReadOnly.brokerSymbol ?? sourceSummary.provenance.providerSymbol ?? snapshot.marketData.contract ?? "n/a";
  const requestedSymbol = snapshot.marketData.symbol;
  const primaryTimeframe = sourceSummary.timeframe ?? snapshot.marketData.timeframe;
  const symbol = sourceSummary.symbol ?? requestedSymbol;
  const htfSources = await resolveHtfSources(snapshot);
  const htfCandles = Object.fromEntries(htfSources.map(({ source }) => [source.timeframe, source.candles]));
  const candles = activeSource?.candles ?? [];
  const htfTimeframes = Object.keys(htfCandles);
  const signals = activeSource?.candles?.length
    ? buildIctAdvisorSignals({
        brokerSymbol,
        candles,
        htfCandles,
        primaryTimeframe,
        requestedSymbol,
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
  const approvedProfileDecision = evaluateApprovedSetupProfile(recommendedSignal, approvedProfile);
  const journalEvents = signals.map((signal) => buildIctAdvisorJournalEvent(signal));
  const journalWrite = appendIctAdvisorJournalEvents(journalEvents);
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
      candleCount: activeSource?.candleCount ?? sourceSummary.candleCount,
      firstTimestamp: activeSource?.firstTimestamp ?? sourceSummary.firstTimestamp,
      lastTimestamp: activeSource?.lastTimestamp ?? sourceSummary.lastTimestamp,
      sourceFingerprint: activeSource?.fingerprint ?? sourceSummary.fingerprint,
      sourceLabel: sourceSummary.provenance.sourceLabel
    },
    signals,
    recommendedSignal,
    compactSummary: {
      compositeBias: recommendedSignal.bias.composite,
      drawOnLiquidity: recommendedSignal.drawOnLiquidity
        ? `${recommendedSignal.drawOnLiquidity.type} @ ${recommendedSignal.drawOnLiquidity.price}`
        : undefined,
      setup: recommendedSignal.setup,
      decision: recommendedSignal.decision,
      side: recommendedSignal.side,
      confidence: clamp(recommendedSignal.confidence),
      approvedProfileStatus: approvedProfileDecision.status,
      approvalScore: approvedProfileDecision.approvalScore,
      noTradeReasonCount: recommendedSignal.noTradeReasons.length
    },
    approvedProfileDecision,
    journalEvents,
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
