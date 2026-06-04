import { canonicalMetricsForRun } from "@/lib/performance/canonicalMetrics";
import type { ResearchCycleRun } from "@/lib/researchCycle/researchCycleTypes";
import type { ResearchRuntimeSnapshot } from "@/lib/runtime";
import type { GrinchExpansionReplayDiagnostics } from "@/lib/strategyLibrary/grinchExpansionReplayDiagnostics";
import { safeArray, safeTopN, uid } from "@/lib/utils";

import {
  researchDecisionAuthorityNone,
  researchDecisionExcludedSections,
  type ResearchDecisionGrinchContext,
  type ResearchDecisionLogEntry,
  type ResearchDecisionMetrics,
  type ResearchDecisionSourceContext,
  type ResearchDecisionVerdict,
  type ResearchReflectionMemory,
  type ResearchReflectionSupport
} from "./researchDecisionLogTypes";

const finiteNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const uniqueCompact = (values: Array<string | undefined | null>, max = 12) =>
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

const sourceProxyLabel = (provider: string, brokerSymbol?: string) => {
  if (provider === "mt5_read_only") {
    return brokerSymbol
      ? `${brokerSymbol} is MT5 read-only CFD/proxy market data, not CME futures broker truth.`
      : "MT5 read-only market data is proxy data, not broker truth.";
  }
  if (provider === "tradingview_mcp") {
    return "TradingView MCP is read-only evidence/chart data, not broker truth.";
  }
  if (provider === "mock") {
    return "Mock data is demo evidence only and should not be treated as market truth.";
  }
  return undefined;
};

function buildSourceContext(cycle: ResearchCycleRun | undefined, snapshot: ResearchRuntimeSnapshot): ResearchDecisionSourceContext {
  const activeSource = snapshot.marketData.activeResearchSource;
  const provider = activeSource.provider ?? cycle?.sourceMetadata?.activeSourceMode ?? cycle?.dataSourceMode ?? "unknown";
  const brokerSymbol =
    snapshot.mt5ReadOnly.brokerSymbol ??
    activeSource.provenance.providerSymbol ??
    (provider === "mt5_read_only" ? snapshot.mt5ReadOnly.feedSymbol : undefined);

  return {
    provider,
    sourceLabel: cycle?.sourceMetadata?.activeSourceLabel ?? activeSource.provenance.sourceLabel ?? activeSource.sourceId,
    requestedSymbol: snapshot.marketData.symbol ?? cycle?.thesisSummary?.symbol ?? activeSource.symbol,
    brokerSymbol,
    timeframe: cycle?.researchTimeframe ?? snapshot.marketData.timeframe ?? activeSource.timeframe,
    sourceFingerprint: cycle?.sourceMetadata?.activeSourceFingerprint ?? activeSource.fingerprint,
    candleCount: cycle?.sourceMetadata?.candleCount ?? activeSource.candleCount ?? cycle?.rawCandleCount ?? 0,
    firstTimestamp: cycle?.sourceMetadata?.firstTimestamp ?? activeSource.firstTimestamp,
    lastTimestamp: cycle?.sourceMetadata?.lastTimestamp ?? activeSource.lastTimestamp,
    sourceEligibility: cycle?.sourceMetadata?.researchEligibility,
    proxyLabel: sourceProxyLabel(String(provider), brokerSymbol),
    warnings: uniqueCompact([
      ...safeArray(cycle?.sourceMetadata?.sourceWarnings),
      ...safeArray(activeSource.warnings),
      ...safeArray(snapshot.marketData.canonicalSourceWarnings)
    ])
  };
}

function buildGrinchContext(snapshot: ResearchRuntimeSnapshot): ResearchDecisionGrinchContext {
  const grinch = snapshot.latestResearchCycle.activeGrinchProfileSummary;
  const replay = (snapshot.latestResearchCycle.grinchStrategyScore as
    | { expansionReplayDiagnostics?: GrinchExpansionReplayDiagnostics }
    | undefined)?.expansionReplayDiagnostics;

  return {
    selectedProfile: grinch?.profile ?? "unknown",
    state: grinch?.state,
    timingGrade: grinch?.timingGrade,
    blocker: grinch?.hardGateReason ?? grinch?.primaryRuleBlock,
    detail: grinch?.detail,
    expansionReplayResult: replay
      ? {
          title: replay.title,
          timingDate: replay.timingDate,
          timingZone: replay.timingZone,
          failedRule: replay.expansionTest.failedRule,
          failureReason: replay.expansionTest.failureReason,
          nearMissScore: replay.nearMissScore,
          recommendation: replay.recommendation
        }
      : undefined
  };
}

function buildMetrics(cycle: ResearchCycleRun | undefined): ResearchDecisionMetrics {
  const metrics = canonicalMetricsForRun(cycle);
  const backtest = cycle?.backtestSummary;
  const trades = metrics?.totalTrades ?? backtest?.totalTrades ?? 0;
  const falsePositiveCount = finiteNumberOrNull(metrics?.falsePositiveCount);

  return {
    trades,
    winRate: finiteNumberOrNull(metrics?.winRate ?? backtest?.winRate),
    averageR: finiteNumberOrNull(metrics?.averageR ?? backtest?.averageR),
    drawdown: finiteNumberOrNull(metrics?.maxDrawdownR ?? backtest?.maxDrawdown),
    profitFactor: finiteNumberOrNull(metrics?.profitFactor ?? backtest?.profitFactor),
    falsePositiveRate: falsePositiveCount !== null && trades > 0 ? falsePositiveCount / trades : null
  };
}

function buildBlockers(cycle: ResearchCycleRun | undefined, snapshot: ResearchRuntimeSnapshot, grinch: ResearchDecisionGrinchContext) {
  return uniqueCompact([
    ...safeArray(cycle?.blockers),
    ...snapshot.readiness.actualBlockers,
    grinch.blocker,
    grinch.expansionReplayResult?.failedRule,
    ...snapshot.regime.warnings,
    ...snapshot.regime.current.missingInputs.map((input) => `missing_regime_input:${input}`),
    ...snapshot.walkForward.warnings
  ]);
}

function chooseVerdict({
  cycle,
  metrics,
  blockers,
  grinch,
  snapshot
}: {
  cycle: ResearchCycleRun | undefined;
  metrics: ResearchDecisionMetrics;
  blockers: string[];
  grinch: ResearchDecisionGrinchContext;
  snapshot: ResearchRuntimeSnapshot;
}): { verdict: ResearchDecisionVerdict; reason: string } {
  if (!cycle) {
    return {
      verdict: "collect_more_data",
      reason: "No completed research cycle is available for a final research verdict."
    };
  }

  const replayRejected =
    grinch.expansionReplayResult?.nearMissScore === 0 &&
    Boolean(grinch.expansionReplayResult.failedRule && grinch.expansionReplayResult.failedRule !== "passed_diagnostic_check");
  if (replayRejected || blockers.some((item) => item.includes("grinch_no_valid_profile") || item.includes("grinch_timing_expired"))) {
    return {
      verdict: "reject_current_setup",
      reason: "Current Grinch refinement evidence blocks the full-stack ICT/Grinch setup for this window."
    };
  }

  if (snapshot.proposal.latestProposalId || cycle.createdProposalId) {
    return {
      verdict: "draft_self_improvement_proposal",
      reason: "A local simulation proposal exists, but it remains draft-only until normal validation gates pass."
    };
  }

  if (snapshot.walkForward.windowsTested === 0 && metrics.trades > 0) {
    return {
      verdict: "run_walk_forward",
      reason: "The latest cycle produced simulated trades, but walk-forward evidence is not available yet."
    };
  }

  if ((snapshot.evidence.evidenceQualityScore ?? 0) < 50 || (snapshot.maturity.maturityScore ?? 0) < 50) {
    return {
      verdict: "collect_more_data",
      reason: "Evidence or maturity remains below the level needed for stronger research conclusions."
    };
  }

  if (grinch.selectedProfile === "none" || grinch.selectedProfile === "unknown") {
    return {
      verdict: "run_calibration_test",
      reason: "No active Grinch refinement profile is selected; controlled diagnostics should guide the next calibration test."
    };
  }

  return {
    verdict: "observe",
    reason: "No execution action is permitted; observe the current research state and continue gated validation."
  };
}

export function buildResearchDecisionLogEntry(
  snapshot: ResearchRuntimeSnapshot,
  latestCycle = snapshot.latestResearchCycle.latestRun
): ResearchDecisionLogEntry {
  const source = buildSourceContext(latestCycle, snapshot);
  const grinch = buildGrinchContext(snapshot);
  const metrics = buildMetrics(latestCycle);
  const blockers = buildBlockers(latestCycle, snapshot, grinch);
  const verdict = chooseVerdict({ cycle: latestCycle, metrics, blockers, grinch, snapshot });

  return {
    decisionId: uid("research_decision"),
    timestamp: new Date().toISOString(),
    cycleId: latestCycle?.cycleId,
    source,
    regime: {
      label: latestCycle?.regimeSummary?.label ?? snapshot.regime.label,
      confidence: finiteNumberOrNull(latestCycle?.regimeSummary?.confidence ?? snapshot.regime.confidence),
      dataQuality: latestCycle?.regimeSummary?.dataQuality ?? snapshot.regime.dataQuality,
      missingInputs: uniqueCompact(latestCycle?.regimeSummary?.missingInputs ?? snapshot.regime.current.missingInputs)
    },
    ictThesis: latestCycle?.thesisSummary
      ? {
          thesisId: latestCycle.thesisSummary.thesisId,
          bias: latestCycle.thesisSummary.bias,
          ictBias: latestCycle.thesisSummary.ictBias,
          confidence: finiteNumberOrNull(latestCycle.thesisSummary.confidence),
          summary: latestCycle.thesisSummary.summary
        }
      : null,
    grinch,
    metrics,
    walkForward:
      snapshot.walkForward.latestRun || snapshot.walkForward.verdict || snapshot.walkForward.windowsTested > 0
        ? {
            runId: snapshot.walkForward.latestRunId,
            verdict: snapshot.walkForward.verdict,
            windowsTested: snapshot.walkForward.windowsTested,
            outOfSampleWindowsPassed: snapshot.walkForward.outOfSampleWindowsPassed,
            stabilityScore: finiteNumberOrNull(snapshot.walkForward.stabilityScore),
            warnings: uniqueCompact(snapshot.walkForward.warnings, 8)
          }
        : null,
    quality: {
      evidenceScore: finiteNumberOrNull(latestCycle?.evidenceSummary?.evidenceScore ?? snapshot.evidence.evidenceQualityScore),
      maturityScore: finiteNumberOrNull(latestCycle?.maturitySummary?.maturityScore ?? snapshot.maturity.maturityScore),
      maturityGrade: latestCycle?.maturitySummary?.maturityGrade ?? snapshot.maturity.maturityGrade
    },
    readiness: {
      state: (latestCycle?.readinessSnapshot ?? snapshot.readiness.readinessSnapshot).state,
      recommendedNextStep: (latestCycle?.readinessSnapshot ?? snapshot.readiness.readinessSnapshot).recommendedNextStep,
      blockers: snapshot.readiness.actualBlockers,
      warnings: uniqueCompact((latestCycle?.readinessSnapshot ?? snapshot.readiness.readinessSnapshot).warnings, 8)
    },
    blockers,
    finalResearchVerdict: verdict.verdict,
    finalResearchVerdictReason: verdict.reason,
    authority: researchDecisionAuthorityNone,
    exclusions: researchDecisionExcludedSections
  };
}

const supportStatusFor = (entry: ResearchDecisionLogEntry): ResearchReflectionSupport => {
  if (entry.finalResearchVerdict === "draft_self_improvement_proposal" || entry.finalResearchVerdict === "run_calibration_test") {
    return "needs_more_evidence";
  }
  if (entry.finalResearchVerdict === "reject_current_setup") {
    return "not_supported";
  }
  if (entry.finalResearchVerdict === "run_walk_forward") {
    return "needs_more_evidence";
  }
  return entry.metrics.trades > 0 ? "supported" : "none";
};

export function buildResearchReflectionMemory(entry: ResearchDecisionLogEntry): ResearchReflectionMemory {
  const whatWorked = uniqueCompact([
    entry.source.candleCount >= 400 ? `${entry.source.provider} supplied ${entry.source.candleCount.toLocaleString()} research candles.` : undefined,
    entry.regime.dataQuality === "sufficient" ? `Regime classified as ${entry.regime.label}.` : undefined,
    entry.metrics.trades > 0 ? `${entry.metrics.trades} simulated trade(s) were produced.` : undefined,
    entry.metrics.averageR !== null && entry.metrics.averageR > 0 ? `Average R stayed positive at ${entry.metrics.averageR.toFixed(2)}R.` : undefined,
    entry.source.sourceFingerprint ? "Source fingerprint is recorded for reproducibility." : undefined
  ]);
  const whatFailed = uniqueCompact([
    entry.grinch.blocker ? `Grinch blocker: ${entry.grinch.blocker.replace(/_/g, " ")}.` : undefined,
    entry.grinch.expansionReplayResult?.failureReason,
    ...entry.blockers,
    entry.walkForward?.verdict === "fail" || entry.walkForward?.verdict === "insufficient_evidence"
      ? `Walk-forward verdict: ${entry.walkForward.verdict.replace(/_/g, " ")}.`
      : undefined
  ]);
  const support = supportStatusFor(entry);

  return {
    reflectionId: uid("research_reflection"),
    timestamp: new Date().toISOString(),
    decisionId: entry.decisionId,
    whatWorked: whatWorked.length ? whatWorked : ["No durable positive research evidence is available yet."],
    whatFailed: whatFailed.length ? whatFailed : ["No major blocker was recorded in the compact decision log."],
    repeatedBlocker: entry.blockers[0] ?? entry.grinch.blocker,
    whatToTestNext:
      entry.finalResearchVerdict === "reject_current_setup"
        ? "Wait for cleaner Grinch evidence or run a targeted calibration diagnostic on a future window."
        : entry.finalResearchVerdict === "run_walk_forward"
          ? "Run walk-forward validation before considering any stronger research claim."
          : entry.finalResearchVerdict === "run_calibration_test"
            ? "Run the strongest current Grinch calibration candidate in research-only mode."
            : entry.finalResearchVerdict === "draft_self_improvement_proposal"
              ? "Keep the proposal draft-only until AI Research, walk-forward, evidence, maturity, and regime checks pass."
              : "Collect more current candles and rerun deterministic research when a cleaner setup appears.",
    calibrationProposalSupport: {
      status: support,
      reason:
        support === "not_supported"
          ? "Current blockers or expansion replay evidence do not support the active calibration proposal for this window."
          : support === "needs_more_evidence"
            ? "The reflection points to more controlled validation before any proposal can be trusted."
            : support === "supported"
              ? "The latest deterministic evidence is directionally supportive, but it remains research-only."
              : "No active proposal support can be inferred from the compact decision log."
    },
    gbrainMemoryPacketHint: {
      shouldCreateLater: true,
      reason: "Decision log and reflection are compact, deterministic, and exclude candles/secrets, so they can be converted into a gbrain packet later."
    },
    authority: researchDecisionAuthorityNone,
    exclusions: researchDecisionExcludedSections
  };
}

export function buildResearchDecisionLogBundle(
  snapshot: ResearchRuntimeSnapshot,
  latestCycle = snapshot.latestResearchCycle.latestRun
) {
  const entry = buildResearchDecisionLogEntry(snapshot, latestCycle);
  return {
    entry,
    reflection: buildResearchReflectionMemory(entry)
  };
}
