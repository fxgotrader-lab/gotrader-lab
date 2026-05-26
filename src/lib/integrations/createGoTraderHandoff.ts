import { resolveActiveBacktestConfig } from "@/lib/selfImprovement";
import {
  GO_TRADER_HANDOFF_MODE,
  GO_TRADER_HANDOFF_SCHEMA_VERSION,
  GO_TRADER_HANDOFF_SOURCE,
  GO_TRADER_HANDOFF_STRATEGY,
  type GoTraderHandoff,
  type GoTraderHandoffReplayBacktestMetadata
} from "@/lib/integrations/goTraderHandoffSchema";
import { GoTraderHandoffValidationError, validateGoTraderHandoff } from "@/lib/integrations/validateGoTraderHandoff";
import type { DebateSession, TradeThesis } from "@/lib/types";
import { biasToSignal, uid } from "@/lib/utils";

interface CreateGoTraderHandoffOptions {
  handoffId?: string;
  timestamp?: string;
  debateSession?: DebateSession;
  replayBacktestMetadata?: Partial<GoTraderHandoffReplayBacktestMetadata>;
}

export function createGoTraderHandoff(thesis: TradeThesis, options: CreateGoTraderHandoffOptions = {}): GoTraderHandoff {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const backtestConfig = resolveActiveBacktestConfig().config;
  const replayBacktestMetadata: GoTraderHandoffReplayBacktestMetadata = {
    sourceModule: options.replayBacktestMetadata?.sourceModule ?? "research_workbench",
    mockDataOnly: true,
    replayIndex: options.replayBacktestMetadata?.replayIndex,
    backtestConfig: options.replayBacktestMetadata?.backtestConfig ?? {
      symbol: backtestConfig.symbol,
      timeframe: backtestConfig.timeframe,
      sessionFilter: backtestConfig.sessionFilter,
      minimumConfluenceThreshold: backtestConfig.minimumConfluenceThreshold,
      minimumConfidenceThreshold: backtestConfig.minimumConfidenceThreshold,
      targetRMultiple: backtestConfig.targetRMultiple,
      stopModel: backtestConfig.stopModel,
      maxBarsToResolveTrade: backtestConfig.maxBarsToResolveTrade
    }
  };

  const handoff: GoTraderHandoff = {
    schemaVersion: GO_TRADER_HANDOFF_SCHEMA_VERSION,
    handoffId: options.handoffId ?? uid("handoff"),
    timestamp,
    source: GO_TRADER_HANDOFF_SOURCE,
    mode: GO_TRADER_HANDOFF_MODE,
    strategy: GO_TRADER_HANDOFF_STRATEGY,
    symbol: thesis.symbol,
    timeframe: thesis.timeframe,
    signal: biasToSignal(thesis.finalBias),
    confidence: thesis.confidence,
    confluenceScore: thesis.ictContext.confluenceScore,
    ictSummary: {
      narrativeSummary: thesis.ictContext.narrativeSummary,
      bias: thesis.ictContext.bias,
      confluenceScore: thesis.ictContext.confluenceScore,
      killZone: thesis.ictContext.killZoneTag,
      premiumDiscount: thesis.ictContext.premiumDiscount,
      displacement: thesis.ictContext.displacement,
      fairValueGap: thesis.ictContext.fairValueGap,
      latestSwingHigh: thesis.ictContext.latestSwingHigh?.price,
      latestSwingLow: thesis.ictContext.latestSwingLow?.price,
      liquiditySweepCount: thesis.ictContext.liquiditySweeps.length,
      fairValueGapCount: thesis.ictContext.fairValueGaps.length,
      hasBullishMSS: thesis.ictContext.hasBullishMSS,
      hasBearishMSS: thesis.ictContext.hasBearishMSS,
      hasBullishBOS: thesis.ictContext.hasBullishBOS,
      hasBearishBOS: thesis.ictContext.hasBearishBOS
    },
    agentSummaries: (options.debateSession?.messages ?? []).map((message) => ({
      agentId: message.agentId,
      agentName: message.agentName,
      layer: message.layer,
      bias: message.stance,
      confidence: message.confidence,
      weight: message.weight,
      reasoning: message.message,
      recommendation: message.recommendation,
      supportingFactors: message.supportingFactors ?? [],
      warningFactors: message.warningFactors ?? []
    })),
    cioThesis: {
      thesisId: thesis.id,
      bias: thesis.finalBias,
      summary: thesis.thesisSummary,
      reasoningSummary: thesis.reasoningSummary,
      confidence: thesis.confidence,
      session: thesis.session,
      marketRegime: thesis.marketRegime
    },
    entryZone: thesis.simulatedTradePlan.entryZone,
    invalidation: thesis.invalidationLevel,
    target: thesis.targetLiquidity,
    riskNotes: thesis.riskNotes,
    replayBacktestMetadata,
    safety: {
      label: "Simulation-only handoff. No broker execution.",
      brokerConnection: false,
      liveTrading: false,
      orderExecution: false,
      externalApi: false
    }
  };

  const validation = validateGoTraderHandoff(handoff);
  if (!validation.valid) {
    throw new GoTraderHandoffValidationError(validation);
  }

  return handoff;
}
