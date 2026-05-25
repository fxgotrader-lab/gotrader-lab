import { useState } from "react";
import { CheckCircle2, ClipboardCheck, FileJson, ShieldAlert, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  bridgeVerificationItems,
  getBridgeStatusSnapshot,
  loadBridgeVerificationState,
  saveBridgeVerificationState,
  type BridgeVerificationKey
} from "@/lib/integrations/bridgeStatus";
import type { GoTraderHandoffAuditEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export function BridgeStatusCard({
  handoffExports,
  compact = false
}: {
  handoffExports: GoTraderHandoffAuditEntry[];
  compact?: boolean;
}) {
  const status = getBridgeStatusSnapshot(handoffExports);
  const [verification, setVerification] = useState(() => loadBridgeVerificationState());

  const updateVerification = (key: BridgeVerificationKey, checked: boolean) => {
    const next = { ...verification, [key]: checked };
    setVerification(next);
    saveBridgeVerificationState(next);
  };

  const resetChecklist = () => {
    const next = bridgeVerificationItems.reduce(
      (current, item) => ({ ...current, [item.key]: false }),
      {} as typeof verification
    );
    setVerification(next);
    saveBridgeVerificationState(next);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>GoTrader Simulation Bridge</CardTitle>
            </div>
            <CardDescription>Safe AI Lab to go-trader JSON handoff visibility.</CardDescription>
          </div>
          <Badge variant="warning">{status.mode}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn("grid gap-3", compact ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-4")}>
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-xs text-muted-foreground">Last handoff export</p>
            <p className="mt-1 break-all font-mono text-xs text-foreground">{status.latestHandoffExportTimestamp}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-xs text-muted-foreground">Total handoff exports</p>
            <p className="mt-1 font-mono text-lg text-foreground">{status.totalHandoffExports}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3 xl:col-span-2">
            <p className="text-xs text-muted-foreground">Recommended handoff path</p>
            <p className="mt-1 break-all font-mono text-xs text-foreground">{status.recommendedHandoffPath}</p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <div className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-sm font-semibold">Reader command</p>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-card/60 p-3 font-mono text-xs leading-5 text-slate-200">
              {status.readerCommand}
            </pre>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-sm font-semibold">Scheduler command</p>
            </div>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-card/60 p-3 font-mono text-xs leading-5 text-slate-200">
              {status.schedulerCommand}
            </pre>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/45 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <p className="text-sm font-semibold">Verification checklist</p>
            </div>
            <Button variant="ghost" size="sm" onClick={resetChecklist}>
              Reset checks
            </Button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {bridgeVerificationItems.map((item) => (
              <label
                key={item.key}
                className="flex min-h-12 items-center gap-2 rounded-md border border-border bg-card/45 px-3 py-2 text-sm text-muted-foreground"
              >
                <input
                  type="checkbox"
                  checked={verification[item.key]}
                  onChange={(event) => updateVerification(item.key, event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
          <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
          {status.warning}
        </div>
      </CardContent>
    </Card>
  );
}
