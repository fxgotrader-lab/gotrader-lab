import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
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
import { openClawHermesBridgeSpec } from "@/lib/integrations/openclawHermesBridgeSpec";
import { openClawHermesAdvisorySpec } from "@/lib/integrations/openclawHermesSpec";
import { paperDemoExecutionSpec } from "@/lib/integrations/paperDemoExecutionSpec";
import {
  evaluateReadinessGate,
  latestApprovalTimestamp,
  loadManualApprovalRecord,
  READINESS_APPROVAL_UPDATED_EVENT
} from "@/lib/readiness";
import {
  loadLatestResearchQualityReview,
  RESEARCH_QUALITY_UPDATED_EVENT
} from "@/lib/researchQuality";
import {
  countCompletedRunbookItems,
  loadSimulationRunbookState,
  SIMULATION_RUNBOOK_UPDATED_EVENT,
  simulationRunbookChecklist
} from "@/lib/simulationRunbook";
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
const readinessStateVariant = (state?: string) =>
  state === "Paper-Demo Candidate" ? "success" : state === "Research Ready" ? "warning" : state === "Not Ready" ? "danger" : "muted";
const calibrationHelpLinks = [
  { label: "Backtest Lab", href: "/backtest-lab" },
  { label: "Validation", href: "/validation" },
  { label: "Research Quality", href: "/research-quality" },
  { label: "Readiness Gate", href: "/readiness-gate" }
];

export function SettingsView({ state, onReset }: { state: LabState; onReset: () => void }) {
  const [ictWeights, setIctWeights] = useState<ICTScoringWeights>(() => loadICTScoringWeights());
  const [latestValidationReport, setLatestValidationReport] = useState(() => loadLatestValidationReport());
  const [latestQualityReview, setLatestQualityReview] = useState(() => loadLatestResearchQualityReview());
  const [simulationRunbook, setSimulationRunbook] = useState(() => loadSimulationRunbookState());
  const [readinessApproval, setReadinessApproval] = useState(() => loadManualApprovalRecord());
  const latestHandoffExport = state.handoffExports?.[0];
  const latestAdvisoryPacket = state.advisoryPackets?.[0];
  const latestAdvisoryResponse = state.advisoryResponses?.[0];
  const runbookCompleted = countCompletedRunbookItems(simulationRunbook);
  const runbookTotal = simulationRunbookChecklist.length;
  const readinessGate = useMemo(
    () =>
      evaluateReadinessGate({
        validation: latestValidationReport,
        quality: latestQualityReview,
        runbook: simulationRunbook
      }),
    [latestValidationReport, latestQualityReview, simulationRunbook]
  );

  useEffect(() => {
    const refreshValidationReport = () => setLatestValidationReport(loadLatestValidationReport());
    window.addEventListener(VALIDATION_REPORT_UPDATED_EVENT, refreshValidationReport);
    window.addEventListener("storage", refreshValidationReport);
    return () => {
      window.removeEventListener(VALIDATION_REPORT_UPDATED_EVENT, refreshValidationReport);
      window.removeEventListener("storage", refreshValidationReport);
    };
  }, []);

  useEffect(() => {
    const refreshQualityReview = () => setLatestQualityReview(loadLatestResearchQualityReview());
    window.addEventListener(RESEARCH_QUALITY_UPDATED_EVENT, refreshQualityReview);
    window.addEventListener("storage", refreshQualityReview);
    return () => {
      window.removeEventListener(RESEARCH_QUALITY_UPDATED_EVENT, refreshQualityReview);
      window.removeEventListener("storage", refreshQualityReview);
    };
  }, []);

  useEffect(() => {
    const refreshRunbook = () => setSimulationRunbook(loadSimulationRunbookState());
    window.addEventListener(SIMULATION_RUNBOOK_UPDATED_EVENT, refreshRunbook);
    window.addEventListener("storage", refreshRunbook);
    return () => {
      window.removeEventListener(SIMULATION_RUNBOOK_UPDATED_EVENT, refreshRunbook);
      window.removeEventListener("storage", refreshRunbook);
    };
  }, []);

  useEffect(() => {
    const refreshApproval = () => setReadinessApproval(loadManualApprovalRecord());
    window.addEventListener(READINESS_APPROVAL_UPDATED_EVENT, refreshApproval);
    window.addEventListener("storage", refreshApproval);
    return () => {
      window.removeEventListener(READINESS_APPROVAL_UPDATED_EVENT, refreshApproval);
      window.removeEventListener("storage", refreshApproval);
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
              <span>Advisory packets</span>
              <span className="font-mono text-foreground">{state.advisoryPackets?.length ?? 0}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Advisory responses</span>
              <span className="font-mono text-foreground">{state.advisoryResponses?.length ?? 0}</span>
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
              <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Simulation Runbook</CardTitle>
            </div>
            <CardDescription>Latest AI Lab to go-trader simulation verification record.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
              <span className="text-muted-foreground">Latest verification</span>
              <span className="max-w-[11rem] truncate font-mono text-xs text-foreground">
                {simulationRunbook.verifiedAt ?? "none"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
              <span className="text-muted-foreground">Checklist</span>
              <Badge variant={runbookCompleted === runbookTotal ? "success" : "warning"}>
                {runbookCompleted}/{runbookTotal}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-background/45 p-3 font-mono text-xs text-muted-foreground">
              <span>{simulationRunbook.symbol || "symbol n/a"}</span>
              <span>{simulationRunbook.timeframe || "timeframe n/a"}</span>
              <span>{simulationRunbook.signal || "signal n/a"}</span>
              <span>{simulationRunbook.mode}</span>
            </div>
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              Broker execution must remain skipped and trades must stay at 0.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>OpenClaw/Hermes Advisory Agents</CardTitle>
            </div>
            <CardDescription>Future advisory review layer for research context only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ["Status", openClawHermesAdvisorySpec.status],
              ["OpenClaw", openClawHermesAdvisorySpec.openClawConnection],
              ["Hermes", openClawHermesAdvisorySpec.hermesConnection],
              ["Latest packet", latestAdvisoryPacket?.generatedAt ?? "none"],
              ["Total packets", String(state.advisoryPackets?.length ?? 0)],
              ["Latest response", latestAdvisoryResponse?.importedAt ?? "none"],
              ["Total responses", String(state.advisoryResponses?.length ?? 0)],
              ["Latest recommendation", latestAdvisoryResponse?.proceedRecommendation ?? "none"],
              ["Bridge mode", openClawHermesBridgeSpec.mode],
              ["File watcher", openClawHermesBridgeSpec.fileWatchImplemented ? "implemented" : "not implemented"],
              ["Role", openClawHermesAdvisorySpec.role],
              ["Broker authority", openClawHermesAdvisorySpec.brokerAuthority],
              ["Execution authority", openClawHermesAdvisorySpec.executionAuthority],
              ["Readiness override", openClawHermesAdvisorySpec.readinessOverrideAuthority]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
                <span className="text-muted-foreground">{label}</span>
                <Badge variant={value === "none" ? "danger" : "warning"}>{formatBridgeValue(value)}</Badge>
              </div>
            ))}
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
              Advisory agents cannot execute trades or override readiness gates.
            </div>
            <div className="rounded-md border border-border bg-background/45 p-3 text-muted-foreground">
              Local bridge contract: watch `{openClawHermesBridgeSpec.pathContract.requestPattern}` and write
              `{openClawHermesBridgeSpec.pathContract.responsePattern}` in a future planning-only bridge.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-200" aria-hidden="true" />
              <CardTitle>Readiness Gate</CardTitle>
            </div>
            <CardDescription>Manual approval layer for future paper-demo consideration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
              <span className="text-muted-foreground">Current state</span>
              <Badge variant={readinessStateVariant(readinessGate.state)}>{readinessGate.state}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
              <span className="text-muted-foreground">Manual approval</span>
              <Badge variant={readinessApproval.status === "approved" ? "success" : readinessApproval.status === "rejected" ? "danger" : readinessApproval.status === "paused" ? "warning" : "muted"}>
                {readinessApproval.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
              <span className="text-muted-foreground">Latest action</span>
              <span className="max-w-[11rem] truncate font-mono text-xs text-foreground">
                {latestApprovalTimestamp(readinessApproval) ?? "none"}
              </span>
            </div>
            <div className="rounded-md border border-border bg-background/45 p-3 text-muted-foreground">
              {readinessGate.recommendedNextStep}
            </div>
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              Broker execution remains disabled.
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
              <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Research Quality Review</CardTitle>
            </div>
            <CardDescription>Latest simulated readiness grade from validation review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
              <span className="text-muted-foreground">Latest review</span>
              <span className="max-w-[11rem] truncate font-mono text-xs text-foreground">
                {latestQualityReview?.generatedAt ?? "none"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
              <span className="text-muted-foreground">Readiness grade</span>
              <Badge variant={validationVariant(latestQualityReview?.readinessStatus)}>
                {latestQualityReview?.readinessGrade ?? "not run"}
              </Badge>
            </div>
            <div className="rounded-md border border-border bg-background/45 p-3 text-muted-foreground">
              {latestQualityReview?.recommendedNextStep ??
                "Run research quality review after strategy validation is complete."}
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

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Calibration Help</CardTitle>
            </div>
            <CardDescription>Quick links for the simulation validation workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              Simulation calibration only. Do not connect broker execution until readiness is repeatedly Paper-Demo
              Candidate under conservative settings.
            </div>
            <div className="grid gap-2">
              {calibrationHelpLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background/60 px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
                >
                  {link.label}
                </Link>
              ))}
            </div>
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
