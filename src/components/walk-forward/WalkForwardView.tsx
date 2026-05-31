import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, GitBranch, Loader2, Play, XCircle } from "lucide-react";

import { MetricProvenanceDetails } from "@/components/common/MetricProvenanceDetails";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { saveAutoResearchFollowUpSearchPlan } from "@/lib/autoResearch";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  getImportedDataPreset,
  getWalkForwardDataPreset,
  loadCandleWindowSettings,
  loadPreparedWalkForwardCandleSource,
  loadWalkForwardCandleWindowSettings,
  MARKET_DATA_IMPORT_UPDATED_EVENT,
  saveWalkForwardCandleWindowSettings,
  WALK_FORWARD_IMPORTED_STANDARD_WINDOW_SIZE,
  WALK_FORWARD_WINDOW_SETTINGS_UPDATED_EVENT,
  walkForwardDataPresetSettings,
  type CandleWindowSettings,
  type PreparedCandleSource,
  type WalkForwardDataPreset
} from "@/lib/marketData";
import {
  resolveResearchRuntimeSnapshot,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";
import { SELF_IMPROVEMENT_UPDATED_EVENT } from "@/lib/selfImprovement";
import { formatPercent, safeArray } from "@/lib/utils";
import {
  clearWalkForwardHistory,
  createWalkForwardWindows,
  latestWalkForwardRun,
  loadWalkForwardState,
  runWalkForwardValidation,
  splitRatioPresets,
  walkForwardModeWindowSize,
  WALK_FORWARD_UPDATED_EVENT,
  type WalkForwardMode,
  type WalkForwardRun,
  type WalkForwardSplitRatioPreset
} from "@/lib/walkForward";

const verdictVariant = (verdict?: string) =>
  verdict === "paper_demo_review_candidate" || verdict === "robust_research"
    ? "success"
    : verdict === "promising"
      ? "warning"
      : verdict === "fail"
        ? "danger"
        : verdict === "insufficient_evidence"
          ? "warning"
        : "muted";

const riskVariant = (risk?: string) =>
  risk === "low" ? "success" : risk === "medium" ? "warning" : risk === "high" ? "danger" : "muted";

const formatRatio = (value: number) => `${Math.round(value * 100)}%`;
const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : "not run");
const minimumProcessedCandlesFor = (mode: WalkForwardMode, requiredWindows = 3) =>
  walkForwardModeWindowSize[mode] + Math.max(0, requiredWindows - 1);
const emptyWalkForwardSource: PreparedCandleSource = {
  mode: "mock",
  label: "Loading walk-forward candles",
  candles: [],
  rawCandleCount: 0,
  researchWindowCandles: 0,
  processedCandleCount: 0,
  estimatedProcessedCandles: 0,
  appliedSettings: walkForwardDataPresetSettings.safe,
  aggregationApplied: false,
  performanceMode: "safe",
  warnings: []
};

export function WalkForwardView() {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();
  const [latestRun, setLatestRun] = useState<WalkForwardRun | undefined>(() => latestWalkForwardRun());
  const [mode, setMode] = useState<WalkForwardMode>("safe");
  const [ratioPreset, setRatioPreset] = useState<WalkForwardSplitRatioPreset>("60_20_20");
  const [maxWindows, setMaxWindows] = useState(3);
  const [dashboardWindowSettings, setDashboardWindowSettings] = useState<CandleWindowSettings>(() => loadCandleWindowSettings());
  const [walkForwardSettings, setWalkForwardSettings] = useState<CandleWindowSettings>(() => loadWalkForwardCandleWindowSettings());
  const [walkForwardSource, setWalkForwardSource] = useState<PreparedCandleSource>(emptyWalkForwardSource);
  const [customInSample, setCustomInSample] = useState(60);
  const [customValidation, setCustomValidation] = useState(20);
  const [customOutOfSample, setCustomOutOfSample] = useState(20);
  const [busy, setBusy] = useState(false);
  const [controller, setController] = useState<AbortController>();
  const [actionMessage, setActionMessage] = useState("");

  const latestProposal = runtimeSnapshot?.proposal.latestProposal;
  const proposalWalkForwardStatus = latestProposal
    ? latestRun?.proposalId === latestProposal.proposalId
      ? `Proposal ${latestProposal.proposalId} has latest walk-forward validation.`
      : "Latest proposal has not been walk-forward validated yet."
    : "No active proposal selected for walk-forward validation.";

  const refresh = () => {
    setLatestRun(latestWalkForwardRun(loadWalkForwardState()));
    setDashboardWindowSettings(loadCandleWindowSettings());
    setWalkForwardSettings(loadWalkForwardCandleWindowSettings());
    void loadPreparedWalkForwardCandleSource()
      .then(setWalkForwardSource)
      .catch(() => undefined);
    void resolveResearchRuntimeSnapshot()
      .then(setRuntimeSnapshot)
      .catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    window.addEventListener(WALK_FORWARD_UPDATED_EVENT, refresh);
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(WALK_FORWARD_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(WALK_FORWARD_UPDATED_EVENT, refresh);
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener(WALK_FORWARD_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const progressPercent = latestRun?.progress
    ? Math.round((latestRun.progress.currentWindow / Math.max(1, latestRun.progress.totalWindows)) * 100)
    : latestRun?.stability
      ? 100
      : 0;

  const run = async () => {
    if (walkForwardSource.mode !== "imported") {
      setActionMessage("Walk-forward imported-data validation requires an active imported dataset. Reactivate or re-import MNQ data on Market Data first.");
      return;
    }
    if (expectedWindows < 3) {
      setActionMessage("Not enough data for meaningful walk-forward. Increase the walk-forward raw window or select Standard.");
      return;
    }
    const abortController = new AbortController();
    setController(abortController);
    setBusy(true);
    const result = await runWalkForwardValidation({
      mode,
      splitRatioPreset: ratioPreset,
      maxWindows,
      proposalId: latestProposal?.proposalId,
      customRatio:
        ratioPreset === "custom"
          ? {
              inSample: customInSample / 100,
              validation: customValidation / 100,
              outOfSample: customOutOfSample / 100
            }
          : undefined,
      signal: abortController.signal,
      onProgress: setLatestRun
    });
    setLatestRun(result);
    setBusy(false);
    setController(undefined);
    refresh();
  };

  const cancel = () => {
    controller?.abort();
  };

  const clear = () => {
    if (window.confirm("Clear local walk-forward history? This does not change strategy settings.")) {
      clearWalkForwardHistory();
      refresh();
    }
  };

  const windowRows = useMemo(() => latestRun?.windows ?? [], [latestRun]);
  const diagnostics = latestRun?.failureDiagnostics ?? latestRun?.stability?.diagnostics;
  const followUpPlan = latestRun?.followUpPlan ?? latestRun?.stability?.followUpPlan;
  const evidenceSummary = latestRun?.stability?.evidenceSummary;
  const splitRatio = ratioPreset === "custom"
    ? {
        preset: "custom" as const,
        label: `${customInSample} / ${customValidation} / ${customOutOfSample}`,
        inSample: customInSample / 100,
        validation: customValidation / 100,
        outOfSample: customOutOfSample / 100
      }
    : splitRatioPresets[ratioPreset];
  const feasibilityWindows = createWalkForwardWindows({
    candles: walkForwardSource.candles,
    source: walkForwardSource,
    ratio: splitRatio,
    mode,
    maxWindows
  });
  const expectedWindows = feasibilityWindows.length;
  const expectedOosCandles =
    feasibilityWindows[0]?.splits.find((split) => split.label === "out_of_sample")?.processedCandleCount ?? 0;
  const minimumProcessedCandles = minimumProcessedCandlesFor(mode);
  const walkForwardPreset = getWalkForwardDataPreset(walkForwardSettings);
  const dashboardPreset = getImportedDataPreset(dashboardWindowSettings);
  const usingDashboardSafeData =
    walkForwardSource.mode === "imported" &&
    walkForwardSource.researchWindowCandles <= 500 &&
    walkForwardSource.appliedSettings.targetTimeframe === "5m";
  const feasibilityWarnings = [
    walkForwardSource.mode !== "imported"
      ? "Walk-forward is using mock data. Reactivate imported MNQ data before running imported-data validation."
      : undefined,
    expectedWindows < 3 ? "Not enough data for meaningful walk-forward. Increase raw window." : undefined,
    usingDashboardSafeData
      ? "Walk-forward is using Dashboard Safe data. Select a larger walk-forward data preset for meaningful validation."
      : undefined,
    walkForwardSettings.windowSize > 10000 ? "Raw walk-forward window above 10,000 candles can be heavy in the browser." : undefined
  ].filter((warning): warning is string => Boolean(warning));

  const createFollowUpSearch = () => {
    if (!followUpPlan) {
      setActionMessage("No walk-forward follow-up plan is available yet. Run walk-forward validation first.");
      return;
    }
    saveAutoResearchFollowUpSearchPlan(followUpPlan);
    setActionMessage(
      `Created Auto Research follow-up plan ${followUpPlan.planId}. Open Auto Research to use ${followUpPlan.recommendedSearchMode.replace(/_/g, " ")} mode.`
    );
  };

  const applyWalkForwardPreset = (preset: Exclude<WalkForwardDataPreset, "custom">) => {
    const saved = saveWalkForwardCandleWindowSettings(walkForwardDataPresetSettings[preset]);
    setWalkForwardSettings(saved);
    setMode(preset === "advanced" ? "advanced" : preset === "standard" ? "standard" : "safe");
    setMaxWindows(preset === "advanced" ? 5 : preset === "standard" ? 5 : 3);
    refresh();
  };

  const patchWalkForwardSettings = (patch: Partial<CandleWindowSettings>) => {
    const saved = saveWalkForwardCandleWindowSettings({ ...walkForwardSettings, ...patch });
    setWalkForwardSettings(saved);
    refresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Imported-data validation</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Walk-Forward Validation</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Tests active calibration behavior across in-sample, validation, and out-of-sample windows so one selected
            candle window cannot masquerade as robust research.
          </p>
        </div>
        <Badge variant={runtimeSnapshot?.marketData.isImportedDataActive ? "success" : "warning"}>
          {runtimeSnapshot?.marketData.isImportedDataActive ? "imported data active" : "mock data warning"}
        </Badge>
      </div>

      <SafetyLockBanner message="Walk-forward validation is research/simulation only. It cannot execute trades, enable demo/live mode, or override readiness." />

      {actionMessage ? (
        <Card className="border-emerald-300/25 bg-emerald-300/10">
          <CardContent className="p-4 text-sm font-medium text-emerald-100">{actionMessage}</CardContent>
        </Card>
      ) : null}

      <Card className="border-cyan-400/20 bg-cyan-400/5">
        <CardContent className="grid gap-3 p-4 text-sm text-cyan-50 md:grid-cols-2 xl:grid-cols-5">
          <StatusTile label="Dashboard research preset" value={`${dashboardPreset} / ${runtimeSnapshot ? `${runtimeSnapshot.marketData.researchWindow.toLocaleString()} raw -> ${runtimeSnapshot.marketData.processedCandleCount.toLocaleString()} ${runtimeSnapshot.marketData.timeframe}` : "loading"}`} />
          <StatusTile label="Walk-forward data preset" value={`${walkForwardPreset} / ${walkForwardSource.researchWindowCandles.toLocaleString()} raw -> ${walkForwardSource.processedCandleCount.toLocaleString()} ${walkForwardSource.appliedSettings.targetTimeframe}`} />
          <StatusTile label="Raw imported dataset" value={walkForwardSource.mode === "imported" ? walkForwardSource.rawCandleCount.toLocaleString() : "mock data"} />
          <StatusTile label="Minimum processed needed" value={`${minimumProcessedCandles.toLocaleString()} for ${mode} / 3 windows`} />
          <StatusTile label="Active calibration" value={runtimeSnapshot?.activeConfig.activeCalibrationId ?? "default baseline"} />
        </CardContent>
      </Card>

      {feasibilityWarnings.length ? (
        <Card className="border-amber-300/25 bg-amber-300/10">
          <CardContent className="space-y-1 p-4 text-sm text-amber-100">
            {feasibilityWarnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-cyan-300" aria-hidden="true" />
              Run Settings
            </CardTitle>
            <CardDescription>Use Safe first. Standard/Advanced increase windows and browser work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground" htmlFor="walk-forward-data-preset">Data preset</label>
                <Select
                  id="walk-forward-data-preset"
                  value={walkForwardPreset === "custom" ? "advanced" : walkForwardPreset}
                  disabled={busy}
                  onChange={(event) => applyWalkForwardPreset(event.target.value as Exclude<WalkForwardDataPreset, "custom">)}
                  options={[
                    { label: "Walk-forward Safe: 2,000 raw → 5m", value: "safe" },
                    { label: "Walk-forward Standard: 5,000 raw → 5m", value: "standard" },
                    { label: "Walk-forward Advanced: custom", value: "advanced" }
                  ]}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground" htmlFor="walk-forward-mode">Mode</label>
                <Select
                  id="walk-forward-mode"
                  value={mode}
                  disabled={busy}
                  onChange={(event) => {
                    const next = event.target.value as WalkForwardMode;
                    setMode(next);
                    setMaxWindows(next === "advanced" ? 5 : next === "standard" ? 5 : 3);
                  }}
                  options={[
                    { label: "Safe", value: "safe" },
                    { label: "Standard", value: "standard" },
                    { label: "Advanced", value: "advanced" }
                  ]}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground" htmlFor="walk-forward-ratio">Split ratio</label>
                <Select
                  id="walk-forward-ratio"
                  value={ratioPreset}
                  disabled={busy}
                  onChange={(event) => setRatioPreset(event.target.value as WalkForwardSplitRatioPreset)}
                  options={[
                    ...Object.values(splitRatioPresets).map((ratio) => ({ label: ratio.label, value: ratio.preset })),
                    { label: "Custom advanced", value: "custom" }
                  ]}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground" htmlFor="walk-forward-max">Max windows</label>
                <Input
                  id="walk-forward-max"
                  type="number"
                  min={1}
                  max={mode === "advanced" ? 8 : mode === "standard" ? 5 : 3}
                  value={maxWindows}
                  disabled={busy}
                  onChange={(event) => setMaxWindows(Number(event.target.value) || 1)}
                />
              </div>
            </div>

            {walkForwardSettings.advancedMode ? (
              <div className="grid gap-3 rounded-lg border border-border bg-background/45 p-3 sm:grid-cols-3">
                <div>
                  <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground" htmlFor="walk-forward-raw-window">Raw window</label>
                  <Input
                    id="walk-forward-raw-window"
                    type="number"
                    min={1000}
                    max={50000}
                    value={walkForwardSettings.windowSize}
                    disabled={busy}
                    onChange={(event) => patchWalkForwardSettings({ windowSize: Number(event.target.value) || WALK_FORWARD_IMPORTED_STANDARD_WINDOW_SIZE })}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground" htmlFor="walk-forward-timeframe">Aggregate</label>
                  <Select
                    id="walk-forward-timeframe"
                    value={walkForwardSettings.targetTimeframe}
                    disabled={busy}
                    onChange={(event) => patchWalkForwardSettings({ targetTimeframe: event.target.value as CandleWindowSettings["targetTimeframe"] })}
                    options={[
                      { label: "5m", value: "5m" },
                      { label: "15m", value: "15m" },
                      { label: "1m", value: "1m" }
                    ]}
                  />
                </div>
                <StatusTile label="Advanced warning" value={walkForwardSettings.windowSize > 10000 ? "Large browser workload" : "Within normal walk-forward bounds"} />
              </div>
            ) : null}

            <div className="grid gap-3 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <StatusTile label="Projected windows" value={`${expectedWindows}/${maxWindows}`} />
              <StatusTile label="Projected OOS candles" value={String(expectedOosCandles)} />
              <StatusTile label="Processed available" value={walkForwardSource.processedCandleCount.toLocaleString()} />
              <StatusTile label="Raw selected" value={walkForwardSource.researchWindowCandles.toLocaleString()} />
            </div>

            {ratioPreset === "custom" ? (
              <div className="grid gap-3 rounded-lg border border-border bg-background/45 p-3 sm:grid-cols-3">
                <CustomRatioInput label="In-sample %" value={customInSample} onChange={setCustomInSample} />
                <CustomRatioInput label="Validation %" value={customValidation} onChange={setCustomValidation} />
                <CustomRatioInput label="Out-of-sample %" value={customOutOfSample} onChange={setCustomOutOfSample} />
              </div>
            ) : null}

            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              <AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden="true" />
              Out-of-sample behavior is weighted heavily. One good in-sample window is never enough.
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={run} disabled={busy || walkForwardSource.mode !== "imported"} className="justify-center gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                {busy ? "Walk-forward running" : walkForwardSource.mode !== "imported" ? "Reactivate imported data first" : "Run Walk-Forward"}
              </Button>
              {busy ? (
                <Button variant="destructive" onClick={cancel} className="justify-center gap-2">
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Cancel after current split
                </Button>
              ) : (
                <Button variant="outline" onClick={clear}>Clear history</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest Result</CardTitle>
            <CardDescription>{latestRun?.stability?.summary ?? "Run walk-forward validation to evaluate stability across windows."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={latestRun?.status === "completed" ? "success" : latestRun?.status === "failed" || latestRun?.status === "canceled" ? "danger" : "warning"}>
                {latestRun?.status ?? "not run"}
              </Badge>
              <Badge variant={verdictVariant(latestRun?.stability?.verdict)}>
                {latestRun?.stability?.verdict?.replace(/_/g, " ") ?? "no verdict"}
              </Badge>
              <Badge variant={riskVariant(latestRun?.stability?.overfitRisk)}>
                overfit: {latestRun?.stability?.overfitRisk === "not_applicable" ? "not applicable" : latestRun?.stability?.overfitRisk ?? "unknown"}
              </Badge>
            </div>
            <Progress value={progressPercent} />
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <StatusTile label="Windows tested" value={String(latestRun?.stability?.windowCount ?? latestRun?.windows.length ?? 0)} />
              <StatusTile label="OOS windows passed" value={`${latestRun?.stability?.outOfSampleWindowsPassed ?? 0}/${latestRun?.stability?.windowCount ?? 0}`} />
              <StatusTile label="Stability score" value={latestRun?.stability ? `${latestRun.stability.stabilityScore}/100` : "n/a"} />
              <StatusTile label="Worst OOS drawdown" value={latestRun?.stability ? `${latestRun.stability.worstWindowDrawdownR.toFixed(2)}R` : "n/a"} />
              <StatusTile label="Worst OOS win rate" value={latestRun?.stability ? formatPercent(latestRun.stability.worstWindowWinRate, 1) : "n/a"} />
              <StatusTile label="Worst OOS average R" value={latestRun?.stability ? `${latestRun.stability.worstWindowAverageR.toFixed(2)}R` : "n/a"} />
              <StatusTile label="Requested max windows" value={String(evidenceSummary?.requestedMaxWindows ?? latestRun?.requestedMaxWindows ?? maxWindows)} />
              <StatusTile label="Actual windows generated" value={String(evidenceSummary?.actualWindowsGenerated ?? latestRun?.actualWindowsGenerated ?? latestRun?.windows.length ?? 0)} />
              <StatusTile label="Required OOS trades" value={`${evidenceSummary?.minimumOosTradesPerWindow ?? 5}/window, ${evidenceSummary?.minimumTotalOosTrades ?? 20} total`} />
              <StatusTile label="Actual OOS trades" value={String(evidenceSummary?.totalOosTrades ?? 0)} />
            </div>
            {latestRun?.stability?.verdict === "insufficient_evidence" ? (
              <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                <div className="font-medium">Insufficient evidence</div>
                <div className="mt-1">
                  {evidenceSummary?.insufficientEvidenceReasons[0] ??
                    "Increase windows or out-of-sample trades before treating this as strategy failure."}
                </div>
                {safeArray(evidenceSummary?.windowGenerationNotes).length ? (
                  <div className="mt-2 text-xs">{safeArray(evidenceSummary?.windowGenerationNotes).join(" ")}</div>
                ) : null}
              </div>
            ) : null}
            <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3 text-sm text-cyan-100">
              {latestRun?.progress?.message ?? latestRun?.stability?.recommendedNextAction ?? "No walk-forward run has completed yet."}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={diagnostics ? "border-amber-300/25 bg-amber-300/10" : "border-white/10 bg-slate-950/70"}>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Failure Diagnostics and Follow-Up Search</CardTitle>
            <CardDescription>
              When walk-forward fails, GoTrader identifies the likely failure mode and prepares bounded research candidates.
            </CardDescription>
          </div>
          <Badge variant={diagnostics ? "warning" : "muted"}>
            {diagnostics?.likelyFailureCause?.replace(/_/g, " ") ?? "not diagnosed"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {diagnostics ? (
            <>
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <StatusTile label="Failed windows" value={String(diagnostics.failedWindowCount)} />
                <StatusTile label="Worst window" value={diagnostics.worstWindowId ?? "unknown"} />
                <StatusTile label="Worst OOS win rate" value={formatPercent(diagnostics.worstOosWinRate, 1)} />
                <StatusTile label="Worst OOS average R" value={`${diagnostics.worstOosAverageR.toFixed(2)}R`} />
                <StatusTile label="Worst OOS drawdown" value={`${diagnostics.worstOosDrawdown.toFixed(2)}R`} />
                <StatusTile label="Follow-up mode" value={followUpPlan?.recommendedSearchMode?.replace(/_/g, " ") ?? "none"} />
              </div>
              <div className="rounded-lg border border-amber-200/25 bg-background/45 p-3 text-sm text-amber-50">
                {diagnostics.summary}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">Repeated failure reasons</div>
                  <div className="space-y-2">
                    {diagnostics.repeatedFailureReasons.map((reason) => (
                      <div key={reason} className="rounded-md border border-border bg-background/45 p-2 text-sm text-muted-foreground">
                        {reason}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">Targeted recommendations</div>
                  <div className="space-y-2">
                    {diagnostics.recommendations.map((recommendation) => (
                      <div key={recommendation.recommendationId} className="rounded-md border border-border bg-background/45 p-2 text-sm">
                        <div className="font-medium text-foreground">{recommendation.label}</div>
                        <div className="mt-1 text-muted-foreground">{recommendation.rationale}</div>
                        <div className="mt-2 text-xs text-cyan-100">
                          {recommendation.candidateConfigHints.slice(0, 4).join(" / ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <Button onClick={createFollowUpSearch} disabled={!followUpPlan}>
                Create Follow-Up Search
              </Button>
            </>
          ) : (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              Run walk-forward validation to generate failure diagnostics and a bounded follow-up search plan.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calibration Promotion Gate</CardTitle>
          <CardDescription>Self-improvement proposals should pass out-of-sample checks before trust increases.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          <StatusTile label="Latest proposal" value={latestProposal?.proposalId ?? "none"} />
          <StatusTile label="Walk-forward status" value={proposalWalkForwardStatus} />
          <StatusTile
            label="Promotion warning"
            value={
              latestRun?.stability?.verdict === "insufficient_evidence"
                ? "Insufficient evidence; do not promote yet."
                : latestRun?.stability?.overfitRisk === "high"
                  ? "Likely overfit; do not promote."
                  : "Approval still requires manual review."
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-Window Results</CardTitle>
          <CardDescription>Each row is one rolling window with its out-of-sample result.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="border-b border-border bg-muted/45 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-medium">Window</th>
                <th className="px-3 py-3 font-medium">Verdict</th>
                <th className="px-3 py-3 text-right font-medium">OOS trades</th>
                <th className="px-3 py-3 text-right font-medium">OOS win</th>
                <th className="px-3 py-3 text-right font-medium">OOS avg R</th>
                <th className="px-3 py-3 text-right font-medium">OOS DD</th>
                <th className="px-3 py-3 text-right font-medium">Grinch</th>
                <th className="px-3 py-3 font-medium">Profile / SMT</th>
                <th className="px-3 py-3 text-right font-medium">Readiness</th>
                <th className="px-3 py-3 font-medium">Failure reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {windowRows.length ? (
                windowRows.map((row) => {
                  const oos = row.metricsBySplit.out_of_sample;
                  return (
                    <tr key={row.windowId}>
                      <td className="px-3 py-3 font-mono text-xs">{row.windowIndex}/{row.totalWindows}</td>
                      <td className="px-3 py-3"><Badge variant={row.verdict === "pass" ? "success" : row.verdict === "warning" ? "warning" : "danger"}>{row.verdict}</Badge></td>
                      <td className="px-3 py-3 text-right tabular-nums">{oos.totalTrades}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatPercent(oos.winRate, 1)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{oos.averageR.toFixed(2)}R</td>
                      <td className="px-3 py-3 text-right tabular-nums">{oos.maxDrawdownR.toFixed(2)}R</td>
                      <td className="px-3 py-3 text-right tabular-nums">{oos.grinchMetrics?.grinchScore ?? "n/a"}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {oos.grinchMetrics
                          ? `${oos.grinchMetrics.profileDetected.replace(/_/g, " ")} / trade ${oos.grinchMetrics.profileProducedTrade.replace(/_/g, " ")} / SMT ${oos.grinchMetrics.smtState.replace(/_/g, " ")}`
                          : "Grinch metrics unavailable"}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{oos.readinessScore}</td>
                      <td className="px-3 py-3 text-muted-foreground">{row.failReasons[0] ?? "Passed validation and out-of-sample checks."}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                    No walk-forward windows have been run yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <TechnicalDetails title="Advanced walk-forward diagnostics" description="Open for split ratios, source metadata, and full stability fields.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Split Ratios</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
              <StatusTile label="In-sample" value={latestRun ? formatRatio(latestRun.splitRatio.inSample) : "60%"} />
              <StatusTile label="Validation" value={latestRun ? formatRatio(latestRun.splitRatio.validation) : "20%"} />
              <StatusTile label="Out-of-sample" value={latestRun ? formatRatio(latestRun.splitRatio.outOfSample) : "20%"} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Run Metadata</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <StatusTile label="Run ID" value={latestRun?.runId ?? "none"} />
              <StatusTile label="Completed" value={formatDate(latestRun?.completedAt)} />
              <StatusTile label="Data source" value={latestRun?.dataSourceLabel ?? "none"} />
              <StatusTile label="Candle window" value={latestRun?.candleWindow ?? "none"} />
              <StatusTile label="Active calibration" value={latestRun?.activeCalibrationId ?? "default baseline"} />
              <StatusTile label="Config merge" value={latestRun?.configMergeStatus ?? "none"} />
            </CardContent>
          </Card>
        </div>
        <MetricProvenanceDetails snapshot={runtimeSnapshot} />
      </TechnicalDetails>
    </div>
  );
}

function CustomRatioInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</label>
      <Input type="number" min={10} max={80} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} />
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/45 p-3">
      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-medium text-foreground">{value}</div>
    </div>
  );
}
