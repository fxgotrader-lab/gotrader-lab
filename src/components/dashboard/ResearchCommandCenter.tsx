import { useEffect, useState } from "react";
import { ArrowRight, Bot, ClipboardCheck, DatabaseZap, ExternalLink, Gauge, GitBranch, MessageSquareText, MessagesSquare, Route, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { AutonomySafetyPolicyPanel } from "@/components/autonomous-research/AutonomySafetyPolicyPanel";
import { loadAgentAuditState, summarizeAgentAudit } from "@/lib/agentAudit";
import { loadAgentDebateState, summarizeAgentDebate } from "@/lib/agentDebate";
import {
  latestAutoResearchCycle,
  loadAutoResearchState,
} from "@/lib/autoResearch";
import { latestAutonomousResearchRun, loadAutonomousResearchState } from "@/lib/autonomousResearch";
import { getCommunicationSummary, loadCommunicationMessages } from "@/lib/communications/communicationSpec";
import { evidenceScoreVariant, selectStrongestEvidenceLabel, selectWeakestEvidenceLabel } from "@/lib/evidence";
import { maturityGradeLabel, maturityGradeVariant, selectMaturityNextRequirement, selectMaturityTrendMessage } from "@/lib/maturity";
import {
  getLLMReadinessImpact,
  latestLLMAdvisoryRun,
  loadLLMResearchState,
  providerStatusForMode,
} from "@/lib/llm";
import {
  buildMarketContext,
  loadPreparedCandleSource,
  MARKET_DATA_IMPORT_UPDATED_EVENT,
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  loadCandleWindowSettings,
  type PreparedCandleSource
} from "@/lib/marketData";
import { evaluateReadinessGate, loadManualApprovalRecord } from "@/lib/readiness";
import { loadLatestResearchQualityReview } from "@/lib/researchQuality";
import { latestResearchCycleRun, loadResearchCycleState } from "@/lib/researchCycle";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeConfigSummary,
  selectRuntimeDataBadge,
  selectRuntimeFingerprintLabel,
  selectRuntimeMetricSourceLabel,
  selectRuntimeProvenanceRows,
  selectRuntimeProvenanceWarnings,
  selectRuntimeSnapshotHealth,
  selectRuntimeSourceLabel,
  selectRuntimeWarnings,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";
import { loadSelfImprovementState } from "@/lib/selfImprovement";
import {
  countCompletedRunbookItems,
  loadSimulationRunbookState,
  simulationRunbookChecklist,
} from "@/lib/simulationRunbook";
import type { LabState } from "@/lib/types";
import { safeArray } from "@/lib/utils";
import { loadLatestValidationReport } from "@/lib/validation";
import { latestWalkForwardRun, loadWalkForwardState } from "@/lib/walkForward";

import { AutomationTimeline, type AutomationTimelineEvent } from "./AutomationTimeline";
import { AutoResearchStatusCard } from "./AutoResearchStatusCard";
import { formatDateTime, formatNumber } from "./dashboardFormatters";
import { LLMAgentStatusCard } from "./LLMAgentStatusCard";
import { ReadinessSummaryCard } from "./ReadinessSummaryCard";
import { ResearchCycleControl } from "./ResearchCycleControl";
import { SafetyLockCard } from "./SafetyLockCard";
import { SelfImprovementStatusCard } from "./SelfImprovementStatusCard";
import { SimulatedAccountCard } from "./SimulatedAccountCard";
import { SimulationBridgeStatusCard } from "./SimulationBridgeStatusCard";
import { SystemStatusGrid } from "./SystemStatusGrid";
import { ValidationStatusCard } from "./ValidationStatusCard";
import {
  detectCanonicalMetricsMismatch,
  normalizeCycleMetricsForDisplay
} from "@/lib/performance/canonicalMetrics";
import { buildSimulatedAccountFromCanonicalMetrics } from "@/lib/performance/simulatedAccount";

type ResearchCommandCenterProps = {
  state: LabState;
};

const fallbackCandleSource: PreparedCandleSource = {
  mode: "mock",
  label: "Mock candles",
  candles: [],
  rawCandleCount: 0,
  researchWindowCandles: 0,
  processedCandleCount: 0,
  estimatedProcessedCandles: 0,
  appliedSettings: loadCandleWindowSettings(),
  aggregationApplied: false,
  performanceMode: "safe",
  warnings: []
};

export function ResearchCommandCenter({ state }: ResearchCommandCenterProps) {
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [activeCandleSource, setActiveCandleSource] = useState<PreparedCandleSource>(fallbackCandleSource);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();
  const llmState = loadLLMResearchState();
  const latestLLMRun = latestLLMAdvisoryRun(llmState);
  const researchCycleState = loadResearchCycleState();
  const latestResearchCycle = latestResearchCycleRun(researchCycleState);
  const providerStatus = providerStatusForMode(llmState.providerMode);
  const autoResearchState = loadAutoResearchState();
  const latestAutoResearch = latestAutoResearchCycle(autoResearchState);
  const latestAutonomousResearch = latestAutonomousResearchRun(loadAutonomousResearchState());
  const latestWalkForward = runtimeSnapshot?.walkForward.latestRun ?? latestWalkForwardRun(loadWalkForwardState());
  const validationReport = loadLatestValidationReport();
  const researchQuality = loadLatestResearchQualityReview();
  const selfImprovement = loadSelfImprovementState();
  const latestProposal =
    selfImprovement.proposals.find((proposal) => proposal.proposalId === selfImprovement.latestProposalId) ??
    selfImprovement.proposals[0];
  const runbook = loadSimulationRunbookState();
  const completedRunbookItems = countCompletedRunbookItems(runbook);
  const manualApproval = loadManualApprovalRecord();
  const fallbackReadiness = evaluateReadinessGate({
    validation: validationReport,
    quality: researchQuality,
    runbook,
  });
  const readiness = runtimeSnapshot?.readiness.readinessSnapshot ?? fallbackReadiness;
  const latestHandoff = state.handoffExports[0];
  const communicationSummary = getCommunicationSummary(loadCommunicationMessages());
  const agentAuditSummary = summarizeAgentAudit(loadAgentAuditState());
  const agentDebateSummary = summarizeAgentDebate(loadAgentDebateState());
  const canonicalMetrics = runtimeSnapshot?.performance.canonicalPerformanceMetrics ?? normalizeCycleMetricsForDisplay(latestResearchCycle, validationReport);
  const derivedCanonicalMetrics = normalizeCycleMetricsForDisplay(latestResearchCycle, validationReport);
  const canonicalMismatchWarnings = detectCanonicalMetricsMismatch(latestResearchCycle?.canonicalMetrics, derivedCanonicalMetrics);
  const simulatedAccount = runtimeSnapshot?.performance.simulatedAccountSummary ?? buildSimulatedAccountFromCanonicalMetrics(canonicalMetrics);
  const latestThesis = state.tradeTheses[0];
  const marketSymbol = activeCandleSource.metadata?.symbol ?? latestThesis?.symbol ?? "NQ";
  const marketTimeframe =
    activeCandleSource.mode === "imported"
      ? activeCandleSource.appliedSettings.targetTimeframe
      : latestThesis?.timeframe ?? "5m";
  const marketContext = buildMarketContext({
    symbol: marketSymbol,
    timeframe: marketTimeframe,
    mode: activeCandleSource.mode === "imported" ? "imported" : "mock",
    candles: activeCandleSource.candles
  });

  useEffect(() => {
    let mounted = true;
    const refreshMarketData = () => {
      loadPreparedCandleSource().then((source) => {
        if (mounted) {
          setActiveCandleSource(source);
          resolveResearchRuntimeSnapshot({ labState: state, preparedCandleSource: source }).then((snapshot) => {
            if (mounted) {
              setRuntimeSnapshot(snapshot);
            }
          }).catch(() => undefined);
        }
      }).catch(() => undefined);
    };
    refreshMarketData();
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refreshMarketData);
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refreshMarketData);
    window.addEventListener("storage", refreshMarketData);
    return () => {
      mounted = false;
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refreshMarketData);
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refreshMarketData);
      window.removeEventListener("storage", refreshMarketData);
    };
  }, [dashboardRefresh, state]);

  const runtimeWarnings = selectRuntimeWarnings(runtimeSnapshot);

  const recommendedAction = getRecommendedAction({
    completedRunbookItems,
    latestAutoResearch: Boolean(latestAutoResearch),
    latestLLMRunPassed: Boolean(latestLLMRun?.advisoryPassed),
    latestProposalStatus: latestProposal?.status,
    providerConfigured: providerStatus.configured || Boolean(latestLLMRun?.providerConfigured),
    qualityRun: Boolean(researchQuality),
    readinessFailedCount: safeArray(readiness.failedRequirements).length,
    runbookComplete: completedRunbookItems === simulationRunbookChecklist.length,
    validationRun: Boolean(validationReport),
  });

  const timelineEvents = buildTimelineEvents({
    autoResearchTimestamp: latestAutoResearch?.timestamp,
    autoResearchStatus: latestAutoResearch?.status,
    completedRunbookItems,
    researchCycleStatus: latestResearchCycle?.status,
    researchCycleTimestamp: latestResearchCycle?.completedAt ?? latestResearchCycle?.startedAt,
    llmRunTimestamp: latestLLMRun?.timestamp,
    llmRunPassed: Boolean(latestLLMRun?.advisoryPassed),
    proposalTimestamp: latestProposal?.timestamp,
    proposalStatus: latestProposal?.status,
    qualityTimestamp: researchQuality?.generatedAt,
    readiness,
    runbookTimestamp: runbook.verifiedAt,
    totalRunbookItems: simulationRunbookChecklist.length,
    validationTimestamp: validationReport?.generatedAt,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-white/10 bg-slate-950/80 p-5 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">AI research command center</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-50">GoTrader AI Lab Dashboard</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Monitor LLM advisory review, autonomous configuration search, validation, self-improvement proposals,
            readiness gating, and the simulation-only go-trader bridge from one cockpit.
          </p>
        </div>
        <Badge variant="danger" className="w-fit text-sm">
          Broker execution disabled
        </Badge>
      </div>

      <SystemStatusGrid />

      <Card className="border-cyan-400/20 bg-cyan-950/20">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base text-cyan-100">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Recommended Next Action
            </CardTitle>
            <p className="mt-1 text-xs text-cyan-100/70">{recommendedAction.reason}</p>
          </div>
          <Badge variant="warning">Human approval center</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xl font-semibold text-cyan-50">{recommendedAction.title}</div>
            <p className="mt-1 max-w-3xl text-sm text-cyan-100/75">{recommendedAction.detail}</p>
          </div>
          <Link to={recommendedAction.href}>
            <Button className="w-full md:w-auto">
              Go there
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <ResearchCycleControl state={state} onCycleUpdate={() => setDashboardRefresh((value) => value + 1)} />

      <Card className="border-cyan-300/20 bg-cyan-300/10">
        <CardContent className="flex flex-col gap-2 p-4 text-sm text-cyan-100 md:flex-row md:items-center md:justify-between">
          <span>
            Metrics source: {runtimeSnapshot ? selectRuntimeMetricSourceLabel(runtimeSnapshot) : canonicalMetrics ? `latest research cycle ${canonicalMetrics.sourceCycleId}` : "no completed research cycle yet"}
          </span>
          <span>Fingerprint: {selectRuntimeFingerprintLabel(runtimeSnapshot)}</span>
          <span>
            {canonicalMetrics
              ? `${canonicalMetrics.dataSource} / ${canonicalMetrics.candleWindow}`
              : "Run AI Research Cycle to generate canonical performance metrics."}
          </span>
        </CardContent>
      </Card>
      {canonicalMismatchWarnings.length ? (
        <Card className="border-amber-300/25 bg-amber-300/10">
          <CardContent className="p-4 text-sm text-amber-100">
            Dashboard is using the stored canonical latest-cycle metrics as source of truth. Derived summary mismatch: {canonicalMismatchWarnings.join(" ")}
          </CardContent>
        </Card>
      ) : null}

      <SimulatedAccountCard account={simulatedAccount} />

      <SafetyLockCard />

      <Card className="border-white/10 bg-slate-950/70">
        <CardContent className="grid gap-3 p-4 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
          <StatusLine label="Runtime snapshot" value={selectRuntimeSnapshotHealth(runtimeSnapshot)} />
          <StatusLine label="Data source" value={selectRuntimeSourceLabel(runtimeSnapshot)} />
          <StatusLine label="Active config" value={selectRuntimeConfigSummary(runtimeSnapshot)} />
          <StatusLine label="Data mode" value={selectRuntimeDataBadge(runtimeSnapshot)} />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <AICommunicationsCard summary={communicationSummary} />
        <MarketDataContextCard context={marketContext} source={activeCandleSource} />
        <EvidenceQualityCard snapshot={runtimeSnapshot} />
        <ResearchMaturityCard snapshot={runtimeSnapshot} />
        <AutonomySafetyPolicyPanel latestAutoResearch={latestAutoResearch} snapshot={runtimeSnapshot} />
        <AutonomousResearchStatusCard run={latestAutonomousResearch} />
        <WalkForwardStatusCard run={latestWalkForward} snapshot={runtimeSnapshot} />
        <AgentDebateCard summary={agentDebateSummary} />
        <AgentAuditCard summary={agentAuditSummary} />
        <LLMAgentStatusCard latestRun={latestLLMRun} providerStatus={providerStatus} state={llmState} />
        <AutoResearchStatusCard cycle={latestAutoResearch} />
        <ValidationStatusCard report={validationReport} qualityReview={researchQuality} />
        <ResearchQualityStatusCard quality={researchQuality} />
        <SelfImprovementStatusCard latestCycleMetrics={canonicalMetrics} proposal={latestProposal} />
        <ReadinessSummaryCard manualApproval={manualApproval} readiness={readiness} />
        <SimulationBridgeStatusCard
          completedRunbookItems={completedRunbookItems}
          handoff={latestHandoff}
          runbook={runbook}
          totalRunbookItems={simulationRunbookChecklist.length}
        />
        <RunSequenceGuide />
      </div>

      <TechnicalDetails
        title="View automation timeline and readiness details"
        description="Open for event history, gate blocker counts, and latest handoff debug context."
      >
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <AutomationTimeline events={timelineEvents} />
        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-base text-slate-100">Readiness Impact Summary</CardTitle>
            <p className="text-xs text-slate-500">Why the system can monitor research but cannot execute.</p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <p>{getLLMReadinessImpact(llmState)}</p>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Gate blockers</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">{safeArray(readiness.failedRequirements).length}</div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Latest handoff</div>
              <div className="mt-1 break-all text-slate-200">{latestHandoff?.filename ?? "No handoff exported yet"}</div>
            </div>
          </CardContent>
        </Card>
        </div>
        {runtimeSnapshot ? (
          <Card className="mt-5 border-white/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-base text-slate-100">Runtime Snapshot Diagnostics</CardTitle>
              <p className="text-xs text-slate-500">Canonical read-model status for data, config, cycle, proposal, readiness, and metrics.</p>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-300">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatusLine label="Snapshot ID" value={runtimeSnapshot.snapshotId} />
                <StatusLine label="Generated" value={formatDateTime(runtimeSnapshot.generatedAt)} />
                <StatusLine label="Active threshold" value={`${(runtimeSnapshot.activeConfig.resolvedConfluenceThreshold * 100).toFixed(0)}%`} />
                <StatusLine label="Latest proposal" value={runtimeSnapshot.proposal.latestProposalId ?? "none"} />
                <StatusLine label="Run fingerprint" value={selectRuntimeFingerprintLabel(runtimeSnapshot)} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Metric provenance</div>
                  <div className="mt-2 grid gap-2">
                    {selectRuntimeProvenanceRows(runtimeSnapshot).map((item) => (
                      <StatusLine key={item.label} label={item.label} value={item.value} />
                    ))}
                  </div>
                  {selectRuntimeProvenanceWarnings(runtimeSnapshot).length ? (
                    <p className="mt-3 text-amber-100">{selectRuntimeProvenanceWarnings(runtimeSnapshot).join(" ")}</p>
                  ) : null}
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Source trace</div>
                  <ul className="mt-2 space-y-1">
                    {runtimeSnapshot.diagnostics.sourceTrace.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Warnings</div>
                  {runtimeWarnings.length ? (
                    <ul className="mt-2 space-y-1 text-amber-100">
                      {runtimeWarnings.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-emerald-200">No runtime snapshot mismatch warnings detected.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </TechnicalDetails>
    </div>
  );
}

function MarketDataContextCard({
  context,
  source
}: {
  context: ReturnType<typeof buildMarketContext>;
  source: PreparedCandleSource;
}) {
  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <DatabaseZap className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            Market Data Context
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Active historical candle source for research/backtesting.</p>
        </div>
        <Badge variant={source.mode === "imported" ? "success" : "warning"}>{context.mode}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Symbol" value={`${context.symbol} ${context.timeframe}`} />
          <StatusLine label="Source" value={source.label} />
          <StatusLine label="Raw candles" value={source.rawCandleCount.toLocaleString()} />
          <StatusLine label="Window used" value={source.researchWindowCandles.toLocaleString()} />
          <StatusLine label="Processed candles" value={String(context.priceVolume.ohlcv.candles.length)} />
          <StatusLine label="Performance" value={source.performanceMode} />
          <StatusLine label="Available modules" value={String(context.availableModules.length)} />
          <StatusLine label="Missing modules" value={String(context.missingModules.length)} />
          <StatusLine label="Planned agents" value={String(context.plannedAgents.length)} />
        </div>
        <div className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs text-cyan-100">
          {source.mode === "imported"
            ? "Imported OHLCV is active for local research. Macro, positioning, intermarket, and order flow remain roadmap inputs."
            : "Mock price/volume context is active; macro, positioning, intermarket, and order flow remain roadmap inputs."}
        </div>
        <Link to="/market-data">
          <Button variant="secondary" className="w-full justify-between">
            Open market data context
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function EvidenceQualityCard({ snapshot }: { snapshot?: ResearchRuntimeSnapshot }) {
  const summary = snapshot?.evidence.evidenceLedgerSummary;

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <Gauge className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            Evidence Quality
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">How much current research evidence is real, derived, mock, planned, or unavailable.</p>
        </div>
        <Badge variant={evidenceScoreVariant(summary?.overallScore)}>
          {summary ? `${summary.overallScore}/100` : "loading"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Real coverage" value={summary ? `${summary.realEvidenceCoverage}%` : "loading"} />
          <StatusLine label="Mock/planned/unavailable" value={String(summary?.mockPlannedUnavailableCount ?? 0)} />
          <StatusLine label="Strongest real evidence" value={selectStrongestEvidenceLabel(summary)} />
          <StatusLine label="Weakest evidence" value={selectWeakestEvidenceLabel(summary)} />
        </div>
        <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">
          {summary?.readinessEvidenceWarnings[0] ?? "Evidence quality can support research confidence, but cannot approve readiness by itself."}
        </div>
        <Link to="/evidence-quality">
          <Button variant="secondary" className="w-full justify-between">
            Open evidence ledger
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function ResearchMaturityCard({ snapshot }: { snapshot?: ResearchRuntimeSnapshot }) {
  const summary = snapshot?.maturity.maturitySummary;

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <Gauge className="h-4 w-4 text-violet-300" aria-hidden="true" />
            Research Maturity
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Repeatability score for the active calibration and strategy state.</p>
        </div>
        <Badge variant={maturityGradeVariant(summary?.grade)}>{maturityGradeLabel(summary?.grade)}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Score" value={summary ? `${summary.score}/100` : "loading"} />
          <StatusLine label="Cycles tested" value={String(summary?.cyclesTested ?? 0)} />
          <StatusLine label="Windows tested" value={String(summary?.dataWindowsTested ?? 0)} />
          <StatusLine label="Evidence score" value={`${summary?.evidenceQualityScore ?? 0}/100`} />
          <StatusLine label="Trend status" value={selectMaturityTrendMessage(summary)} />
        </div>
        <div className="rounded-md border border-violet-300/25 bg-violet-300/10 p-3 text-xs text-violet-100">
          {selectMaturityNextRequirement(summary)}
        </div>
        <Link to="/research-maturity">
          <Button variant="secondary" className="w-full justify-between">
            Open maturity score
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function AutonomousResearchStatusCard({
  run
}: {
  run?: ReturnType<typeof latestAutonomousResearchRun>;
}) {
  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <Bot className="h-4 w-4 text-amber-300" aria-hidden="true" />
            Autonomous Research
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Policy-gated supervisor loop for bounded research calibrations.</p>
        </div>
        <Badge
          variant={
            run?.status === "completed"
              ? "success"
              : run?.status === "failed"
                ? "danger"
                : run?.status === "paused" || run?.status === "canceled"
                  ? "warning"
                  : "secondary"
          }
        >
          {run?.status?.replace(/_/g, " ") ?? "not run"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Mode" value={run?.settings.autoApplyPolicyEnabled ? "policy-gated auto-apply" : "proposal-only"} />
          <StatusLine label="Current iteration" value={`${run?.currentIteration ?? 0}/${run?.settings.maxIterations ?? 3}`} />
          <StatusLine label="Latest scenario" value={run?.latestScenarioFamily?.replace(/_/g, " ") ?? "none"} />
          <StatusLine label="Last auto-applied" value={run?.latestAutoAppliedCalibrationId ?? "none"} />
          <StatusLine label="Stop reason" value={run?.stopReason?.replace(/_/g, " ") ?? "not stopped"} />
          <StatusLine label="Handoff eligibility" value={run?.goTraderHandoffGate.eligibleForReview ? "review only" : "blocked"} />
        </div>
        <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">
          {run?.latestScenarioReason ?? "Run the autonomous supervisor after evidence, walk-forward, and maturity are available."}
        </div>
        <Link to="/autonomous-research">
          <Button variant="secondary" className="w-full justify-between">
            Open autonomous loop
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function WalkForwardStatusCard({
  run,
  snapshot
}: {
  run?: ReturnType<typeof latestWalkForwardRun>;
  snapshot?: ResearchRuntimeSnapshot;
}) {
  const stability = run?.stability;
  const diagnostics = snapshot?.walkForward.failureDiagnostics ?? run?.failureDiagnostics ?? stability?.diagnostics;
  const followUpPlan = snapshot?.walkForward.followUpPlan ?? run?.followUpPlan ?? stability?.followUpPlan;

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <GitBranch className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            Walk-Forward Validation
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">In-sample, validation, and out-of-sample stability for imported data.</p>
        </div>
        <Badge
          variant={
            stability?.verdict === "paper_demo_review_candidate" || stability?.verdict === "robust_research"
              ? "success"
              : stability?.verdict === "promising"
                ? "warning"
                : stability?.verdict === "fail"
                  ? "danger"
                  : stability?.verdict === "insufficient_evidence"
                    ? "warning"
                    : "muted"
          }
        >
          {stability?.verdict?.replace(/_/g, " ") ?? "not run"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Windows tested" value={String(stability?.windowCount ?? 0)} />
          <StatusLine label="OOS passed" value={`${stability?.outOfSampleWindowsPassed ?? 0}/${stability?.windowCount ?? 0}`} />
          <StatusLine label="Stability score" value={stability ? `${stability.stabilityScore}/100` : "n/a"} />
          <StatusLine label="Overfit risk" value={stability?.overfitRisk === "not_applicable" ? "not applicable" : stability?.overfitRisk ?? "unknown"} />
          <StatusLine label="Data preset" value={snapshot?.walkForward.dataPreset ?? run?.walkForwardDataPreset ?? "not run"} />
          <StatusLine label="Candle window" value={run?.candleWindow ?? "not run"} />
        </div>
        {stability?.verdict === "insufficient_evidence" ? (
          <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">
            <div className="font-medium">Walk-forward insufficient evidence</div>
            <div className="mt-1">
              Requested {stability.evidenceSummary?.requestedMaxWindows ?? run?.maxWindows ?? 0} window(s), generated{" "}
              {stability.evidenceSummary?.actualWindowsGenerated ?? stability.windowCount}. OOS trades{" "}
              {stability.evidenceSummary?.totalOosTrades ?? 0}/{stability.evidenceSummary?.minimumTotalOosTrades ?? 20}.
            </div>
            <div className="mt-1">
              {stability.evidenceSummary?.insufficientEvidenceReasons[0] ??
                "Use Standard preset or a larger raw candle window before judging strategy quality."}
            </div>
          </div>
        ) : null}
        <div className="rounded-md border border-cyan-300/25 bg-cyan-300/10 p-3 text-xs text-cyan-100">
          {snapshot?.walkForward.recommendedNextAction ?? "Run walk-forward validation before trusting a one-window calibration."}
        </div>
        {diagnostics ? (
          <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">
            <div className="font-medium">Failure summary</div>
            <div className="mt-1">
              Verdict {stability?.verdict?.replace(/_/g, " ") ?? "unknown"}; OOS passed{" "}
              {stability?.outOfSampleWindowsPassed ?? 0}/{stability?.windowCount ?? 0}; worst window{" "}
              {diagnostics.worstWindowId ?? "unknown"}.
            </div>
            <div className="mt-1">
              Top reason: {diagnostics.repeatedFailureReasons[0] ?? "none recorded"}. Next follow-up:{" "}
              {followUpPlan?.recommendations[0]?.label ?? "run targeted walk-forward follow-up"}.
            </div>
          </div>
        ) : null}
        <Link to="/walk-forward">
          <Button variant="secondary" className="w-full justify-between">
            Open walk-forward validation
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function AgentDebateCard({ summary }: { summary: ReturnType<typeof summarizeAgentDebate> }) {
  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <MessagesSquare className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            Agent Debate Consensus
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Moderator consensus from opening statements and debate rounds.</p>
        </div>
        <Badge variant={summary.consensusReached ? "success" : "warning"}>
          {summary.consensusReached ? "Consensus" : "Flat/no consensus"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Position" value={summary.position} />
          <StatusLine label="Probability" value={`${Math.round(summary.probability * 100)}%`} />
          <StatusLine label="Strongest disagreement" value={summary.strongestDisagreement} />
          <StatusLine label="Minority view" value={summary.minorityView} />
        </div>
        <div className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs text-cyan-100">
          Debate interprets immutable facts only. No consensus means flat/no thesis.
        </div>
        <Link to="/agent-debate">
          <Button variant="secondary" className="w-full justify-between">
            Open debate layer
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function AgentAuditCard({ summary }: { summary: ReturnType<typeof summarizeAgentAudit> }) {
  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <ClipboardCheck className="h-4 w-4 text-violet-300" aria-hidden="true" />
            Agent Decision Audit
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Explainability and reliability scoring for agent decisions.</p>
        </div>
        <Badge variant={summary.needsReviewCount > 0 ? "warning" : "secondary"}>
          {summary.needsReviewCount} need review
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Latest audit" value={formatDateTime(summary.latestAuditAt)} />
          <StatusLine label="Weakest agent" value={summary.weakestAgent?.agentName ?? "None"} />
          <StatusLine label="Strongest agent" value={summary.strongestAgent?.agentName ?? "None"} />
          <StatusLine label="Unsafe rejected" value={String(summary.unsafeRejectedCount)} />
        </div>
        <Link to="/agent-audit">
          <Button variant="secondary" className="w-full justify-between">
            Open agent audit
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function AICommunicationsCard({
  summary,
}: {
  summary: ReturnType<typeof getCommunicationSummary>;
}) {
  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <MessageSquareText className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            AI Communications
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Primary in-app channel for agent messages and approvals.</p>
        </div>
        <Badge variant={summary.actionRequiredCount > 0 ? "warning" : "secondary"}>
          {summary.actionRequiredCount} action required
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Unread messages" value={String(summary.unreadMessages)} />
          <StatusLine label="Action required" value={String(summary.actionRequiredCount)} />
          <StatusLine label="Latest agent message" value={summary.latestAgentMessage?.title ?? "No messages"} />
          <StatusLine label="Latest critical warning" value={summary.latestCriticalWarning?.title ?? "No critical warning"} />
        </div>
        <div className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs text-cyan-100">
          App-first communication. Discord, Telegram, and Hermes are optional notification routes only.
        </div>
        <Link to="/communications">
          <Button variant="secondary" className="w-full justify-between">
            Open communications
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function ResearchQualityStatusCard({ quality }: { quality: ReturnType<typeof loadLatestResearchQualityReview> }) {
  const topWeakness = quality?.topWeaknesses[0];
  const topStrength = quality?.topStrengths[0];

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <ClipboardCheck className="h-4 w-4 text-lime-300" aria-hidden="true" />
            Research Quality Status
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Weaknesses, strengths, and readiness grade from validation.</p>
        </div>
        <Badge variant={quality?.readinessGrade === "Paper-Demo Candidate" ? "success" : quality ? "warning" : "secondary"}>
          {quality?.readinessGrade ?? "Not run"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Latest review" value={formatDateTime(quality?.generatedAt)} />
          <StatusLine label="Readiness score" value={formatNumber(quality?.readinessScore, 1)} />
          <StatusLine label="Top weakness" value={topWeakness?.title ?? "Run review first"} />
          <StatusLine label="Top strength" value={topStrength?.title ?? "Run review first"} />
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
          {quality?.recommendedNextStep ?? "Run validation first, then run the research quality review."}
        </div>
        <Link to="/research-quality">
          <Button variant="secondary" className="w-full justify-between">
            Open research quality
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function RunSequenceGuide() {
  const sequence = [
    ["Start local LLM bridge", "/llm-agents"],
    ["Run GPT Advisory Review", "/llm-agents"],
    ["Run Auto Research Cycle", "/auto-research"],
    ["Review Calibration Proposal", "/self-improvement"],
    ["Run Validation Suite", "/validation"],
    ["Run Research Quality Review", "/research-quality"],
    ["Check Readiness Gate", "/readiness-gate"],
    ["Verify Simulation Bridge", "/simulation-runbook"],
  ];

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-slate-100">
          <Route className="h-4 w-4 text-cyan-300" aria-hidden="true" />
          Run Sequence Guide
        </CardTitle>
        <p className="text-xs text-slate-500">Preferred order for the AI-driven research loop.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {sequence.map(([label, href], index) => (
          <Link
            key={label}
            to={href}
            className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/5"
          >
            <span>
              <span className="mr-2 font-mono text-xs text-slate-500">{index + 1}.</span>
              {label}
            </span>
            <ExternalLink className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 truncate font-medium text-slate-200">{value}</div>
    </div>
  );
}

function getRecommendedAction({
  completedRunbookItems,
  latestAutoResearch,
  latestLLMRunPassed,
  latestProposalStatus,
  providerConfigured,
  qualityRun,
  readinessFailedCount,
  runbookComplete,
  validationRun,
}: {
  completedRunbookItems: number;
  latestAutoResearch: boolean;
  latestLLMRunPassed: boolean;
  latestProposalStatus?: string;
  providerConfigured: boolean;
  qualityRun: boolean;
  readinessFailedCount: number;
  runbookComplete: boolean;
  validationRun: boolean;
}) {
  if (!providerConfigured) {
    return {
      title: "Configure/start local LLM bridge",
      reason: "Real research mode requires a secure local provider boundary before LLM advisory can pass.",
      detail: "Start the local bridge with the API key in PowerShell, then run GPT Advisory Review.",
      href: "/llm-agents",
    };
  }
  if (!latestLLMRunPassed) {
    return {
      title: "Run LLM advisory review",
      reason: "Paper-Demo Candidate is blocked until the required LLM advisory review passes.",
      detail: "LLM agents can review research context, but they remain advisory-only and cannot execute trades.",
      href: "/llm-agents",
    };
  }
  if (!latestAutoResearch) {
    return {
      title: "Run auto-research cycle",
      reason: "No autonomous research configuration search has been recorded yet.",
      detail: "Let the supervisor compare bounded candidate configurations and create a proposal only if stability improves.",
      href: "/auto-research",
    };
  }
  if (latestProposalStatus === "proposed" || latestProposalStatus === "testing") {
    return {
      title: "Review self-improvement proposal",
      reason: "A calibration proposal is waiting for human review.",
      detail: "Approve only after simulation results improve stability, not just headline profit.",
      href: "/self-improvement",
    };
  }
  if (!validationRun) {
    return {
      title: "Run validation suite",
      reason: "The dashboard needs scenario validation before readiness can improve.",
      detail: "Run conservative, aggressive, session, direction, confidence, and stop-model checks.",
      href: "/validation",
    };
  }
  if (!qualityRun) {
    return {
      title: "Run research-quality review",
      reason: "Validation results need quality analysis before readiness can be trusted.",
      detail: "Review weaknesses, false positives, drawdown clusters, and session consistency.",
      href: "/research-quality",
    };
  }
  if (readinessFailedCount > 0) {
    return {
      title: "Review readiness gate",
      reason: `${readinessFailedCount} blocker${readinessFailedCount === 1 ? "" : "s"} still prevent Paper-Demo Candidate.`,
      detail: "Use the debugger to see the current value, required value, and suggested fix for each blocker.",
      href: "/readiness-gate",
    };
  }
  if (!runbookComplete || completedRunbookItems < simulationRunbookChecklist.length) {
    return {
      title: "Verify simulation bridge",
      reason: "The go-trader bridge must prove broker execution is skipped and trades remain zero.",
      detail: "Complete the simulation runbook after a scheduler one-cycle run.",
      href: "/simulation-runbook",
    };
  }
  return {
    title: "Do not proceed to broker demo",
    reason: "Research monitoring is complete for now, but execution remains disabled.",
    detail: "Keep broker-demo work separate until a future implementation adds explicit risk gates and paper-only controls.",
    href: "/readiness-gate",
  };
}

function buildTimelineEvents({
  autoResearchStatus,
  autoResearchTimestamp,
  completedRunbookItems,
  researchCycleStatus,
  researchCycleTimestamp,
  llmRunPassed,
  llmRunTimestamp,
  proposalStatus,
  proposalTimestamp,
  qualityTimestamp,
  readiness,
  runbookTimestamp,
  totalRunbookItems,
  validationTimestamp,
}: {
  autoResearchStatus?: string;
  autoResearchTimestamp?: string;
  completedRunbookItems: number;
  researchCycleStatus?: string;
  researchCycleTimestamp?: string;
  llmRunPassed: boolean;
  llmRunTimestamp?: string;
  proposalStatus?: string;
  proposalTimestamp?: string;
  qualityTimestamp?: string;
  readiness: ReturnType<typeof evaluateReadinessGate>;
  runbookTimestamp?: string;
  totalRunbookItems: number;
  validationTimestamp?: string;
}): AutomationTimelineEvent[] {
  return [
    {
      label: "Dashboard research cycle",
      timestamp: researchCycleTimestamp,
      status: researchCycleStatus === "completed" ? "complete" : researchCycleTimestamp ? "attention" : "missing",
      detail: researchCycleStatus
        ? `Latest dashboard cycle status: ${researchCycleStatus}.`
        : "Use the dashboard control to run the safe research sequence.",
      href: "/dashboard",
    },
    {
      label: "LLM advisory run",
      timestamp: llmRunTimestamp,
      status: llmRunPassed ? "complete" : llmRunTimestamp ? "attention" : "missing",
      detail: llmRunPassed ? "Configured LLM advisory review passed." : "LLM advisory review is required before Paper-Demo Candidate.",
      href: "/llm-agents",
    },
    {
      label: "Auto research cycle",
      timestamp: autoResearchTimestamp,
      status: autoResearchTimestamp ? "complete" : "missing",
      detail: autoResearchStatus ? `Latest cycle status: ${autoResearchStatus}.` : "No auto-research cycle recorded yet.",
      href: "/auto-research",
    },
    {
      label: "Validation run",
      timestamp: validationTimestamp,
      status: validationTimestamp ? "complete" : "missing",
      detail: validationTimestamp ? "Scenario validation has been run." : "Run validation to generate scenario evidence.",
      href: "/validation",
    },
    {
      label: "Research quality review",
      timestamp: qualityTimestamp,
      status: qualityTimestamp ? "complete" : "missing",
      detail: qualityTimestamp ? "Research quality review is available." : "Run quality review after validation.",
      href: "/research-quality",
    },
    {
      label: "Self-improvement proposal",
      timestamp: proposalTimestamp,
      status: proposalStatus === "accepted" ? "complete" : proposalTimestamp ? "attention" : "missing",
      detail: proposalStatus ? `Latest proposal status: ${proposalStatus}.` : "No calibration proposal has been created.",
      href: "/self-improvement",
    },
    {
      label: "Readiness gate update",
      timestamp: readiness.evaluatedAt,
      status: safeArray(readiness.failedRequirements).length === 0 ? "complete" : "attention",
      detail: `${readiness.state}; ${safeArray(readiness.failedRequirements).length} failed requirement${safeArray(readiness.failedRequirements).length === 1 ? "" : "s"}.`,
      href: "/readiness-gate",
    },
    {
      label: "Simulation bridge verification",
      timestamp: runbookTimestamp,
      status: completedRunbookItems === totalRunbookItems && runbookTimestamp ? "complete" : "attention",
      detail: `${completedRunbookItems}/${totalRunbookItems} runbook checks complete; broker execution must stay skipped.`,
      href: "/simulation-runbook",
    },
  ];
}
