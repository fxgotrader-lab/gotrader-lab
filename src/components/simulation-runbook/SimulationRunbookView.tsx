import { AlertTriangle, CheckCircle2, ClipboardCheck, RotateCcw, Save, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  completeSimulationRunbookVerification,
  countCompletedRunbookItems,
  loadSimulationRunbookState,
  resetSimulationRunbookState,
  saveSimulationRunbookState,
  simulationRunbookChecklist
} from "@/lib/simulationRunbook";
import type {
  SimulationRunbookChecklistId,
  SimulationRunbookSignal,
  SimulationRunbookState
} from "@/lib/simulationRunbook";

const readerCommand =
  "python shared_scripts/check_ict_ai_lab.py --handoff-file ../gotrader/exports/latest-gotrader-handoff.json";

const schedulerCommand = `$env:GOTRADER_PYTHON = "C:\\Python314\\python.exe"
go run . -config ../docs/ai-lab-scheduler-simulation.config.json -once`;

const signalOptions = [
  { label: "Select signal", value: "" },
  { label: "BUY", value: "BUY" },
  { label: "SELL", value: "SELL" },
  { label: "NEUTRAL", value: "NEUTRAL" }
];

const completionLabel = (completed: number, total: number) =>
  completed === total ? "Verification complete" : `${completed}/${total} checks complete`;

export function SimulationRunbookView() {
  const [runbook, setRunbook] = useState<SimulationRunbookState>(() => loadSimulationRunbookState());
  const completed = countCompletedRunbookItems(runbook);
  const total = simulationRunbookChecklist.length;
  const progress = (completed / total) * 100;
  const failedItems = simulationRunbookChecklist.filter((item) => !runbook.checklist[item.id]);

  const persist = (next: SimulationRunbookState) => {
    setRunbook(next);
    saveSimulationRunbookState(next);
  };

  const updateField = (field: keyof SimulationRunbookState, value: string) => {
    persist({
      ...runbook,
      [field]: value
    });
  };

  const toggleChecklist = (id: SimulationRunbookChecklistId, checked: boolean) => {
    persist({
      ...runbook,
      checklist: {
        ...runbook.checklist,
        [id]: checked
      }
    });
  };

  const saveVerification = () => {
    setRunbook(completeSimulationRunbookVerification(runbook));
  };

  const resetRunbook = () => {
    const approved = window.confirm("Reset the local simulation verification runbook?");
    if (approved) {
      setRunbook(resetSimulationRunbookState());
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Simulation verification</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Verification Runbook</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Record the AI Lab to go-trader simulation handoff evidence after exporting a thesis and running the
            scheduler in one-cycle simulation mode.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveVerification}>
            <Save className="h-4 w-4" aria-hidden="true" />
            Save Verification
          </Button>
          <Button variant="outline" onClick={resetRunbook}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
        </div>
      </div>

      <SafetyLockBanner message="Simulation verification only. Broker execution must remain skipped. No real trades." />

      {failedItems.length ? (
        <Card className="border-amber-300/25 bg-amber-300/10">
          <CardContent className="space-y-2 p-4 text-sm text-amber-100">
            <div className="font-medium">Failed checklist items</div>
            <div className="flex flex-wrap gap-2">
              {failedItems.slice(0, 5).map((item) => (
                <Badge key={item.id} variant="warning">{item.label}</Badge>
              ))}
              {failedItems.length > 5 ? <Badge variant="muted">+{failedItems.length - 5} more</Badge> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <TechnicalDetails
          title="View full verification checklist"
          description="Open to mark each simulation bridge verification item."
        >
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Verification Checklist</CardTitle>
            </div>
            <CardDescription>Use this as the local audit trail for the safe simulation handoff loop.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{completionLabel(completed, total)}</span>
                <Badge variant={completed === total ? "success" : "warning"}>{Math.round(progress)}%</Badge>
              </div>
              <Progress value={progress} />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {simulationRunbookChecklist.map((item, index) => (
                <label
                  key={item.id}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border bg-background/45 p-3 text-sm transition-colors hover:bg-secondary/45"
                >
                  <input
                    type="checkbox"
                    checked={runbook.checklist[item.id]}
                    onChange={(event) => toggleChecklist(item.id, event.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
        </TechnicalDetails>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <CardTitle>Latest Verification</CardTitle>
            </div>
            <CardDescription>Stored locally in this browser.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm">
              <div className="text-xs text-muted-foreground">Latest verification timestamp</div>
              <div className="mt-1 font-mono">{runbook.verifiedAt ?? "not saved"}</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="runbook-symbol">Symbol</Label>
                <Input
                  id="runbook-symbol"
                  value={runbook.symbol}
                  placeholder="MES"
                  onChange={(event) => updateField("symbol", event.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="runbook-timeframe">Timeframe</Label>
                <Input
                  id="runbook-timeframe"
                  value={runbook.timeframe}
                  placeholder="5m"
                  onChange={(event) => updateField("timeframe", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="runbook-signal">Signal</Label>
                <Select
                  id="runbook-signal"
                  value={runbook.signal}
                  options={signalOptions}
                  onChange={(event) => updateField("signal", event.target.value as SimulationRunbookSignal)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="runbook-mode">Mode</Label>
                <Input id="runbook-mode" value={runbook.mode} readOnly className="font-mono" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="runbook-platform">Platform</Label>
                <Input
                  id="runbook-platform"
                  value={runbook.platform}
                  onChange={(event) => updateField("platform", event.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="runbook-notes">Notes</Label>
              <Textarea
                id="runbook-notes"
                value={runbook.notes}
                placeholder="Paste scheduler evidence or notes from the simulation cycle."
                onChange={(event) => updateField("notes", event.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <TechnicalDetails
        title="View verification commands"
        description="Open for reader and scheduler commands from the separate go-trader repo."
      >
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            <CardTitle>Verification Commands</CardTitle>
          </div>
          <CardDescription>Run these from the separate go-trader repo. They are shown for manual verification only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">Reader</div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-background/75 p-4 font-mono text-xs leading-5 text-slate-200">
              {readerCommand}
            </pre>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Scheduler</div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-background/75 p-4 font-mono text-xs leading-5 text-slate-200">
              {schedulerCommand}
            </pre>
          </div>
        </CardContent>
      </Card>
      </TechnicalDetails>
    </div>
  );
}
