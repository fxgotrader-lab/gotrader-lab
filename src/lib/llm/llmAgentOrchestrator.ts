import { localCommandLLMProvider } from "@/lib/llm/localCommandLLMProvider";
import { mockLLMProvider } from "@/lib/llm/mockLLMProvider";
import { providerStatusForMode } from "@/lib/llm/llmProvider";
import { requiredLLMAgents } from "@/lib/llm/llmPromptTemplates";
import type {
  LLMAgentResponse,
  LLMAdvisoryRun,
  LLMProviderMode,
  LLMResearchContextPacket,
  LLMResponseValidationResult
} from "@/lib/llm/llmTypes";
import { validateLLMResponse } from "@/lib/llm/validateLLMResponse";
import type { ReadinessGateSnapshot } from "@/lib/readiness";
import type { ResearchQualityReview } from "@/lib/researchQuality";
import type { SimulationRunbookState } from "@/lib/simulationRunbook";
import { countCompletedRunbookItems, simulationRunbookChecklist } from "@/lib/simulationRunbook";
import type { DebateSession, LabState, TradeThesis } from "@/lib/types";
import { uid } from "@/lib/utils";
import type { ValidationSuiteReport } from "@/lib/validation";

const maxDrawdownFor = (validation?: ValidationSuiteReport) =>
  validation?.scenarios.reduce((max, scenario) => Math.max(max, scenario.maxDrawdown), 0);

const confidenceCalibrationFor = (validation?: ValidationSuiteReport) =>
  validation?.scenarios.length
    ? validation.scenarios.reduce((sum, scenario) => sum + scenario.confidenceCalibration.score, 0) /
      validation.scenarios.length
    : undefined;

const latestDebateFor = (state: LabState, thesis?: TradeThesis): DebateSession | undefined =>
  state.debateSessions.find((debate) => debate.cioThesisId === thesis?.id) ?? state.debateSessions[0];

export function buildLLMResearchContextPacket({
  state,
  validation,
  quality,
  readiness,
  runbook,
  providerMode
}: {
  state: LabState;
  validation?: ValidationSuiteReport;
  quality?: ResearchQualityReview;
  readiness?: ReadinessGateSnapshot;
  runbook?: SimulationRunbookState;
  providerMode: LLMProviderMode;
}): LLMResearchContextPacket {
  const thesis = state.tradeTheses[0];
  const debate = latestDebateFor(state, thesis);
  const ictContext = thesis?.ictContext;

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
          liquiditySweepCount: ictContext.liquiditySweeps.length,
          fairValueGapCount: ictContext.fairValueGaps.length
        }
      : undefined,
    deterministicICTFacts: [
      `Confluence score: ${ictContext?.confluenceScore ?? "missing"}`,
      `Bias: ${ictContext?.bias ?? "missing"}`,
      `MSS bullish/bearish: ${Boolean(ictContext?.hasBullishMSS)}/${Boolean(ictContext?.hasBearishMSS)}`,
      `BOS bullish/bearish: ${Boolean(ictContext?.hasBullishBOS)}/${Boolean(ictContext?.hasBearishBOS)}`,
      `Liquidity sweeps: ${ictContext?.liquiditySweeps.length ?? 0}`,
      `Fair value gaps: ${ictContext?.fairValueGaps.length ?? 0}`
    ],
    internalBaselineAgentDebate:
      debate?.messages.map((message) => ({
        agentId: message.agentId,
        agentName: message.agentName,
        bias: message.stance,
        confidence: message.confidence,
        reasoning: message.message
      })) ?? [],
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
          conservativeScenarioStatus: validation.scenarios.find((scenario) => scenario.id === "conservative-confluence")?.readiness,
          maxDrawdownR: maxDrawdownFor(validation),
          confidenceCalibration: confidenceCalibrationFor(validation)
        }
      : undefined,
    researchQualityGrade: quality
      ? {
          reviewId: quality.id,
          generatedAt: quality.generatedAt,
          readinessGrade: quality.readinessGrade,
          topWeaknesses: quality.topWeaknesses.map((weakness) => weakness.title),
          falsePositiveCount: quality.falsePositivePatterns.reduce((sum, pattern) => sum + pattern.estimatedFalsePositives, 0)
        }
      : undefined,
    readinessState: readiness
      ? {
          state: readiness.state,
          failedRequirements: readiness.failedRequirements.map((requirement) => requirement.label),
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
      const invalidCount = Object.values(validationResults).filter((result) => !result.valid).length;
      status = invalidCount ? "rejected" : providerMode === "mock_llm" ? "mock_complete" : "complete";
      readinessImpact =
        providerMode === "mock_llm"
          ? "Mock LLM review completed for UI testing only; real research mode still requires a configured provider."
          : invalidCount
            ? "Unsafe or invalid LLM responses were rejected."
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
