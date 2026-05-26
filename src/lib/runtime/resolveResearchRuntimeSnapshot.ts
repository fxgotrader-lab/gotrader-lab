import { defaultBacktestConfig, loadBacktestConfig } from "@/lib/backtesting";
import { latestAutoResearchCycle, loadAutoResearchState, AUTO_RESEARCH_STORAGE_KEY } from "@/lib/autoResearch";
import {
  getLLMReadinessImpact,
  latestLLMAdvisoryRun,
  LLM_RESEARCH_STORAGE_KEY,
  loadLLMResearchState,
  providerStatusForMode,
  requiredLLMAgents
} from "@/lib/llm";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  getActiveImportedCandleSetId,
  loadCandleWindowSettings,
  loadPreparedCandleSource,
  type PreparedCandleSource
} from "@/lib/marketData";
import {
  buildCanonicalPerformanceMetricsFromRun,
  canonicalMetricsForRun,
  detectCanonicalMetricsMismatch
} from "@/lib/performance/canonicalMetrics";
import { buildSimulatedAccountFromCanonicalMetrics } from "@/lib/performance/simulatedAccount";
import { evaluateReadinessGate } from "@/lib/readiness";
import { loadLatestResearchQualityReview, RESEARCH_QUALITY_STORAGE_KEY } from "@/lib/researchQuality";
import { latestResearchCycleRun, loadResearchCycleState, RESEARCH_CYCLE_STORAGE_KEY } from "@/lib/researchCycle";
import {
  ACTIVE_RESEARCH_CALIBRATION_STORAGE_KEY,
  loadSelfImprovementState,
  resolveActiveBacktestConfig,
  SELF_IMPROVEMENT_STORAGE_KEY
} from "@/lib/selfImprovement";
import {
  countCompletedRunbookItems,
  loadSimulationRunbookState,
  SIMULATION_RUNBOOK_STORAGE_KEY,
  simulationRunbookChecklist
} from "@/lib/simulationRunbook";
import { labStorage } from "@/lib/storage";
import type { FuturesSymbol, LabState, Timeframe } from "@/lib/types";
import { safeArray, safeTopN, uid } from "@/lib/utils";
import { loadLatestValidationReport, VALIDATION_REPORT_STORAGE_KEY } from "@/lib/validation";

import type {
  ResearchRuntimeSnapshot,
  ResolveResearchRuntimeSnapshotOptions,
  RuntimeDataPreset,
  RuntimeMarketDataState
} from "@/lib/runtime/researchRuntimeTypes";

const LAB_STATE_STORAGE_KEY = "gotrader-ai-lab-state";
const BACKTEST_CONFIG_STORAGE_KEY = "gotrader-ai-lab-backtest-config";
const CANDLE_WINDOW_STORAGE_KEY = "gotrader-ai-lab-candle-window-settings";
const ACTIVE_IMPORT_STORAGE_KEY = "gotrader-ai-lab-active-candle-import-id";
const INDEXED_DB_NAME = "gotrader-ai-lab-market-data";

const now = () => new Date().toISOString();

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;

const latestCycleTimestamp = (run?: ReturnType<typeof latestResearchCycleRun>) => run?.completedAt ?? run?.startedAt;

const dataPresetFor = (source: PreparedCandleSource): RuntimeDataPreset => {
  if (source.mode !== "imported") {
    return "mock";
  }
  if (source.appliedSettings.advancedMode) {
    return "advanced";
  }
  if (source.researchWindowCandles <= 500 && source.appliedSettings.targetTimeframe === "5m") {
    return "safe";
  }
  if (source.researchWindowCandles <= 2000 && source.appliedSettings.targetTimeframe === "5m") {
    return "standard";
  }
  return "custom";
};

const marketStateFor = (source: PreparedCandleSource, fallbackSymbol?: FuturesSymbol, fallbackTimeframe?: Timeframe): RuntimeMarketDataState => {
  const metadata = source.metadata;
  const symbol = metadata?.symbol ?? source.candles[0]?.symbol ?? fallbackSymbol ?? "NQ";
  const timeframe = source.appliedSettings.targetTimeframe ?? metadata?.timeframe ?? source.candles[0]?.timeframe ?? fallbackTimeframe ?? "5m";

  return {
    activeDataSource: source.mode,
    sourceLabel: source.label,
    symbol,
    contract: metadata?.contract,
    timeframe,
    rawCandleCount: source.rawCandleCount,
    researchWindow: source.researchWindowCandles,
    processedCandleCount: source.processedCandleCount,
    dataPreset: dataPresetFor(source),
    isImportedDataActive: source.mode === "imported",
    isMockDataActive: source.mode === "mock",
    preparedSource: source
  };
};

const missingReviewersFor = (latestRun?: ReturnType<typeof latestLLMAdvisoryRun>) => {
  if (!latestRun) {
    return requiredLLMAgents.map((agent) => agent.agentId);
  }
  const returnedIds = new Set(safeArray(latestRun.responses).map((response) => response.agentId));
  return requiredLLMAgents.map((agent) => agent.agentId).filter((agentId) => !returnedIds.has(agentId));
};

const latestProposalFrom = (selfImprovement: ReturnType<typeof loadSelfImprovementState>) =>
  selfImprovement.proposals.find((proposal) => proposal.proposalId === selfImprovement.latestProposalId) ??
  selfImprovement.proposals[0];

const thesisFallback = (labState?: LabState) => {
  const thesis = labState?.tradeTheses[0];
  return thesis
    ? {
        id: thesis.id,
        symbol: thesis.symbol,
        timeframe: thesis.timeframe,
        finalBias: thesis.finalBias,
        confidence: thesis.confidence,
        thesisSummary: thesis.thesisSummary
      }
    : undefined;
};

const buildMismatchWarnings = ({
  activeImportId,
  activeCalibrationExists,
  activeCalibrationApplied,
  canonicalMismatchWarnings,
  latestCycleId,
  latestProposal,
  marketData,
  researchQuality,
  validation
}: {
  activeImportId?: string;
  activeCalibrationExists: boolean;
  activeCalibrationApplied: boolean;
  canonicalMismatchWarnings: string[];
  latestCycleId?: string;
  latestProposal?: ReturnType<typeof latestProposalFrom>;
  marketData: RuntimeMarketDataState;
  researchQuality: ReturnType<typeof loadLatestResearchQualityReview>;
  validation: ReturnType<typeof loadLatestValidationReport>;
}) => {
  const warnings: string[] = [];
  if (canonicalMismatchWarnings.length) {
    warnings.push(...canonicalMismatchWarnings);
  }
  if (activeCalibrationExists && !activeCalibrationApplied) {
    warnings.push("Approved active calibration exists, but the resolved config did not apply it.");
  }
  if (activeImportId && marketData.isMockDataActive) {
    warnings.push("An imported candle set is selected, but the active prepared data source resolved to mock candles.");
  }
  const proposalCycleId = latestProposal?.metricsSnapshot?.sourceCycleId;
  if (latestCycleId && proposalCycleId && proposalCycleId !== latestCycleId) {
    warnings.push(`Latest proposal snapshot is from cycle ${proposalCycleId}, while the latest dashboard cycle is ${latestCycleId}.`);
  }
  if (latestCycleId && validation && latestProposal?.metricsSnapshot?.sourceCycleId && latestProposal.metricsSnapshot.sourceCycleId !== latestCycleId) {
    warnings.push("Proposal metrics and latest validation may refer to different research cycles.");
  }
  if (latestCycleId && researchQuality && latestProposal?.metricsSnapshot?.sourceCycleId && latestProposal.metricsSnapshot.sourceCycleId !== latestCycleId) {
    warnings.push("Proposal metrics and latest research quality review may refer to different research cycles.");
  }
  return warnings;
};

export async function resolveResearchRuntimeSnapshot(
  options: ResolveResearchRuntimeSnapshotOptions = {}
): Promise<ResearchRuntimeSnapshot> {
  const labState = options.labState ?? labStorage.load();
  const researchCycleState = loadResearchCycleState();
  const latestCycle = latestResearchCycleRun(researchCycleState);
  const selfImprovement = loadSelfImprovementState();
  const latestProposal = latestProposalFrom(selfImprovement);
  const validation = loadLatestValidationReport();
  const researchQuality = loadLatestResearchQualityReview();
  const runbook = loadSimulationRunbookState();
  const activeConfig = resolveActiveBacktestConfig();
  const savedConfig = loadBacktestConfig();
  const llmState = loadLLMResearchState();
  const latestLLMRun = latestLLMAdvisoryRun(llmState);
  const providerStatus = providerStatusForMode(llmState.providerMode);
  const preparedCandleSource = options.preparedCandleSource ?? await loadPreparedCandleSource().catch(() => undefined);
  const source = preparedCandleSource ?? {
    mode: "mock" as const,
    label: "Mock candles",
    candles: [],
    rawCandleCount: 0,
    researchWindowCandles: 0,
    processedCandleCount: 0,
    estimatedProcessedCandles: 0,
    appliedSettings: loadCandleWindowSettings(),
    aggregationApplied: false,
    performanceMode: "safe" as const,
    warnings: ["Prepared candle source could not be loaded; runtime snapshot used an empty mock fallback."]
  };
  const marketData = marketStateFor(source, latestCycle?.backtestSummary?.config.symbol, latestCycle?.researchTimeframe);
  const readinessSnapshot = evaluateReadinessGate({
    validation,
    quality: researchQuality,
    runbook
  });
  const canonicalPerformanceMetrics = canonicalMetricsForRun(latestCycle);
  const derivedMetrics = buildCanonicalPerformanceMetricsFromRun(latestCycle);
  const canonicalMismatchWarnings = detectCanonicalMetricsMismatch(latestCycle?.canonicalMetrics, derivedMetrics);
  const completedRunbookItems = countCompletedRunbookItems(runbook);
  const autoResearchState = loadAutoResearchState();
  const latestAutoResearch = latestAutoResearchCycle(autoResearchState);
  const activeImportId = getActiveImportedCandleSetId();
  const sourceTrace = [
    `market data: ${marketData.sourceLabel}`,
    `candle window: ${marketData.researchWindow.toLocaleString()} raw -> ${marketData.processedCandleCount.toLocaleString()} processed ${marketData.timeframe}`,
    `config merge: ${activeConfig.mergeStatusLabel}`,
    `latest cycle: ${latestCycle?.cycleId ?? "none"}`,
    `latest auto research: ${latestAutoResearch?.cycleId ?? "none"}`,
    `latest proposal: ${latestProposal?.proposalId ?? "none"}`,
    `latest LLM run: ${latestLLMRun?.runId ?? "none"}`,
    `readiness: ${readinessSnapshot.state}`
  ];
  const staleStateWarnings = [
    latestCycle?.validationSummary && validation && latestCycle.validationSummary.validationId !== validation.id
      ? `Latest research cycle validation ${latestCycle.validationSummary.validationId} differs from stored latest validation ${validation.id}.`
      : undefined,
    latestCycle?.researchQualitySummary && researchQuality && latestCycle.researchQualitySummary.reviewId !== researchQuality.id
      ? `Latest research cycle quality review ${latestCycle.researchQualitySummary.reviewId} differs from stored latest quality review ${researchQuality.id}.`
      : undefined,
    runbook.latestResearchCycleId && latestCycle?.cycleId && runbook.latestResearchCycleId !== latestCycle.cycleId
      ? `Simulation runbook references cycle ${runbook.latestResearchCycleId}, while latest cycle is ${latestCycle.cycleId}.`
      : undefined
  ].filter((warning): warning is string => Boolean(warning));
  const mismatchWarnings = buildMismatchWarnings({
    activeImportId,
    activeCalibrationExists: Boolean(activeConfig.activeResearchCalibration),
    activeCalibrationApplied: activeConfig.activeCalibrationApplied,
    canonicalMismatchWarnings,
    latestCycleId: latestCycle?.cycleId,
    latestProposal,
    marketData,
    researchQuality,
    validation
  });

  return {
    snapshotId: uid("runtime_snapshot"),
    generatedAt: now(),
    marketData,
    activeConfig: {
      resolvedBacktestConfig: activeConfig.config,
      defaultConfig: defaultBacktestConfig,
      savedConfig,
      activeResearchCalibration: activeConfig.activeResearchCalibration,
      activeCalibrationId: activeConfig.activeCalibrationId,
      appliedConfigPatch: activeConfig.appliedPatch,
      configMergeStatus: activeConfig.mergeStatus,
      configMergeStatusLabel: activeConfig.mergeStatusLabel,
      resolvedConfluenceThreshold: activeConfig.activeConfluenceThreshold
    },
    latestResearchCycle: {
      latestCycleId: latestCycle?.cycleId,
      latestCycleStatus: latestCycle?.status,
      latestCycleTimestamp: latestCycleTimestamp(latestCycle),
      latestCycleMetrics: canonicalPerformanceMetrics,
      latestThesisSummary: latestCycle?.thesisSummary ?? thesisFallback(labState),
      latestBacktestSummary: latestCycle?.backtestSummary,
      latestValidationSummary: latestCycle?.validationSummary,
      latestResearchQualitySummary: latestCycle?.researchQualitySummary,
      latestReadinessSummary: latestCycle?.readinessSnapshot,
      latestRun: latestCycle
    },
    llm: {
      bridgeStatus: options.bridgeStatus ?? "not_checked",
      providerStatus,
      providerConfigured: providerStatus.configured || Boolean(latestLLMRun?.providerConfigured),
      latestLLMRun,
      missingReviewers: missingReviewersFor(latestLLMRun),
      unsafeRejections: llmState.unsafeResponseRejections ?? 0,
      advisoryPassed: Boolean(latestLLMRun?.advisoryPassed),
      readinessImpact: getLLMReadinessImpact(llmState)
    },
    proposal: {
      latestProposalId: latestProposal?.proposalId,
      latestProposal,
      latestProposalSnapshot: latestProposal?.metricsSnapshot,
      activeApprovedProposalId: selfImprovement.lastAcceptedProposalId ?? selfImprovement.activeResearchCalibration?.sourceProposalId,
      proposalSourceCycleId: latestProposal?.metricsSnapshot?.sourceCycleId
    },
    readiness: {
      readinessState: readinessSnapshot.state,
      readinessSnapshot,
      actualBlockers: safeArray(readinessSnapshot.failedRequirements).map((item) => item.label),
      passedRequirements: safeArray(readinessSnapshot.passedRequirements).map((item) => item.label),
      warnings: readinessSnapshot.warnings,
      nextAction: readinessSnapshot.recommendedNextStep
    },
    performance: {
      canonicalPerformanceMetrics,
      simulatedAccountSummary: buildSimulatedAccountFromCanonicalMetrics(canonicalPerformanceMetrics)
    },
    diagnostics: {
      sourceTrace,
      staleStateWarnings: safeTopN(staleStateWarnings, 8),
      mismatchWarnings: safeTopN(mismatchWarnings, 8),
      storageKeysUsed: [
        LAB_STATE_STORAGE_KEY,
        RESEARCH_CYCLE_STORAGE_KEY,
        AUTO_RESEARCH_STORAGE_KEY,
        VALIDATION_REPORT_STORAGE_KEY,
        RESEARCH_QUALITY_STORAGE_KEY,
        SIMULATION_RUNBOOK_STORAGE_KEY,
        LLM_RESEARCH_STORAGE_KEY,
        SELF_IMPROVEMENT_STORAGE_KEY,
        ACTIVE_RESEARCH_CALIBRATION_STORAGE_KEY,
        BACKTEST_CONFIG_STORAGE_KEY,
        CANDLE_WINDOW_STORAGE_KEY,
        ACTIVE_IMPORT_STORAGE_KEY,
        INDEXED_DB_NAME,
        CANDLE_WINDOW_SETTINGS_UPDATED_EVENT
      ]
    }
  };
}

export function describeRuntimeConfig(snapshot: ResearchRuntimeSnapshot) {
  return [
    `${snapshot.activeConfig.resolvedBacktestConfig.symbol} ${snapshot.activeConfig.resolvedBacktestConfig.timeframe}`,
    `ICT >= ${pct(snapshot.activeConfig.resolvedConfluenceThreshold)}`,
    snapshot.activeConfig.configMergeStatusLabel,
    snapshot.activeConfig.activeCalibrationId ? `calibration ${snapshot.activeConfig.activeCalibrationId}` : "no active calibration"
  ].join(" / ");
}
