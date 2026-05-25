import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  ClipboardList,
  Database,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Unplug
} from "lucide-react";
import { BridgeStatusCard } from "@/components/bridge/BridgeStatusCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  defaultICTScoringWeights,
  loadICTScoringWeights,
  resetICTScoringWeights,
  saveICTScoringWeights
} from "@/lib/ict";
import { brokerDemoBridgeSpec } from "@/lib/integrations/brokerDemoBridgeSpec";
import { paperDemoExecutionSpec } from "@/lib/integrations/paperDemoExecutionSpec";
import type { ICTScoringWeights, LabState } from "@/lib/types";
import {
  loadLatestValidationReport,
  VALIDATION_REPORT_UPDATED_EVENT
} from "@/lib/validation";

const weightLabels: Record<string, string> = {
  bullishMSS: "Bullish MSS",
  bearishMSS: "Bearish MSS",
  bullishBOS: "Bullish BOS",
  bearishBOS: "Bearish BOS",
  liquiditySweep: "Liquidity sweep",
  fvgAlignment: "FVG alignment",
  premiumDiscountAlignment: "Premium/discount",
  sessionKillZone: "Session kill zone",
  latestSwingStructure: "Latest swing structure",
  riskRewardQuality: "Risk/reward quality"
};
const formatWeightLabel = (key: string) => weightLabels[key] ?? key;
const formatBridgeValue = (value: string) => value.replace(/_/g, " ");
const validationVariant = (status?: string) =>
  status === "green" ? "success" : status === "yellow" ? "warning" : status === "red" ? "danger" : "muted";

export function SettingsView({ state, onReset }: { state: LabState; onReset: () => void }) {
  const [ictWeights, setIctWeights] = useState<ICTScoringWeights>(() => loadICTScoringWeights());
  const [latestValidationReport, setLatestValidationReport] = useState(() => loadLatestValidationReport());
  const latestHandoffExport = state.handoffExports?.[0];

  useEffect(() => {
    const refreshValidationReport = () => setLatestValidationReport(loadLatestValidationReport());
    window.addEventListener(VALIDATION_REPORT_UPDATED_EVENT, refreshValidationReport);
    window.addEventListener("storage", refreshValidationReport);
    return () => {
      window.removeEventListener(VALIDATION_REPORT_UPDATED_EVENT, refreshValidationReport);
      window.removeEventListener("storage", refreshValidationReport);
    };
  }, []);

  const reset = () => {
    const approved = window.confirm("Reset local GoTrader AI Lab mock data and prompt history?");
    if (approved) {
      onReset();
    }
  };

  const updateWeight = (key: keyof ICTScoringWeights, value: string) => {
    const numeric = Number(value);
    const next = {
      ...ictWeights,
      [key]: Number.isFinite(numeric) ? Math.min(3, Math.max(0, numeric)) : ictWeights[key]
    };
    setIctWeights(next);
    saveICTScoringWeights(next);
  };

  const resetWeights = () => {
    const next = resetICTScoringWeights();
    setIctWeights(next);
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

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle>ICT Scoring Calibration</CardTitle>
              </div>
              <CardDescription>Local weights used by the deterministic mock-candle confluence engine.</CardDescription>
            </div>
            <Button variant="secondary" onClick={resetWeights}>
              Reset to defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {Object.entries(ictWeights).map(([key, value]) => (
              <div key={key} className="space-y-2 rounded-lg border border-border bg-background/45 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`ict-weight-${key}`} className="text-xs">
                    {formatWeightLabel(key)}
                  </Label>
                  <span className="font-mono text-xs text-muted-foreground">
                    default {defaultICTScoringWeights[key as keyof ICTScoringWeights].toFixed(2)}
                  </span>
                </div>
                <Input
                  id={`ict-weight-${key}`}
                  type="number"
                  min="0"
                  max="3"
                  step="0.05"
                  value={value}
                  onChange={(event) => updateWeight(key as keyof ICTScoringWeights, event.target.value)}
                  className="font-mono"
                />
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            Calibration is local to this browser and applies to newly generated simulated research theses.
          </div>
        </CardContent>
      </Card>

      <BridgeStatusCard handoffExports={state.handoffExports ?? []} />

      <div className="grid gap-5 xl:grid-cols-4">
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
            <div className="flex justify-between gap-3">
              <span>Handoff exports</span>
              <span className="font-mono text-foreground">{state.handoffExports?.length ?? 0}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Latest handoff</span>
              <span className="max-w-[11rem] truncate font-mono text-foreground">
                {latestHandoffExport?.exportedAt ?? "none"}
              </span>
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
              <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Strategy Validation</CardTitle>
            </div>
            <CardDescription>Latest simulated ICT validation and calibration readiness.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
              <span className="text-muted-foreground">Latest run</span>
              <span className="max-w-[11rem] truncate font-mono text-xs text-foreground">
                {latestValidationReport?.generatedAt ?? "none"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
              <span className="text-muted-foreground">Readiness</span>
              <Badge variant={validationVariant(latestValidationReport?.calibration.readinessStatus)}>
                {latestValidationReport?.calibration.readinessStatus ?? "not run"}
              </Badge>
            </div>
            <div className="rounded-md border border-border bg-background/45 p-3 text-muted-foreground">
              {latestValidationReport?.calibration.recommendedNextStep ??
                "Run the validation suite before any broker-demo implementation planning."}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Unplug className="h-4 w-4 text-amber-200" aria-hidden="true" />
              <CardTitle>Broker Demo Bridge</CardTitle>
            </div>
            <CardDescription>Single-account paper execution bridge architecture only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-md border border-border bg-background/45 px-3 py-2">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="warning">{formatBridgeValue(brokerDemoBridgeSpec.status)}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-background/45 px-3 py-2">
              <span className="text-muted-foreground">Mode</span>
              <Badge variant="muted">{formatBridgeValue(brokerDemoBridgeSpec.mode)}</Badge>
            </div>
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
              No broker code exists yet. No API keys, broker connection, websocket feed, or order placement is present.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Paper/Demo Execution Plan</CardTitle>
            </div>
            <CardDescription>Future single-account paper bridge planning only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ["Status", paperDemoExecutionSpec.status],
              ["Broker connection", paperDemoExecutionSpec.brokerConnection],
              ["Live trading", paperDemoExecutionSpec.liveTrading],
              ["Account mode", paperDemoExecutionSpec.accountMode],
              ["Next phase", paperDemoExecutionSpec.nextPhase]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
                <span className="text-muted-foreground">{label}</span>
                <Badge variant={label === "Live trading" ? "danger" : "warning"}>{formatBridgeValue(value)}</Badge>
              </div>
            ))}
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
              No broker code exists yet. Demo execution comes after simulation bridge verification.
            </div>
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
