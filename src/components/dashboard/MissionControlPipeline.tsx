import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Lock, RadioTower, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type MissionStageStatus = "active" | "waiting" | "blocked" | "complete" | "warning" | "locked";

export type MissionPipelineStage = {
  countLabel?: string;
  href?: string;
  id: string;
  label: string;
  lastEvent?: string;
  status: MissionStageStatus;
  task: string;
};

const statusCopy: Record<MissionStageStatus, string> = {
  active: "active",
  waiting: "waiting",
  blocked: "blocked",
  complete: "complete",
  warning: "warning",
  locked: "locked"
};

const statusVariant = (status: MissionStageStatus) =>
  status === "complete"
    ? "success"
    : status === "active"
      ? "default"
      : status === "blocked" || status === "locked"
        ? "danger"
        : status === "warning"
          ? "warning"
          : "secondary";

const stageIcon = (status: MissionStageStatus) => {
  if (status === "active") {
    return <RadioTower className="h-4 w-4 text-cyan-200" aria-hidden="true" />;
  }
  if (status === "complete") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />;
  }
  if (status === "locked") {
    return <Lock className="h-4 w-4 text-rose-300" aria-hidden="true" />;
  }
  if (status === "blocked" || status === "warning") {
    return <ShieldAlert className="h-4 w-4 text-amber-200" aria-hidden="true" />;
  }
  return <ArrowRight className="h-4 w-4 text-slate-500" aria-hidden="true" />;
};

export function MissionControlPipeline({ stages }: { stages: MissionPipelineStage[] }) {
  return (
    <section className="rounded-xl border border-white/10 bg-slate-950/80 p-4 shadow-[0_0_45px_rgba(8,145,178,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Pipeline</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-50">Autonomous Research Flow</h3>
        </div>
        <Badge variant="danger">Execution authority none</Badge>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage) => {
          const content = (
            <div
              className={cn(
                "group relative h-full overflow-hidden rounded-lg border p-4 transition",
                stage.status === "active"
                  ? "border-cyan-300/50 bg-cyan-300/10 shadow-[0_0_35px_rgba(34,211,238,0.16)]"
                  : stage.status === "locked"
                    ? "border-rose-300/25 bg-rose-300/5"
                    : "border-white/10 bg-white/[0.035] hover:border-cyan-300/25"
              )}
            >
              {stage.status === "active" ? (
                <div className="absolute inset-x-0 top-0 h-px animate-pulse bg-cyan-200" aria-hidden="true" />
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {stageIcon(stage.status)}
                  <span className="text-sm font-semibold text-slate-100">{stage.label}</span>
                </div>
                <Badge variant={statusVariant(stage.status)}>{statusCopy[stage.status]}</Badge>
              </div>
              <p className="mt-3 min-h-10 text-sm text-slate-300">{stage.task}</p>
              <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span className="truncate">{stage.lastEvent ?? "No event yet"}</span>
                <span className="font-mono text-slate-400">{stage.countLabel ?? ""}</span>
              </div>
            </div>
          );

          return stage.href ? (
            <Link key={stage.id} to={stage.href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
              {content}
            </Link>
          ) : (
            <div key={stage.id}>{content}</div>
          );
        })}
      </div>
    </section>
  );
}
