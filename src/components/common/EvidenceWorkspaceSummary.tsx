import { Link } from "react-router-dom";
import { DatabaseZap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useLatestValidationChainEntry } from "@/components/common/ValidationChainCard";
import { AUTHORITY_BADGE_LABEL, WORKSPACE_CARD } from "@/components/common/workspaceStyles";

type EvidenceWorkspaceSummaryProps = {
  evidenceScore?: number;
  maturityScore?: number;
  missingEvidence?: string;
  paperDemoBlocker?: string;
  testId?: string;
};

/**
 * Evidence workspace readout: scores, gaps, Paper-Demo relation, next validation step.
 */
export function EvidenceWorkspaceSummary({
  evidenceScore,
  maturityScore,
  missingEvidence,
  paperDemoBlocker,
  testId = "evidence-workspace-summary"
}: EvidenceWorkspaceSummaryProps) {
  const chain = useLatestValidationChainEntry();

  const nextValidation =
    chain?.nextAction ??
    "Complete replay and walk-forward validation before evidence can support Paper-Demo review.";

  return (
    <section data-testid={testId} className={`${WORKSPACE_CARD} px-4 py-3`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <DatabaseZap className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Evidence workspace</span>
        <Badge variant="muted">{AUTHORITY_BADGE_LABEL}</Badge>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Evidence score</dt>
          <dd className="mt-0.5 text-slate-200">{evidenceScore !== undefined ? `${evidenceScore}/100` : "loading"}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Maturity score</dt>
          <dd className="mt-0.5 text-slate-200">{maturityScore !== undefined ? `${maturityScore}/100` : "loading"}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Missing evidence</dt>
          <dd className="mt-0.5 text-slate-200">{missingEvidence ?? "Resolving ledger…"}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Paper-Demo blocker</dt>
          <dd className="mt-0.5 text-slate-200">{paperDemoBlocker ?? "Checklist is reporting-only — cannot promote readiness."}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-5 text-slate-400" data-testid="evidence-workspace-next-validation">
        Next validation: {nextValidation}. Recognition is not evidence.{" "}
        <Link to="/replay" className="font-medium text-sky-300 underline underline-offset-2">
          Replay
        </Link>{" "}
        →{" "}
        <Link to="/walk-forward" className="font-medium text-sky-300 underline underline-offset-2">
          Walk-forward
        </Link>{" "}
        before treating scores as readiness input.
      </p>
    </section>
  );
}
