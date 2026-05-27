import { Activity, DatabaseZap, Gauge, Lock, ShieldCheck, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AutonomousResearchStatus } from "@/lib/autonomousResearch";
import type { ResearchRuntimeSnapshot } from "@/lib/runtime";
import { cn } from "@/lib/utils";

type MissionControlStatusStripProps = {
  autoApplyPolicyEnabled: boolean;
  loopStatus?: AutonomousResearchStatus;
  snapshot?: ResearchRuntimeSnapshot;
};

const statusVariant = (status?: string) =>
  status === "running"
    ? "warning"
    : status === "completed"
      ? "success"
      : status === "failed"
        ? "danger"
        : status === "paused" || status === "completed_with_warnings"
          ? "warning"
          : "secondary";

const formatToken = (value?: string) => (value ?? "idle").replace(/_/g, " ");

export function MissionControlStatusStrip({
  autoApplyPolicyEnabled,
  loopStatus,
  snapshot
}: MissionControlStatusStripProps) {
  const health =
    !snapshot
      ? "loading"
      : snapshot.diagnostics.mismatchWarnings.length || snapshot.diagnostics.staleStateWarnings.length
        ? "attention"
        : "healthy";
  const evidenceScore = snapshot?.evidence.evidenceQualityScore ?? 0;
  const maturityScore = snapshot?.maturity.maturityScore ?? 0;
  const readinessState = snapshot?.readiness.readinessState ?? "Not Ready";

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <StatusReadout
        icon={Activity}
        label="System health"
        value={health}
        detail={snapshot?.diagnostics.mismatchWarnings[0] ?? "Runtime snapshot synced"}
        variant={health === "healthy" ? "success" : health === "loading" ? "secondary" : "warning"}
      />
      <StatusReadout
        icon={Zap}
        label="Autonomy mode"
        value={autoApplyPolicyEnabled ? "policy-gated" : "proposal-only"}
        detail={`Loop ${formatToken(loopStatus)}`}
        variant={statusVariant(loopStatus)}
      />
      <StatusReadout
        icon={DatabaseZap}
        label="Evidence"
        value={`${evidenceScore}/100`}
        detail={snapshot?.evidence.weakestEvidenceCategories[0]?.replace(/_/g, " ") ?? "quality pending"}
        variant={evidenceScore >= 70 ? "success" : evidenceScore >= 50 ? "warning" : "danger"}
      />
      <StatusReadout
        icon={Gauge}
        label="Maturity"
        value={`${maturityScore}/100`}
        detail={snapshot?.maturity.maturityGrade.replace(/_/g, " ") ?? "untested"}
        variant={maturityScore >= 70 ? "success" : maturityScore >= 45 ? "warning" : "secondary"}
      />
      <StatusReadout
        icon={ShieldCheck}
        label="Readiness"
        value={readinessState}
        detail={snapshot?.readiness.actualBlockers[0] ?? "no active blocker"}
        variant={readinessState === "Paper-Demo Candidate" ? "success" : readinessState === "Research Ready" ? "warning" : "danger"}
      />
      <StatusReadout
        icon={Lock}
        label="Broker execution"
        value="disabled"
        detail="No orders, no handoff authority"
        variant="danger"
      />
    </div>
  );
}

function StatusReadout({
  detail,
  icon: Icon,
  label,
  value,
  variant
}: {
  detail: string;
  icon: typeof Activity;
  label: string;
  value: string;
  variant: "success" | "warning" | "danger" | "secondary";
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/80 p-4 shadow-[0_0_30px_rgba(8,145,178,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 p-2">
          <Icon className="h-4 w-4 text-cyan-200" aria-hidden="true" />
        </div>
        <Badge variant={variant} className="capitalize">
          {value}
        </Badge>
      </div>
      <div className="mt-4 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={cn("mt-1 truncate text-xs text-slate-400", variant === "danger" && "text-rose-100/80")}>{detail}</div>
    </div>
  );
}
