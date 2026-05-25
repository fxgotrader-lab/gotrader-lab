import { ExternalLink, GitBranch } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AutoResearchCycle } from "@/lib/autoResearch";

import { formatDateTime, formatNumber } from "./dashboardFormatters";

type AutoResearchStatusCardProps = {
  cycle?: AutoResearchCycle;
};

export function AutoResearchStatusCard({ cycle }: AutoResearchStatusCardProps) {
  const bestCandidate = cycle?.bestCandidate;
  const rejectedCount = cycle?.rejectedCandidates.length ?? 0;

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <GitBranch className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            Auto Research Status
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Configuration search stays simulation-only.</p>
        </div>
        <Badge variant={cycle ? "success" : "secondary"}>{cycle?.status ?? "Idle"}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Latest cycle" value={formatDateTime(cycle?.timestamp)} />
          <StatusLine label="Best candidate" value={bestCandidate?.label ?? "No candidate yet"} />
          <StatusLine label="Rejected candidates" value={String(rejectedCount)} />
          <StatusLine label="Proposal created" value={cycle?.createdProposalId ?? "None"} />
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Stability score</div>
          <div className="mt-1 text-lg font-semibold text-emerald-200">
            {formatNumber(bestCandidate?.scoreBreakdown.totalScore, 1)}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Best candidates are selected for stability first, not highest profit alone.
          </p>
        </div>
        <Link to="/auto-research">
          <Button variant="secondary" className="w-full justify-between">
            Open auto research
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
