import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, PauseCircle, Play, RotateCcw, ShieldAlert } from "lucide-react";

import { AutonomySafetyPolicyPanel } from "@/components/autonomous-research/AutonomySafetyPolicyPanel";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  AUTONOMOUS_RESEARCH_UPDATED_EVENT,
  clearAutonomousResearchHistory,
  latestAutonomousResearchRun,
  loadAutonomousResearchState,
  runAutonomousResearchLoop,
  type AutonomousResearchRun,
  type AutonomousResearchState
} from "@/lib/autonomousResearch";
import { latestAutoResearchCycle, loadAutoResearchState } from "@/lib/autoResearch";
import {
  ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT,
  SELF_IMPROVEMENT_UPDATED_EVENT
} from "@/lib/selfImprovement";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeFingerprintLabel,
  selectRuntimeSourceLabel,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";
import { RESEARCH_CYCLE_UPDATED_EVENT } from "@/lib/researchCycle";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  MARKET_DATA_IMPORT_UPDATED_EVENT
} from "@/lib/marketData";
import { hermesNotificationHookSpec } from "@/lib/integrations/hermesNotificationHooks";
import { openClawMemoryHookSpec } from "@/lib/integrations/openclawMemoryHooks";
import type { LabState } from "@/lib/types";
import { safeArray, safeTopN } from "@/lib/utils";
import { WALK_FORWARD_UPDATED_EVENT } from "@/lib/walkForward";

const statusVariant = (status?: string) =>
  status === "completed"
    ? "success"
    : status === "failed"
      ? "danger"
      : status === "paused" || status === "completed_with_warnings" || status === "canceled"
        ? "warning"
        : status === "running"
          ? "warning"
          : "secondary";

const formatToken = (value?: string) => (value ?? "idle").replace(/_/g, " ");

export function AutonomousResearchView({ state }: { state: LabState }) {
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
  const latestAutoResearch = latestAutoResearchCycle(loadAutoResearchState());

  const refresh = () => {
    setAutonomyState(loadAutonomousResearchState());
    void resolveResearchRuntimeSnapshot().then(setRuntimeSnapshot).catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    window.addEventListener(AUTONOMOUS_RESEARCH_UPDATED_EVENT, refresh);
    window.addEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
    window.addEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
    window.addEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
    window.addEventListener(WALK_FORWARD_UPDATED_EVENT, refresh);
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(AUTONOMOUS_RESEARCH_UPDATED_EVENT, refresh);
      window.removeEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
      window.removeEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
      window.removeEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
      window.removeEventListener(WALK_FORWARD_UPDATED_EVENT, refresh);
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const currentIteration = latestRun?.iterations.find((iteration) => iteration.iteration === latestRun.currentIteration);
  const autoApplySummary = latestRun?.latestAutoApplyEligibility;
  const history = useMemo(() => safeTopN(latestRun?.iterations, 8), [latestRun]);

  const startLoop = async () => {
    const controller = new AbortController();
    setAbortController(controller);
    setBusy(true);
    setLiveRun(undefined);
    try {
      const run = await runAutonomousResearchLoop({
        state,
        settings: {
          maxIterations: Number(maxIterations),
          noImprovementStop: Number(noImprovementStop),
          safeImportedDataMode: true,
          advancedFullResearchMode,
          autoApplyPolicyEnabled
        },
        signal: controller.signal,
        onUpdate: setLiveRun
      });
      setLiveRun(run);
      setAutonomyState(loadAutonomousResearchState());
      await resolveResearchRuntimeSnapshot().then(setRuntimeSnapshot).catch(() => undefined);
    } finally {
      setBusy(false);
      setAbortController(undefined);
    }
  };

  const stopLoop = () => {
    abortController?.abort();
  };

  const clearHistory = () => {
    if (window.confirm("Clear autonomous research loop history? This does not delete research cycles, proposals, readiness, or market data.")) {
      setAutonomyState(clearAutonomousResearchHistory());
      setLiveRun(undefined);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Autonomous research</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Research Supervisor Loop</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Runs a bounded simulation-only loop: diagnose blockers, select scenario families, run research cycles, validate proposals,
            and stop before paper-demo, go-trader, broker, or readiness authority.
          </p>
        </div>
        <Badge variant={statusVariant(latestRun?.status)}>{formatToken(latestRun?.status)}</Badge>
      </div>

      <SafetyLockBanner message="Autonomous research is simulation-only. It cannot execute trades, approve Paper-Demo Candidate, send go-trader handoffs, or override readiness." />

      <AutonomySafetyPolicyPanel latestAutoResearch={latestAutoResearch} snapshot={runtimeSnapshot} />

      <Card>
        <CardHeader>
          <CardTitle>External Advisory Memory</CardTitle>
          <CardDescription>
            Planned OpenClaw memory and Hermes notification hooks for future local/VPS bridge review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <StatusTile label="OpenClaw memory" value={formatToken(openClawMemoryHookSpec.openClawMemory)} />
            <StatusTile label="Hermes notifications" value={formatToken(hermesNotificationHookSpec.hermesNotifications)} />
            <StatusTile label="Authority" value="execution none / broker none / readiness override none" />
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Events planned for external review</p>
            <p className="mt-1 text-muted-foreground">
              {openClawMemoryHookSpec.events.map(formatToken).join(", ")}. Hermes can later notify on{" "}
              {hermesNotificationHookSpec.events.slice(0, 5).map(formatToken).join(", ")}.
            </p>
          </div>
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
            External hooks are planning-only and advisory. They cannot approve proposals, execute trades, change readiness, or send go-trader handoffs.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
            Loop Controls
          </CardTitle>
          <CardDescription>Auto-apply remains off unless policy mode is explicitly enabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="autonomy-max-iterations">Max iterations</Label>
              <Select
                id="autonomy-max-iterations"
                value={maxIterations}
                options={[1, 2, 3, 4, 5].map((value) => ({ label: String(value), value: String(value) }))}
                onChange={(event) => setMaxIterations(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="autonomy-no-improvement">No improvement stop</Label>
              <Select
                id="autonomy-no-improvement"
                value={noImprovementStop}
                options={[1, 2, 3].map((value) => ({ label: `${value} cycle${value === 1 ? "" : "s"}`, value: String(value) }))}
                onChange={(event) => setNoImprovementStop(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background/45 p-3 text-sm">
              <input
                type="checkbox"
                checked={autoApplyPolicyEnabled}
                onChange={(event) => setAutoApplyPolicyEnabled(event.target.checked)}
              />
              Enable policy-gated auto-apply
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background/45 p-3 text-sm">
              <input
                type="checkbox"
                checked={advancedFullResearchMode}
                onChange={(event) => setAdvancedFullResearchMode(event.target.checked)}
              />
              Advanced full research mode
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={startLoop} disabled={busy}>
              <Play className="h-4 w-4" aria-hidden="true" />
              {busy ? "Running loop" : "Start Autonomous Loop"}
            </Button>
            {busy ? (
              <Button variant="destructive" onClick={stopLoop}>
                <PauseCircle className="h-4 w-4" aria-hidden="true" />
                Stop loop
              </Button>
            ) : null}
            <Button variant="outline" onClick={refresh}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
          </div>
          {autoApplyPolicyEnabled ? (
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
              Policy-gated auto-apply can apply only safe research calibration fields. It still cannot approve readiness,
              enable demo/live trading, or send go-trader handoffs.
            </div>
          ) : (
            <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3 text-sm text-cyan-100">
              Auto-apply is disabled. The loop will run research and mark proposals as blocked/pending for review.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Current Loop Status</CardTitle>
            <CardDescription>Latest iteration, blocker diagnosis, and scenario-selection decision.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <StatusTile label="Run ID" value={latestRun?.runId ?? "none"} />
            <StatusTile label="Current iteration" value={`${latestRun?.currentIteration ?? 0}/${latestRun?.settings.maxIterations ?? maxIterations}`} />
            <StatusTile label="Selected scenario family" value={formatToken(latestRun?.latestScenarioFamily)} />
            <StatusTile label="Latest blocker" value={formatToken(latestRun?.latestBlocker)} />
            <StatusTile label="Candidate result" value={latestRun?.latestCandidateResult ?? "none"} />
            <StatusTile label="Stop reason" value={latestRun?.stopReason ? formatToken(latestRun.stopReason) : "not stopped"} />
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Scenario reason</p>
              <p className="mt-1 text-foreground">{latestRun?.latestScenarioReason ?? currentIteration?.scenarioReason ?? "Run the loop to select a scenario family."}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auto-Apply and Handoff Gate</CardTitle>
            <CardDescription>Research-only auto-apply and go-trader review eligibility.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <StatusTile label="Eligibility" value={formatToken(autoApplySummary?.status)} />
              <StatusTile label="Applied calibration" value={latestRun?.latestAutoAppliedCalibrationId ?? "none"} />
              <StatusTile label="Walk-forward verdict" value={formatToken(autoApplySummary?.walkForwardVerdict)} />
              <StatusTile label="Handoff review eligible" value={latestRun?.goTraderHandoffGate.eligibleForReview ? "yes" : "no"} />
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Auto-apply details</p>
              {autoApplySummary?.reasons.length ? (
                <ul className="mt-2 space-y-1">
                  {safeTopN(autoApplySummary.reasons, 5).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground">No auto-apply decision yet.</p>
              )}
            </div>
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              Go-trader handoff gate is review-only. Broker execution remains disabled.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loop History</CardTitle>
          <CardDescription>Compact local history of each iteration and stop condition.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {history.length ? (
            history.map((iteration) => (
              <div key={iteration.iteration} className="rounded-lg border border-border bg-background/45 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Iteration {iteration.iteration}</p>
                    <p className="mt-1 text-muted-foreground">{iteration.scenarioReason ?? "No scenario reason recorded."}</p>
                  </div>
                  <Badge variant={iteration.status === "failed" ? "danger" : iteration.status === "warning" ? "warning" : "secondary"}>
                    {iteration.status}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  <StatusTile label="Cycle" value={iteration.cycleId ?? "none"} />
                  <StatusTile label="Proposal" value={iteration.proposalId ?? "none"} />
                  <StatusTile label="Walk-forward" value={formatToken(iteration.walkForwardVerdict)} />
                  <StatusTile label="Readiness" value={iteration.readinessState ?? "n/a"} />
                </div>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {safeTopN(iteration.notes, 4).map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              No autonomous loop has run yet.
            </div>
          )}
        </CardContent>
      </Card>

      <TechnicalDetails title="Advanced autonomous research details" description="Open for runtime source, drift history, and storage controls.">
        <div className="grid gap-3 md:grid-cols-3">
          <StatusTile label="Runtime source" value={selectRuntimeSourceLabel(runtimeSnapshot)} />
          <StatusTile label="Run fingerprint" value={selectRuntimeFingerprintLabel(runtimeSnapshot)} />
          <StatusTile label="Maturity trend" value={latestRun?.maturityTrend ?? runtimeSnapshot?.maturity.maturitySummary.trendAvailability.message ?? "unknown"} />
        </div>
        <div className="mt-3 rounded-lg border border-border bg-background/45 p-3 text-sm">
          <p className="font-medium">Calibration drift history</p>
          {safeArray(latestRun?.calibrationDriftHistory).length ? (
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {safeArray(latestRun?.calibrationDriftHistory).map((entry) => (
                <li key={entry.id}>
                  {entry.proposalId}: maturity {entry.maturityScoreBefore} → {entry.maturityScoreAfter}; evidence {entry.evidenceQualityScore}/100.
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">No autonomous calibration drift recorded.</p>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
          <span>Clearing autonomous loop history does not delete research cycles, proposals, market data, or readiness state.</span>
          <Button variant="destructive" onClick={clearHistory}>Clear autonomous history</Button>
        </div>
        <div className="mt-3">
          <Link to="/communications">
            <Button variant="secondary">Open communications audit</Button>
          </Link>
        </div>
      </TechnicalDetails>
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/45 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-xs text-foreground">{value}</p>
    </div>
  );
}
