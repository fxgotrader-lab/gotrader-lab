import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Play, ShieldCheck } from "lucide-react";

import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AutoResearchSearchMode } from "@/lib/autoResearch";
import {
  latestResearchCycleRun,
  loadResearchCycleState,
  RESEARCH_CYCLE_UPDATED_EVENT,
  runResearchCycle
} from "@/lib/researchCycle";
import type { ResearchCycleRun, ResearchCycleStepResult, ResearchCycleStepStatus } from "@/lib/researchCycle";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  DASHBOARD_IMPORTED_SAFE_WINDOW_SIZE,
  dashboardImportedSafeCandleWindowSettings,
  loadCandleWindowSettings,
  loadPreparedCandleSource,
  MARKET_DATA_IMPORT_UPDATED_EVENT,
  type PreparedCandleSource
} from "@/lib/marketData";
import {
  ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT,
  loadActiveResearchCalibration,
  resolveActiveBacktestConfig
} from "@/lib/selfImprovement";
import type { LabState } from "@/lib/types";
import { safeArray, safeTopN } from "@/lib/utils";

import { formatDateTime } from "./dashboardFormatters";

type ResearchCycleControlProps = {
  state: LabState;
  onCycleUpdate?: () => void;
};

const statusVariant = (status?: ResearchCycleRun["status"]) =>
  status === "completed"
    ? "success"
    : status === "completed_with_warnings" || status === "running"
      ? "warning"
      : status === "failed"
        ? "danger"
        : "secondary";

const stepVariant = (status: ResearchCycleStepStatus) =>
  status === "passed" || status === "completed"
    ? "success"
    : status === "failed"
      ? "danger"
      : status === "warning"
        ? "warning"
        : status === "running"
          ? "secondary"
          : "muted";

const stepIcon = (status: ResearchCycleStepStatus) => {
  if (status === "passed" || status === "completed") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />;
  }
  if (status === "failed" || status === "warning") {
    return <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />;
  }
  if (status === "running") {
    return <Loader2 className="h-4 w-4 animate-spin text-cyan-300" aria-hidden="true" />;
  }
  return <CircleDashed className="h-4 w-4 text-slate-500" aria-hidden="true" />;
};

const formatStatus = (status?: string) => (status ?? "idle").replace(/_/g, " ");
const formatPercent = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : "n/a";
const dashboardSearchModes: Array<{ label: string; value: AutoResearchSearchMode; count: number }> = [
  { label: "Quick - 5 candidates", value: "quick", count: 5 },
  { label: "Standard - 10 candidates", value: "standard", count: 10 },
  { label: "Deep - 25 candidates", value: "deep", count: 25 }
];

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

export function ResearchCycleControl({ state, onCycleUpdate }: ResearchCycleControlProps) {
  const [cycleState, setCycleState] = useState(() => loadResearchCycleState());
  const [activeRun, setActiveRun] = useState<ResearchCycleRun>();
  const [activeCalibration, setActiveCalibration] = useState(() => loadActiveResearchCalibration());
  const [activeConfigResolution, setActiveConfigResolution] = useState(() => resolveActiveBacktestConfig());
  const [activeCandleSource, setActiveCandleSource] = useState<PreparedCandleSource>(fallbackCandleSource);
  const [searchMode, setSearchMode] = useState<AutoResearchSearchMode>("standard");
  const [advancedFullResearchMode, setAdvancedFullResearchMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const latestRun = activeRun ?? latestResearchCycleRun(cycleState);
  const importedSafeMode = activeCandleSource.mode === "imported" && !advancedFullResearchMode;
  const effectiveSearchMode = importedSafeMode ? "quick" : searchMode;
  const selectedSearchMode = dashboardSearchModes.find((mode) => mode.value === effectiveSearchMode) ?? dashboardSearchModes[0];
  const dashboardPreset = activeCandleSource.mode === "imported"
    ? advancedFullResearchMode
      ? "Advanced"
      : "Safe"
    : "Mock";
  const researchCalibrationAvailable = Boolean(
    latestRun?.createdProposalId && latestRun.autoResearchCycle?.noSafePaperDemoCandidateFound
  );
  const actualBlockers = useMemo(() => {
    if (!latestRun) {
      return [];
    }
    return [
      ...safeArray(latestRun.readinessSnapshot?.failedRequirements).map((requirement) => requirement.label),
      ...(!latestRun.llmRun?.advisoryPassed ? ["LLM advisory review required before Paper-Demo Candidate."] : [])
    ].filter((item, index, array) => item && array.indexOf(item) === index);
  }, [latestRun]);
  const passedRequirements = useMemo(
    () => safeArray(latestRun?.readinessSnapshot?.passedRequirements).map((requirement) => requirement.label),
    [latestRun]
  );
  const readinessWarnings = useMemo(
    () => [
      ...safeArray(latestRun?.readinessSnapshot?.warnings),
      ...safeArray(latestRun?.candleWindowWarnings)
    ],
    [latestRun]
  );
  const topTradeQualityIssue =
    safeArray(latestRun?.tradeQualityDiagnostics).find((item) => item.severity === "blocking") ??
    safeArray(latestRun?.tradeQualityDiagnostics).find((item) => item.severity === "warning") ??
    safeArray(latestRun?.tradeQualityDiagnostics)[0];

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      setCycleState(loadResearchCycleState());
      setActiveCalibration(loadActiveResearchCalibration());
      setActiveConfigResolution(resolveActiveBacktestConfig());
      loadPreparedCandleSource().then(async (source) => {
        const preparedSource =
          source.mode === "imported" && !advancedFullResearchMode
            ? await loadPreparedCandleSource(dashboardImportedSafeCandleWindowSettings)
            : source;
        if (mounted) {
          setActiveCandleSource(preparedSource);
        }
      });
    };
    refresh();
    window.addEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
    window.addEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      mounted = false;
      window.removeEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
      window.removeEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [advancedFullResearchMode]);

  const progress = useMemo(() => {
    const steps = safeArray(latestRun?.steps);
    const terminalSteps = steps.filter((step) => ["passed", "completed", "warning", "failed", "skipped"].includes(step.status)).length;
    return {
      total: steps.length,
      done: terminalSteps,
      percent: steps.length ? Math.round((terminalSteps / steps.length) * 100) : 0
    };
  }, [latestRun]);

  const runCycle = async () => {
    setBusy(true);
    setActiveRun(undefined);
    try {
      const result = await runResearchCycle({
        state,
        searchMode: effectiveSearchMode,
        maxCandidateCount: selectedSearchMode.count,
        candleWindowSettings:
          activeCandleSource.mode === "imported" && !advancedFullResearchMode
            ? dashboardImportedSafeCandleWindowSettings
            : activeCandleSource.appliedSettings,
        advancedFullResearchMode,
        skipHeavyAudit: activeCandleSource.mode === "imported" && !advancedFullResearchMode,
        onUpdate: (run) => {
          setActiveRun(run);
          onCycleUpdate?.();
        }
      });
      setActiveRun(result);
      setCycleState(loadResearchCycleState());
      setActiveCalibration(loadActiveResearchCalibration());
      setActiveConfigResolution(resolveActiveBacktestConfig());
      onCycleUpdate?.();
    } finally {
      setBusy(false);
    }
  };

  const updateAdvancedFullResearchMode = (enabled: boolean) => {
    if (
      enabled &&
      typeof window !== "undefined" &&
      !window.confirm("Large imported datasets may freeze the browser. Use small windows first.")
    ) {
      return;
    }
    setAdvancedFullResearchMode(enabled);
  };

  const previousDataSizeFailure =
    latestRun?.status === "failed" &&
    latestRun.dataSourceMode === "imported" &&
    /dataset|browser|processing|safe limit|large|too large/i.test(
      `${latestRun.failedStepDetails ?? ""} ${latestRun.resultSummary ?? ""}`
    );

  return (
    <Card className="border-cyan-400/25 bg-cyan-950/20">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-cyan-50">
            <ShieldCheck className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            AI Research Cycle
          </CardTitle>
          <p className="mt-1 text-sm text-cyan-100/70">
            One safe sequence for thesis generation, backtesting, LLM advisory, Auto Research, validation, quality review,
            proposals, readiness, and audit logging.
          </p>
        </div>
        <Badge variant={statusVariant(latestRun?.status)} className="w-fit capitalize">
          {formatStatus(latestRun?.status)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <SafetyLockBanner
          message="Research cycle only. Broker execution remains disabled."
          className="border-cyan-400/20 bg-cyan-400/10 text-cyan-50"
        />

        <div className="grid gap-3 lg:grid-cols-[1fr_260px] lg:items-end">
          <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Latest result</p>
                <p className="mt-1 text-sm font-medium text-slate-100">
                  {latestRun?.resultSummary ?? "No dashboard research cycle has been run yet."}
                </p>
              </div>
              <Badge variant="secondary">{progress.done}/{progress.total || 7} steps</Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-cyan-300 transition-all"
                style={{ width: `${progress.percent}%` }}
                aria-hidden="true"
              />
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Last run: {formatDateTime(latestRun?.completedAt ?? latestRun?.startedAt)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <Badge variant={activeCandleSource.mode === "imported" ? "success" : "secondary"}>
                {activeCandleSource.mode === "imported" ? "Imported historical data active" : "Mock candles active"}
              </Badge>
              <span className="text-slate-400">
                {activeCandleSource.label}
                {activeCandleSource.mode === "imported"
                  ? ` / raw ${activeCandleSource.rawCandleCount.toLocaleString()} / window ${activeCandleSource.researchWindowCandles.toLocaleString()} / ${activeCandleSource.processedCandleCount.toLocaleString()} ${activeCandleSource.appliedSettings.targetTimeframe}`
                  : ""}
              </span>
            </div>
            <div className="mt-3 grid gap-2 rounded-md border border-white/10 bg-slate-950/45 p-2 text-xs text-slate-300 md:grid-cols-6">
              <div>
                <p className="uppercase tracking-[0.14em] text-slate-500">Data source</p>
                <p className="mt-1 font-mono text-slate-100">
                  {activeCandleSource.mode === "imported" ? activeCandleSource.metadata?.symbol ?? "Imported" : "Mock"}
                </p>
              </div>
              <div>
                <p className="uppercase tracking-[0.14em] text-slate-500">Raw candles</p>
                <p className="mt-1 font-mono text-slate-100">{activeCandleSource.rawCandleCount.toLocaleString()}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.14em] text-slate-500">Using window</p>
                <p className="mt-1 font-mono text-slate-100">{activeCandleSource.researchWindowCandles.toLocaleString()}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.14em] text-slate-500">Research timeframe</p>
                <p className="mt-1 font-mono text-slate-100">{activeCandleSource.appliedSettings.targetTimeframe}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.14em] text-slate-500">Performance mode</p>
                <p className="mt-1 font-mono text-slate-100">{activeCandleSource.performanceMode}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.14em] text-slate-500">Research preset</p>
                <p className="mt-1 font-mono text-slate-100">{dashboardPreset}</p>
              </div>
            </div>
            {previousDataSizeFailure ? (
              <div className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-2 text-xs text-amber-100">
                Last run may have exceeded browser limits. Safe mode is recommended.
              </div>
            ) : null}
            {activeCandleSource.warnings.length ? (
              <div className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-2 text-xs text-amber-100">
                {activeCandleSource.warnings[0]}
              </div>
            ) : null}
            {latestRun?.candidateProgress ? (
              <div className="mt-3 rounded-md border border-cyan-400/15 bg-cyan-400/5 p-2 text-xs text-cyan-100/80">
                Pass {latestRun.candidateProgress.passNumber ?? 1}/{latestRun.candidateProgress.totalPasses ?? 1} - candidate{" "}
                {latestRun.candidateProgress.currentCandidate}/{latestRun.candidateProgress.totalCandidates} tested. Best so far:{" "}
                {latestRun.candidateProgress.bestCandidateLabel ?? "none"}.
                {safeArray(latestRun.candidateProgress.failedGatesTargeted).length ? (
                  <span className="block pt-1">
                    Targeting: {safeArray(latestRun.candidateProgress.failedGatesTargeted).map((gate) => gate.replace(/_/g, " ")).join(", ")}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="dashboard-research-depth" className="text-cyan-100">
              Search depth
            </Label>
            <Select
              id="dashboard-research-depth"
              disabled={busy || importedSafeMode}
              value={effectiveSearchMode}
              options={dashboardSearchModes.map((mode) => ({ label: mode.label, value: mode.value }))}
              onChange={(event) => setSearchMode(event.target.value as AutoResearchSearchMode)}
            />
            {importedSafeMode ? (
              <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 p-2 text-xs text-cyan-50">
                Imported data Safe preset is active: latest {DASHBOARD_IMPORTED_SAFE_WINDOW_SIZE.toLocaleString()} raw candles,
                5m aggregation, quick search, 5 candidates, one adaptive pass, compact audit.
              </div>
            ) : null}
            {activeCandleSource.mode === "imported" ? (
              <label className="flex items-start gap-2 rounded-md border border-white/10 bg-slate-950/50 p-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={advancedFullResearchMode}
                  disabled={busy}
                  onChange={(event) => updateAdvancedFullResearchMode(event.target.checked)}
                />
                <span>
                  Advanced full research mode
                  <span className="block text-slate-500">
                    Required for 2,000+ raw candles, deep search, and full audit traces.
                  </span>
                </span>
              </label>
            ) : null}
            <Button onClick={runCycle} disabled={busy} className="h-12 w-full justify-center gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              Run AI Research Cycle
            </Button>
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border border-white/10 bg-slate-950/55 p-3 text-xs text-slate-300 md:grid-cols-3">
          <div>
            <p className="uppercase tracking-[0.14em] text-slate-500">Active calibration storage found</p>
            <p className="mt-1 font-mono text-slate-100">
              {activeConfigResolution.activeCalibrationStorageFound ? "yes" : "no"}
            </p>
          </div>
          <div>
            <p className="uppercase tracking-[0.14em] text-slate-500">Config merge status</p>
            <p className="mt-1 font-mono text-slate-100">{activeConfigResolution.mergeStatusLabel}</p>
          </div>
          <div>
            <p className="uppercase tracking-[0.14em] text-slate-500">Resolved threshold</p>
            <p className="mt-1 font-mono text-slate-100">
              {(activeConfigResolution.finalBacktestConfluenceThreshold * 100).toFixed(0)}%
            </p>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" aria-live="polite">
          {safeArray(latestRun?.steps).map((step) => (
            <ResearchCycleStep key={step.stepId} step={step} />
          ))}
          {!latestRun ? (
            <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-400 md:col-span-2 xl:col-span-4">
              Run the cycle to see step-by-step progress.
            </div>
          ) : null}
        </div>

        {latestRun?.failedStepDetails ? (
          <div className="rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-100">
            <p className="font-medium">Failed step details</p>
            <p className="mt-1">{latestRun.failedStepDetails}</p>
          </div>
        ) : null}

        {latestRun ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Final readiness</p>
              <p className="mt-1 font-semibold text-slate-100">{latestRun.readinessSnapshot?.state ?? "Not evaluated"}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Best candidate</p>
              <p className="mt-1 truncate font-semibold text-slate-100">{latestRun.bestCandidateSummary?.label ?? "None selected"}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Proposal</p>
              {latestRun.createdProposalId ? (
                <Link
                  to={`/self-improvement?proposalId=${encodeURIComponent(latestRun.createdProposalId)}`}
                  className="mt-1 block truncate font-semibold text-cyan-100 hover:text-cyan-50"
                >
                  {researchCalibrationAvailable ? "Research calibration proposal available" : latestRun.createdProposalId}
                </Link>
              ) : (
                <p className="mt-1 truncate font-semibold text-slate-100">{latestRun.proposalStatus ?? "No proposal"}</p>
              )}
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Blockers</p>
              <p className="mt-1 font-semibold text-slate-100">{actualBlockers.length}</p>
            </div>
          </div>
        ) : null}

        {activeCalibration ? (
          <div className={`rounded-lg border p-3 text-sm ${
            activeConfigResolution.activeCalibrationApplied
              ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
              : "border-amber-300/25 bg-amber-300/10 text-amber-100"
          }`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {activeConfigResolution.activeCalibrationApplied
                    ? "Using approved research baseline"
                    : "Approved calibration exists but was not merged"}
                </p>
                <p className="mt-1">
                  Active calibration: {activeCalibration.approvedCalibrationId}. Active confluence threshold{" "}
                  {(activeConfigResolution.finalBacktestConfluenceThreshold * 100).toFixed(0)}%. Config merge:{" "}
                  {activeConfigResolution.mergeStatusLabel}.
                </p>
                {activeConfigResolution.mergeError ? <p className="mt-1">{activeConfigResolution.mergeError}</p> : null}
              </div>
              <Badge variant={activeConfigResolution.activeCalibrationApplied ? "success" : "warning"}>
                approved calibration
              </Badge>
            </div>
          </div>
        ) : null}

        {latestRun ? (
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              <p className="font-medium">Actual blockers</p>
              {actualBlockers.length ? (
                <ul className="mt-2 space-y-1">
                  {safeTopN(actualBlockers, 4).map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-amber-100/75">No active readiness blockers reported.</p>
              )}
            </div>
            <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">
              <p className="font-medium">Passed requirements</p>
              {passedRequirements.length ? (
                <ul className="mt-2 space-y-1">
                  {safeTopN(passedRequirements, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-emerald-100/75">No passed requirements recorded yet.</p>
              )}
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
              <p className="font-medium text-slate-100">Warnings and next action</p>
              {readinessWarnings.length ? (
                <ul className="mt-2 space-y-1">
                  {safeTopN(readinessWarnings, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-slate-400">No readiness warnings recorded.</p>
              )}
              <p className="mt-2 text-cyan-100">{latestRun.nextRecommendedAction}</p>
            </div>
          </div>
        ) : null}

        {latestRun?.backtestSummary && latestRun.backtestSummary.totalTrades > 0 ? (
          <div className="rounded-lg border border-violet-300/25 bg-violet-300/10 p-3 text-sm text-violet-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">Trade Quality Diagnostics</p>
                <p className="mt-1">
                  Top issue: {topTradeQualityIssue?.reasonCode.replace(/_/g, " ") ?? "none detected"}.{" "}
                  {topTradeQualityIssue?.suggestedFix ?? "Keep validating trade quality before readiness review."}
                </p>
              </div>
              <Badge variant={topTradeQualityIssue?.severity === "blocking" ? "danger" : topTradeQualityIssue ? "warning" : "success"}>
                {topTradeQualityIssue?.severity ?? "stable"}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <div className="rounded-md border border-violet-200/20 bg-violet-200/5 p-2">
                <p className="text-xs uppercase tracking-[0.14em] text-violet-100/70">Win rate</p>
                <p className="mt-1 font-mono">{formatPercent(latestRun.backtestSummary.winRate)}</p>
              </div>
              <div className="rounded-md border border-violet-200/20 bg-violet-200/5 p-2">
                <p className="text-xs uppercase tracking-[0.14em] text-violet-100/70">Average R</p>
                <p className="mt-1 font-mono">{latestRun.backtestSummary.averageR.toFixed(2)}R</p>
              </div>
              <div className="rounded-md border border-violet-200/20 bg-violet-200/5 p-2">
                <p className="text-xs uppercase tracking-[0.14em] text-violet-100/70">Max drawdown</p>
                <p className="mt-1 font-mono">{latestRun.backtestSummary.maxDrawdown.toFixed(2)}R</p>
              </div>
              <div className="rounded-md border border-violet-200/20 bg-violet-200/5 p-2">
                <p className="text-xs uppercase tracking-[0.14em] text-violet-100/70">Recommended test</p>
                <p className="mt-1">{topTradeQualityIssue?.candidateConfigHints[0]?.label ?? "Run trade quality optimizer"}</p>
              </div>
            </div>
          </div>
        ) : null}

        {latestRun?.backtestSummary?.totalTrades === 0 ? (
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            {(() => {
              const recoveryMetadata = latestRun.autoResearchCycle?.recoveryMetadata;
              const topDiagnostic = safeArray(latestRun.backtestDiagnostics)[0];
              const observedConfluence = recoveryMetadata?.observedICTConfluence ?? topDiagnostic?.observedConfluenceScore;
              const proposedThreshold = recoveryMetadata?.proposedConfluenceThreshold ?? topDiagnostic?.suggestedConfluenceThreshold;
              const recoveryThreshold =
                recoveryMetadata?.recoveryConfluenceThreshold ??
                latestRun.autoResearchCycle?.recoveryResult?.config.minimumConfluenceThreshold;
              return (
                <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">No trades generated</p>
                <p className="mt-1">
                  {safeArray(latestRun.backtestDiagnostics)[0]?.explanation ??
                    "The strategy cannot be evaluated until at least one simulated trade is generated."}
                </p>
              </div>
              <Badge variant="warning">cannot evaluate</Badge>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-md border border-amber-200/20 bg-amber-200/5 p-2">
                <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Top reason</p>
                <p className="mt-1">{safeArray(latestRun.backtestDiagnostics)[0]?.reasonCode.replace(/_/g, " ") ?? "unknown"}</p>
              </div>
              <div className="rounded-md border border-amber-200/20 bg-amber-200/5 p-2">
                <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Recovery attempted</p>
                <p className="mt-1">{latestRun.autoResearchCycle?.recoveryAttempted ? "yes" : "not yet"}</p>
              </div>
              <div className="rounded-md border border-amber-200/20 bg-amber-200/5 p-2">
                <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Trades after recovery</p>
                <p className="mt-1">{latestRun.autoResearchCycle?.tradesAfterRecovery ?? 0}</p>
              </div>
              <div className="rounded-md border border-amber-200/20 bg-amber-200/5 p-2">
                <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Active threshold</p>
                <p className="mt-1">{((latestRun.activeConfluenceThreshold ?? latestRun.backtestSummary.config.minimumConfluenceThreshold) * 100).toFixed(0)}%</p>
              </div>
              <div className="rounded-md border border-amber-200/20 bg-amber-200/5 p-2">
                <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Recovery threshold</p>
                <p className="mt-1">{formatPercent(recoveryThreshold)}</p>
              </div>
              <div className="rounded-md border border-amber-200/20 bg-amber-200/5 p-2">
                <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Observed ICT confluence</p>
                <p className="mt-1">{formatPercent(observedConfluence)}</p>
              </div>
              <div className="rounded-md border border-amber-200/20 bg-amber-200/5 p-2">
                <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Proposed threshold</p>
                <p className="mt-1">{formatPercent(proposedThreshold)}</p>
              </div>
              <div className="rounded-md border border-amber-200/20 bg-amber-200/5 p-2">
                <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Config merge</p>
                <p className="mt-1">{latestRun.activeCalibrationMergeLabel ?? (latestRun.activeCalibrationApplied ? "active calibration applied" : "default baseline")}</p>
              </div>
            </div>
            {latestRun.activeCalibrationId && !latestRun.activeCalibrationApplied ? (
              <div className="mt-3 rounded-md border border-amber-200/20 bg-amber-200/5 p-2 text-xs text-amber-100">
                Approved calibration exists but was not merged. Check the active patch and storage summary before creating another proposal.
              </div>
            ) : null}
            <p className="mt-3 text-xs text-amber-100/80">
              Next action: {safeArray(latestRun.backtestDiagnostics)[0]?.suggestedFix ?? "Run bounded recovery in Auto Research, then rerun validation."}
            </p>
            {latestRun.createdProposalId && latestRun.autoResearchCycle?.recoveryAttempted && (latestRun.autoResearchCycle.tradesAfterRecovery ?? 0) > 0 ? (
              <div className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">
                Research calibration proposal available: calibrate threshold to recovery-tested level.
              </div>
            ) : null}
                </>
              );
            })()}
          </div>
        ) : null}

        {researchCalibrationAvailable && latestRun?.backtestSummary?.totalTrades !== 0 ? (
          <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">
            Research calibration proposal available. This is a baseline-improvement proposal only, not a Paper-Demo Candidate approval.
          </div>
        ) : null}

        {safeArray(latestRun?.autoResearchCycle?.adaptivePasses).length ? (
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/70">Adaptive improvement</p>
                <p className="mt-1 text-sm font-medium text-cyan-50">
                  Final result: {formatStatus(latestRun?.autoResearchCycle?.finalOutcome ?? latestRun?.autoResearchCycle?.finalResultCategory)}
                </p>
              </div>
              <Badge variant={latestRun?.autoResearchCycle?.noSafePaperDemoCandidateFound ? "warning" : "success"}>
                {latestRun?.autoResearchCycle?.noSafePaperDemoCandidateFound ? "continue research" : "candidate found"}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {safeArray(latestRun?.autoResearchCycle?.adaptivePasses).map((pass) => (
                <div key={pass.passNumber} className="rounded-md border border-white/10 bg-slate-950/45 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-100">Pass {pass.passNumber}</span>
                    <Badge variant={pass.improvementOverPriorPass ? "success" : "muted"}>
                      {pass.improvementOverPriorPass ? "improved" : "no lift"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-slate-400">{pass.reasonForPass}</p>
                  <p className="mt-2 text-cyan-100/80">
                    Tried: {safeArray(pass.targetedChanges).length ? safeArray(pass.targetedChanges).join(", ") : "bounded baseline candidates"}
                  </p>
                  <p className="mt-1 text-slate-400">
                    Best: {pass.bestCandidatePerPass?.label ?? "none"} ({formatStatus(pass.finalOutcome)})
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Recommended next action</p>
          <p className="mt-1">{latestRun?.nextRecommendedAction ?? "Start with a research cycle, then review any warnings or proposals."}</p>
        </div>

        <TechnicalDetails
          title="Active calibration diagnostics"
          description="Open to inspect active patch storage and the final threshold used by dashboard research cycles."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Active calibration storage found", activeConfigResolution.activeCalibrationStorageFound ? "yes" : "no"],
              ["Config merge status", activeConfigResolution.mergeStatusLabel],
              ["Stored active ID", activeConfigResolution.activeCalibrationId ?? "none"],
              ["Default threshold", `${(activeConfigResolution.defaultConfluenceThreshold * 100).toFixed(0)}%`],
              ["Saved threshold", `${(activeConfigResolution.savedConfluenceThreshold * 100).toFixed(0)}%`],
              ["Resolved threshold", `${(activeConfigResolution.finalBacktestConfluenceThreshold * 100).toFixed(0)}%`]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-slate-950/45 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
                <p className="mt-1 break-words font-mono text-sm text-slate-100">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/45 p-3 text-xs text-slate-400">
            <div>Merge status: {activeConfigResolution.mergeStatusLabel}</div>
            <div>Source trace: {activeConfigResolution.sourceTrace.join(" + ")}</div>
            <div>Active patch: {JSON.stringify(activeConfigResolution.appliedPatch ?? {})}</div>
            <div>Last run final threshold: {latestRun?.finalBacktestConfluenceThreshold !== undefined ? `${(latestRun.finalBacktestConfluenceThreshold * 100).toFixed(0)}%` : "n/a"}</div>
            {activeConfigResolution.mergeError ? <div className="text-amber-100">Merge warning: {activeConfigResolution.mergeError}</div> : null}
          </div>
        </TechnicalDetails>
      </CardContent>
    </Card>
  );
}

function ResearchCycleStep({ step }: { step: ResearchCycleStepResult }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {stepIcon(step.status)}
          <p className="truncate text-sm font-medium text-slate-100">{step.label}</p>
        </div>
        <Badge variant={stepVariant(step.status)} className="shrink-0 capitalize">
          {formatStatus(step.status)}
        </Badge>
      </div>
      <p className="mt-2 line-clamp-3 text-xs text-slate-400">{step.error ?? step.warning ?? step.summary}</p>
      {step.detail ? <p className="mt-2 line-clamp-2 text-xs text-slate-500">{step.detail}</p> : null}
    </div>
  );
}
