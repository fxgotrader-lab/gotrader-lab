import type { IctAdvisorSignal } from "./ictAdvisorTypes";
import {
  buildPhase2BaseSignal,
  buildPhase2MarketContext,
  selectBestOrderBlockCandidate,
  type IctPhase2SignalContext
} from "./ictPhase2OrderBlocks";

const sideForComposite = (composite: string): IctAdvisorSignal["side"] =>
  composite === "bullish" ? "long" : composite === "bearish" ? "short" : "flat";

const confluenceReasons = ({
  biasMatches,
  blockMatches,
  hasBlock,
  side
}: {
  biasMatches: boolean;
  blockMatches: boolean;
  hasBlock: boolean;
  side: "long" | "short";
}) =>
  [
    !hasBlock ? "No qualifying order-block family candidate." : "",
    !biasMatches ? `Composite ICT bias does not support a ${side} Bread & Butter model.` : "",
    !blockMatches ? `Order-block direction does not support a ${side} Bread & Butter model.` : ""
  ].filter(Boolean);

export const evaluateIctPhase2BreadAndButterBuy = (context: IctPhase2SignalContext): IctAdvisorSignal => {
  const market = buildPhase2MarketContext(context);
  const orderBlock = selectBestOrderBlockCandidate({ candles: context.candles, primaryTimeframe: context.primaryTimeframe });
  const biasMatches = market.bias.composite === "bullish";
  const blockMatches = orderBlock?.direction === "bullish" && orderBlock.displacementConfirmed && orderBlock.liquiditySweepConfirmed;
  const noTradeReasons = confluenceReasons({
    biasMatches,
    blockMatches: Boolean(blockMatches),
    hasBlock: Boolean(orderBlock),
    side: "long"
  });
  const valid = noTradeReasons.length === 0;
  return buildPhase2BaseSignal({
    confidence: valid ? Math.min(0.82, 0.56 + (orderBlock?.confidence ?? 0) * 0.28) : Math.min(0.36, 0.16 + (orderBlock?.confidence ?? 0) * 0.2),
    context: market,
    decision: valid ? "research_only" : "no_trade",
    noTradeReasons,
    orderBlock,
    setup: valid ? "bread_and_butter_buy" : "no_trade",
    side: valid ? "long" : "flat",
    strategyId: "ict-bread-and-butter-buy",
    summary: valid
      ? `Bread & Butter buy research model aligns bullish bias with ${orderBlock?.variant.replace(/_/g, " ")} evidence.`
      : "Bread & Butter buy is not actionable in the current compact context.",
    riskNotes: [
      "Bread & Butter buy requires bullish directional agreement, order-block evidence, sweep, and displacement before profile review."
    ]
  });
};

export const evaluateIctPhase2BreadAndButterSell = (context: IctPhase2SignalContext): IctAdvisorSignal => {
  const market = buildPhase2MarketContext(context);
  const orderBlock = selectBestOrderBlockCandidate({ candles: context.candles, primaryTimeframe: context.primaryTimeframe });
  const biasMatches = market.bias.composite === "bearish";
  const blockMatches = orderBlock?.direction === "bearish" && orderBlock.displacementConfirmed && orderBlock.liquiditySweepConfirmed;
  const noTradeReasons = confluenceReasons({
    biasMatches,
    blockMatches: Boolean(blockMatches),
    hasBlock: Boolean(orderBlock),
    side: "short"
  });
  const valid = noTradeReasons.length === 0;
  return buildPhase2BaseSignal({
    confidence: valid ? Math.min(0.82, 0.56 + (orderBlock?.confidence ?? 0) * 0.28) : Math.min(0.36, 0.16 + (orderBlock?.confidence ?? 0) * 0.2),
    context: market,
    decision: valid ? "research_only" : "no_trade",
    noTradeReasons,
    orderBlock,
    setup: valid ? "bread_and_butter_sell" : "no_trade",
    side: valid ? "short" : "flat",
    strategyId: "ict-bread-and-butter-sell",
    summary: valid
      ? `Bread & Butter sell research model aligns bearish bias with ${orderBlock?.variant.replace(/_/g, " ")} evidence.`
      : "Bread & Butter sell is not actionable in the current compact context.",
    riskNotes: [
      "Bread & Butter sell requires bearish directional agreement, order-block evidence, sweep, and displacement before profile review."
    ]
  });
};

export const evaluateIctPhase2OrderBlockTaxonomy = (context: IctPhase2SignalContext): IctAdvisorSignal => {
  const market = buildPhase2MarketContext(context);
  const orderBlock = selectBestOrderBlockCandidate({ candles: context.candles, primaryTimeframe: context.primaryTimeframe });
  const side = orderBlock?.direction === "bullish" ? "long" : orderBlock?.direction === "bearish" ? "short" : sideForComposite(market.bias.composite);
  const valid = Boolean(orderBlock && !orderBlock.invalidated);
  const setup =
    orderBlock?.variant === "breaker_block"
      ? "breaker_retest"
      : orderBlock?.variant === "mitigation_block"
        ? "mitigation_block_retracement"
        : valid
          ? "order_block_retracement"
          : "no_trade";
  return buildPhase2BaseSignal({
    confidence: valid ? Math.min(0.74, 0.38 + (orderBlock?.confidence ?? 0) * 0.4) : 0.18,
    context: market,
    decision: valid ? "research_only" : "no_trade",
    noTradeReasons: valid ? [] : [orderBlock ? "Best order-block family candidate is invalidated." : "No compact order-block family candidate detected."],
    orderBlock,
    setup,
    side: valid ? side : "flat",
    strategyId: "ict-order-block-taxonomy",
    summary: valid
      ? `Order-block taxonomy selected ${orderBlock?.variant.replace(/_/g, " ")} as compact research evidence.`
      : "Order-block taxonomy found no usable compact candidate.",
    riskNotes: [
      "Order-block taxonomy is a classification layer; approved profile gates decide whether the candidate is useful."
    ]
  });
};

