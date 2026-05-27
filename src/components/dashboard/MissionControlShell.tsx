import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Lock, ShieldCheck } from "lucide-react";

import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AUTONOMOUS_RESEARCH_UPDATED_EVENT,
  discardAutonomousResearchCheckpoint,
  latestAutonomousResearchRun,
  loadAutonomousResearchState,
  runAutonomousResearchLoop,
  type AutonomousResearchSettings,
  type AutonomousResearchRun,
  type AutonomousResearchState
} from "@/lib/autonomousResearch";
import { COMMUNICATION_AUDIT_UPDATED_EVENT, loadCommunicationMessages } from "@/lib/communications/communicationSpec";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  MARKET_DATA_IMPORT_UPDATED_EVENT
} from "@/lib/marketData";
import { RESEARCH_CYCLE_UPDATED_EVENT } from "@/lib/researchCycle";
import {
  ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT,
  SELF_IMPROVEMENT_UPDATED_EVENT
} from "@/lib/selfImprovement";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeFingerprintLabel,
  selectRuntimeProvenanceRows,
  selectRuntimeWarnings,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";
import type { LabState } from "@/lib/types";
import { safeArray, safeTopN, uid } from "@/lib/utils";
import { WALK_FORWARD_UPDATED_EVENT } from "@/lib/walkForward";

import { formatDateTime } from "./dashboardFormatters";
import { AutonomousLoopProgress } from "./AutonomousLoopProgress";
import { MissionControlActionPanel, type MissionActionItem } from "./MissionControlActionPanel";
import { MissionControlDataFeed, type MissionFeedItem } from "./MissionControlDataFeed";
import { MissionControlPipeline, type MissionPipelineStage } from "./MissionControlPipeline";
import { MissionControlStatusStrip } from "./MissionControlStatusStrip";
import { ResearchCycleControl } from "./ResearchCycleControl";

const currency = new Intl.NumberFormat(undefined, {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency"
});

const pct = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : "n/a";

const formatToken = (value?: string) => (value ?? "idle").replace(/_/g, " ");

export function MissionControlShell({ state }: { state: LabState }) {
  const [autonomyState, setAutonomyState] = useState<AutonomousResearchState>(() => loadAutonomousResearchState());
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();
  const [liveRun, setLiveRun] = useState<AutonomousResearchRun>();
  const [busy, setBusy] = useState(false);
  const [abortController, setAbortController] = useState<AbortController>();
  const [maxIterations, setMaxIterations] = useState("3");
  const [noImprovementStop, setNoImprovementStop] = useState("2");
  const [autoApplyPolicyEnabled, setAutoApplyPolicyEnabled] = useState(false);
  const [advancedFullResearchMode, setAdvancedFullResearchMode] = useState(false);
  const latestRun = liveRun ?? latestAutonomousResearchRun(autonomyState);
  const currentIteration = latestRun?.iterations.find((iteration) => iteration.iteration === latestRun.currentIteration);
  const recoveryRun = !busy && autonomyState.activeRun?.status === "running" ? autonomyState.activeRun : undefined;

  const refresh = () => {
    setAutonomyState(loadAutonomousResearchState());
    void resolveResearchRuntimeSnapshot({ labState: state }).then(setRuntimeSnapshot).catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    window.addEventListener(AUTONOMOUS_RESEARCH_UPDATED_EVENT, refresh);
    window.addEventListener(COMMUNICATION_AUDIT_UPDATED_EVENT, refresh);
    window.addEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
    window.addEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
    window.addEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
    window.addEventListener(WALK_FORWARD_UPDATED_EVENT, refresh);
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(AUTONOMOUS_RESEARCH_UPDATED_EVENT, refresh);
      window.removeEventListener(COMMUNICATION_AUDIT_UPDATED_EVENT, refresh);
      window.removeEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
      window.removeEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
      window.removeEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
      window.removeEventListener(WALK_FORWARD_UPDATED_EVENT, refresh);
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [state]);

  const startLoop = async () => {
    const controller = new AbortController();
    const settings: AutonomousResearchSettings = {
      maxIterations: Number(maxIterations),
      noImprovementStop: Number(noImprovementStop),
      safeImportedDataMode: true,
      advancedFullResearchMode,
      autoApplyPolicyEnabled
    };
    setAbortController(controller);
    setBusy(true);
    setLiveRun(createStartingAutonomyRun(settings));
    try {
      const run = await runAutonomousResearchLoop({
        state,
        settings,
        signal: controller.signal,
        onUpdate: setLiveRun
      });
      setLiveRun(run);
      setAutonomyState(loadAutonomousResearchState());
      await resolveResearchRuntimeSnapshot({ labState: state }).then(setRuntimeSnapshot).catch(() => undefined);
    } finally {
      setBusy(false);
      setAbortController(undefined);
    }
  };

  const stopLoop = () => {
    abortController?.abort();
  };

  const discardRecovery = () => {
    setAutonomyState(discardAutonomousResearchCheckpoint());
    setLiveRun(undefined);
  };

  const pipelineStages = useMemo(
    () => buildPipelineStages(runtimeSnapshot, latestRun, busy, currentIteration?.startedAt),
    [busy, currentIteration?.startedAt, latestRun, runtimeSnapshot]
  );
  const actionItems = useMemo(() => buildActionItems(runtimeSnapshot, latestRun), [runtimeSnapshot, latestRun]);
  const feedItems = useMemo(() => buildFeedItems(latestRun), [latestRun]);
  const keyMetrics = buildKeyMetrics(runtimeSnapshot, latestRun);
  const simulatedAccount = runtimeSnapshot?.performance.simulatedAccountSummary;
  const warnings = selectRuntimeWarnings(runtimeSnapshot);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950 px-5 py-6 shadow-[0_0_70px_rgba(8,145,178,0.12)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" aria-hidden="true" />
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Autonomous mission control</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-50">GoTrader AI Lab Command Center</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Supervise the research loop, watch pipeline health, and respond only when a gate, proposal, or evidence issue needs review.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="danger" className="text-sm">
              Broker execution disabled
            </Badge>
            <Badge variant="secondary" className="text-sm">
              Readiness override none
            </Badge>
          </div>
        </div>
      </section>

      <MissionControlStatusStrip
        autoApplyPolicyEnabled={autoApplyPolicyEnabled}
        loopStatus={latestRun?.status}
        snapshot={runtimeSnapshot}
      />

      <MissionControlActionPanel
        actionItems={actionItems}
        advancedFullResearchMode={advancedFullResearchMode}
        autoApplyPolicyEnabled={autoApplyPolicyEnabled}
        busy={busy}
        dataPresetLabel={runtimeSnapshot?.marketData.dataPreset ?? "loading"}
        maxIterations={maxIterations}
        noImprovementStop={noImprovementStop}
        onAdvancedFullResearchModeChange={setAdvancedFullResearchMode}
        onAutoApplyPolicyEnabledChange={setAutoApplyPolicyEnabled}
        onMaxIterationsChange={setMaxIterations}
        onNoImprovementStopChange={setNoImprovementStop}
        onStart={startLoop}
        onStop={stopLoop}
        searchDepthLabel={latestRun?.latestScenarioFamily ? formatToken(latestRun.latestScenarioFamily) : "auto-selected"}
        selectedScenarioFamily={formatToken(latestRun?.latestScenarioFamily)}
      />

      <AutonomousLoopProgress
        busy={busy}
        onDiscardRecovery={discardRecovery}
        recoveryRun={recoveryRun}
        run={latestRun}
      />

      <MissionControlPipeline stages={pipelineStages} />

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-xl border border-white/10 bg-slate-950/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Key readouts</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-50">Minimal Metrics</h3>
            </div>
            <Badge variant="secondary">{selectRuntimeFingerprintLabel(runtimeSnapshot)}</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {keyMetrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <div className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">{metric.label}</div>
                <div className="mt-1 truncate font-mono text-sm text-slate-100">{metric.value}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{metric.detail}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">
            {simulatedAccount
              ? `Simulated balance ${currency.format(simulatedAccount.currentBalance)}; P&L ${currency.format(simulatedAccount.realizedPnL)}. Simulation only.`
              : "Run AI Research Cycle to generate simulated account results. Simulation only."}
          </div>
        </div>
        <MissionControlDataFeed items={feedItems} />
      </section>

      <section className="rounded-xl border border-rose-300/25 bg-rose-950/20 p-4 text-sm text-rose-100">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Safety locks are always on.</p>
            <p className="mt-1 text-rose-100/80">
              Command Center can start research loops only. It cannot execute trades, approve Paper-Demo Candidate, send go-trader handoffs,
              connect Tradovate, or override readiness gates.
            </p>
          </div>
        </div>
      </section>

      <TechnicalDetails
        title="Advanced details and drill-down controls"
        description="Open for the one-cycle research control, runtime diagnostics, source trace, and direct links to detail pages."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Data source", runtimeSnapshot?.marketData.sourceLabel ?? "loading"],
            ["Active config", runtimeSnapshot?.activeConfig.configMergeStatusLabel ?? "loading"],
            ["Latest cycle", runtimeSnapshot?.latestResearchCycle.latestCycleId ?? "none"],
            ["Latest proposal", runtimeSnapshot?.proposal.latestProposalId ?? "none"]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
              <p className="mt-1 break-words font-mono text-xs text-slate-100">{value}</p>
            </div>
          ))}
        </div>
        {warnings.length ? (
          <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            <p className="font-semibold">Runtime warnings</p>
            <ul className="mt-2 space-y-1">
              {safeTopN(warnings, 6).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Market Data", "/market-data"],
            ["Agent Debate", "/agent-debate"],
            ["Walk-Forward", "/walk-forward"],
            ["Self-Improvement", "/self-improvement"],
            ["Readiness Gate", "/readiness-gate"],
            ["Autonomous Loop", "/autonomous-research"],
            ["Performance", "/performance"],
            ["Simulation Runbook", "/simulation-runbook"]
          ].map(([label, href]) => (
            <Link key={href} to={href}>
              <Button variant="secondary" className="w-full justify-between">
                {label}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          ))}
        </div>
        <div className="mt-4">
          <ResearchCycleControl state={state} />
        </div>
        {runtimeSnapshot ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/55 p-3 text-xs text-slate-400">
            <div className="mb-2 flex items-center gap-2 text-slate-200">
              <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              Runtime provenance
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {selectRuntimeProvenanceRows(runtimeSnapshot).map((row) => (
                <div key={row.label} className="flex justify-between gap-3 border-b border-white/5 py-1">
                  <span>{row.label}</span>
                  <span className="text-right font-mono text-slate-200">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3">Source trace: {runtimeSnapshot.diagnostics.sourceTrace.join(" + ")}</div>
          </div>
        ) : null}
      </TechnicalDetails>
    </div>
  );
}

function createStartingAutonomyRun(settings: AutonomousResearchSettings): AutonomousResearchRun {
  const startedAt = new Date().toISOString();
  return {
    runId: uid("autonomous_research_starting"),
    startedAt,
    status: "running",
    settings,
    currentIteration: 0,
    progress: {
      status: "running",
      activeStage: "resolving_runtime",
      activeStageLabel: "Resolving runtime",
      currentIteration: 0,
      maxIterations: settings.maxIterations,
      progressPercent: 10,
      startedAt,
      updatedAt: startedAt,
      currentTask: "Starting autonomous research loop...",
      events: [
        {
          eventId: uid("autonomy_event"),
          timestamp: startedAt,
          stage: "resolving_runtime",
          title: "Loop start requested",
          detail: "Starting autonomous research loop from Mission Control."
        }
      ]
    },
    iterations: [],
    readinessTrend: "unknown",
    maturityTrend: "unknown",
    goTraderHandoffGate: {
      eligibleForReview: false,
      reasons: ["Loop is starting. Go-trader review remains locked."],
      brokerExecutionDisabled: true
    },
    calibrationDriftHistory: [],
    openClawHooks: {
      failureAnalysisMemory: { executionAuthority: "none" },
      scenarioRecommendation: { executionAuthority: "none" },
      proposalReview: { executionAuthority: "none" }
    },
    hermesNotification: { executionAuthority: "none" },
    safetyNotice: "Autonomous research is simulation-only. It cannot execute trades, approve Paper-Demo Candidate, send go-trader handoffs, or override readiness."
  };
}

function buildPipelineStages(
  snapshot?: ResearchRuntimeSnapshot,
  run?: AutonomousResearchRun,
  busy?: boolean,
  iterationStartedAt?: string
): MissionPipelineStage[] {
  const latestCycle = snapshot?.latestResearchCycle.latestRun;
  const running = busy || run?.status === "running";
  const currentIteration = run?.iterations.find((iteration) => iteration.iteration === run.currentIteration);
  const activeStage = run?.progress?.activeStage;
  const activeMarketData = running && activeStage === "resolving_runtime";
  const activeAiResearch = running && (activeStage === "thesis_generation" || activeStage === "auto_research");
  const activeDebate = running && activeStage === "llm_advisory";
  const activeValidation = running && activeStage === "backtest";
  const activeWalkForward = running && activeStage === "walk_forward";
  const activeSelfImprovement = running && activeStage === "self_improvement";
  const activeReadiness = running && (activeStage === "readiness_maturity" || activeStage === "audit_communications");
  const walkForwardVerdict = snapshot?.walkForward.verdict;
  const latestProposal = snapshot?.proposal.latestProposal;

  return [
    {
      id: "market-data",
      label: "Lab / Market Data",
      href: "/market-data",
      status: activeMarketData ? "active" : snapshot?.marketData.processedCandleCount ? "complete" : "warning",
      task: snapshot
        ? `${snapshot.marketData.sourceLabel}; ${snapshot.marketData.processedCandleCount.toLocaleString()} processed candles.`
        : "Preparing runtime data source.",
      countLabel: snapshot?.marketData.dataPreset,
      lastEvent: snapshot?.generatedAt ? formatDateTime(snapshot.generatedAt) : undefined
    },
    {
      id: "ai-research",
      label: "AI Research",
      href: "/research",
      status: activeAiResearch ? "active" : latestCycle ? "complete" : "waiting",
      task: activeAiResearch
        ? run?.progress?.currentTask ?? "Diagnosing blockers and running scenario search."
        : latestCycle?.resultSummary ?? "Waiting for the first research cycle.",
      countLabel: run ? `${run.currentIteration}/${run.settings.maxIterations}` : undefined,
      lastEvent: latestCycle?.completedAt ?? latestCycle?.startedAt ?? iterationStartedAt
    },
    {
      id: "agent-debate",
      label: "Agent Debate / CIO",
      href: "/agent-debate",
      status: activeDebate ? "active" : latestCycle?.agentDebateConsensus ? "complete" : latestCycle ? "warning" : "waiting",
      task: activeDebate
        ? run?.progress?.currentTask ?? "Running LLM advisory and CIO interpretation."
        : latestCycle?.agentDebateConsensus
        ? `CIO consensus ${latestCycle.agentDebateConsensus.position}; facts remain immutable.`
        : "Debate summary appears after a cycle produces agent context.",
      lastEvent: latestCycle?.completedAt
    },
    {
      id: "validation",
      label: "Backtest / Validation",
      href: "/validation",
      status: activeValidation
        ? "active"
        : snapshot?.latestResearchCycle.latestValidationSummary
        ? "complete"
        : latestCycle?.backtestSummary
          ? "warning"
          : "waiting",
      task: activeValidation
        ? run?.progress?.currentTask ?? "Running backtest and validation."
        : snapshot?.latestResearchCycle.latestValidationSummary
        ? `Trades ${snapshot.latestResearchCycle.latestBacktestSummary?.totalTrades ?? 0}; validation ready.`
        : "Backtest and validation evidence not complete yet.",
      countLabel: latestCycle?.backtestSummary ? `${latestCycle.backtestSummary.totalTrades} trades` : undefined,
      lastEvent: latestCycle?.completedAt
    },
    {
      id: "walk-forward",
      label: "Walk-Forward",
      href: "/walk-forward",
      status: activeWalkForward
        ? "active"
        : walkForwardVerdict === "fail"
          ? "blocked"
          : walkForwardVerdict === "insufficient_evidence"
            ? "warning"
            : walkForwardVerdict
              ? "complete"
              : "waiting",
      task: snapshot?.walkForward.recommendedNextAction ?? "Run imported-data walk-forward before trusting a calibration.",
      countLabel: snapshot?.walkForward.windowsTested ? `${snapshot.walkForward.windowsTested} windows` : undefined,
      lastEvent: snapshot?.walkForward.latestTimestamp
    },
    {
      id: "self-improvement",
      label: "Self-Improvement",
      href: "/self-improvement",
      status: activeSelfImprovement
        ? "active"
        : latestProposal?.status === "proposed" || latestProposal?.status === "testing"
          ? "blocked"
          : latestProposal
            ? "complete"
            : "waiting",
      task: latestProposal
        ? `Proposal ${latestProposal.status}; approval or policy decision required.`
        : "No current calibration proposal.",
      countLabel: latestProposal?.proposalIntent?.replace(/_/g, " "),
      lastEvent: latestProposal?.timestamp
    },
    {
      id: "go-trader",
      label: "Go-Trader Review Gate",
      href: "/simulation-runbook",
      status: "locked",
      task: run?.goTraderHandoffGate.eligibleForReview
        ? "Review eligibility only. Handoff remains locked until human process."
        : activeReadiness
          ? run?.progress?.currentTask ?? "Updating readiness, maturity, and audit state."
        : "Locked. Simulation runbook and readiness must pass first.",
      countLabel: "review only",
      lastEvent: run?.completedAt
    },
    {
      id: "tradovate",
      label: "Tradovate Future Gate",
      status: "locked",
      task: "Future integration placeholder. No broker connection or API authority exists.",
      countLabel: "future"
    }
  ];
}

function buildActionItems(snapshot?: ResearchRuntimeSnapshot, run?: AutonomousResearchRun): MissionActionItem[] {
  const items: MissionActionItem[] = [];
  const latestProposal = snapshot?.proposal.latestProposal;
  const firstBlocker = snapshot?.readiness.actualBlockers[0];

  if (!snapshot) {
    return [
      {
        id: "snapshot-loading",
        title: "Runtime snapshot loading",
        detail: "The command center is resolving the current data source and state.",
        severity: "info"
      }
    ];
  }
  if (!snapshot.marketData.isImportedDataActive) {
    items.push({
      id: "imported-data",
      title: "Imported data unavailable",
      detail: "The loop can use mock data, but imported MNQ evidence is stronger for maturity.",
      href: "/market-data",
      severity: "warning"
    });
  }
  if (!snapshot.llm.advisoryPassed) {
    items.push({
      id: "llm-advisory",
      title: snapshot.llm.providerConfigured ? "LLM advisory not passed" : "LLM bridge unavailable",
      detail: "Paper-Demo review remains blocked until advisory-only LLM review passes.",
      href: "/llm-agents",
      severity: "action_required"
    });
  }
  if (snapshot.walkForward.verdict === "fail" || snapshot.walkForward.verdict === "insufficient_evidence") {
    items.push({
      id: "walk-forward",
      title: snapshot.walkForward.verdict === "fail" ? "Walk-forward failed" : "Walk-forward insufficient evidence",
      detail: snapshot.walkForward.recommendedNextAction,
      href: "/walk-forward",
      severity: snapshot.walkForward.verdict === "fail" ? "critical" : "warning"
    });
  }
  if (snapshot.evidence.evidenceQualityScore < 55) {
    items.push({
      id: "evidence-quality",
      title: "Evidence quality is weak",
      detail: snapshot.evidence.readinessEvidenceWarnings[0] ?? "Add real/imported evidence before advancing readiness.",
      href: "/evidence-quality",
      severity: "warning"
    });
  }
  if (snapshot.maturity.maturityScore < 45) {
    items.push({
      id: "maturity",
      title: "Research maturity too low",
      detail: snapshot.maturity.nextMaturityRequirement,
      href: "/research-maturity",
      severity: "warning"
    });
  }
  if (latestProposal?.status === "proposed" || latestProposal?.status === "testing") {
    items.push({
      id: "proposal",
      title: "Proposal review required",
      detail: `Proposal ${latestProposal.proposalId} is ${latestProposal.status}.`,
      href: `/self-improvement?proposalId=${latestProposal.proposalId}`,
      severity: "action_required"
    });
  }
  if (firstBlocker) {
    items.push({
      id: "readiness",
      title: "Readiness gate blocked",
      detail: firstBlocker,
      href: "/readiness-gate",
      severity: "action_required"
    });
  }
  if (run?.status === "paused" && run.stopReason === "regime_mismatch_detected") {
    items.unshift({
      id: "regime-mismatch",
      title: "Regime mismatch paused loop",
      detail: run.stopReasonDetail ?? "Human review required before additional calibration search.",
      href: "/autonomous-research",
      severity: "critical"
    });
  }

  return safeTopN(items, 6);
}

function buildFeedItems(run?: AutonomousResearchRun): MissionFeedItem[] {
  const communicationItems: MissionFeedItem[] = safeTopN(loadCommunicationMessages(), 8).map((message) => ({
    id: message.messageId,
    title: message.title,
    detail: message.summary,
    timestamp: message.timestamp,
    severity: message.severity,
    href: "/communications"
  }));
  const progressItems: MissionFeedItem[] = safeTopN(run?.progress?.events, 10).map((event) => ({
    id: event.eventId,
    title: event.title,
    detail: event.detail,
    timestamp: event.timestamp,
    severity:
      event.stage === "failed"
        ? "critical"
        : event.stage === "canceled" || event.stage === "paused"
          ? "warning"
          : "info",
    href: "/autonomous-research"
  }));
  const loopItems: MissionFeedItem[] = safeArray(run?.iterations).flatMap((iteration) => [
    {
      id: `iteration-${iteration.iteration}-scenario`,
      title: `Iteration ${iteration.iteration}: ${formatToken(iteration.selectedScenarioFamily)}`,
      detail: iteration.scenarioReason ?? "Scenario family selected by blocker diagnosis.",
      timestamp: iteration.startedAt,
      severity: "info" as const,
      href: "/autonomous-research"
    },
    {
      id: `iteration-${iteration.iteration}-result`,
      title: iteration.autoApplyEligibility?.applied ? "Calibration auto-applied" : "Calibration blocked or pending",
      detail: iteration.autoApplyEligibility?.reasons[0] ?? iteration.notes[0] ?? "Iteration result pending.",
      timestamp: iteration.completedAt ?? iteration.startedAt,
      severity: iteration.autoApplyEligibility?.applied ? "info" as const : "warning" as const,
      href: iteration.proposalId ? `/self-improvement?proposalId=${iteration.proposalId}` : "/autonomous-research"
    }
  ]);

  return safeTopN([...progressItems, ...loopItems, ...communicationItems].sort((a, b) => {
    const left = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const right = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return right - left;
  }), 10);
}

function buildKeyMetrics(snapshot?: ResearchRuntimeSnapshot, run?: AutonomousResearchRun) {
  const account = snapshot?.performance.simulatedAccountSummary;
  return [
    {
      label: "Readiness",
      value: snapshot?.readiness.readinessState ?? "loading",
      detail: snapshot?.readiness.actualBlockers[0] ?? "No current blocker"
    },
    {
      label: "Current blocker",
      value: snapshot?.readiness.actualBlockers[0] ?? "none",
      detail: snapshot?.readiness.nextAction ?? "Next action pending"
    },
    {
      label: "Last auto-apply",
      value: run?.latestAutoAppliedCalibrationId ?? "none",
      detail: run?.latestAutoApplyEligibility?.reasons[0] ?? "Auto-apply disabled or blocked"
    },
    {
      label: "Walk-forward",
      value: formatToken(snapshot?.walkForward.verdict),
      detail: `${snapshot?.walkForward.outOfSampleWindowsPassed ?? 0}/${snapshot?.walkForward.windowsTested ?? 0} OOS windows`
    },
    {
      label: "Maturity",
      value: `${snapshot?.maturity.maturityScore ?? 0}/100`,
      detail: snapshot?.maturity.maturityGrade.replace(/_/g, " ") ?? "untested"
    },
    {
      label: "Evidence",
      value: `${snapshot?.evidence.evidenceQualityScore ?? 0}/100`,
      detail: snapshot?.evidence.weakestEvidenceCategories[0]?.replace(/_/g, " ") ?? "ledger pending"
    },
    {
      label: "Handoff gate",
      value: run?.goTraderHandoffGate.eligibleForReview ? "review eligible" : "locked",
      detail: run?.goTraderHandoffGate.reasons[0] ?? "No execution handoff authority"
    },
    {
      label: "Sim P&L",
      value: account ? currency.format(account.realizedPnL) : "n/a",
      detail: account ? `${pct(account.winRate)} win rate / ${account.totalTrades} trades` : "Run cycle first"
    }
  ];
}
