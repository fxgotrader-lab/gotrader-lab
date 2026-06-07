import { Activity, CheckCircle2, Circle, Clock3, Loader2, ShieldCheck, SkipForward, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  IctActivateMarketResult,
  IctActivateMarketStatus,
  IctActivateMarketStep
} from "@/lib/ict-strategy-suite/ictActivateMarketPipelineTypes";

const formatToken = (value?: string) => (value ?? "idle").replace(/_/g, " ");

const statusVariant = (status?: string) =>
  status === "completed"
    ? "success"
    : status === "partial" || status === "skipped" || status === "unavailable"
      ? "warning"
      : status === "failed"
        ? "danger"
        : status === "running"
          ? "secondary"
          : "muted";

const stepIcon = (step: IctActivateMarketStep) => {
  switch (step.status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-cyan-300" aria-hidden="true" />;
    case "skipped":
      return <SkipForward className="h-4 w-4 text-amber-300" aria-hidden="true" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-rose-300" aria-hidden="true" />;
    default:
      return <Circle className="h-4 w-4 text-slate-600" aria-hidden="true" />;
  }
};

const durationLabel = (durationMs?: number) => {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) return undefined;
  return durationMs < 1000 ? `${Math.round(durationMs)}ms` : `${(durationMs / 1000).toFixed(1)}s`;
};

export function ActivateMarketProgress({
  buttonLabel = "Activate Market",
  disabled = false,
  onActivate,
  result,
  status = result?.status ?? "idle",
  steps = result?.steps ?? [],
  compact = false
}: {
  buttonLabel?: string;
  disabled?: boolean;
  onActivate?: () => void;
  result?: IctActivateMarketResult;
  status?: IctActivateMarketStatus;
  steps?: IctActivateMarketStep[];
  compact?: boolean;
}) {
  const completedCount = steps.filter((step) => step.status === "completed").length;
  const visibleCount = Math.max(steps.length, 1);
  const progressPct = Math.round((completedCount / visibleCount) * 100);
  const activeStep = steps.find((step) => step.status === "running");
  const topIssue = result?.errors[0] ?? result?.warnings[0] ?? activeStep?.message;
  const isRunning = status === "running" || steps.some((step) => step.status === "running");

  return (
    <section
      data-testid="activate-market-progress"
      className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-4 shadow-[0_0_28px_rgba(8,145,178,0.08)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Activate Market Workflow</p>
          <h3 className="mt-1 text-lg font-semibold tracking-normal text-slate-50">
            {activeStep ? activeStep.label : result ? "Activation summary ready" : "Safe research pipeline"}
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            {topIssue ?? "Runs MT5 read-only source checks, current read, signal contract, and next safe action."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant={statusVariant(status)}>{formatToken(status)}</Badge>
          <Badge variant="danger">Authority none</Badge>
          {onActivate ? (
            <Button onClick={onActivate} disabled={disabled || isRunning} size="sm">
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Activating...
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4" aria-hidden="true" />
                  {buttonLabel}
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10" aria-label="Activate Market progress">
        <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {steps.length ? (
        <div className={`mt-4 grid gap-2 ${compact ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
          {steps.map((step) => (
            <div key={step.id} className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span className="mt-0.5 shrink-0">{stepIcon(step)}</span>
                  <span className="block whitespace-normal break-words text-sm font-medium leading-5 text-slate-100">{step.label}</span>
                </div>
                <Badge className="shrink-0" variant={statusVariant(step.status)}>{formatToken(step.status)}</Badge>
              </div>
              <p className="mt-2 line-clamp-2 min-h-[2rem] text-xs leading-4 text-slate-400">
                {step.error ?? step.warning ?? step.message ?? "Waiting."}
              </p>
              {durationLabel(step.durationMs) ? (
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <Clock3 className="h-3 w-3" aria-hidden="true" />
                  {durationLabel(step.durationMs)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 grid gap-2 rounded-lg border border-white/10 bg-black/25 p-3 text-sm md:grid-cols-4">
          <MiniSummary label="Model" value={formatToken(result.summary.modelName ?? "none")} />
          <MiniSummary label="Lane" value={formatToken(result.summary.modelLane ?? "no_trade")} />
          <MiniSummary label="Paper eligible" value={result.cmdPaperEligibility?.eligible ? "yes" : "no"} />
          <MiniSummary label="Execution" value="disabled" />
          <div className="md:col-span-4">
            <div className="flex items-start gap-2 text-xs leading-5 text-slate-300">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" aria-hidden="true" />
              <span>
                Next action: <span className="font-medium text-slate-100">{result.operatorWorkflow?.recommendedAction ?? result.summary.nextAction ?? "Wait / Check MT5 Depth"}</span>.
                Heavy research actions remain manual and deferred.
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MiniSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 truncate font-medium text-slate-100">{value}</p>
    </div>
  );
}
