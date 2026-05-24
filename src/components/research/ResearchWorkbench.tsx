import { useMemo, useState } from "react";
import { Download, FlaskConical, Play, ShieldAlert, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  createGoTraderSimulationSignal,
  GoTraderBridgeValidationError
} from "@/lib/integrations/goTraderBridge";
import type { DebateSession, FuturesSymbol, LabState, MarketRegime, ThesisInput, Timeframe, TradeThesis, TradingSession } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

interface ResearchActions {
  saveThesis(input: ThesisInput): { debateSession: DebateSession; thesis: TradeThesis } | undefined;
  recordSignalExport(thesisId: string, decision: "approved" | "rejected"): void;
  scoreThesis(thesisId: string): void;
}

const symbolOptions = ["ES", "NQ", "MES", "MNQ"].map((value) => ({ label: value, value }));
const timeframeOptions = ["1m", "5m", "15m", "1h", "4h", "1d"].map((value) => ({ label: value, value }));
const sessionOptions = ["Globex", "London", "New York AM", "New York Lunch", "New York PM"].map((value) => ({ label: value, value }));
const regimeOptions = ["trend", "balanced", "volatile", "range", "news-driven", "risk-off", "risk-on"].map((value) => ({ label: value, value }));

export function ResearchWorkbench({ state, actions }: { state: LabState; actions: ResearchActions }) {
  const [input, setInput] = useState<ThesisInput>({
    symbol: "NQ",
    timeframe: "5m",
    session: "New York AM",
    marketRegime: "trend",
    notes: "Sell-side sweep below London low, displacement back into the range, tech breadth stable."
  });
  const [activeThesisId, setActiveThesisId] = useState(state.tradeTheses[0]?.id);
  const [exportJson, setExportJson] = useState("");

  const activeThesis = useMemo(
    () => state.tradeTheses.find((thesis) => thesis.id === activeThesisId) ?? state.tradeTheses[0],
    [activeThesisId, state.tradeTheses]
  );
  const activeDebate = useMemo(
    () => state.debateSessions.find((debate) => debate.cioThesisId === activeThesis?.id),
    [activeThesis?.id, state.debateSessions]
  );

  const updateInput = (field: keyof ThesisInput, value: string) => {
    setInput((current) => ({ ...current, [field]: value }));
  };

  const generate = () => {
    const generated = actions.saveThesis(input);
    if (generated) {
      setActiveThesisId(generated.thesis.id);
      setExportJson("");
    }
  };

  const confirmExport = () => {
    if (!activeThesis) {
      return;
    }
    const approved = window.confirm(
      "Export a simulated go-trader-compatible signal? This is research-only JSON and cannot execute trades."
    );
    actions.recordSignalExport(activeThesis.id, approved ? "approved" : "rejected");
    if (approved) {
      try {
        setExportJson(JSON.stringify(createGoTraderSimulationSignal(activeThesis), null, 2));
      } catch (error) {
        const message =
          error instanceof GoTraderBridgeValidationError
            ? error.validation.errors.join("\n")
            : "Unable to create simulated go-trader export.";
        window.alert(message);
      }
    }
  };

  const scoreOutcome = () => {
    if (activeThesis) {
      actions.scoreThesis(activeThesis.id);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Trade thesis generator</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">AI Research Workbench</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Generate an agent debate and a CIO research thesis with ICT context, simulated plan, and local memory.
          </p>
        </div>
        <Badge variant="warning">No broker APIs, no orders</Badge>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <Card>
          <CardHeader>
            <CardTitle>Scenario Inputs</CardTitle>
            <CardDescription>Futures research context used by the mock simulation engine.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="symbol">Futures symbol</Label>
                <Select
                  id="symbol"
                  value={input.symbol}
                  options={symbolOptions}
                  onChange={(event) => updateInput("symbol", event.target.value as FuturesSymbol)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeframe">Timeframe</Label>
                <Select
                  id="timeframe"
                  value={input.timeframe}
                  options={timeframeOptions}
                  onChange={(event) => updateInput("timeframe", event.target.value as Timeframe)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="session">Session</Label>
                <Select
                  id="session"
                  value={input.session}
                  options={sessionOptions}
                  onChange={(event) => updateInput("session", event.target.value as TradingSession)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="regime">Market regime</Label>
                <Select
                  id="regime"
                  value={input.marketRegime}
                  options={regimeOptions}
                  onChange={(event) => updateInput("marketRegime", event.target.value as MarketRegime)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Optional notes</Label>
              <Textarea
                id="notes"
                value={input.notes}
                onChange={(event) => updateInput("notes", event.target.value)}
                placeholder="Example: sell-side sweep, NY AM displacement, FVG still open..."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button onClick={generate}>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Generate thesis
              </Button>
              <Button variant="secondary" onClick={scoreOutcome} disabled={!activeThesis}>
                <Play className="h-4 w-4" aria-hidden="true" />
                Score simulated outcome
              </Button>
            </div>
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              User confirmation is required before saving prompt mutations or exporting simulated signals.
            </div>
          </CardContent>
        </Card>

        {activeThesis ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>CIO Recommendation</CardTitle>
                  <CardDescription>
                    {activeThesis.symbol} {activeThesis.timeframe} during {activeThesis.session}
                  </CardDescription>
                </div>
                <Badge variant={activeThesis.finalBias === "bullish" ? "success" : activeThesis.finalBias === "bearish" ? "danger" : "warning"}>
                  {activeThesis.finalBias}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">Confidence</p>
                  <p className="mt-1 font-mono text-lg">{formatPercent(activeThesis.confidence)}</p>
                  <Progress value={activeThesis.confidence * 100} className="mt-2" />
                </div>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">Invalidation</p>
                  <p className="mt-1 font-mono text-lg">{activeThesis.invalidationLevel}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">Target liquidity</p>
                  <p className="mt-1 font-mono text-lg">{activeThesis.targetLiquidity}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">Risk/reward</p>
                  <p className="mt-1 font-mono text-lg">{activeThesis.simulatedTradePlan.riskReward.toFixed(2)}R</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Thesis Summary</h3>
                <p className="mt-2 text-sm text-muted-foreground">{activeThesis.thesisSummary}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Reasoning Summary</h3>
                <p className="mt-2 text-sm text-muted-foreground">{activeThesis.reasoningSummary}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Stop-risk Notes</h3>
                <p className="mt-2 text-sm text-muted-foreground">{activeThesis.riskNotes}</p>
              </div>

              <Separator />

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <h3 className="text-sm font-semibold">ICT Context</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant={activeThesis.ictContext.liquiditySweep ? "success" : "muted"}>liquidity sweep</Badge>
                    <Badge variant={activeThesis.ictContext.marketStructureShift ? "success" : "muted"}>market structure shift</Badge>
                    <Badge variant="secondary">{activeThesis.ictContext.displacement} displacement</Badge>
                    <Badge variant="secondary">{activeThesis.ictContext.fairValueGap} FVG</Badge>
                    <Badge variant="secondary">{activeThesis.ictContext.premiumDiscount}</Badge>
                    <Badge variant="secondary">{activeThesis.ictContext.killZoneTag}</Badge>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <h3 className="text-sm font-semibold">Simulated Trade Plan</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <span>Entry zone</span>
                    <span className="font-mono text-foreground">
                      {activeThesis.simulatedTradePlan.entryZone[0]} - {activeThesis.simulatedTradePlan.entryZone[1]}
                    </span>
                    <span>Mode</span>
                    <span className="font-mono text-foreground">{activeThesis.simulatedTradePlan.mode}</span>
                    <span>Bias</span>
                    <span className="font-mono text-foreground">{activeThesis.finalBias}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
                <ShieldAlert className="mr-2 inline h-4 w-4 text-amber-200" aria-hidden="true" />
                {activeThesis.disclaimer}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={confirmExport}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Confirm simulated signal export
                </Button>
                <Input readOnly value={activeThesis.id} className="max-w-sm font-mono text-xs" aria-label="Thesis ID" />
              </div>

              {exportJson ? (
                <pre className="overflow-x-auto rounded-lg border border-border bg-background/75 p-4 font-mono text-xs leading-5 text-slate-200">
                  {exportJson}
                </pre>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {activeDebate ? (
        <Card>
          <CardHeader>
            <CardTitle>Agent Debate</CardTitle>
            <CardDescription>Layered market views generated before CIO synthesis.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeDebate.messages.map((message) => (
              <div key={message.id} className="rounded-lg border border-border bg-background/45 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{message.agentName}</p>
                    <p className="text-xs text-muted-foreground">{message.layer}</p>
                  </div>
                  <Badge variant={message.stance === "bullish" ? "success" : message.stance === "bearish" ? "danger" : "warning"}>
                    {message.stance}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{message.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.ictTags.map((tag) => (
                    <Badge key={tag} variant="muted">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
