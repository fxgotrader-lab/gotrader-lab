import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, BrainCircuit, ClipboardList, Play, ShieldAlert, SlidersHorizontal, Trophy } from "lucide-react";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  AUTO_RESEARCH_UPDATED_EVENT,
  autoResearchSearchModeDefaults,
  autoResearchSearchModes,
  clearAutoResearchHistory,
  estimateAutoResearchStateSize,
  latestAutoResearchCycle,
  loadAutoResearchState,
  runAutoResearchCycle
} from "@/lib/autoResearch";
import type {
  AutoResearchCandidateResult,
  AutoResearchSearchMode,
  AutoResearchState
} from "@/lib/autoResearch";
import { describeBacktestConfig, sanitizeBacktestConfig } from "@/lib/backtesting";
import {
  ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT,
  resolveActiveBacktestConfig
} from "@/lib/selfImprovement";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  loadCandleWindowSettings,
  loadPreparedCandleSource,
  MARKET_DATA_IMPORT_UPDATED_EVENT,
  type PreparedCandleSource
} from "@/lib/marketData";
import { formatPercent, formatSigned, safeArray, safeTopN } from "@/lib/utils";

const searchModeOptions = autoResearchSearchModes.map((mode) => ({
  label: mode.replace(/_/g, " "),
  value: mode
}));
const maxCandidateOptions = [2, 3, 4, 6, 8, 10, 12].map((count) => ({
  label: `${count} candidates`,
  value: String(count)
}));
const multiPassCandidateOptions = [5, 10, 25].map((count) => ({
  label: `${count} candidates`,
  value: String(count)
}));
const statusVariant = (status?: string) =>
  status === "proposal_created" || status === "completed"
    ? "success"
    : status === "failed"
      ? "danger"
      : status === "running"
        ? "warning"
        : "muted";

const formatProfitFactor = (value: number | null) => (value === null ? "n/a" : value >= 99 ? "uncapped" : value.toFixed(2));
const formatBytes = (bytes?: number) => {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "N/A";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
};
const categoryVariant = (category?: string) =>
  category === "paper_demo_candidate"
    ? "success"
    : category === "research_ready" || category === "research_ready_candidate" || category === "improved_but_not_ready"
      ? "warning"
      : category === "unsafe_overfit"
        ? "danger"
        : "muted";
const formatToken = (value?: string) => (value ?? "none").replace(/_/g, " ");
const formatOptionalPercent = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? formatPercent(value) : "n/a";
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
const metricValue = (candidate: AutoResearchCandidateResult) => ({
  totalTrades: candidate.metrics?.totalTrades ?? 0,
  winRate: candidate.metrics?.winRate ?? 0,
  averageR: candidate.metrics?.averageR ?? 0,
  maxDrawdown: candidate.metrics?.maxDrawdown ?? 0,
  falsePositiveCount: candidate.metrics?.falsePositiveCount ?? 0,
  profitFactor: candidate.metrics?.profitFactor ?? null,
  confidenceCalibration: candidate.metrics?.confidenceCalibration ?? 0
});
const scoreValue = (candidate?: AutoResearchCandidateResult) => candidate?.scoreBreakdown?.totalScore ?? 0;

const CandidateTable = ({ candidates }: { candidates: AutoResearchCandidateResult[] }) => (
  <div className="overflow-x-auto rounded-lg border border-border">
    <table className="w-full min-w-[1220px] text-left text-sm">
      <thead className="border-b border-border bg-muted/45 text-xs uppercase text-muted-foreground">
        <tr>
          <th className="px-3 py-3 font-medium">Candidate</th>
          <th className="px-3 py-3 font-medium">Category</th>
          <th className="px-3 py-3 text-right font-medium">Score</th>
          <th className="px-3 py-3 text-right font-medium">Trades</th>
          <th className="px-3 py-3 text-right font-medium">Win</th>
          <th className="px-3 py-3 text-right font-medium">Avg R</th>
          <th className="px-3 py-3 text-right font-medium">Max DD</th>
          <th className="px-3 py-3 text-right font-medium">False +</th>
          <th className="px-3 py-3 text-right font-medium">PF</th>
          <th className="px-3 py-3 font-medium">Readiness</th>
          <th className="px-3 py-3 font-medium">Changed</th>
          <th className="px-3 py-3 font-medium">Why not selected</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {candidates.map((candidate) => (
          // Stored cycles from earlier prototypes may not have every multi-pass field yet.
          // Keep display defensive so older localStorage state does not break the page.
          (() => {
            const readinessState = candidate.readinessEstimate?.state ?? "Not Ready";
            const rejectionReasons = safeArray(candidate.rejectionReasons);
            const metrics = metricValue(candidate);
            return (
          <tr key={candidate.candidateId} className="align-top">
            <td className="px-3 py-3">
              <div className="font-medium">{candidate.label}</div>
              <div className="mt-1 max-w-md text-xs text-muted-foreground">{candidate.rationale}</div>
            </td>
            <td className="px-3 py-3">
              <Badge variant={categoryVariant(candidate.resultCategory)}>{formatToken(candidate.resultCategory)}</Badge>
            </td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{scoreValue(candidate)}</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{metrics.totalTrades}</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{formatPercent(metrics.winRate, 0)}</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{formatSigned(metrics.averageR, 2)}R</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{metrics.maxDrawdown.toFixed(2)}R</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{metrics.falsePositiveCount}</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{formatProfitFactor(metrics.profitFactor)}</td>
            <td className="px-3 py-3">
              <Badge variant={readinessState === "Paper-Demo Candidate" ? "success" : readinessState === "Research Ready" ? "warning" : "danger"}>
                {readinessState}
              </Badge>
            </td>
            <td className="px-3 py-3">
              <div className="flex flex-wrap gap-1">
                {safeArray(candidate.changedParameters).map((item) => (
                  <Badge key={item} variant="muted">{item}</Badge>
                ))}
              </div>
            </td>
            <td className="px-3 py-3 text-xs text-muted-foreground">
              {rejectionReasons.length ? rejectionReasons.join(" ") : "Selected or eligible for proposal review."}
            </td>
          </tr>
            );
          })()
        ))}
      </tbody>
    </table>
    {!candidates.length ? (
      <div className="p-3 text-sm text-muted-foreground">Run an Auto Research cycle to compare candidates.</div>
    ) : null}
  </div>
);

export function AutoResearchView() {
  const [state, setState] = useState<AutoResearchState>(() => loadAutoResearchState());
  const [searchMode, setSearchMode] = useState<AutoResearchSearchMode>("standard");
  const [maxCandidateCount, setMaxCandidateCount] = useState("10");
  const [isRunning, setIsRunning] = useState(false);
  const [configRefreshKey, setConfigRefreshKey] = useState(0);
  const [activeCandleSource, setActiveCandleSource] = useState<PreparedCandleSource>(fallbackCandleSource);
  const baselineResolution = useMemo(() => {
    const resolved = resolveActiveBacktestConfig();
    if (!activeCandleSource.metadata) {
      return resolved;
    }
    const sourceConfig = sanitizeBacktestConfig({
      ...resolved.config,
      symbol: activeCandleSource.metadata.symbol,
      timeframe: activeCandleSource.appliedSettings.targetTimeframe
    });
    return { ...resolved, config: sourceConfig };
  }, [state.latestCycleId, configRefreshKey, activeCandleSource]);
  const baselineConfig = baselineResolution.config;
  const latestCycle = latestAutoResearchCycle(state);
  const bestCandidate = latestCycle?.bestCandidate;
  const topCandidates = latestCycle?.closestCandidates?.length
    ? safeArray(latestCycle.closestCandidates)
    : safeTopN([...safeArray(latestCycle?.candidateResults)].sort((a, b) => scoreValue(b) - scoreValue(a)), 3);
  const storedSize = estimateAutoResearchStateSize(state);
  const candidateSummaryCount = safeArray(state.cycles).reduce((sum, cycle) => sum + safeArray(cycle.candidateResults).length, 0);
  const hasIncompleteData = Boolean(
    latestCycle &&
      (!Array.isArray(latestCycle.candidateResults) ||
        !Array.isArray(latestCycle.rejectedCandidates) ||
        !Array.isArray(latestCycle.closestCandidates) ||
        safeArray(latestCycle.candidateResults).some(
          (candidate) => !candidate.metrics || !candidate.scoreBreakdown || !Array.isArray(candidate.rejectionReasons)
        ))
  );
  const bestCandidateStable = Boolean(bestCandidate?.scoreBreakdown?.stabilityImproved);
  const researchCalibrationProposalCreated = Boolean(
    latestCycle?.createdProposalId && latestCycle.noSafePaperDemoCandidateFound
  );

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      setState(loadAutoResearchState());
      setConfigRefreshKey((value) => value + 1);
      loadPreparedCandleSource().then((source) => {
        if (mounted) {
          setActiveCandleSource(source);
        }
      });
    };
    refresh();
    window.addEventListener(AUTO_RESEARCH_UPDATED_EVENT, refresh);
    window.addEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      mounted = false;
      window.removeEventListener(AUTO_RESEARCH_UPDATED_EVENT, refresh);
      window.removeEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const runCycle = () => {
    setIsRunning(true);
    const cycle = runAutoResearchCycle({
      searchMode,
      maxCandidateCount: Number(maxCandidateCount),
      createProposal: true,
      candles: activeCandleSource.candles,
      baselineConfig
    });
    setState(loadAutoResearchState());
    setIsRunning(false);
    if (cycle.status === "failed") {
      window.alert(cycle.error ?? "Auto Research cycle failed.");
    }
  };

  const clearHistory = () => {
    if (!window.confirm("Clear Auto Research history? Validation, readiness, and self-improvement data will not be deleted.")) {
      return;
    }
    setState(clearAutoResearchHistory());
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Autonomous research</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Auto Research Supervisor</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Search bounded research configurations, run active candle-source validation, compare stability, and create
            approval-gated calibration proposals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">Simulation only</Badge>
          <Badge variant="muted">No execution authority</Badge>
          <Badge variant={activeCandleSource.mode === "imported" ? "success" : "muted"}>
            {activeCandleSource.mode === "imported" ? "Imported history active" : "Mock candles"}
          </Badge>
        </div>
      </div>

      <Card className="border-amber-300/25 bg-amber-300/10">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <span>
              Auto Research may create calibration proposals, but cannot execute trades, enable broker/demo/live mode,
              or override readiness.
            </span>
          </div>
          <Badge variant="warning">Approval required</Badge>
        </CardContent>
      </Card>

      {state.storageWarning ? (
        <Card className="border-amber-300/25 bg-amber-300/10">
          <CardContent className="p-4 text-sm text-amber-100">
            {state.storageWarning}
          </CardContent>
        </Card>
      ) : null}

      {hasIncompleteData ? (
        <Card className="border-amber-300/25 bg-amber-300/10">
          <CardContent className="p-4 text-sm text-amber-100">
            Auto Research returned incomplete data. Safe defaults were applied.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Baseline and Search Controls</CardTitle>
            </div>
            <CardDescription>Active simulation settings are used as the baseline. They are not changed automatically.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-background/45 p-3 font-mono text-sm text-slate-200">
              {describeBacktestConfig(baselineConfig)}
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3 text-xs text-muted-foreground">
              Config merge: {baselineResolution.mergeStatusLabel}. Final confluence threshold{" "}
              {(baselineResolution.finalBacktestConfluenceThreshold * 100).toFixed(0)}%.
              {baselineResolution.activeCalibrationId ? ` Active calibration ${baselineResolution.activeCalibrationId}.` : ""}
            </div>
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs text-cyan-50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  Data source: {activeCandleSource.mode === "imported" ? activeCandleSource.metadata?.symbol ?? "Imported" : "Mock candles"}
                </span>
                <Badge variant={activeCandleSource.performanceMode === "safe" ? "success" : "warning"}>
                  {activeCandleSource.performanceMode} mode
                </Badge>
              </div>
              {activeCandleSource.mode === "imported" ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div>Raw candles: {activeCandleSource.rawCandleCount.toLocaleString()}</div>
                  <div>Research window: {activeCandleSource.researchWindowCandles.toLocaleString()}</div>
                  <div>
                    Processed: {activeCandleSource.processedCandleCount.toLocaleString()}{" "}
                    {activeCandleSource.appliedSettings.targetTimeframe}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-cyan-100/75">Mock data is being used until an imported candle set is activated.</p>
              )}
              {activeCandleSource.warnings.length ? (
                <p className="mt-2 text-amber-100">{activeCandleSource.warnings[0]}</p>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="auto-search-mode">Search mode</Label>
                <Select
                  id="auto-search-mode"
                  value={searchMode}
                  options={searchModeOptions}
                  onChange={(event) => {
                    const nextMode = event.target.value as AutoResearchSearchMode;
                    setSearchMode(nextMode);
                    setMaxCandidateCount(String(autoResearchSearchModeDefaults[nextMode] ?? 10));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auto-max-candidates">Max candidate count</Label>
                <Select
                  id="auto-max-candidates"
                  value={maxCandidateCount}
                  options={[...multiPassCandidateOptions, ...maxCandidateOptions].filter(
                    (option, index, array) => array.findIndex((item) => item.value === option.value) === index
                  )}
                  onChange={(event) => setMaxCandidateCount(event.target.value)}
                />
              </div>
            </div>
            <Button onClick={runCycle} disabled={isRunning}>
              <Play className="h-4 w-4" aria-hidden="true" />
              Run Auto Research Cycle
            </Button>
            <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-primary">
              <BrainCircuit className="mr-2 inline h-4 w-4" aria-hidden="true" />
              LLM supervisor required for full autonomous research mode. Deterministic search is baseline optimizer only.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Best Candidate</CardTitle>
            </div>
            <CardDescription>Selected by stability-first score, not highest profit alone.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {bestCandidate ? (
              <>
                {latestCycle?.noSafePaperDemoCandidateFound ? (
                  <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                    No safe Paper-Demo Candidate found. Continue research.
                  </div>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background/45 p-3">
                  <div>
                    <p className="font-medium">{bestCandidate.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{bestCandidate.rationale}</p>
                  </div>
                  <Badge variant={bestCandidateStable ? "success" : "warning"}>
                    {formatToken(bestCandidate.resultCategory)} / score {scoreValue(bestCandidate)}
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Max DD", `${metricValue(bestCandidate).maxDrawdown.toFixed(2)}R`],
                    ["Avg R", `${formatSigned(metricValue(bestCandidate).averageR, 2)}R`],
                    ["Trades", String(metricValue(bestCandidate).totalTrades)],
                    ["Calibration", formatPercent(metricValue(bestCandidate).confidenceCalibration, 0)]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
                {latestCycle?.createdProposalId ? (
                  <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                    {researchCalibrationProposalCreated
                      ? "Research calibration proposal created from an improved-but-not-ready candidate. "
                      : "Created proposal "}
                    {researchCalibrationProposalCreated ? null : latestCycle.createdProposalId}
                    {researchCalibrationProposalCreated
                      ? "It is not paper-demo ready; approve it only as a baseline calibration and rerun validation. "
                      : " Review and test it on "}
                    <Link to="/self-improvement" className="font-semibold underline underline-offset-4">
                      /self-improvement
                    </Link>
                    .
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                    No proposal was created because the best candidate did not clear the stability-first promotion gate.
                  </div>
                )}
                {safeArray(bestCandidate.comparisonResult?.criticalRegressions).length ? (
                  <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                    <p className="font-medium">Follow-up required before proposal promotion</p>
                    <p className="mt-1">
                      {bestCandidate.comparisonResult.followUpSearchDirection ??
                        "Run a targeted follow-up search because the candidate has critical metric regressions."}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
                No cycle has selected a best candidate yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Top 3 Closest Candidates</CardTitle>
              <CardDescription>
                If no Paper-Demo Candidate is found, these are the closest research candidates and their blockers.
              </CardDescription>
            </div>
            <Badge variant={latestCycle?.noSafePaperDemoCandidateFound ? "warning" : "success"}>
              {latestCycle?.noSafePaperDemoCandidateFound ? "No safe candidate found" : "Candidate found"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-3">
          {topCandidates.map((candidate) => (
            <div key={candidate.candidateId} className="rounded-lg border border-border bg-background/45 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{candidate.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{candidate.rationale}</p>
                </div>
                <Badge variant={categoryVariant(candidate.resultCategory)}>{scoreValue(candidate)}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                <Badge variant={categoryVariant(candidate.resultCategory)}>{formatToken(candidate.resultCategory)}</Badge>
                <Badge variant="muted">{candidate.readinessEstimate?.state ?? "Not Ready"}</Badge>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {safeArray(candidate.rejectionReasons).length
                  ? safeArray(candidate.rejectionReasons).join(" ")
                  : "Eligible for proposal review; approval still required before any setting changes."}
              </p>
            </div>
          ))}
          {!topCandidates.length ? (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground lg:col-span-3">
              Run a multi-pass search to see closest candidates.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Adaptive Improvement</CardTitle>
              <CardDescription>
                If the best candidate fails stability, Auto Research diagnoses the failed gates and runs up to two targeted follow-up passes.
              </CardDescription>
            </div>
            <Badge variant={latestCycle?.finalOutcome === "paper_demo_candidate" ? "success" : latestCycle?.finalOutcome === "unsafe_overfit" ? "danger" : "warning"}>
              {formatToken(latestCycle?.finalOutcome ?? latestCycle?.finalResultCategory)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            Auto Research can optimize simulation settings only. It cannot execute trades, enable demo/live mode, or override readiness.
          </div>
          {safeArray(latestCycle?.adaptivePasses).length ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {safeArray(latestCycle?.adaptivePasses).map((pass) => (
                <div key={pass.passNumber} className="rounded-lg border border-border bg-background/45 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">Pass {pass.passNumber}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{pass.reasonForPass}</p>
                    </div>
                    <Badge variant={pass.improvementOverPriorPass ? "success" : "muted"}>
                      {pass.improvementOverPriorPass ? "improved" : "no lift"}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Failed gates targeted</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {safeArray(pass.failedGatesTargeted).length ? (
                          safeArray(pass.failedGatesTargeted).map((gate) => (
                            <Badge key={gate} variant="warning">{formatToken(gate)}</Badge>
                          ))
                        ) : (
                          <Badge variant="muted">initial search</Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Targeted changes</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {safeArray(pass.targetedChanges).length ? (
                          safeArray(pass.targetedChanges).map((change) => (
                            <Badge key={change} variant="secondary">{change}</Badge>
                          ))
                        ) : (
                          <Badge variant="muted">bounded baseline set</Badge>
                        )}
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-background/60 p-2">
                      <p className="text-xs text-muted-foreground">Best candidate this pass</p>
                      <p className="mt-1 font-medium">{pass.bestCandidatePerPass?.label ?? "none"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Score {scoreValue(pass.bestCandidatePerPass)} / {formatToken(pass.finalOutcome)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              Run Auto Research to see adaptive passes and targeted follow-up attempts.
            </div>
          )}
          <div className="rounded-lg border border-border bg-background/45 p-3 text-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Final recommendation</p>
            <p className="mt-1 text-foreground">
              {latestCycle?.recoveryAttempted && (latestCycle.tradesAfterRecovery ?? 0) === 0
                ? "No valid simulated trades were generated. Strategy cannot be evaluated yet."
                : researchCalibrationProposalCreated
                ? "Research calibration proposal created. Rerun validation and readiness after user approval."
                : latestCycle?.noSafePaperDemoCandidateFound
                ? "No safe Paper-Demo Candidate found. Continue research with the closest stable candidates and review failed gates."
                : latestCycle?.bestCandidate
                  ? `Review ${latestCycle.bestCandidate.label}. Approval is still required before any simulation setting changes.`
                  : "No adaptive result yet."}
            </p>
          </div>
        </CardContent>
      </Card>

      {researchCalibrationProposalCreated ? (
        <Card className="border-emerald-300/25 bg-emerald-300/10">
          <CardContent className="space-y-2 p-4 text-sm text-emerald-100">
            <p className="font-medium">Best improved candidate is ready for research calibration review.</p>
            <p>
              Proposal created: {latestCycle?.createdProposalId}. This does not grant Paper-Demo Candidate and does not enable demo/live trading.
            </p>
            <p>
              Why not ready:{" "}
              {safeArray(bestCandidate?.rejectionReasons).length
                ? safeArray(bestCandidate?.rejectionReasons).join(" ")
                : "Candidate still needs validation and readiness rerun after approval."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Trade Quality Optimization</CardTitle>
              <CardDescription>
                When trades exist but quality is weak, Auto Research tests stop, target, session, direction, and quality-filter variants.
              </CardDescription>
            </div>
            <Badge variant={safeArray(latestCycle?.tradeQualityDiagnostics).length ? "warning" : "muted"}>
              {safeArray(latestCycle?.tradeQualityDiagnostics).length ? "quality pass active" : "no quality pass"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {safeArray(latestCycle?.tradeQualityDiagnostics).length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {safeArray(latestCycle?.tradeQualityDiagnostics).map((item) => (
                <div key={`${item.reasonCode}-${item.currentValue}`} className="rounded-lg border border-border bg-background/45 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{formatToken(item.reasonCode)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.explanation}</p>
                    </div>
                    <Badge variant={item.severity === "blocking" ? "danger" : item.severity === "warning" ? "warning" : "muted"}>
                      {item.severity}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-md border border-border bg-card/45 p-2">
                      <p className="text-xs text-muted-foreground">Current</p>
                      <p className="mt-1 font-mono text-xs">{item.currentValue}</p>
                    </div>
                    <div className="rounded-md border border-border bg-card/45 p-2">
                      <p className="text-xs text-muted-foreground">Required</p>
                      <p className="mt-1 font-mono text-xs">{item.requiredValue}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-amber-100">{item.suggestedFix}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {safeTopN(item.candidateConfigHints, 3).map((hint) => (
                      <Badge key={hint.label} variant="secondary">{hint.label}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              No trade-quality diagnostics are active for the latest cycle.
            </div>
          )}

          {latestCycle?.tradeQualitySummary ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Tested stop models</p>
                <p className="mt-1 text-sm">{safeArray(latestCycle.tradeQualitySummary.testedStopModels).join(", ") || "none"}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Tested target models</p>
                <p className="mt-1 text-sm">{safeArray(latestCycle.tradeQualitySummary.testedTargetModels).join(", ") || "none"}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Session/direction findings</p>
                <p className="mt-1 text-sm">{safeArray(latestCycle.tradeQualitySummary.sessionDirectionFindings).join(" ") || "none"}</p>
              </div>
            </div>
          ) : null}

          {latestCycle?.tradeQualityBestCandidate ? (
            <div className="rounded-lg border border-violet-300/25 bg-violet-300/10 p-3 text-sm text-violet-100">
              <p className="font-medium">Best trade-quality candidate: {latestCycle.tradeQualityBestCandidate.label}</p>
              <p className="mt-1">
                Win {formatPercent(latestCycle.tradeQualityBestCandidate.metrics.winRate, 0)}, average R{" "}
                {formatSigned(latestCycle.tradeQualityBestCandidate.metrics.averageR, 2)}R, drawdown{" "}
                {latestCycle.tradeQualityBestCandidate.metrics.maxDrawdown.toFixed(2)}R. Proposals still require manual approval.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Trade Generation Diagnostics</CardTitle>
              <CardDescription>
                When zero trades occur, Auto Research explains the blockage and runs bounded recovery candidates before declaring Not Ready.
              </CardDescription>
            </div>
            <Badge variant={latestCycle?.recoveryAttempted ? "warning" : "muted"}>
              {latestCycle?.recoveryAttempted ? "recovery attempted" : "no recovery needed"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {safeArray(latestCycle?.tradeGenerationDiagnostics).length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {safeArray(latestCycle?.tradeGenerationDiagnostics).map((item) => (
                <div key={`${item.reasonCode}-${item.currentValue}`} className="rounded-lg border border-border bg-background/45 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{formatToken(item.reasonCode)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.explanation}</p>
                    </div>
                    <Badge variant={item.severity === "blocking" ? "danger" : item.severity === "warning" ? "warning" : "muted"}>
                      {item.severity}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-md border border-border bg-card/45 p-2">
                      <p className="text-xs text-muted-foreground">Current</p>
                      <p className="mt-1 font-mono text-xs">{item.currentValue}</p>
                    </div>
                    <div className="rounded-md border border-border bg-card/45 p-2">
                      <p className="text-xs text-muted-foreground">Suggested</p>
                      <p className="mt-1 font-mono text-xs">{item.requiredOrSuggestedValue}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-amber-100">{item.suggestedFix}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              No zero-trade diagnostics are active for the latest cycle.
            </div>
          )}

          {latestCycle?.recoveryAttempted ? (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm">
              {(() => {
                const recoveryMetadata = latestCycle.recoveryMetadata;
                return (
                  <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Recovery result</p>
                  <p className="mt-1 text-muted-foreground">
                    Trades before recovery: {latestCycle.tradesBeforeRecovery ?? 0}; trades after recovery: {latestCycle.tradesAfterRecovery ?? 0}.
                  </p>
                </div>
                <Badge variant={(latestCycle.tradesAfterRecovery ?? 0) > 0 ? "success" : "danger"}>
                  {(latestCycle.tradesAfterRecovery ?? 0) > 0 ? "trades generated" : "still zero"}
                </Badge>
              </div>
              {recoveryMetadata ? (
                <div className="mt-3 grid gap-2 md:grid-cols-5">
                  <div className="rounded-md border border-border bg-card/45 p-2">
                    <p className="text-xs text-muted-foreground">Observed confluence</p>
                    <p className="mt-1 font-mono text-sm">{formatOptionalPercent(recoveryMetadata.observedICTConfluence)}</p>
                  </div>
                  <div className="rounded-md border border-border bg-card/45 p-2">
                    <p className="text-xs text-muted-foreground">Active threshold</p>
                    <p className="mt-1 font-mono text-sm">{formatPercent(recoveryMetadata.activeConfluenceThreshold)}</p>
                  </div>
                  <div className="rounded-md border border-border bg-card/45 p-2">
                    <p className="text-xs text-muted-foreground">Recovery threshold</p>
                    <p className="mt-1 font-mono text-sm">{formatOptionalPercent(recoveryMetadata.recoveryConfluenceThreshold ?? recoveryMetadata.proposedConfluenceThreshold)}</p>
                  </div>
                  <div className="rounded-md border border-border bg-card/45 p-2">
                    <p className="text-xs text-muted-foreground">Proposed threshold</p>
                    <p className="mt-1 font-mono text-sm">{formatPercent(recoveryMetadata.proposedConfluenceThreshold)}</p>
                  </div>
                  <div className="rounded-md border border-border bg-card/45 p-2">
                    <p className="text-xs text-muted-foreground">Trades produced</p>
                    <p className="mt-1 font-mono text-sm">{recoveryMetadata.tradesProduced}</p>
                  </div>
                </div>
              ) : null}
              {recoveryMetadata?.calculation ? (
                <p className="mt-3 rounded-md border border-border bg-card/45 p-2 text-xs text-muted-foreground">
                  {recoveryMetadata.calculation}
                </p>
              ) : null}
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {safeArray(latestCycle.recoveryCandidates).map((candidate) => (
                  <div key={candidate.candidateId} className="rounded-md border border-border bg-card/45 p-2">
                    <p className="font-medium">{candidate.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{candidate.rationale}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {safeArray(candidate.changedParameters).map((item) => (
                        <Badge key={item} variant="secondary">{item}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {latestCycle.createdProposalId && (latestCycle.tradesAfterRecovery ?? 0) > 0 ? (
                <div className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">
                  Recovery produced {latestCycle.tradesAfterRecovery ?? 0} trades; proposal created to calibrate threshold to the recovery-tested level.
                </div>
              ) : null}
              {safeArray(latestCycle.recoveryFailureReasons).length ? (
                <div className="mt-3 rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">
                  {safeArray(latestCycle.recoveryFailureReasons).join(" ")}
                </div>
              ) : null}
                  </>
                );
              })()}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <TechnicalDetails
        title="Advanced storage details"
        description="Shows compact Auto Research storage size and lets you clear only Auto Research history."
      >
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["Approx stored size", formatBytes(state.lastStoredBytes ?? storedSize)],
            ["Retained cycles", String(state.cycles.length)],
            ["Candidate summaries", String(candidateSummaryCount)],
            ["Emergency mode", state.storageEmergencyMode ? "yes" : "no"]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
          <span>
            Clearing Auto Research history removes stored candidate summaries only. It does not delete validation,
            readiness, self-improvement, or broker-safety data.
          </span>
          <Button variant="destructive" onClick={clearHistory} className="w-full md:w-auto">
            Clear Auto Research History
          </Button>
        </div>
      </TechnicalDetails>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Candidate Comparison</CardTitle>
              <CardDescription>Every candidate runs through mock backtesting, validation, and research quality review.</CardDescription>
            </div>
            <Badge variant={statusVariant(latestCycle?.status)}>{latestCycle?.status ?? "idle"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            Auto Research can optimize simulation settings only. It cannot execute trades, enable demo/live mode, or override readiness.
          </div>
          <CandidateTable candidates={safeArray(latestCycle?.candidateResults)} />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Stability Score Breakdown</CardTitle>
            <CardDescription>Drawdown, calibration, false positives, and sample quality lead the score.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {bestCandidate ? (
              Object.entries({
                drawdown: bestCandidate.scoreBreakdown?.drawdownScore ?? 0,
                averageR: bestCandidate.scoreBreakdown?.averageRScore ?? 0,
                winRate: bestCandidate.scoreBreakdown?.winRateScore ?? 0,
                falsePositive: bestCandidate.scoreBreakdown?.falsePositiveScore ?? 0,
                confidence: bestCandidate.scoreBreakdown?.confidenceCalibrationScore ?? 0,
                session: bestCandidate.scoreBreakdown?.sessionConsistencyScore ?? 0,
                tradeCount: bestCandidate.scoreBreakdown?.tradeCountScore ?? 0,
                skippedBalance: bestCandidate.scoreBreakdown?.skippedSignalBalanceScore ?? 0,
                profitFactor: bestCandidate.scoreBreakdown?.profitFactorScore ?? 0,
                robustness: bestCandidate.scoreBreakdown?.robustnessScore ?? 0
              }).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground md:col-span-2 xl:col-span-5">
                Run a cycle to see the stability score breakdown.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rejected Candidates</CardTitle>
            <CardDescription>Rejected candidates and the reason they did not become the proposal seed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {safeArray(latestCycle?.rejectedCandidates).length ? (
              safeArray(latestCycle?.rejectedCandidates).map((candidate) => (
                <div key={candidate.candidateId} className="rounded-lg border border-border bg-background/45 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{candidate.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{safeArray(candidate.rejectionReasons).join(" ") || "Lower score than best candidate."}</p>
                    </div>
                    <Badge variant={categoryVariant(candidate.resultCategory)}>{scoreValue(candidate)}</Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
                No rejected candidates yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
            <CardTitle>Audit Trail</CardTitle>
          </div>
          <CardDescription>Every Auto Research decision is logged locally.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {safeTopN(state.auditTrail, 12).map((entry) => (
            <div key={entry.id} className="grid gap-2 rounded-lg border border-border bg-background/45 p-3 text-sm md:grid-cols-[10rem_10rem_minmax(0,1fr)]">
              <span className="font-mono text-xs text-muted-foreground">{entry.timestamp}</span>
              <Badge variant="muted">{entry.action}</Badge>
              <span className="min-w-0 break-words text-muted-foreground">{entry.notes}</span>
            </div>
          ))}
          {!safeArray(state.auditTrail).length ? (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              No Auto Research cycle has run yet.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
            <CardTitle>Authority Boundaries</CardTitle>
          </div>
          <CardDescription>The supervisor can optimize research assumptions only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            "Execution authority: none",
            "Broker authority: none",
            "Readiness override authority: none",
            "Proposal approval authority: user only",
            "API key authority: none",
            "Live/demo mode authority: none",
            "Contract sizing authority: none",
            "Order placement authority: none"
          ].map((item) => (
            <div key={item} className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
