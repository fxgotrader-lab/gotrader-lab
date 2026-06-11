import { Link } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useLatestValidationChainEntry } from "@/components/common/ValidationChainCard";
import { useSourceStatusSnapshot } from "@/components/common/SourceStatusBanner";
import { sourceStatusLabel } from "@/lib/sourceStatus";
import { validationChainStatusLabel } from "@/lib/validationChain";
import { AUTHORITY_BADGE_LABEL, WORKSPACE_CARD } from "@/components/common/workspaceStyles";

type ValidateWorkspaceSummaryProps = {
  /** Page-specific status line (e.g. snapshot ready, run completed). */
  resultSummary?: string;
  /** What the operator should do next on this page. */
  nextAction: string;
  /** Optional blocker when source or prerequisites are missing. */
  blocker?: string;
  testId?: string;
};

/**
 * Compact validate-workspace readout: source, chain status, result, blocker, next action.
 */
export function ValidateWorkspaceSummary({
  blocker,
  nextAction,
  resultSummary,
  testId = "validate-workspace-summary"
}: ValidateWorkspaceSummaryProps) {
  const source = useSourceStatusSnapshot();
  const chain = useLatestValidationChainEntry();

  const sourceLine = source
    ? `${source.requestedSymbol} / ${source.primaryTimeframe} · ${sourceStatusLabel(source.sourceStatus)}`
    : "Resolving source…";

  const chainLine = chain
    ? `${chain.setupLabel} · ${validationChainStatusLabel(chain.hypothesisStatus)}`
    : "No recognition queued yet";

  return (
    <section data-testid={testId} className={`${WORKSPACE_CARD} px-4 py-3`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Validate workspace</span>
        <Badge variant="muted">{AUTHORITY_BADGE_LABEL}</Badge>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Source</dt>
          <dd className="mt-0.5 text-slate-200">{sourceLine}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Validation chain</dt>
          <dd className="mt-0.5 text-slate-200">{chainLine}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Result</dt>
          <dd className="mt-0.5 text-slate-200">{resultSummary ?? "Not run on this page yet"}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Next action</dt>
          <dd className="mt-0.5 text-slate-200" data-testid="validate-workspace-next-action">
            {nextAction}
          </dd>
        </div>
      </dl>
      {blocker ? (
        <p className="mt-2 text-xs leading-5 text-amber-100" data-testid="validate-workspace-blocker" role="alert">
          Blocker: {blocker}
        </p>
      ) : null}
      {!chain ? (
        <p className="mt-2 text-xs text-slate-400">
          Recognition is not evidence.{" "}
          <Link to="/ict-lab" className="font-medium text-sky-300 underline underline-offset-2">
            Queue replay from ICT Lab
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}
