import { ExternalLink, Gauge } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ManualApprovalRecord, ReadinessGateSnapshot } from "@/lib/readiness";

import { formatDateTime } from "./dashboardFormatters";

type ReadinessSummaryCardProps = {
  manualApproval: ManualApprovalRecord;
  readiness: ReadinessGateSnapshot;
};

export function ReadinessSummaryCard({ manualApproval, readiness }: ReadinessSummaryCardProps) {
  const failedCount = readiness.failedRequirements.length;
  const llmRequirement = readiness.llmSnapshot?.advisoryPassed ? "Passed" : "Required";

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <Gauge className="h-4 w-4 text-amber-300" aria-hidden="true" />
            Readiness Gate
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Paper-demo candidate requires all gates and approval.</p>
        </div>
        <Badge variant={readiness.state === "Paper-Demo Candidate" ? "success" : readiness.state === "Research Ready" ? "warning" : "danger"}>
          {readiness.state}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Failed requirements" value={String(failedCount)} />
          <StatusLine label="Manual approval" value={manualApproval.status} />
          <StatusLine label="LLM advisory requirement" value={llmRequirement} />
          <StatusLine label="Gate evaluated" value={formatDateTime(readiness.evaluatedAt)} />
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
          {readiness.recommendedNextStep}
        </div>
        <Link to="/readiness-gate">
          <Button variant="secondary" className="w-full justify-between">
            Review readiness gate
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
