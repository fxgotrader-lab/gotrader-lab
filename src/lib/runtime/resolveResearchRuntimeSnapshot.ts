import { defaultBacktestConfig, loadBacktestConfig } from "@/lib/backtesting";
import { latestAutoResearchCycle, loadAutoResearchState, AUTO_RESEARCH_STORAGE_KEY } from "@/lib/autoResearch";
import { buildEvidenceLedger } from "@/lib/evidence";
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
  getImportedDataPreset,
  loadCandleWindowSettings,
  loadPreparedCandleSource,
  resolveImportedCandleActivationState,
  type ImportedCandleActivationState,
  type PreparedCandleSource
} from "@/lib/marketData";
import {
  canonicalMetricsForRun,
  detectCanonicalMetricsMismatch,
  normalizeCycleMetricsForDisplay
} from "@/lib/performance/canonicalMetrics";
import { calculateResearchMaturity } from "@/lib/maturity";
import { buildSimulatedAccountFromCanonicalMetrics } from "@/lib/performance/simulatedAccount";
import { evaluateReadinessGate } from "@/lib/readiness";
import { loadLatestResearchQualityReview, RESEARCH_QUALITY_STORAGE_KEY } from "@/lib/researchQuality";
import { latestResearchCycleRun, loadResearchCycleState, RESEARCH_CYCLE_STORAGE_KEY } from "@/lib/researchCycle";
import { createMetricProvenance } from "@/lib/runtime/metricProvenance";
import { compareRunFingerprints, createRunFingerprint, LLM_REVIEWER_SCHEMA_VERSION } from "@/lib/runtime/runFingerprint";
import {
  ACTIVE_RESEARCH_CALIBRATION_STORAGE_KEY,
  loadSelfImprovementState,
  resolveActiveBacktestConfig,
  SELF_IMPROVEMENT_STORAGE_KEY
} from "@/lib/selfImprovement";
import {
  analyzeGrinchPhase1,
  analyzeGrinchPhase2Reversal,
  analyzeGrinchPhase3Consolidation,
  analyzeGrinchPhase4Smt,
  calculateGrinchStrategyScore,
  summarizeGrinchConsolidationProfile,
  summarizeGrinchPhase1,
  summarizeGrinchReversalProfile,
  summarizeGrinchSmtIntermarket,
  summarizeGrinchStrategyScore
} from "@/lib/strategyLibrary";
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
import { latestWalkForwardRun, loadWalkForwardState, WALK_FORWARD_STORAGE_KEY } from "@/lib/walkForward";

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

const candleWindowLabel = (marketData: RuntimeMarketDataState) =>
  `${marketData.researchWindow.toLocaleString()} raw / ${marketData.processedCandleCount.toLocaleString()} processed ${marketData.timeframe}`;

const dataPresetFor = (source: PreparedCandleSource): RuntimeDataPreset => {
  if (source.mode !== "imported") {
    return "mock";
  }
  return getImportedDataPreset(source.appliedSettings);
};

const fallbackImportActivation = (): ImportedCandleActivationState => ({
  imports: [],
  activeCandlesAvailable: false,
  importedDatasetCount: 0,
  status: "mock_fallback",
  message: "Imported data activation state could not be loaded."
});

const marketStateFor = (
  source: PreparedCandleSource,
  importActivation: ImportedCandleActivationState,
  fallbackSymbol?: FuturesSymbol,
  fallbackTimeframe?: Timeframe
): RuntimeMarketDataState => {
  const metadata = source.metadata;
  const symbol = metadata?.symbol ?? source.candles[0]?.symbol ?? fallbackSymbol ?? "NQ";
  const timeframe = source.appliedSettings.targetTimeframe ?? metadata?.timeframe ?? source.candles[0]?.timeframe ?? fallbackTimeframe ?? "5m";
  const fallbackToMock = source.mode === "mock";

  return {
    activeDataSource: source.mode,
    activeImportId: importActivation.activeImportId,
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
    importedDatasetCount: importActivation.importedDatasetCount,
    importedDataStatus: importActivation.status,
    importedDataMessage: importActivation.message,
    importedDataMissing: importActivation.status === "imported_missing" || importActivation.status === "mock_fallback",
    activeImportIdStale: importActivation.status === "active_import_missing_stale",
    fallbackToMock,
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

const runtimeProposalFrom = (
  selfImprovement: ReturnType<typeof loadSelfImprovementState>,
  latestCycle?: ReturnType<typeof latestResearchCycleRun>
) =>
  (latestCycle?.createdProposalId
    ? selfImprovement.proposals.find((proposal) => proposal.proposalId === latestCycle.createdProposalId)
    : undefined) ?? latestProposalFrom(selfImprovement);

const blockerLikePhrases = [
  "insufficient",
  "cannot be evaluated",
  "too low",
  "too high",
  "missing",
  "required",
  "blocked",
  "failed",
  "unstable",
  "weak",
  "not ready",
  "no safe"
];

const isBlockerLikeLabel = (value: string) => {
  const normalized = value.toLowerCase();
  return blockerLikePhrases.some((phrase) => normalized.includes(phrase));
};

const displayLabelForRequirement = (item: { id?: string; label: string; passed?: boolean }) => {
  if (!item.passed) {
    switch (item.id) {
      case "simulated-trade-sample":
        return "Insufficient simulated trades. Readiness cannot be evaluated.";
      case "validation-exists":
        return "Validation suite missing.";
      case "research-quality-exists":
        return "Research quality review missing.";
      case "llm-advisory-review":
        return "LLM advisory missing.";
      case "runbook-complete":
        return "Simulation runbook incomplete.";
      case "quality-candidate":
        return "Research Quality must reach Paper-Demo Candidate.";
      case "drawdown-threshold":
        return "Drawdown too high.";
      case "confidence-calibration":
        return "Confidence calibration too low.";
      case "false-positive-control":
        return "False positives too high.";
      case "session-consistency":
        return "Session consistency weak.";
      case "conservative-stability":
        return "Conservative scenario unstable.";
      default:
        return item.label;
    }
  }
  switch (item.id) {
    case "simulated-trade-sample":
      return "Simulated trade sample exists.";
    default:
      return item.label;
  }
};

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
  latestAutoResearchCycleId,
  latestCycleCreatedProposalId,
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
  latestAutoResearchCycleId?: string;
  latestCycleCreatedProposalId?: string;
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
  if (marketData.activeImportIdStale) {
    warnings.push(marketData.importedDataMessage);
  }
  if (marketData.importedDataStatus === "imported_missing") {
    warnings.push("Imported candle sets exist, but none is active. Reactivate one before imported-data research.");
  }
  const proposalCycleId = latestProposal?.metricsSnapshot?.sourceCycleId;
  const proposalLinkedToLatestCycle =
    Boolean(latestCycleId && proposalCycleId === latestCycleId) ||
    Boolean(latestAutoResearchCycleId && proposalCycleId === latestAutoResearchCycleId) ||
    Boolean(latestCycleCreatedProposalId && latestCycleCreatedProposalId === latestProposal?.proposalId);
  if (latestCycleId && proposalCycleId && !proposalLinkedToLatestCycle) {
    warnings.push(`Latest proposal snapshot is from cycle ${proposalCycleId}, while the latest dashboard cycle is ${latestCycleId}.`);
  }
  if (latestCycleId && validation && proposalCycleId && !proposalLinkedToLatestCycle) {
    warnings.push("Proposal metrics and latest validation may refer to different research cycles.");
  }
  if (latestCycleId && researchQuality && proposalCycleId && !proposalLinkedToLatestCycle) {
    warnings.push("Proposal metrics and latest research quality review may refer to different research cycles.");
  }
  return warnings;
};

const proposalCurrencyFor = ({
  latestCycle,
  latestProposal,
  latestAutoResearchCycleId
}: {
  latestCycle?: ReturnType<typeof latestResearchCycleRun>;
  latestProposal?: ReturnType<typeof latestProposalFrom>;
  latestAutoResearchCycleId?: string;
}) => {
  if (!latestProposal) {
    return {
      isCurrent: false,
      isHistorical: false,
      reason: undefined
    };
  }
  const proposalSourceCycleId = latestProposal.metricsSnapshot?.sourceCycleId;
  const proposalSourceCandidateId = latestProposal.metricsSnapshot?.sourceCandidateId ?? latestProposal.sourceCandidateId;
  const latestCycleId = latestCycle?.cycleId;
  const latestCreatedProposalId = latestCycle?.createdProposalId;
  const latestCycleAutoResearchId = latestCycle?.autoResearchCycle?.cycleId ?? latestAutoResearchCycleId;
  const current =
    Boolean(latestCreatedProposalId && latestCreatedProposalId === latestProposal.proposalId) ||
    Boolean(latestCycleId && proposalSourceCycleId && proposalSourceCycleId === latestCycleId);

  if (current) {
    return {
      isCurrent: true,
      isHistorical: false,
      reason: undefined
    };
  }

  const reason = latestCycleId
    ? proposalSourceCycleId
      ? `Proposal snapshot source ${proposalSourceCycleId} does not match latest dashboard cycle ${latestCycleId}.`
      : proposalSourceCandidateId
        ? `Proposal candidate ${proposalSourceCandidateId} is not linked to latest dashboard cycle ${latestCycleId}.`
        : latestCycleAutoResearchId
          ? `Proposal is not linked to latest dashboard auto-research cycle ${latestCycleAutoResearchId}.`
          : `Proposal is not linked to latest dashboard cycle ${latestCycleId}.`
    : "No latest dashboard cycle exists to prove this proposal is current.";

  return {
    isCurrent: false,
    isHistorical: true,
    reason
  };
};

const buildCurrentActionItems = ({
  evidenceScore,
  latestProposal,
  maturityScore,
  proposalCurrency,
  readinessBlockers,
  snapshotLLMPassed,
  walkForwardRecommendedNextAction,
  walkForwardVerdict
}: {
  evidenceScore: number;
  latestProposal?: ReturnType<typeof latestProposalFrom>;
  maturityScore: number;
  proposalCurrency: ReturnType<typeof proposalCurrencyFor>;
  readinessBlockers: string[];
  snapshotLLMPassed: boolean;
  walkForwardRecommendedNextAction: string;
  walkForwardVerdict?: string;
}) => {
  const items: ResearchRuntimeSnapshot["proposal"]["currentActionItems"] = [];
  if (!snapshotLLMPassed) {
    items.push({
      id: "llm-advisory",
      title: "LLM advisory not passed",
      detail: "Paper-Demo review remains blocked until advisory-only LLM review passes.",
      href: "/llm-agents",
      severity: "action_required"
    });
  }
  if (walkForwardVerdict === "fail" || walkForwardVerdict === "insufficient_evidence") {
    items.push({
      id: "walk-forward",
      title: walkForwardVerdict === "fail" ? "Walk-forward failed" : "Walk-forward insufficient evidence",
      detail: walkForwardRecommendedNextAction,
      href: "/walk-forward",
      severity: walkForwardVerdict === "fail" ? "critical" : "warning"
    });
  }
  if (evidenceScore < 55) {
    items.push({
      id: "evidence-quality",
      title: "Evidence quality is weak",
      detail: "Evidence quality is not strong enough for advancement.",
      href: "/evidence-quality",
      severity: "warning"
    });
  }
  if (maturityScore < 45) {
    items.push({
      id: "maturity",
      title: "Research maturity too low",
      detail: "Run more consistent cycles/windows before advancing readiness.",
      href: "/research-maturity",
      severity: "warning"
    });
  }
  if (
    latestProposal &&
    proposalCurrency.isCurrent &&
    (latestProposal.status === "proposed" || latestProposal.status === "testing")
  ) {
    items.push({
      id: "proposal",
      title: "Proposal review required",
      detail: `Current proposal ${latestProposal.proposalId} is ${latestProposal.status}.`,
      href: `/self-improvement?proposalId=${latestProposal.proposalId}`,
      severity: "action_required"
    });
  }
  const blocker = readinessBlockers[0];
  if (blocker) {
    items.push({
      id: "readiness",
      title: "Readiness gate blocked",
      detail: blocker,
      href: "/readiness-gate",
      severity: "action_required"
    });
  }
  return safeTopN(items, 8);
};

const runtimeNextActionFor = ({
  latestCycle,
  latestProposal,
  latestWalkForward,
  marketData,
  proposalCurrency,
  readinessSnapshot
}: {
  latestCycle?: ReturnType<typeof latestResearchCycleRun>;
  latestProposal?: ReturnType<typeof latestProposalFrom>;
  latestWalkForward?: ReturnType<typeof latestWalkForwardRun>;
  marketData: RuntimeMarketDataState;
  proposalCurrency: ReturnType<typeof proposalCurrencyFor>;
  readinessSnapshot: ReturnType<typeof evaluateReadinessGate>;
}) => {
  const latestCycleCreatedNoProposal = Boolean(latestCycle && !latestCycle.createdProposalId);
  const currentPendingProposal =
    latestProposal &&
    proposalCurrency.isCurrent &&
    (latestProposal.status === "proposed" || latestProposal.status === "testing");

  if (currentPendingProposal) {
    return "Review the current research calibration proposal, then rerun the AI Research Cycle after any approved change.";
  }

  if (latestCycleCreatedNoProposal && readinessSnapshot.state === "Research Ready") {
    if (!latestWalkForward || latestWalkForward.stability?.verdict === "insufficient_evidence") {
      return "Run walk-forward with enough windows before treating the latest Research Ready result as durable.";
    }
    if (marketData.dataPreset === "safe") {
      return "Run a larger sample / Standard data test before considering any review gate.";
    }
    return "Resolve readiness blockers and rerun validation/research quality on a larger sample.";
  }

  if (latestCycleCreatedNoProposal && proposalCurrency.isHistorical) {
    return "No current proposal came from the latest cycle. Resolve current blockers or run a larger data test.";
  }

  return readinessSnapshot.recommendedNextStep;
};

export async function resolveResearchRuntimeSnapshot(
  options: ResolveResearchRuntimeSnapshotOptions = {}
): Promise<ResearchRuntimeSnapshot> {
  const snapshotGeneratedAt = now();
  const labState = options.labState ?? labStorage.load();
  const researchCycleState = loadResearchCycleState();
  const latestCycle = latestResearchCycleRun(researchCycleState);
  const selfImprovement = loadSelfImprovementState();
  const latestProposal = runtimeProposalFrom(selfImprovement, latestCycle);
  const validation = loadLatestValidationReport();
  const researchQuality = loadLatestResearchQualityReview();
  const runbook = loadSimulationRunbookState();
  const activeConfig = resolveActiveBacktestConfig();
  const savedConfig = loadBacktestConfig();
  const llmState = loadLLMResearchState();
  const latestLLMRun = latestLLMAdvisoryRun(llmState);
  const providerStatus = providerStatusForMode(llmState.providerMode);
  const importActivation = await resolveImportedCandleActivationState().catch(fallbackImportActivation);
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
  const marketData = marketStateFor(source, importActivation, latestCycle?.backtestSummary?.config.symbol, latestCycle?.researchTimeframe);
  const grinchPhase1Summary = source.candles.length
    ? analyzeGrinchPhase1({
        candles: source.candles,
        options: {
          symbol: marketData.symbol,
          timeframe: marketData.timeframe,
          currentTimestamp: source.candles[source.candles.length - 1]?.timestamp
        }
      })
    : undefined;
  const grinchPhase2ReversalSummary = source.candles.length && grinchPhase1Summary
    ? analyzeGrinchPhase2Reversal({
        candles: source.candles,
        phase1: grinchPhase1Summary,
        options: {
          symbol: marketData.symbol,
          timeframe: marketData.timeframe,
          currentTimestamp: source.candles[source.candles.length - 1]?.timestamp
        }
      })
    : undefined;
  const grinchPhase3ConsolidationSummary = source.candles.length && grinchPhase1Summary
    ? analyzeGrinchPhase3Consolidation({
        candles: source.candles,
        phase1: grinchPhase1Summary,
        options: {
          symbol: marketData.symbol,
          timeframe: marketData.timeframe,
          currentTimestamp: source.candles[source.candles.length - 1]?.timestamp
        }
      })
    : undefined;
  const grinchPhase4SmtSummary = source.candles.length && grinchPhase1Summary
    ? analyzeGrinchPhase4Smt({
        candles: source.candles,
        phase1: grinchPhase1Summary,
        reversal: grinchPhase2ReversalSummary,
        consolidation: grinchPhase3ConsolidationSummary,
        options: {
          symbol: marketData.symbol,
          timeframe: marketData.timeframe,
          currentTimestamp: source.candles[source.candles.length - 1]?.timestamp
        }
      })
    : undefined;
  const grinchStrategyScore = source.candles.length && grinchPhase1Summary
    ? calculateGrinchStrategyScore({
        candles: source.candles,
        phase1: grinchPhase1Summary,
        reversal: grinchPhase2ReversalSummary,
        consolidation: grinchPhase3ConsolidationSummary,
        smt: grinchPhase4SmtSummary,
        options: {
          symbol: marketData.symbol,
          timeframe: marketData.timeframe,
          currentTimestamp: source.candles[source.candles.length - 1]?.timestamp
        }
      })
    : undefined;
  const smtSummary = grinchPhase4SmtSummary
    ? {
        smtState: grinchPhase4SmtSummary.smtState,
        primaryPair: grinchPhase4SmtSummary.primaryPair,
        divergenceType: grinchPhase4SmtSummary.divergenceType,
        supportsBias: grinchPhase4SmtSummary.supportsBias,
        supportsActiveProfile: grinchPhase4SmtSummary.supportsActiveProfile,
        confidenceAdjustment: grinchPhase4SmtSummary.confidenceAdjustment,
        conflictWarning: grinchPhase4SmtSummary.conflictWarning,
        detail: summarizeGrinchSmtIntermarket(grinchPhase4SmtSummary)
      }
    : undefined;
  const grinchHardGateDetail = grinchStrategyScore?.primaryRuleBlock
    ? ` ${grinchStrategyScore.primaryRuleBlock}`
    : "";
  const activeGrinchProfileSummary = grinchPhase3ConsolidationSummary?.consolidationProfileState === "valid"
    ? {
        profile: "consolidation" as const,
        state: grinchPhase3ConsolidationSummary.consolidationProfileState,
        entryIntent: grinchPhase3ConsolidationSummary.entryIntent,
        timingGrade: grinchPhase3ConsolidationSummary.timingGrade,
        grinchModelScore: grinchStrategyScore?.grinchModelScore,
        falsePositiveRisk: grinchStrategyScore?.falsePositiveRisk,
        setupQuality: grinchStrategyScore?.setupQuality,
        hardGateReason: grinchStrategyScore?.hardGateReason,
        primaryRuleBlock: grinchStrategyScore?.primaryRuleBlock,
        improvedLatestRun: latestCycle?.backtestSummary?.grinchSummary?.grinchImprovedLatestRun,
        detail: `${summarizeGrinchConsolidationProfile(grinchPhase3ConsolidationSummary)}${grinchHardGateDetail}`
      }
    : grinchPhase2ReversalSummary?.reversalProfileState === "valid"
      ? {
          profile: "reversal" as const,
          state: grinchPhase2ReversalSummary.reversalProfileState,
          entryIntent: grinchPhase2ReversalSummary.entryIntent,
          timingGrade: grinchPhase2ReversalSummary.timingGrade,
          grinchModelScore: grinchStrategyScore?.grinchModelScore,
          falsePositiveRisk: grinchStrategyScore?.falsePositiveRisk,
          setupQuality: grinchStrategyScore?.setupQuality,
          hardGateReason: grinchStrategyScore?.hardGateReason,
          primaryRuleBlock: grinchStrategyScore?.primaryRuleBlock,
          improvedLatestRun: latestCycle?.backtestSummary?.grinchSummary?.grinchImprovedLatestRun,
          detail: `${summarizeGrinchReversalProfile(grinchPhase2ReversalSummary)}${grinchHardGateDetail}`
        }
      : grinchPhase1Summary
        ? {
            profile: "model_1" as const,
            state: grinchPhase1Summary.modelOneState,
            entryIntent: grinchPhase1Summary.tradeIntent,
            timingGrade: grinchPhase1Summary.timingGrade,
            grinchModelScore: grinchStrategyScore?.grinchModelScore,
            falsePositiveRisk: grinchStrategyScore?.falsePositiveRisk,
            setupQuality: grinchStrategyScore?.setupQuality,
            hardGateReason: grinchStrategyScore?.hardGateReason,
            primaryRuleBlock: grinchStrategyScore?.primaryRuleBlock,
            improvedLatestRun: latestCycle?.backtestSummary?.grinchSummary?.grinchImprovedLatestRun,
            detail: `${summarizeGrinchPhase1(grinchPhase1Summary)}${grinchHardGateDetail}`
          }
        : {
            profile: "none" as const,
            state: "not_available",
            entryIntent: "no_trade",
            timingGrade: "unknown",
            grinchModelScore: grinchStrategyScore?.grinchModelScore,
            falsePositiveRisk: grinchStrategyScore?.falsePositiveRisk,
            setupQuality: grinchStrategyScore?.setupQuality,
            hardGateReason: grinchStrategyScore?.hardGateReason,
            primaryRuleBlock: grinchStrategyScore?.primaryRuleBlock,
            improvedLatestRun: latestCycle?.backtestSummary?.grinchSummary?.grinchImprovedLatestRun,
            detail: "No Grinch profile available."
          };
  const readinessSnapshot = evaluateReadinessGate({
    validation,
    quality: researchQuality,
    runbook
  });
  const canonicalPerformanceMetrics = normalizeCycleMetricsForDisplay(latestCycle, validation);
  const derivedMetrics = normalizeCycleMetricsForDisplay(latestCycle, validation);
  const canonicalMismatchWarnings = detectCanonicalMetricsMismatch(latestCycle?.canonicalMetrics, derivedMetrics);
  const completedRunbookItems = countCompletedRunbookItems(runbook);
  const autoResearchState = loadAutoResearchState();
  const latestAutoResearch = latestAutoResearchCycle(autoResearchState);
  const walkForwardState = loadWalkForwardState();
  const latestWalkForward = latestWalkForwardRun(walkForwardState);
  const activeImportId = getActiveImportedCandleSetId();
  const evidenceLedgerSummary = buildEvidenceLedger({
    dataMode: marketData.activeDataSource === "imported" ? "imported" : "mock",
    sourceLabel: marketData.sourceLabel,
    rawCandleCount: marketData.rawCandleCount,
    processedCandleCount: marketData.processedCandleCount,
    researchWindow: marketData.researchWindow,
    latestCycleId: latestCycle?.cycleId,
    latestCycleTimestamp: latestCycle?.completedAt ?? latestCycle?.startedAt,
    latestLLMRunId: latestLLMRun?.runId,
    llmAdvisoryPassed: latestLLMRun?.advisoryPassed,
    debateSessionId: latestCycle?.agentDebateConsensus?.sessionId,
    validationId: latestCycle?.validationSummary?.validationId ?? validation?.id,
    researchQualityId: latestCycle?.researchQualitySummary?.reviewId ?? researchQuality?.id,
    readinessState: readinessSnapshot.state,
    proposalId: latestProposal?.proposalId,
    smtState: grinchPhase4SmtSummary?.smtState
  });
  const researchMaturitySummary = calculateResearchMaturity({
    activeCalibrationId: activeConfig.activeCalibrationId,
    activeCalibrationApprovedAt: activeConfig.activeResearchCalibration?.approvedAt,
    evidenceQualityScore: evidenceLedgerSummary.overallScore,
    proposals: selfImprovement.proposals,
    latestReadinessState: readinessSnapshot.state,
    latestWalkForwardRun: latestWalkForward,
    cycles: safeArray(researchCycleState.runs).map((run) => {
      const metrics = canonicalMetricsForRun(run);
      return {
        cycleId: run.cycleId,
        timestamp: run.completedAt ?? run.startedAt,
        status: run.status,
        activeCalibrationId: metrics?.activeCalibrationId ?? run.activeCalibrationId,
        dataSourceMode: run.dataSourceMode,
        researchPreset: run.researchPreset,
        candleWindow: metrics?.candleWindow ?? `${run.researchWindowCandles ?? 0} raw / ${run.processedCandleCount ?? 0} processed`,
        rawCandleCount: metrics?.rawCandleCount ?? run.rawCandleCount,
        processedCandleCount: metrics?.processedCandleCount ?? run.processedCandleCount,
        totalTrades: metrics?.totalTrades ?? run.backtestSummary?.totalTrades,
        winRate: metrics?.winRate ?? run.backtestSummary?.winRate,
        averageR: metrics?.averageR ?? run.backtestSummary?.averageR,
        maxDrawdownR: metrics?.maxDrawdownR ?? run.backtestSummary?.maxDrawdown,
        falsePositiveCount: metrics?.falsePositiveCount,
        readinessScore: metrics?.readinessScore ?? run.researchQualitySummary?.readinessScore ?? run.validationSummary?.readinessScore,
        readinessState: run.readinessSnapshot?.state,
        llmAdvisoryPassed: run.llmRun?.advisoryPassed
      };
    })
  });
  const sourceTrace = [
    `market data: ${marketData.sourceLabel}`,
    `imported data status: ${marketData.importedDataStatus}`,
    `active import id: ${marketData.activeImportId ?? "none"}`,
    `stored imports: ${marketData.importedDatasetCount}`,
    `candle window: ${marketData.researchWindow.toLocaleString()} raw -> ${marketData.processedCandleCount.toLocaleString()} processed ${marketData.timeframe}`,
    `config merge: ${activeConfig.mergeStatusLabel}`,
    `latest cycle: ${latestCycle?.cycleId ?? "none"}`,
    `latest auto research: ${latestAutoResearch?.cycleId ?? "none"}`,
    `latest walk-forward: ${latestWalkForward?.runId ?? "none"}`,
    `latest proposal: ${latestProposal?.proposalId ?? "none"}`,
    `latest LLM run: ${latestLLMRun?.runId ?? "none"}`,
    `Grinch Phase 1: ${summarizeGrinchPhase1(grinchPhase1Summary)}`,
    `Grinch Reversal Profile: ${summarizeGrinchReversalProfile(grinchPhase2ReversalSummary)}`,
    `Grinch Consolidation Profile: ${summarizeGrinchConsolidationProfile(grinchPhase3ConsolidationSummary)}`,
    `Grinch SMT: ${summarizeGrinchSmtIntermarket(grinchPhase4SmtSummary)}`,
    `Grinch Score: ${summarizeGrinchStrategyScore(grinchStrategyScore)}`,
    `Active Grinch Profile: ${activeGrinchProfileSummary.detail}`,
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
  const walkForwardWarnings = [
    !latestWalkForward ? "No walk-forward validation exists; proposals and readiness are based on selected-window evidence only." : undefined,
    latestWalkForward?.stability?.verdict === "insufficient_evidence"
      ? "Latest walk-forward validation has insufficient evidence; increase windows or OOS trades before judging strategy quality."
      : undefined,
    latestWalkForward?.stability?.verdict === "fail" ? "Latest walk-forward validation failed; targeted follow-up research is required." : undefined,
    latestWalkForward?.stability?.overfitRisk === "high" ? "Latest walk-forward validation reports high overfit risk." : undefined,
    latestWalkForward?.stability &&
    latestWalkForward.stability.verdict !== "insufficient_evidence" &&
    latestWalkForward.stability.outOfSampleWindowsPassed < latestWalkForward.stability.windowCount
      ? "Walk-forward needs more OOS consistency before maturity can advance."
      : undefined,
    latestWalkForward && latestWalkForward.dataSource !== "imported" ? "Latest walk-forward validation did not use imported historical data." : undefined
  ].filter((warning): warning is string => Boolean(warning));

  const mismatchWarnings = buildMismatchWarnings({
    activeImportId,
    activeCalibrationExists: Boolean(activeConfig.activeResearchCalibration),
    activeCalibrationApplied: activeConfig.activeCalibrationApplied,
    canonicalMismatchWarnings,
    latestAutoResearchCycleId: latestCycle?.autoResearchCycle?.cycleId ?? latestAutoResearch?.cycleId,
    latestCycleCreatedProposalId: latestCycle?.createdProposalId,
    latestCycleId: latestCycle?.cycleId,
    latestProposal,
    marketData,
    researchQuality,
    validation
  });
  const activeBaselineFingerprint = createRunFingerprint({
    runId: activeConfig.activeCalibrationId ?? "active-baseline",
    dataSource: marketData.sourceLabel,
    symbol: marketData.symbol,
    timeframe: marketData.timeframe,
    rawCandleCount: marketData.rawCandleCount,
    processedCandleCount: marketData.processedCandleCount,
    candleWindow: candleWindowLabel(marketData),
    dataPreset: marketData.dataPreset,
    activeCalibrationId: activeConfig.activeCalibrationId,
    configMergeStatus: activeConfig.mergeStatusLabel,
    llmReviewerSchemaVersion: LLM_REVIEWER_SCHEMA_VERSION,
    llmRunId: latestLLMRun?.runId,
    generatedAt: activeConfig.activeResearchCalibration?.approvedAt ?? snapshotGeneratedAt,
    metricSourceType: "active_baseline"
  });
  const latestCycleFingerprint = latestCycle
    ? createRunFingerprint({
        runId: latestCycle.cycleId,
        cycleId: latestCycle.cycleId,
        proposalId: latestCycle.createdProposalId,
        dataSource: canonicalPerformanceMetrics?.dataSource ?? latestCycle.dataSourceLabel ?? marketData.sourceLabel,
        symbol: canonicalPerformanceMetrics?.symbol ?? latestCycle.backtestSummary?.config.symbol ?? marketData.symbol,
        timeframe: canonicalPerformanceMetrics?.timeframe ?? latestCycle.researchTimeframe ?? marketData.timeframe,
        rawCandleCount: canonicalPerformanceMetrics?.rawCandleCount ?? latestCycle.rawCandleCount ?? marketData.rawCandleCount,
        processedCandleCount:
          canonicalPerformanceMetrics?.processedCandleCount ?? latestCycle.processedCandleCount ?? marketData.processedCandleCount,
        candleWindow: canonicalPerformanceMetrics?.candleWindow ?? candleWindowLabel(marketData),
        dataPreset: marketData.dataPreset,
        activeCalibrationId: canonicalPerformanceMetrics?.activeCalibrationId ?? latestCycle.activeCalibrationId ?? activeConfig.activeCalibrationId,
        configMergeStatus: activeConfig.mergeStatusLabel,
        llmReviewerSchemaVersion: LLM_REVIEWER_SCHEMA_VERSION,
        llmRunId: latestCycle.llmRun?.runId ?? latestLLMRun?.runId,
        generatedAt: canonicalPerformanceMetrics?.generatedAt ?? latestCycle.completedAt ?? latestCycle.startedAt,
        metricSourceType: "latest_cycle"
      })
    : undefined;
  const proposalSnapshot = latestProposal?.metricsSnapshot;
  const proposalCurrency = proposalCurrencyFor({
    latestCycle,
    latestProposal,
    latestAutoResearchCycleId: latestAutoResearch?.cycleId
  });
  const proposalSnapshotFingerprint = proposalSnapshot
    ? createRunFingerprint({
        runId: proposalSnapshot.sourceCycleId ?? latestProposal.proposalId,
        cycleId: proposalSnapshot.sourceCycleId,
        proposalId: latestProposal.proposalId,
        sourceCandidateId: proposalSnapshot.sourceCandidateId,
        dataSource: proposalSnapshot.dataSource ?? marketData.sourceLabel,
        symbol: latestProposal.proposedConfig.symbol,
        timeframe: latestProposal.proposedConfig.timeframe,
        rawCandleCount: marketData.rawCandleCount,
        processedCandleCount: marketData.processedCandleCount,
        candleWindow: proposalSnapshot.candleWindow ?? candleWindowLabel(marketData),
        dataPreset: marketData.dataPreset,
        activeCalibrationId: proposalSnapshot.activeCalibrationIdUsed ?? activeConfig.activeCalibrationId,
        configMergeStatus: activeConfig.mergeStatusLabel,
        llmReviewerSchemaVersion: LLM_REVIEWER_SCHEMA_VERSION,
        llmRunId: latestLLMRun?.runId,
        generatedAt: proposalSnapshot.generatedAt,
        metricSourceType: "proposal_snapshot"
      })
    : undefined;
  const provenanceMismatchWarnings = [
    ...compareRunFingerprints(latestCycleFingerprint, proposalSnapshotFingerprint)
  ];
  const activeBaselineProvenance = createMetricProvenance(activeBaselineFingerprint, "active baseline");
  const latestCycleProvenance = latestCycleFingerprint
    ? createMetricProvenance(latestCycleFingerprint, canonicalPerformanceMetrics?.metricSourceLabel ?? latestCycleFingerprint.label)
    : undefined;
  const proposalSnapshotProvenance = proposalSnapshotFingerprint
    ? createMetricProvenance(proposalSnapshotFingerprint, "proposal snapshot", latestCycleFingerprint)
    : undefined;
  const actualBlockers = safeArray(readinessSnapshot.failedRequirements)
    .map((item) => displayLabelForRequirement(item))
    .filter((label) => Boolean(label?.trim()));
  const passedRequirements = safeArray(readinessSnapshot.passedRequirements)
    .map((item) => displayLabelForRequirement(item))
    .filter((label) => Boolean(label?.trim()) && !isBlockerLikeLabel(label));
  const readinessWarnings = [
    ...readinessSnapshot.warnings,
    marketData.isMockDataActive
      ? `Current data source is Mock. Not valid for imported MNQ comparison. ${marketData.importedDataMessage}`
      : undefined,
    ...safeArray(readinessSnapshot.passedRequirements)
      .map((item) => displayLabelForRequirement(item))
      .filter((label) => isBlockerLikeLabel(label)),
    ...evidenceLedgerSummary.readinessEvidenceWarnings,
    ...researchMaturitySummary.maturityWarnings,
    ...walkForwardWarnings,
    proposalCurrency.isHistorical && proposalCurrency.reason
      ? `Historical proposal available: ${proposalCurrency.reason}`
      : undefined
  ].filter((warning): warning is string => Boolean(warning));
  const currentActionItems = buildCurrentActionItems({
    evidenceScore: evidenceLedgerSummary.overallScore,
    latestProposal,
    maturityScore: researchMaturitySummary.score,
    proposalCurrency,
    readinessBlockers: actualBlockers,
    snapshotLLMPassed: Boolean(latestLLMRun?.advisoryPassed),
    walkForwardRecommendedNextAction:
      latestWalkForward?.stability?.recommendedNextAction ?? "Run walk-forward validation on imported data before trusting a calibration.",
    walkForwardVerdict: latestWalkForward?.stability?.verdict
  });
  const runtimeNextAction = runtimeNextActionFor({
    latestCycle,
    latestProposal,
    latestWalkForward,
    marketData,
    proposalCurrency,
    readinessSnapshot
  });

  return {
    snapshotId: uid("runtime_snapshot"),
    generatedAt: snapshotGeneratedAt,
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
      grinchPhase1Summary,
      grinchPhase2ReversalSummary,
      grinchPhase3ConsolidationSummary,
      grinchPhase4SmtSummary,
      grinchStrategyScore,
      smtSummary,
      activeGrinchProfileSummary,
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
      proposalSourceCycleId: latestProposal?.metricsSnapshot?.sourceCycleId,
      latestProposalIsCurrent: proposalCurrency.isCurrent,
      latestProposalIsHistorical: proposalCurrency.isHistorical,
      proposalSourceMismatchReason: proposalCurrency.reason,
      currentActionItems
    },
    readiness: {
      readinessState: readinessSnapshot.state,
      readinessSnapshot,
      actualBlockers,
      passedRequirements,
      warnings: readinessWarnings,
      nextAction: runtimeNextAction
    },
    performance: {
      canonicalPerformanceMetrics,
      simulatedAccountSummary: buildSimulatedAccountFromCanonicalMetrics(canonicalPerformanceMetrics)
    },
    evidence: {
      evidenceQualityScore: evidenceLedgerSummary.overallScore,
      evidenceLedgerSummary,
      weakestEvidenceCategories: evidenceLedgerSummary.weakestEvidenceCategories,
      readinessEvidenceWarnings: evidenceLedgerSummary.readinessEvidenceWarnings
    },
    maturity: {
      maturitySummary: researchMaturitySummary,
      maturityWarnings: researchMaturitySummary.maturityWarnings,
      maturityGrade: researchMaturitySummary.grade,
      maturityScore: researchMaturitySummary.score,
      nextMaturityRequirement: researchMaturitySummary.nextMaturityRequirement
    },
    walkForward: {
      latestRun: latestWalkForward,
      latestRunId: latestWalkForward?.runId,
      latestStatus: latestWalkForward?.status,
      latestTimestamp: latestWalkForward?.completedAt ?? latestWalkForward?.startedAt,
      dataPreset: latestWalkForward?.walkForwardDataPreset,
      stability: latestWalkForward?.stability,
      stabilityScore: latestWalkForward?.stability?.stabilityScore,
      verdict: latestWalkForward?.stability?.verdict,
      overfitRisk: latestWalkForward?.stability?.overfitRisk,
      windowsTested: latestWalkForward?.stability?.windowCount ?? 0,
      outOfSampleWindowsPassed: latestWalkForward?.stability?.outOfSampleWindowsPassed ?? 0,
      proposalValidated: Boolean(
        latestProposal?.proposalId &&
          latestWalkForward?.proposalId &&
          latestWalkForward.proposalId === latestProposal.proposalId
      ),
      failureDiagnostics: latestWalkForward?.failureDiagnostics ?? latestWalkForward?.stability?.diagnostics,
      followUpPlan: latestWalkForward?.followUpPlan ?? latestWalkForward?.stability?.followUpPlan,
      recommendedNextAction:
        latestWalkForward?.stability?.recommendedNextAction ?? "Run walk-forward validation on imported data before trusting a calibration.",
      warnings: walkForwardWarnings
    },
    fingerprints: {
      activeBaseline: activeBaselineFingerprint,
      latestCycle: latestCycleFingerprint,
      proposalSnapshot: proposalSnapshotFingerprint
    },
    metricProvenance: {
      activeBaseline: activeBaselineProvenance,
      latestCycle: latestCycleProvenance,
      proposalSnapshot: proposalSnapshotProvenance,
      mismatchWarnings: safeTopN(provenanceMismatchWarnings, 8)
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
        WALK_FORWARD_STORAGE_KEY,
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
