import {
  detectDisplacement,
  detectFairValueGap,
  detectLiquidityPools,
  detectLiquiditySweep,
  estimateRewardRisk,
  findNearestDrawOnLiquidity,
  normalizeCandles
} from "./ictStrategySuiteHelpers";
import type { IctAdvisorSignal } from "./ictAdvisorTypes";
import {
  buildPhase2BaseSignal,
  buildPhase2MarketContext,
  selectBestOrderBlockCandidate,
  type IctPhase2SignalContext
} from "./ictPhase2OrderBlocks";

export const evaluateIctPhase2OneShotOneKill = (context: IctPhase2SignalContext): IctAdvisorSignal => {
  const market = buildPhase2MarketContext(context);
  const normalized = normalizeCandles(context.candles);
  const currentPrice = normalized.at(-1)?.close ?? 0;
  const pools = detectLiquidityPools(normalized);
  const sweep = detectLiquiditySweep(normalized, pools);
  const displacement = detectDisplacement(normalized);
  const fvg = detectFairValueGap(normalized);
  const orderBlock = selectBestOrderBlockCandidate({ candles: context.candles, primaryTimeframe: context.primaryTimeframe });
  const drawOnLiquidity = findNearestDrawOnLiquidity(pools, currentPrice, market.bias.composite);
  const side = market.bias.composite === "bullish" ? "long" : market.bias.composite === "bearish" ? "short" : "flat";
  const expectedDirection = side === "long" ? "bullish" : side === "short" ? "bearish" : undefined;
  const entry = orderBlock?.midpoint ?? fvg?.midpoint;
  const invalidation =
    expectedDirection === "bullish"
      ? orderBlock?.low ?? Math.min(...normalized.slice(-8).map((candle) => candle.low))
      : expectedDirection === "bearish"
        ? orderBlock?.high ?? Math.max(...normalized.slice(-8).map((candle) => candle.high))
        : undefined;
  const rrEstimate = estimateRewardRisk({ entry, invalidation, target: drawOnLiquidity?.price });
  const checks = {
    directionalBias: Boolean(expectedDirection && market.bias.primary === market.bias.composite),
    orderBlock: Boolean(orderBlock && orderBlock.direction === expectedDirection && !orderBlock.invalidated),
    sweep: sweep?.direction === expectedDirection,
    displacement: displacement?.direction === expectedDirection,
    fairValueGap: fvg?.direction === expectedDirection && !fvg?.mitigated,
    drawOnLiquidity: Boolean(drawOnLiquidity),
    rewardRisk: (rrEstimate ?? 0) >= 2
  };
  const noTradeReasons = [
    !checks.directionalBias ? "OSOK requires primary and composite directional alignment." : "",
    !checks.orderBlock ? "OSOK requires a non-invalidated matching order-block candidate." : "",
    !checks.sweep ? "OSOK requires matching liquidity sweep evidence." : "",
    !checks.displacement ? "OSOK requires matching displacement evidence." : "",
    !checks.fairValueGap ? "OSOK requires an unmitigated matching FVG." : "",
    !checks.drawOnLiquidity ? "OSOK requires an external draw-on-liquidity target." : "",
    !checks.rewardRisk ? "OSOK RR estimate is below 2.0R." : ""
  ].filter(Boolean);
  const valid = noTradeReasons.length === 0;
  const signal = buildPhase2BaseSignal({
    confidence: valid ? Math.min(0.9, 0.62 + (orderBlock?.confidence ?? 0) * 0.28) : Math.min(0.42, 0.18 + (orderBlock?.confidence ?? 0) * 0.18),
    context: market,
    decision: valid ? "research_only" : "no_trade",
    noTradeReasons,
    orderBlock,
    setup: valid ? "one_shot_one_kill" : "no_trade",
    side: valid ? side : "flat",
    strategyId: "ict-one-shot-one-kill",
    summary: valid
      ? "One Shot One Kill compact confluence is present before approved-profile review."
      : "One Shot One Kill compact confluence is incomplete.",
    riskNotes: [
      "OSOK is the strictest Phase 2 research model and cannot bypass approved setup, evidence, maturity, or readiness gates."
    ]
  });
  const profileStatus = signal.approvedProfileDecision?.status;
  if (valid && profileStatus !== "approved_research_candidate" && profileStatus !== "watchlist_candidate") {
    return {
      ...signal,
      decision: "no_trade",
      side: "flat",
      setup: "no_trade",
      noTradeReasons: Array.from(
        new Set([
          ...signal.noTradeReasons,
          `OSOK failed approved setup profile review: ${profileStatus ?? "unknown"}.`
        ])
      )
    };
  }
  return signal;
};

