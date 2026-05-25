import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Play, ShieldCheck } from "lucide-react";

import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
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
const dashboardSearchModes: Array<{ label: string; value: AutoResearchSearchMode; count: number }> = [
  { label: "Quick - 5 candidates", value: "quick", count: 5 },
  { label: "Standard - 10 candidates", value: "standard", count: 10 },
  { label: "Deep - 25 candidates", value: "deep", count: 25 }
];

export function ResearchCycleControl({ state, onCycleUpdate }: ResearchCycleControlProps) {
  const [cycleState, setCycleState] = useState(() => loadResearchCycleState());
  const [activeRun, setActiveRun] = useState<ResearchCycleRun>();
  const [searchMode, setSearchMode] = useState<AutoResearchSearchMode>("standard");
  const [busy, setBusy] = useState(false);
  const latestRun = activeRun ?? latestResearchCycleRun(cycleState);
  const selectedSearchMode = dashboardSearchModes.find((mode) => mode.value === searchMode) ?? dashboardSearchModes[1];
  const researchCalibrationAvailable = Boolean(
    latestRun?.createdProposalId && latestRun.autoResearchCycle?.noSafePaperDemoCandidateFound
  );

  useEffect(() => {
    const refresh = () => setCycleState(loadResearchCycleState());
    window.addEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

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
        searchMode,
        maxCandidateCount: selectedSearchMode.count,
        onUpdate: (run) => {
          setActiveRun(run);
          onCycleUpdate?.();
        }
      });
      setActiveRun(result);
      setCycleState(loadResearchCycleState());
      onCycleUpdate?.();
    } finally {
      setBusy(false);
    }
  };

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
              disabled={busy}
              value={searchMode}
              options={dashboardSearchModes.map((mode) => ({ label: mode.label, value: mode.value }))}
              onChange={(event) => setSearchMode(event.target.value as AutoResearchSearchMode)}
            />
            <Button onClick={runCycle} disabled={busy} className="h-12 w-full justify-center gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              Run AI Research Cycle
            </Button>
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
              <p className="mt-1 truncate font-semibold text-slate-100">
                {researchCalibrationAvailable
                  ? "Research calibration proposal available"
                  : latestRun.createdProposalId ?? latestRun.proposalStatus ?? "No proposal"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Blockers</p>
              <p className="mt-1 font-semibold text-slate-100">{safeArray(latestRun.blockers).length}</p>
            </div>
          </div>
        ) : null}

        {safeArray(latestRun?.blockers).length ? (
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            <p className="font-medium">Current blockers</p>
            <ul className="mt-2 space-y-1">
              {safeTopN(latestRun?.blockers, 4).map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {latestRun?.backtestSummary?.totalTrades === 0 ? (
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
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
            </div>
            <p className="mt-3 text-xs text-amber-100/80">
              Next action: {safeArray(latestRun.backtestDiagnostics)[0]?.suggestedFix ?? "Run bounded recovery in Auto Research, then rerun validation."}
            </p>
            {latestRun.createdProposalId && latestRun.autoResearchCycle?.recoveryAttempted && (latestRun.autoResearchCycle.tradesAfterRecovery ?? 0) > 0 ? (
              <div className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">
                Research calibration proposal available: lower confluence threshold slightly.
              </div>
            ) : null}
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
