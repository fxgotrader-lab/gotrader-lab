import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock, PauseCircle, RadioTower } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AutonomousResearchRun, AutonomousResearchStatus } from "@/lib/autonomousResearch";
import { cn } from "@/lib/utils";

type AutonomousLoopProgressProps = {
  busy: boolean;
  onDiscardRecovery?: () => void;
  recoveryRun?: AutonomousResearchRun;
  run?: AutonomousResearchRun;
};

const statusVariant = (status?: AutonomousResearchStatus) =>
  status === "running"
    ? "warning"
    : status === "completed"
      ? "success"
      : status === "failed"
        ? "danger"
        : status === "paused" || status === "canceled" || status === "completed_with_warnings"
          ? "warning"
          : "secondary";

const formatToken = (value?: string) => (value ?? "idle").replace(/_/g, " ");

const formatElapsed = (startedAt?: string, completedAt?: string) => {
  if (!startedAt) {
    return "00:00";
  }
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const elapsed = Math.max(0, end - new Date(startedAt).getTime());
  const totalSeconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export function AutonomousLoopProgress({
  busy,
  onDiscardRecovery,
  recoveryRun,
  run
}: AutonomousLoopProgressProps) {
  const [tick, setTick] = useState(0);
  const progress = run?.progress;
  const status = progress?.status ?? run?.status ?? "idle";
  const isRunning = busy || status === "running";
  const progressPercent = Math.max(0, Math.min(100, progress?.progressPercent ?? (status === "completed" ? 100 : 0)));
  const elapsed = useMemo(
    () => formatElapsed(progress?.startedAt ?? run?.startedAt, run?.completedAt),
    [progress?.startedAt, run?.completedAt, progress?.updatedAt, isRunning, tick]
  );

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  return (
    <section className="rounded-xl border border-cyan-300/20 bg-slate-950/80 p-4 shadow-[0_0_45px_rgba(34,211,238,0.08)]">
      {recoveryRun ? (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Previous autonomous loop stopped before completion.</p>
              <p className="text-amber-100/80">Discard the checkpoint before starting a fresh supervisor run.</p>
            </div>
          </div>
          <Button variant="outline" onClick={onDiscardRecovery}>Discard checkpoint</Button>
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Loop progress</p>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-50">
            {isRunning ? <RadioTower className="h-4 w-4 animate-pulse text-cyan-200" aria-hidden="true" /> : null}
            {progress?.currentTask ?? "Autonomous research loop idle."}
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            Active stage: {progress?.activeStageLabel ?? "Idle"}.
            {progress?.lastCompletedStageLabel ? ` Last completed: ${progress.lastCompletedStageLabel}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(status)}>{formatToken(status)}</Badge>
          <Badge variant="secondary">
            Iteration {progress?.currentIteration ?? run?.currentIteration ?? 0}/{progress?.maxIterations ?? run?.settings.maxIterations ?? 0}
          </Badge>
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
            {elapsed}
          </Badge>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span>{progress?.activeStageLabel ?? "Idle"}</span>
          <span className="font-mono text-cyan-100">{progressPercent}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn(
              "h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-300 to-emerald-300 transition-all duration-500",
              isRunning && "animate-pulse"
            )}
            style={{ width: `${progressPercent}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      {status === "failed" || status === "canceled" || status === "paused" ? (
        <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
          <div className="flex items-start gap-2">
            <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">{formatToken(progress?.stopReason ?? run?.stopReason ?? status)}</p>
              <p className="mt-1 text-amber-100/80">
                {progress?.stopReasonDetail ?? run?.stopReasonDetail ?? "The loop stopped and is no longer running."}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 text-xs text-slate-300 md:grid-cols-4">
        <Readout label="Broker execution" value="disabled" />
        <Readout label="Live trading" value="disabled" />
        <Readout label="Go-Trader gate" value="locked unless review-eligible" />
        <Readout label="Tradovate gate" value="future locked" />
      </div>
    </section>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 truncate font-mono text-xs text-slate-100">{value}</div>
    </div>
  );
}
