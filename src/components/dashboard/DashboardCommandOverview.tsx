import { Link } from "react-router-dom";
import { ArrowRight, Gauge } from "lucide-react";

import { useLatestValidationChainEntry } from "@/components/common/ValidationChainCard";
import { useSourceStatusSnapshot } from "@/components/common/SourceStatusBanner";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { sourceStatusLabel } from "@/lib/sourceStatus";
import { validationChainStatusLabel } from "@/lib/validationChain";
import { cn } from "@/lib/utils";
import {
  AUTHORITY_BADGE_LABEL,
  WORKSPACE_CARD_ACCENT,
  WORKSPACE_METRIC_GRID,
  WORKSPACE_SECTION_LABEL
} from "@/components/common/workspaceStyles";

type DashboardCommandOverviewProps = {
  className?: string;
  paperDemoBlocker?: string;
  paperDemoCandidate?: boolean;
  primaryBlocker?: string;
  primarySetupLabel?: string;
  researchReady?: boolean;
  validationNextAction?: string;
};

/**
 * Command overview strip: answers source, recognition, validation next step,
 * Research Ready / Paper-Demo status, and where to click next.
 */
export function DashboardCommandOverview({
  className,
  paperDemoBlocker,
  paperDemoCandidate,
  primaryBlocker,
  primarySetupLabel = "waiting for Activate Market",
  researchReady,
  validationNextAction
}: DashboardCommandOverviewProps) {
  const source = useSourceStatusSnapshot();
  const chain = useLatestValidationChainEntry();

  const sourceLabel = source
    ? `${source.requestedSymbol} ← ${source.brokerSymbol ?? "n/a"} · ${source.primaryTimeframe} · ${sourceStatusLabel(source.sourceStatus)}`
    : "Resolving MT5 / import source…";

  const validationLabel = chain
    ? `${chain.setupLabel} · ${validationChainStatusLabel(chain.hypothesisStatus)}`
    : "No validation queued — recognition is not evidence";

  const nextStep =
    validationNextAction ??
    chain?.nextAction ??
    (source?.isMockOrSample
      ? "Activate MT5 read-only research source before queuing validation."
      : primaryBlocker ?? "Open Advisor and run Activate Market.");

  return (
    <section
      data-testid="dashboard-command-overview"
      className={cn(`${WORKSPACE_CARD_ACCENT} px-4 py-4 sm:px-5`, className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
          <div>
            <p className={WORKSPACE_SECTION_LABEL}>Command overview</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-50">Research workflow at a glance</h3>
          </div>
          <Badge variant="muted">{AUTHORITY_BADGE_LABEL}</Badge>
        </div>
        <Link
          to="/advisor"
          className={buttonVariants({ variant: "secondary", size: "sm", className: "inline-flex items-center gap-1.5" })}
        >
          Open Advisor
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <dl className={`mt-4 ${WORKSPACE_METRIC_GRID}`}>
        <OverviewTile label="Market / source" testId="dashboard-overview-source" value={sourceLabel} />
        <OverviewTile label="Latest setup" testId="dashboard-overview-setup" value={primarySetupLabel} />
        <OverviewTile label="Validation chain" testId="dashboard-overview-validation" value={validationLabel} />
        <OverviewTile
          label="Research Ready"
          testId="dashboard-overview-research-ready"
          value={researchReady === undefined ? "loading" : researchReady ? "yes — checklist gates passed" : "no — more evidence required"}
        />
        <OverviewTile
          label="Paper-Demo Candidate"
          testId="dashboard-overview-paper-demo"
          value={
            paperDemoCandidate === undefined
              ? "loading"
              : paperDemoCandidate
                ? "yes — review only, no execution"
                : `blocked — ${paperDemoBlocker ?? "evidence incomplete"}`
          }
        />
        <OverviewTile label="Next action" testId="dashboard-overview-next-action" value={nextStep} emphasis />
      </dl>
      {source?.isMockOrSample ? (
        <p className="mt-3 text-xs leading-5 text-amber-100" role="alert">
          Mock/sample data — not research evidence.{" "}
          <Link to="/advisor" className="font-medium underline underline-offset-2">
            Activate MT5 Research Mode
          </Link>{" "}
          or{" "}
          <Link to="/market-data" className="font-medium underline underline-offset-2">
            import historical data
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}

function OverviewTile({ emphasis, label, testId, value }: { emphasis?: boolean; label: string; testId: string; value: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-black/25 px-4 py-3", emphasis && "border-primary/25 bg-primary/[0.065]")}>
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm font-medium leading-5 text-slate-100" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
