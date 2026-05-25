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

import { formatDateTime } from "./dashboardFormatters";

type ResearchCycleControlProps = {
  state: LabState;
  onCycleUpdate?: () => void;
};

const statusVariant = (status?: ResearchCycleRun["status"]) =>
  status === "completed" ? "success" : status === "failed" ? "danger" : status === "running" ? "warning" : "secondary";

const stepVariant = (status: ResearchCycleStepStatus) =>
  status === "completed"
    ? "success"
    : status === "failed"
      ? "danger"
      : status === "warning"
        ? "warning"
        : status === "running"
          ? "secondary"
          : "muted";

const stepIcon = (status: ResearchCycleStepStatus) => {
  if (status === "completed") {
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
    const steps = latestRun?.steps ?? [];
    const terminalSteps = steps.filter((step) => ["completed", "warning", "failed", "skipped"].includes(step.status)).length;
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
            One safe sequence for LLM advisory, auto-research, validation, quality review, proposals, readiness, and audit logging.
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
                Candidate {latestRun.candidateProgress.currentCandidate}/{latestRun.candidateProgress.totalCandidates}{" "}
                tested. Best so far: {latestRun.candidateProgress.bestCandidateLabel ?? "none"}.
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
          {(latestRun?.steps ?? []).map((step) => (
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
