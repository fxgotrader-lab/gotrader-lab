import { Database, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LabState } from "@/lib/types";

export function SettingsView({ state, onReset }: { state: LabState; onReset: () => void }) {
  const reset = () => {
    const approved = window.confirm("Reset local GoTrader AI Lab mock data and prompt history?");
    if (approved) {
      onReset();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Configuration</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Settings</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Local-first research controls and safety constraints for the prototype milestone.
          </p>
        </div>
        <Badge variant="success">Simulation mode locked</Badge>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Storage</CardTitle>
            </div>
            <CardDescription>Local-first abstraction ready for a future Supabase adapter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex justify-between gap-3">
              <span>Adapter</span>
              <span className="font-mono text-foreground">localStorage</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Agents</span>
              <span className="font-mono text-foreground">{state.agents.length}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Debates</span>
              <span className="font-mono text-foreground">{state.debateSessions.length}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Prompt versions</span>
              <span className="font-mono text-foreground">{state.promptVersions.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <CardTitle>Safety Gates</CardTitle>
            </div>
            <CardDescription>Hard constraints intentionally built into the prototype.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {["No broker connection", "No broker API keys", "No order placement", "No real trading", "No financial advice"].map(
              (item) => (
                <div key={item} className="flex items-center justify-between rounded-md border border-border bg-background/45 px-3 py-2 text-sm">
                  <span>{item}</span>
                  <Lock className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                </div>
              )
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-200" aria-hidden="true" />
              <CardTitle>Approvals</CardTitle>
            </div>
            <CardDescription>Explicit user confirmation is required for sensitive research actions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-md border border-border bg-background/45 p-3">
              Prompt mutations are saved as candidates first. Users must approve before activation.
            </div>
            <div className="rounded-md border border-border bg-background/45 p-3">
              Simulated signal export asks for confirmation and records the decision locally.
            </div>
            <Button variant="destructive" onClick={reset} className="w-full">
              Reset local prototype data
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Future go-trader Export Contract</CardTitle>
          <CardDescription>
            Superset of the requested AI signal fields and the current go-trader Python check-script JSON shape.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
            Upstream inspection: `scheduler/executor.go` parses check-script outputs with `strategy`, `symbol`,
            `timeframe`, `signal`, `price`, `indicators`, `regime`, and `timestamp`. TopStep futures also emits
            `contract_spec`, `market_open`, `mode`, and `platform`. This lab exports simulation-only JSON in that same
            direction while keeping AI research fields such as confidence, entry zone, invalidation, target, and risk
            notes.
          </div>
          <pre className="overflow-x-auto rounded-lg border border-border bg-background/75 p-4 font-mono text-xs leading-5 text-slate-200">
{`{
  "strategy": "ict_ai_lab",
  "source": "gotrader_ai_lab",
  "symbol": "NQ",
  "timeframe": "5m",
  "signal": 1,
  "price": 18872,
  "confidence": 0.72,
  "entry_zone": [18864, 18880],
  "invalidation": 18836,
  "target": 18952,
  "risk_notes": "Research-only simulated risk notes.",
  "indicators": {
    "confidence": 0.72,
    "risk_reward": 2.52,
    "liquidity_sweep": true,
    "market_structure_shift": true,
    "fair_value_gap": "bullish",
    "kill_zone": "NY AM"
  },
  "regime": "trend",
  "platform": "ai_lab",
  "market_open": true,
  "mode": "simulation",
  "timestamp": "2026-05-24T00:00:00.000Z",
  "contract_spec": {
    "tick_size": 0.25,
    "tick_value": 5,
    "multiplier": 20,
    "margin": 21000
  }
}`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
