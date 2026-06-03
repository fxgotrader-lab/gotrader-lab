import type { CanonicalPerformanceMetrics } from "@/lib/performance/canonicalMetrics";
import { canonicalMetricsForRun } from "@/lib/performance/canonicalMetrics";
import type { ResearchCycleRun } from "@/lib/researchCycle/researchCycleTypes";
import type { ResearchRuntimeSnapshot } from "@/lib/runtime";
import { safeArray, safeTopN, uid } from "@/lib/utils";

import {
  gotraderResearchMemoryAuthorityNone,
  gotraderResearchMemoryExcludedSections,
  type GoTraderResearchCycleMemory,
  type GoTraderResearchMemoryEvidenceMaturity,
  type GoTraderResearchMemoryGrinchContext,
  type GoTraderResearchMemoryIctThesis,
  type GoTraderResearchMemoryMetrics,
  type GoTraderResearchMemoryReadiness,
  type GoTraderResearchMemoryRegimeContext,
  type GoTraderResearchMemorySourceContext,
  type GoTraderResearchMemoryWalkForwardVerdict
} from "./researchMemoryTypes";

const uniqueCompact = (values: Array<string | undefined | null>, max = 10) =>
  safeTopN(
    Array.from(
      new Set(
        values
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      )
    ),
    max
  );

const finiteNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const pctOrNull = (count: number | null, total: number) => {
  if (count === null || total <= 0) {
    return null;
  }
  return count / total;
};

const sourceProxyLabel = (provider: string, brokerSymbol?: string) => {
  if (provider === "mt5_read_only") {
    return brokerSymbol
      ? `${brokerSymbol} is MT5 read-only CFD/proxy market data, not CME futures broker truth.`
      : "MT5 read-only market data is proxy data, not broker truth.";
  }
  if (provider === "tradingview_mcp") {
    return "TradingView MCP is read-only evidence/chart data, not broker truth.";
  }
  return undefined;
};

function buildSourceContext(
  cycle: ResearchCycleRun | undefined,
  runtimeSnapshot: ResearchRuntimeSnapshot
): GoTraderResearchMemorySourceContext {
  const activeSource = runtimeSnapshot.marketData.activeResearchSource;
  const provider = activeSource.provider ?? cycle?.sourceMetadata?.activeSourceMode ?? cycle?.dataSourceMode ?? "unknown";
  const brokerSymbol =
    runtimeSnapshot.mt5ReadOnly.brokerSymbol ??
    activeSource.provenance.providerSymbol ??
    (provider === "mt5_read_only" ? runtimeSnapshot.mt5ReadOnly.feedSymbol : undefined);
  const candleCount = cycle?.sourceMetadata?.candleCount ?? activeSource.candleCount ?? cycle?.rawCandleCount ?? 0;

  return {
    provider,
    sourceLabel: cycle?.sourceMetadata?.activeSourceLabel ?? activeSource.provenance.sourceLabel ?? activeSource.sourceId,
    requestedSymbol: runtimeSnapshot.marketData.symbol ?? cycle?.thesisSummary?.symbol ?? activeSource.symbol,
    brokerSymbol,
    timeframe: cycle?.researchTimeframe ?? runtimeSnapshot.marketData.timeframe ?? activeSource.timeframe,
    candleCount,
    firstTimestamp: cycle?.sourceMetadata?.firstTimestamp ?? activeSource.firstTimestamp,
    lastTimestamp: cycle?.sourceMetadata?.lastTimestamp ?? activeSource.lastTimestamp,
    sourceFingerprint: cycle?.sourceMetadata?.activeSourceFingerprint ?? activeSource.fingerprint,
    sourceEligibility: cycle?.sourceMetadata?.researchEligibility,
    eligibilityReasons: uniqueCompact([
      ...safeArray(cycle?.sourceMetadata?.eligibilityReasons),
      ...safeArray(activeSource.eligibilityReasons)
    ]),
    warnings: uniqueCompact([
      ...safeArray(cycle?.sourceMetadata?.sourceWarnings),
      ...safeArray(activeSource.warnings),
      ...safeArray(runtimeSnapshot.marketData.canonicalSourceWarnings)
    ]),
    proxyLabel: sourceProxyLabel(String(provider), brokerSymbol)
  };
}

function buildRegimeContext(
  cycle: ResearchCycleRun | undefined,
  runtimeSnapshot: ResearchRuntimeSnapshot,
  source: GoTraderResearchMemorySourceContext
): GoTraderResearchMemoryRegimeContext {
  const regime = cycle?.regimeSummary;
  const runtimeRegime = runtimeSnapshot.regime;

  return {
    label: regime?.label ?? runtimeRegime.label,
    instantaneousLabel: regime?.instantaneousLabel ?? runtimeRegime.instantaneousLabel,
    stableLabel: regime?.stableLabel ?? runtimeRegime.label,
    confidence: finiteNumberOrNull(regime?.confidence ?? runtimeRegime.confidence),
    dataQuality: regime?.dataQuality ?? runtimeRegime.dataQuality,
    transitionPending: regime?.transitionPending ?? runtimeRegime.transitionPending,
    candleCount: regime?.candleCount ?? source.candleCount,
    requiredCandleCount: finiteNumberOrNull(regime?.requiredCandleCount),
    missingInputs: uniqueCompact(regime?.missingInputs ?? []),
    supportingFactors: uniqueCompact(regime?.supportingFactors ?? runtimeRegime.supportingFactors, 8),
    warnings: uniqueCompact([...(regime?.warnings ?? []), ...runtimeRegime.warnings], 8),
    sourceFingerprint: regime?.sourceFingerprint ?? runtimeRegime.sourceFingerprint
  };
}

function buildIctThesis(cycle: ResearchCycleRun | undefined): GoTraderResearchMemoryIctThesis | null {
  const thesis = cycle?.thesisSummary;
  if (!thesis) {
    return null;
  }

  return {
    thesisId: thesis.thesisId,
    bias: thesis.bias,
    ictBias: thesis.ictBias,
    confidence: finiteNumberOrNull(thesis.confidence),
    confluenceScore: finiteNumberOrNull(thesis.confluenceScore),
    summary: thesis.summary
  };
}

function buildGrinchContext(runtimeSnapshot: ResearchRuntimeSnapshot): GoTraderResearchMemoryGrinchContext {
  const grinch = runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary;
  if (!grinch) {
    return {
      profile: "unknown",
      blocker: "grinch_profile_unavailable",
      detail: "No compact Grinch profile summary was available in the runtime snapshot."
    };
  }

  return {
    profile: grinch.profile,
    state: grinch.state,
    entryIntent: grinch.entryIntent,
    timingGrade: grinch.timingGrade,
    blocker: grinch.hardGateReason ?? grinch.primaryRuleBlock,
    noValidProfile: grinch.noValidProfile,
    tradeProducingProfile: grinch.tradeProducingProfile,
    detail: grinch.detail
  };
}

function buildMetrics(cycle: ResearchCycleRun | undefined): GoTraderResearchMemoryMetrics {
  const canonicalMetrics: CanonicalPerformanceMetrics | undefined = canonicalMetricsForRun(cycle);
  const backtest = cycle?.backtestSummary;
  const sampleSize = canonicalMetrics?.totalTrades ?? backtest?.totalTrades ?? 0;
  const falsePositiveCount = finiteNumberOrNull(canonicalMetrics?.falsePositiveCount);

  return {
    netR: finiteNumberOrNull(canonicalMetrics?.realizedR ?? backtest?.realizedR),
    averageR: finiteNumberOrNull(canonicalMetrics?.averageR ?? backtest?.averageR),
    profitFactor: finiteNumberOrNull(canonicalMetrics?.profitFactor ?? backtest?.profitFactor),
    winRate: finiteNumberOrNull(canonicalMetrics?.winRate ?? backtest?.winRate),
    maxDrawdownR: finiteNumberOrNull(canonicalMetrics?.maxDrawdownR ?? backtest?.maxDrawdown),
    sampleSize,
    falsePositiveRate: pctOrNull(falsePositiveCount, sampleSize),
    processedCandles: cycle?.processedCandleCount ?? canonicalMetrics?.processedCandleCount ?? 0,
    rawCandles: cycle?.rawCandleCount ?? canonicalMetrics?.rawCandleCount ?? 0,
    metricStatus: sampleSize > 0 ? "simulated" : "unavailable"
  };
}

function buildReadiness(
  cycle: ResearchCycleRun | undefined,
  runtimeSnapshot: ResearchRuntimeSnapshot
): GoTraderResearchMemoryReadiness {
  const readiness = cycle?.readinessSnapshot ?? runtimeSnapshot.readiness.readinessSnapshot;

  return {
    state: readiness.state,
    recommendedNextStep: readiness.recommendedNextStep,
    failedRequirements: uniqueCompact(readiness.failedRequirements.map((requirement) => requirement.label), 8),
    warnings: uniqueCompact(readiness.warnings, 8)
  };
}

function buildEvidenceMaturity(
  cycle: ResearchCycleRun | undefined,
  runtimeSnapshot: ResearchRuntimeSnapshot
): GoTraderResearchMemoryEvidenceMaturity {
  return {
    evidenceScore: finiteNumberOrNull(cycle?.evidenceSummary?.evidenceScore ?? runtimeSnapshot.evidence.evidenceQualityScore),
    maturityScore: finiteNumberOrNull(cycle?.maturitySummary?.maturityScore ?? runtimeSnapshot.maturity.maturityScore),
    maturityGrade: cycle?.maturitySummary?.maturityGrade ?? runtimeSnapshot.maturity.maturityGrade,
    weakestEvidenceCategories: uniqueCompact([
      ...safeArray(cycle?.evidenceSummary?.weakestEvidenceCategories),
      ...runtimeSnapshot.evidence.weakestEvidenceCategories
    ]),
    maturityWarnings: uniqueCompact([
      ...safeArray(cycle?.maturitySummary?.maturityWarnings),
      ...runtimeSnapshot.maturity.maturityWarnings
    ])
  };
}

function buildWalkForwardVerdict(runtimeSnapshot: ResearchRuntimeSnapshot): GoTraderResearchMemoryWalkForwardVerdict | null {
  const walkForward = runtimeSnapshot.walkForward;
  if (!walkForward.latestRun && !walkForward.verdict && walkForward.windowsTested === 0) {
    return null;
  }

  return {
    runId: walkForward.latestRunId,
    status: walkForward.latestStatus,
    verdict: walkForward.verdict,
    stabilityScore: finiteNumberOrNull(walkForward.stabilityScore),
    windowsTested: walkForward.windowsTested,
    outOfSampleWindowsPassed: walkForward.outOfSampleWindowsPassed,
    warnings: uniqueCompact(walkForward.warnings, 8)
  };
}

function buildBlockers(
  cycle: ResearchCycleRun | undefined,
  runtimeSnapshot: ResearchRuntimeSnapshot,
  grinch: GoTraderResearchMemoryGrinchContext,
  regime: GoTraderResearchMemoryRegimeContext
) {
  return uniqueCompact(
    [
      ...safeArray(cycle?.blockers),
      ...runtimeSnapshot.readiness.actualBlockers,
      grinch.blocker,
      ...regime.warnings,
      ...regime.missingInputs.map((input) => `missing_regime_input:${input}`)
    ],
    12
  );
}

const advisoryStatus = (cycle: ResearchCycleRun | undefined): GoTraderResearchCycleMemory["advisoryStatus"] => {
  if (!cycle) {
    return "unknown";
  }
  if (cycle.llmAdvisoryUnavailable) {
    return "unavailable";
  }
  if (cycle.llmRun) {
    return "available";
  }
  return cycle.llmBridgeAvailable ? "skipped" : "unavailable";
};

export function buildResearchCycleMemoryPacket(
  latestCycle: ResearchCycleRun | undefined,
  runtimeSnapshot: ResearchRuntimeSnapshot
): GoTraderResearchCycleMemory {
  const cycle = latestCycle ?? runtimeSnapshot.latestResearchCycle.latestRun;
  const source = buildSourceContext(cycle, runtimeSnapshot);
  const regime = buildRegimeContext(cycle, runtimeSnapshot, source);
  const grinch = buildGrinchContext(runtimeSnapshot);
  const blockers = buildBlockers(cycle, runtimeSnapshot, grinch, regime);

  return {
    packetId: uid("gotrader_research_memory"),
    timestamp: new Date().toISOString(),
    memoryType: "research_cycle",
    cycleId: cycle?.cycleId,
    cycleStatus: cycle?.status,
    completedAt: cycle?.completedAt,
    resultSummary: cycle?.resultSummary,
    advisoryStatus: advisoryStatus(cycle),
    sourceEligibility: source.sourceEligibility,
    source,
    regime,
    ictThesis: buildIctThesis(cycle),
    grinch,
    metrics: buildMetrics(cycle),
    readiness: buildReadiness(cycle, runtimeSnapshot),
    evidenceMaturity: buildEvidenceMaturity(cycle, runtimeSnapshot),
    walkForwardVerdict: buildWalkForwardVerdict(runtimeSnapshot),
    blockers,
    nextAction: cycle?.nextRecommendedAction ?? runtimeSnapshot.readiness.nextAction,
    authority: gotraderResearchMemoryAuthorityNone,
    exclusions: gotraderResearchMemoryExcludedSections
  };
}
