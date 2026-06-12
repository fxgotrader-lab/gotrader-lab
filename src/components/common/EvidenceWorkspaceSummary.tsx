import { Link } from "react-router-dom";
import { DatabaseZap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useLatestValidationChainEntry } from "@/components/common/ValidationChainCard";
import { AUTHORITY_BADGE_LABEL, WORKSPACE_CARD, WORKSPACE_SECTION_LABEL } from "@/components/common/workspaceStyles";

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
        <DatabaseZap className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className={WORKSPACE_SECTION_LABEL}>Evidence workspace</span>
        <Badge variant="muted">{AUTHORITY_BADGE_LABEL}</Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <EvidenceTile label="Evidence score" value={evidenceScore !== undefined ? `${evidenceScore}/100` : "loading"} />
        <EvidenceTile label="Maturity score" value={maturityScore !== undefined ? `${maturityScore}/100` : "loading"} />
        <EvidenceTile label="Missing evidence" value={missingEvidence ?? "Resolving ledger..."} />
        <EvidenceTile
          emphasized
          label="Paper-Demo blocker"
          value={paperDemoBlocker ?? "Checklist is reporting-only; cannot promote readiness."}
        />
      </dl>
      <p className="mt-3 text-xs leading-5 text-slate-400" data-testid="evidence-workspace-next-validation">
        Next validation: {nextValidation}. Recognition is not evidence.{" "}
        <Link to="/replay" className="font-medium text-sky-300 underline underline-offset-2">
          Replay
        </Link>{" "}
        to{" "}
        <Link to="/walk-forward" className="font-medium text-sky-300 underline underline-offset-2">
          Walk-forward
        </Link>{" "}
        before treating scores as readiness input.
      </p>
    </section>
  );
}

function EvidenceTile({ emphasized, label, value }: { emphasized?: boolean; label: string; value: string }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${emphasized ? "border-primary/20 bg-primary/[0.055]" : "border-white/10 bg-black/20"}`}>
      <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">{label}</dt>
      <dd className={`mt-1 ${emphasized ? "text-slate-100" : "text-slate-200"}`}>{value}</dd>
    </div>
  );
}
