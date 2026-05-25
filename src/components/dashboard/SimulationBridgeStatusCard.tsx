import { Cable, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SimulationRunbookState } from "@/lib/simulationRunbook";
import type { GoTraderHandoffAuditEntry } from "@/lib/types";

import { formatDateTime } from "./dashboardFormatters";

type SimulationBridgeStatusCardProps = {
  completedRunbookItems: number;
  handoff?: GoTraderHandoffAuditEntry;
  runbook: SimulationRunbookState;
  totalRunbookItems: number;
};

export function SimulationBridgeStatusCard({
  completedRunbookItems,
  handoff,
  runbook,
  totalRunbookItems,
}: SimulationBridgeStatusCardProps) {
  const brokerSkipped = runbook.checklist.brokerExecutionSkipped;
  const tradesZero = runbook.checklist.tradesZero;

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <Cable className="h-4 w-4 text-teal-300" aria-hidden="true" />
            Simulation Bridge Status
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">AI Lab handoff to go-trader stays execution-free.</p>
        </div>
        <Badge variant={brokerSkipped && tradesZero ? "success" : "warning"}>
          {brokerSkipped && tradesZero ? "Safe verified" : "Verify runbook"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Latest handoff export" value={formatDateTime(handoff?.exportedAt)} />
          <StatusLine label="Scheduler verification" value={formatDateTime(runbook.verifiedAt)} />
          <StatusLine label="Broker execution skipped" value={brokerSkipped ? "Yes" : "Not confirmed"} />
          <StatusLine label="Trades" value={tradesZero ? "0" : "Not confirmed"} />
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Runbook completion</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-100">
            {completedRunbookItems}/{totalRunbookItems}
          </div>
        </div>
        <Link to="/simulation-runbook">
          <Button variant="secondary" className="w-full justify-between">
            Verify simulation bridge
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
