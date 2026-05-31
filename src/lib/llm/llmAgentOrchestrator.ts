import { localCommandLLMProvider } from "@/lib/llm/localCommandLLMProvider";
import { mockLLMProvider } from "@/lib/llm/mockLLMProvider";
import { providerStatusForMode } from "@/lib/llm/llmProvider";
import { requiredLLMAgents } from "@/lib/llm/llmPromptTemplates";
import { buildEvidenceLedger, compactEvidenceQualitySummary, type EvidenceLedgerSummary } from "@/lib/evidence";
import type {
  LLMAgentResponse,
  LLMAdvisoryRun,
  LLMProviderMode,
  LLMResearchContextPacket,
  LLMResponseValidationResult
} from "@/lib/llm/llmTypes";
import { missingRequiredLLMAgents, validateLLMResponse } from "@/lib/llm/validateLLMResponse";
import type { ReadinessGateSnapshot } from "@/lib/readiness";
import { buildMarketContext, summarizeMarketContext } from "@/lib/marketData";
import type { MarketContext } from "@/lib/marketData";
import type { ResearchQualityReview } from "@/lib/researchQuality";
import type { SimulationRunbookState } from "@/lib/simulationRunbook";
import { analyzeGrinchPhase1, analyzeGrinchPhase2Reversal, analyzeGrinchPhase3Consolidation } from "@/lib/strategyLibrary";
import { countCompletedRunbookItems, simulationRunbookChecklist } from "@/lib/simulationRunbook";
import type { DebateSession, LabState, TradeThesis } from "@/lib/types";
import { safeArray, uid } from "@/lib/utils";
import type { ValidationSuiteReport } from "@/lib/validation";

const maxDrawdownFor = (validation?: ValidationSuiteReport) => {
  const scenarios = safeArray(validation?.scenarios);
  return scenarios.length ? scenarios.reduce((max, scenario) => Math.max(max, scenario.maxDrawdown), 0) : undefined;
};

const confidenceCalibrationFor = (validation?: ValidationSuiteReport) => {
  const scenarios = safeArray(validation?.scenarios);
  return scenarios.length
    ? scenarios.reduce((sum, scenario) => sum + scenario.confidenceCalibration.score, 0) / scenarios.length
    : undefined;
};

const latestDebateFor = (state: LabState, thesis?: TradeThesis): DebateSession | undefined =>
  safeArray(state.debateSessions).find((debate) => debate.cioThesisId === thesis?.id) ?? safeArray(state.debateSessions)[0];

export function buildLLMResearchContextPacket({
  state,
  validation,
  quality,
  readiness,
  runbook,
  providerMode,
  marketContext: suppliedMarketContext,
  evidenceQualitySummary
}: {
  state: LabState;
  validation?: ValidationSuiteReport;
  quality?: ResearchQualityReview;
  readiness?: ReadinessGateSnapshot;
  runbook?: SimulationRunbookState;
  providerMode: LLMProviderMode;
  marketContext?: MarketContext;
  evidenceQualitySummary?: EvidenceLedgerSummary;
}): LLMResearchContextPacket {
  const thesis = safeArray(state.tradeTheses)[0];
  const debate = latestDebateFor(state, thesis);
  const ictContext = thesis?.ictContext;
  const sourceMarketContext = thesis ? suppliedMarketContext ?? buildMarketContext({ symbol: thesis.symbol, timeframe: thesis.timeframe, mode: "mock" }) : undefined;
  const marketContext = sourceMarketContext
    ? summarizeMarketContext(sourceMarketContext)
    : undefined;
  const grinchPhase1 = sourceMarketContext?.priceVolume.ohlcv.candles.length
    ? analyzeGrinchPhase1({
        candles: sourceMarketContext.priceVolume.ohlcv.candles,
        options: {
          symbol: thesis?.symbol,
          timeframe: thesis?.timeframe,
          currentTimestamp: sourceMarketContext.priceVolume.ohlcv.candles[sourceMarketContext.priceVolume.ohlcv.candles.length - 1]?.timestamp
        }
      })
    : undefined;
  const grinchReversalProfile = sourceMarketContext?.priceVolume.ohlcv.candles.length && grinchPhase1
    ? analyzeGrinchPhase2Reversal({
        candles: sourceMarketContext.priceVolume.ohlcv.candles,
        phase1: grinchPhase1,
        options: {
          symbol: thesis?.symbol,
          timeframe: thesis?.timeframe,
          currentTimestamp: sourceMarketContext.priceVolume.ohlcv.candles[sourceMarketContext.priceVolume.ohlcv.candles.length - 1]?.timestamp
        }
      })
    : undefined;
  const grinchConsolidationProfile = sourceMarketContext?.priceVolume.ohlcv.candles.length && grinchPhase1
    ? analyzeGrinchPhase3Consolidation({
        candles: sourceMarketContext.priceVolume.ohlcv.candles,
        phase1: grinchPhase1,
        options: {
          symbol: thesis?.symbol,
          timeframe: thesis?.timeframe,
          currentTimestamp: sourceMarketContext.priceVolume.ohlcv.candles[sourceMarketContext.priceVolume.ohlcv.candles.length - 1]?.timestamp
        }
      })
    : undefined;
  const compactEvidenceSummary = evidenceQualitySummary
    ? compactEvidenceQualitySummary(evidenceQualitySummary)
    : compactEvidenceQualitySummary(buildEvidenceLedger({
        dataMode: marketContext?.mode === "imported" ? "imported" : "mock",
        sourceLabel: marketContext?.mode === "imported" ? "Imported candles" : "Mock candles",
        rawCandleCount: 0,
        processedCandleCount: 0,
        researchWindow: 0,
        validationId: validation?.id,
        researchQualityId: quality?.id,
        readinessState: readiness?.state
      }));
  const validationScenarios = safeArray(validation?.scenarios);
  const qualityWeaknesses = safeArray(quality?.topWeaknesses);
  const qualityFalsePositivePatterns = safeArray(quality?.falsePositivePatterns);
  const failedReadinessRequirements = safeArray(readiness?.failedRequirements);

  return {
    packetId: uid("llm_context"),
    timestamp: new Date().toISOString(),
    source: "gotrader_ai_lab",
    mode: "advisory_only",
    researchMode: "llm_required",
    providerMode,
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    symbol: thesis?.symbol,
    timeframe: thesis?.timeframe,
    ictContextSummary: ictContext
      ? {
          narrativeSummary: ictContext.narrativeSummary,
          bias: ictContext.bias,
          confluenceScore: ictContext.confluenceScore,
          killZone: ictContext.killZone,
          premiumDiscount: ictContext.premiumDiscount,
          latestSwingHigh: ictContext.latestSwingHigh?.price,
          latestSwingLow: ictContext.latestSwingLow?.price,
          hasBullishMSS: ictContext.hasBullishMSS,
          hasBearishMSS: ictContext.hasBearishMSS,
          hasBullishBOS: ictContext.hasBullishBOS,
          hasBearishBOS: ictContext.hasBearishBOS,
          liquiditySweepCount: safeArray(ictContext.liquiditySweeps).length,
          fairValueGapCount: safeArray(ictContext.fairValueGaps).length
        }
      : undefined,
    grinchPhase1Summary: grinchPhase1
      ? {
          htfBias: grinchPhase1.htfBias,
          htfDrawOnLiquidity: grinchPhase1.htfDrawOnLiquidity,
          dealingRange: {
            rangeHigh: grinchPhase1.dealingRange.rangeHigh,
            rangeLow: grinchPhase1.dealingRange.rangeLow,
            equilibrium: grinchPhase1.dealingRange.equilibrium,
            premiumDiscountState: grinchPhase1.dealingRange.premiumDiscountState
          },
          activePdArray: grinchPhase1.activePdArrays[0]?.label,
          sundayOpenState: grinchPhase1.sundayOpenState.currentRelation,
          twelveAmOpenState: grinchPhase1.twelveAmOpenState.currentRelation,
          marketCycle: grinchPhase1.marketCycle,
          modelOneState: grinchPhase1.modelOneState,
          timingGrade: grinchPhase1.timingGrade,
          tradeIntent: grinchPhase1.tradeIntent,
          targetHierarchy: grinchPhase1.targetHierarchy,
          invalidationSummary: grinchPhase1.invalidation.primaryInvalidation,
          missingEvidence: grinchPhase1.missingEvidence.slice(0, 8)
        }
      : undefined,
    grinchReversalProfileSummary: grinchReversalProfile
      ? {
          reversalProfileState: grinchReversalProfile.reversalProfileState,
          twelveAmInteractionState: grinchReversalProfile.twelveAmInteractionState,
          londonBehavior: grinchReversalProfile.londonBehavior,
          reversalBias: grinchReversalProfile.reversalBias,
          nyReversalWindow: grinchReversalProfile.nyReversalWindow,
          firstTarget: grinchReversalProfile.firstTarget,
          continuationBeyond12am: grinchReversalProfile.continuationBeyond12am,
          timingGrade: grinchReversalProfile.timingGrade,
          entryIntent: grinchReversalProfile.entryIntent,
          confidenceAdjustment: grinchReversalProfile.confidenceAdjustment,
          invalidationSummary: grinchReversalProfile.invalidation.primaryInvalidation,
          reasons: grinchReversalProfile.reasons.slice(0, 6),
          missingEvidence: grinchReversalProfile.missingEvidence.slice(0, 6)
        }
      : undefined,
    grinchConsolidationProfileSummary: grinchConsolidationProfile
      ? {
          consolidationProfileState: grinchConsolidationProfile.consolidationProfileState,
          consolidationRange: grinchConsolidationProfile.consolidationRange,
          twelveAmRelationship: grinchConsolidationProfile.twelveAmRelationship,
          liquidityRaidState: grinchConsolidationProfile.liquidityRaidState,
          expectedExpansionDirection: grinchConsolidationProfile.expectedExpansionDirection,
          entryIntent: grinchConsolidationProfile.entryIntent,
          timingGrade: grinchConsolidationProfile.timingGrade,
          targetHierarchy: grinchConsolidationProfile.targetHierarchy,
          invalidationSummary: grinchConsolidationProfile.invalidation.primaryInvalidation,
          confidenceAdjustment: grinchConsolidationProfile.confidenceAdjustment,
          reasons: grinchConsolidationProfile.reasons.slice(0, 6),
          missingEvidence: grinchConsolidationProfile.missingEvidence.slice(0, 6)
        }
      : undefined,
    marketContextSummary: marketContext,
    evidenceQualitySummary: compactEvidenceSummary,
    deterministicICTFacts: [
      `Confluence score: ${ictContext?.confluenceScore ?? "missing"}`,
      `Bias: ${ictContext?.bias ?? "missing"}`,
      `MSS bullish/bearish: ${Boolean(ictContext?.hasBullishMSS)}/${Boolean(ictContext?.hasBearishMSS)}`,
      `BOS bullish/bearish: ${Boolean(ictContext?.hasBullishBOS)}/${Boolean(ictContext?.hasBearishBOS)}`,
      `Liquidity sweeps: ${safeArray(ictContext?.liquiditySweeps).length}`,
      `Fair value gaps: ${safeArray(ictContext?.fairValueGaps).length}`,
      `Market context mode: ${marketContext?.mode ?? "missing"}`,
      `Market context missing modules: ${marketContext?.missingModules.join(", ") ?? "missing"}`,
      `Grinch Phase 1: ${grinchPhase1 ? `${grinchPhase1.htfBias}/${grinchPhase1.modelOneState}/${grinchPhase1.timingGrade}` : "missing"}`,
      `Grinch Reversal Profile: ${grinchReversalProfile ? `${grinchReversalProfile.reversalProfileState}/${grinchReversalProfile.nyReversalWindow}/${grinchReversalProfile.entryIntent}` : "missing"}`,
      `Grinch Consolidation Profile: ${grinchConsolidationProfile ? `${grinchConsolidationProfile.consolidationProfileState}/${grinchConsolidationProfile.liquidityRaidState}/${grinchConsolidationProfile.entryIntent}` : "missing"}`,
      `Evidence quality score: ${compactEvidenceSummary.overallScore}/100`,
      `Evidence quality labels: ${compactEvidenceSummary.entries
        .map((item) => `${item.category}=${item.sourceType}`)
        .join("; ")}`
    ],
    internalBaselineAgentDebate:
      safeArray(debate?.messages).map((message) => ({
        agentId: message.agentId,
        agentName: message.agentName,
        bias: message.stance,
        confidence: message.confidence,
        reasoning: message.message
      })),
    cioThesis: thesis
      ? {
          thesisId: thesis.id,
          bias: thesis.finalBias,
          confidence: thesis.confidence,
          summary: thesis.thesisSummary,
          reasoningSummary: thesis.reasoningSummary
        }
      : undefined,
    validationSummary: validation
      ? {
          validationId: validation.id,
          generatedAt: validation.generatedAt,
          readinessStatus: validation.calibration.readinessStatus,
          readinessScore: validation.calibration.readinessScore,
          conservativeScenarioStatus: validationScenarios.find((scenario) => scenario.id === "conservative-confluence")?.readiness,
          maxDrawdownR: maxDrawdownFor(validation),
          confidenceCalibration: confidenceCalibrationFor(validation)
        }
      : undefined,
    researchQualityGrade: quality
      ? {
          reviewId: quality.id,
          generatedAt: quality.generatedAt,
          readinessGrade: quality.readinessGrade,
          topWeaknesses: qualityWeaknesses.map((weakness) => weakness.title),
          falsePositiveCount: qualityFalsePositivePatterns.reduce((sum, pattern) => sum + pattern.estimatedFalsePositives, 0)
        }
      : undefined,
    readinessState: readiness
      ? {
          state: readiness.state,
          failedRequirements: failedReadinessRequirements.map((requirement) => requirement.label),
          brokerExecutionDisabled: true
        }
      : undefined,
    simulationRunbookStatus: runbook
      ? {
          verifiedAt: runbook.verifiedAt,
          completedChecks: countCompletedRunbookItems(runbook),
          totalChecks: simulationRunbookChecklist.length,
          brokerExecutionSkipped: runbook.checklist.brokerExecutionSkipped,
          tradesZero: runbook.checklist.tradesZero,
          positionsZero: runbook.checklist.positionsZero
        }
      : undefined,
    riskNotes: thesis?.riskNotes,
    safetyConstraints: [
      "LLM agents are advisory only.",
      "No broker execution.",
      "No order placement.",
      "No readiness gate override.",
      "No API keys in frontend code.",
      "Calibration suggestions must be simulation-tested and manually approved."
    ]
  };
}

const providerFor = (providerMode: LLMProviderMode) => {
  if (providerMode === "mock_llm") {
    return mockLLMProvider;
  }
  if (providerMode === "local_command") {
    return localCommandLLMProvider;
  }
  return undefined;
};

export async function runLLMAgentOrchestrator(
  context: LLMResearchContextPacket,
  providerMode: LLMProviderMode
): Promise<LLMAdvisoryRun> {
  const provider = providerFor(providerMode);
  const providerStatus = provider?.status() ?? providerStatusForMode(providerMode);
  const validationResults: Record<string, LLMResponseValidationResult> = {};
  let responses: LLMAgentResponse[] = [];
  let status: LLMAdvisoryRun["status"] = "not_configured";
  let readinessImpact = providerStatus.statusMessage;

  try {
    if (!provider) {
      status = providerMode === "deterministic_fallback" ? "fallback_complete" : "not_configured";
      readinessImpact =
        providerMode === "deterministic_fallback"
          ? "Deterministic fallback can support offline comparison but cannot unlock Paper-Demo Candidate."
          : providerStatus.statusMessage;
    } else if (!providerStatus.configured && providerMode !== "mock_llm") {
      status = "not_configured";
      readinessImpact = "LLM advisory review required before Paper-Demo Candidate.";
    } else {
      responses = await provider.runAgents(context);
      for (const response of responses) {
        validationResults[response.agentId] = validateLLMResponse(response);
      }
      const missingAgents = missingRequiredLLMAgents(responses);
      for (const agent of missingAgents) {
        validationResults[agent.agentId] = {
          valid: false,
          errors: [`${agent.agentName} (${agent.agentId}) is missing from the required futures-context reviewer set.`],
          warnings: []
        };
      }
      const invalidCount = Object.values(validationResults).filter((result) => !result.valid).length;
      status = invalidCount ? "rejected" : providerMode === "mock_llm" ? "mock_complete" : "complete";
      readinessImpact =
        providerMode === "mock_llm"
          ? "Mock LLM review completed for UI testing only; real research mode still requires a configured provider."
          : invalidCount
            ? missingAgents.length
              ? `LLM advisory response is missing ${missingAgents.length} required futures-context reviewer${missingAgents.length === 1 ? "" : "s"}.`
              : "Unsafe or invalid LLM responses were rejected."
            : "Configured LLM advisory review passed validation.";
    }
  } catch (error) {
    status = "error";
    readinessImpact = error instanceof Error ? error.message : "LLM provider failed.";
  }

  const unsafeResponseRejections = Object.values(validationResults).filter((result) => !result.valid).length;
  const realProvider = providerMode === "local_command" && providerStatus.configured && status === "complete";
  const advisoryPassed =
    realProvider &&
    status === "complete" &&
    responses.length === requiredLLMAgents.length &&
    unsafeResponseRejections === 0;

  return {
    runId: uid("llm_run"),
    timestamp: new Date().toISOString(),
    researchMode: "llm_required",
    providerMode,
    providerConfigured: providerStatus.configured,
    status,
    realProvider,
    advisoryPassed,
    contextPacketId: context.packetId,
    responses,
    validationResults,
    unsafeResponseRejections,
    readinessImpact,
    safetyNotice: "LLM agents are advisory only. They cannot execute trades or override readiness gates."
  };
}
