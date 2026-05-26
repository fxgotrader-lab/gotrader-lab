import { ExternalLink, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CanonicalPerformanceMetrics } from "@/lib/performance/canonicalMetrics";
import type { CalibrationProposal } from "@/lib/selfImprovement";
import { formatPercent } from "@/lib/utils";

import { formatDateTime, formatR } from "./dashboardFormatters";

type SelfImprovementStatusCardProps = {
  proposal?: CalibrationProposal;
  latestCycleMetrics?: CanonicalPerformanceMetrics;
};

export function SelfImprovementStatusCard({ proposal, latestCycleMetrics }: SelfImprovementStatusCardProps) {
  const status = proposal?.status ?? "none";
  const before = proposal?.metricsSnapshot?.beforeMetrics ?? proposal?.beforeMetrics;
  const after = proposal?.metricsSnapshot?.afterMetrics ?? proposal?.afterMetrics;
  const comparison = proposal?.metricsSnapshot?.comparisonResult ?? proposal?.comparisonResult;

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <SlidersHorizontal className="h-4 w-4 text-violet-300" aria-hidden="true" />
            Self-Improvement Status
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Calibration changes require simulation tests and approval.</p>
        </div>
        <Badge variant={proposal?.status === "accepted" ? "success" : proposal ? "warning" : "secondary"}>
          {status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Latest proposal" value={proposal?.proposalId ?? "None"} />
          <StatusLine label="Created" value={formatDateTime(proposal?.timestamp)} />
          <StatusLine label="Approval required" value={proposal?.approvalRequired ? "Yes" : "No proposal"} />
          <StatusLine label="Source" value={proposal?.source ?? "N/A"} />
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Before / after summary</div>
          <div className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
            <Metric label="Average R" value={`${formatR(before?.averageR)} -> ${formatR(after?.averageR)}`} />
            <Metric label="Drawdown" value={`${formatR(before?.maxDrawdown)} -> ${formatR(after?.maxDrawdown)}`} />
            <Metric label="Result" value={comparison?.recommendation ?? "Not tested"} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {proposal?.metricsSnapshot ? "Using canonical proposal snapshot." : "No canonical snapshot stored yet."}
          </p>
        </div>
        <div className="rounded-md border border-cyan-300/20 bg-cyan-300/5 p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-cyan-100/70">Win rate sources</div>
          <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <Metric
              label="Latest cycle win rate"
              value={latestCycleMetrics ? formatPercent(latestCycleMetrics.winRate, 1) : "n/a"}
            />
            <Metric
              label="Proposal snapshot win rate"
              value={after ? formatPercent(after.winRate, 1) : before ? formatPercent(before.winRate, 1) : "n/a"}
            />
          </div>
          <p className="mt-2 text-xs text-cyan-100/65">
            These can differ when the proposal came from a candidate snapshot instead of the latest Dashboard cycle.
          </p>
        </div>
        <Link to="/self-improvement">
          <Button variant="secondary" className="w-full justify-between">
            Review proposal
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 truncate font-medium text-slate-200">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-words font-medium text-slate-200">{value}</div>
    </div>
  );
}
