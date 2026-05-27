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
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  MARKET_DATA_IMPORT_UPDATED_EVENT
} from "@/lib/marketData";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeFingerprintLabel,
  selectRuntimeSourceLabel,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";
import { SELF_IMPROVEMENT_UPDATED_EVENT } from "@/lib/selfImprovement";
import { formatPercent } from "@/lib/utils";
import {
  clearWalkForwardHistory,
  latestWalkForwardRun,
  loadWalkForwardState,
  runWalkForwardValidation,
  splitRatioPresets,
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
        : "muted";

const riskVariant = (risk?: string) =>
  risk === "low" ? "success" : risk === "medium" ? "warning" : risk === "high" ? "danger" : "muted";

const formatRatio = (value: number) => `${Math.round(value * 100)}%`;
const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : "not run");

export function WalkForwardView() {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();
  const [latestRun, setLatestRun] = useState<WalkForwardRun | undefined>(() => latestWalkForwardRun());
  const [mode, setMode] = useState<WalkForwardMode>("safe");
  const [ratioPreset, setRatioPreset] = useState<WalkForwardSplitRatioPreset>("60_20_20");
  const [maxWindows, setMaxWindows] = useState(2);
  const [customInSample, setCustomInSample] = useState(60);
  const [customValidation, setCustomValidation] = useState(20);
  const [customOutOfSample, setCustomOutOfSample] = useState(20);
  const [busy, setBusy] = useState(false);
  const [controller, setController] = useState<AbortController>();

  const latestProposal = runtimeSnapshot?.proposal.latestProposal;
  const proposalWalkForwardStatus = latestProposal
    ? latestRun?.proposalId === latestProposal.proposalId
      ? `Proposal ${latestProposal.proposalId} has latest walk-forward validation.`
      : "Latest proposal has not been walk-forward validated yet."
    : "No active proposal selected for walk-forward validation.";

  const refresh = () => {
    setLatestRun(latestWalkForwardRun(loadWalkForwardState()));
    void resolveResearchRuntimeSnapshot()
      .then(setRuntimeSnapshot)
      .catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    window.addEventListener(WALK_FORWARD_UPDATED_EVENT, refresh);
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(WALK_FORWARD_UPDATED_EVENT, refresh);
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
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

      <Card className="border-cyan-400/20 bg-cyan-400/5">
        <CardContent className="grid gap-3 p-4 text-sm text-cyan-50 md:grid-cols-2 xl:grid-cols-5">
          <StatusTile label="Active data" value={selectRuntimeSourceLabel(runtimeSnapshot)} />
          <StatusTile label="Candle window" value={runtimeSnapshot ? `${runtimeSnapshot.marketData.researchWindow.toLocaleString()} raw / ${runtimeSnapshot.marketData.processedCandleCount.toLocaleString()} ${runtimeSnapshot.marketData.timeframe}` : "loading"} />
          <StatusTile label="Active calibration" value={runtimeSnapshot?.activeConfig.activeCalibrationId ?? "default baseline"} />
          <StatusTile label="Config merge" value={runtimeSnapshot?.activeConfig.configMergeStatusLabel ?? "loading"} />
          <StatusTile label="Fingerprint" value={selectRuntimeFingerprintLabel(runtimeSnapshot)} />
        </CardContent>
      </Card>

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
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground" htmlFor="walk-forward-mode">Mode</label>
                <Select
                  id="walk-forward-mode"
                  value={mode}
                  disabled={busy}
                  onChange={(event) => {
                    const next = event.target.value as WalkForwardMode;
                    setMode(next);
                    setMaxWindows(next === "advanced" ? 5 : next === "standard" ? 3 : 2);
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
              <Button onClick={run} disabled={busy} className="justify-center gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                {busy ? "Walk-forward running" : "Run Walk-Forward"}
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
                overfit: {latestRun?.stability?.overfitRisk ?? "unknown"}
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
            </div>
            <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3 text-sm text-cyan-100">
              {latestRun?.progress?.message ?? latestRun?.stability?.recommendedNextAction ?? "No walk-forward run has completed yet."}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Calibration Promotion Gate</CardTitle>
          <CardDescription>Self-improvement proposals should pass out-of-sample checks before trust increases.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          <StatusTile label="Latest proposal" value={latestProposal?.proposalId ?? "none"} />
          <StatusTile label="Walk-forward status" value={proposalWalkForwardStatus} />
          <StatusTile label="Promotion warning" value={latestRun?.stability?.overfitRisk === "high" ? "Likely overfit; do not promote." : "Approval still requires manual review."} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-Window Results</CardTitle>
          <CardDescription>Each row is one rolling window with its out-of-sample result.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-border bg-muted/45 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-medium">Window</th>
                <th className="px-3 py-3 font-medium">Verdict</th>
                <th className="px-3 py-3 text-right font-medium">OOS trades</th>
                <th className="px-3 py-3 text-right font-medium">OOS win</th>
                <th className="px-3 py-3 text-right font-medium">OOS avg R</th>
                <th className="px-3 py-3 text-right font-medium">OOS DD</th>
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
                      <td className="px-3 py-3 text-right tabular-nums">{oos.readinessScore}</td>
                      <td className="px-3 py-3 text-muted-foreground">{row.failReasons[0] ?? "Passed validation and out-of-sample checks."}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
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
