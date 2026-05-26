import { useEffect, useMemo, useState } from "react";
import { Activity, RotateCcw, ShieldAlert, SlidersHorizontal, Target, TimerReset } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalibrationAssistantPanel } from "@/components/backtest-lab/CalibrationAssistantPanel";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { MetricCard } from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ValidationGuideCard } from "@/components/validation/ValidationGuideCard";
import {
  backtestSessionFilters,
  backtestStopModels,
  defaultBacktestAgentWeights,
  diagnoseTradeGeneration,
  describeBacktestConfig,
  resetBacktestConfig,
  runBacktest,
  sanitizeBacktestConfig,
  saveBacktestConfig
} from "@/lib/backtesting";
import type { BacktestAgentWeightId, ResolvedBacktestConfig } from "@/lib/backtesting";
import { mockCandles } from "@/lib/mockData/mockCandles";
import {
  ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT,
  clearActiveResearchCalibration,
  loadActiveResearchCalibration,
  resolveActiveBacktestConfig
} from "@/lib/selfImprovement";
import type { FuturesSymbol, MarketRegime, Timeframe } from "@/lib/types";
import { formatPercent, formatSigned } from "@/lib/utils";

const symbolOptions = ["ES", "NQ", "MES", "MNQ"].map((value) => ({ label: value, value }));
const timeframeOptions = ["1m", "5m", "15m", "1h"].map((value) => ({ label: value, value }));
const sessionOptions = backtestSessionFilters.map((value) => ({ label: value, value }));
const stopModelOptions = backtestStopModels.map((value) => ({ label: value, value }));
const regimeOptions = ["trend", "balanced", "volatile", "range", "news-driven", "risk-off", "risk-on"].map((value) => ({ label: value, value }));

const agentWeightLabels: Record<BacktestAgentWeightId, string> = {
  "ict-liquidity-agent": "ICT Liquidity",
  "ict-structure-agent": "ICT Structure",
  "session-timing-agent": "Session Timing",
  "risk-reward-agent": "Risk/Reward",
  "session-levels-agent": "Session Levels",
  "auction-volume-profile-agent": "Auction/Profile",
  "macro-event-risk-agent": "Macro Event Risk",
  "intermarket-confirmation-agent": "Intermarket",
  "positioning-gamma-agent": "Positioning/Gamma",
  "order-flow-agent": "Order Flow Later",
  "volatility-regime-agent": "Volatility/Regime"
};

const numberFields: Array<{
  key: keyof Pick<
    ResolvedBacktestConfig,
    | "minimumConfluenceThreshold"
    | "minimumConfidenceThreshold"
    | "targetRMultiple"
    | "fixedTickStopSize"
    | "maxBarsToResolveTrade"
    | "warmupCandles"
    | "decisionInterval"
    | "visibleWindow"
  >;
  label: string;
  detail: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "minimumConfluenceThreshold", label: "Minimum confluence", detail: "ICT score gate", min: 0, max: 1, step: 0.01 },
  { key: "minimumConfidenceThreshold", label: "Minimum confidence", detail: "CIO confidence gate", min: 0, max: 1, step: 0.01 },
  { key: "targetRMultiple", label: "Target R multiple", detail: "Simulated target", min: 0.25, max: 8, step: 0.25 },
  { key: "fixedTickStopSize", label: "Fixed tick stop", detail: "Used by fixed stop model", min: 1, max: 400, step: 1 },
  { key: "maxBarsToResolveTrade", label: "Max bars to resolve", detail: "Target/stop/expiry window", min: 1, max: 48, step: 1 },
  { key: "warmupCandles", label: "Warmup candles", detail: "History before first decision", min: 6, max: 100, step: 1 },
  { key: "decisionInterval", label: "Decision interval", detail: "Candles between theses", min: 1, max: 24, step: 1 },
  { key: "visibleWindow", label: "Replay window", detail: "Candles shown in Replay", min: 8, max: 80, step: 1 }
];

const biasVariant = (bias?: string) => {
  if (bias === "bullish") {
    return "success" as const;
  }
  if (bias === "bearish") {
    return "danger" as const;
  }
  return "warning" as const;
};

export function BacktestLab() {
  const [configResolution, setConfigResolution] = useState(() => resolveActiveBacktestConfig());
  const [draftConfig, setDraftConfig] = useState<ResolvedBacktestConfig>(() => resolveActiveBacktestConfig().config);
  const [result, setResult] = useState(() => runBacktest(mockCandles, resolveActiveBacktestConfig().config));
  const [activeCalibration, setActiveCalibration] = useState(() => loadActiveResearchCalibration());
  const summary = result.summary;
  const zeroTradeDiagnostics = summary.totalTrades === 0
    ? diagnoseTradeGeneration({ candles: mockCandles, config: result.config, result })
    : [];
  const lastEquity = summary.equityCurve[summary.equityCurve.length - 1]?.equityR ?? 0;
  const agentWeightTotal = useMemo(
    () => Object.values(draftConfig.agentWeights).reduce((sum, value) => sum + value, 0),
    [draftConfig.agentWeights]
  );

  const patchConfig = (patch: Partial<ResolvedBacktestConfig>) => {
    setDraftConfig((current) => sanitizeBacktestConfig({ ...current, ...patch }));
  };

  const patchNumber = (key: keyof ResolvedBacktestConfig, value: string) => {
    const numeric = Number(value);
    patchConfig({ [key]: Number.isFinite(numeric) ? numeric : draftConfig[key] } as Partial<ResolvedBacktestConfig>);
  };

  const patchAgentWeight = (agentId: BacktestAgentWeightId, value: string) => {
    const numeric = Number(value);
    setDraftConfig((current) =>
      sanitizeBacktestConfig({
        ...current,
        agentWeights: {
          ...current.agentWeights,
          [agentId]: Number.isFinite(numeric) ? numeric : current.agentWeights[agentId]
        }
      })
    );
  };

  const run = () => {
    const saved = saveBacktestConfig(draftConfig);
    const resolved = resolveActiveBacktestConfig(saved);
    setConfigResolution(resolved);
    setDraftConfig(resolved.config);
    setResult(runBacktest(mockCandles, resolved.config));
  };

  const saveOnly = () => {
    const saved = saveBacktestConfig(draftConfig);
    const resolved = resolveActiveBacktestConfig(saved);
    setConfigResolution(resolved);
    setDraftConfig(resolved.config);
  };

  const reset = () => {
    clearActiveResearchCalibration("Reset Backtest Lab to the default simulation baseline.");
    const next = resetBacktestConfig();
    const resolved = resolveActiveBacktestConfig(next);
    setActiveCalibration(loadActiveResearchCalibration());
    setConfigResolution(resolved);
    setDraftConfig(resolved.config);
    setResult(runBacktest(mockCandles, resolved.config));
  };

  useEffect(() => {
    const refresh = () => {
      setActiveCalibration(loadActiveResearchCalibration());
      const resolved = resolveActiveBacktestConfig();
      setConfigResolution(resolved);
      setDraftConfig(resolved.config);
      setResult(runBacktest(mockCandles, resolved.config));
    };
    window.addEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Backtest configuration</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Parameter Lab</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Tune mock-candle replay assumptions for ICT filters, confluence gates, agent weights, stop model, and
            simulated target logic.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">Simulation only</Badge>
          <Badge variant="muted">Mock candles</Badge>
        </div>
      </div>

      <SafetyLockBanner message="Simulation calibration only. No broker connection, live market data, or real trades." />

      <Card className="border-primary/20 bg-primary/10">
        <CardContent className="grid gap-3 p-4 text-sm text-primary md:grid-cols-4">
          <div>
            <div className="text-xs uppercase opacity-70">Active calibration storage found</div>
            <div className="mt-1 font-mono">{configResolution.activeCalibrationStorageFound ? "yes" : "no"}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Active threshold</div>
            <div className="mt-1 font-mono">
              {activeCalibration ? `${(activeCalibration.activeConfigAfter.minimumConfluenceThreshold * 100).toFixed(0)}%` : "n/a"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Default threshold</div>
            <div className="mt-1 font-mono">{(configResolution.defaultConfluenceThreshold * 100).toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Resolved threshold</div>
            <div className="mt-1 font-mono">{(configResolution.finalBacktestConfluenceThreshold * 100).toFixed(0)}%</div>
          </div>
        </CardContent>
      </Card>

      {activeCalibration ? (
        <Card className="border-emerald-300/25 bg-emerald-300/10">
          <CardContent className="flex flex-col gap-3 p-4 text-sm text-emerald-100 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Active approved calibration</p>
              <p className="mt-1">
                {activeCalibration.approvedCalibrationId} is active. Current confluence threshold{" "}
                {(configResolution.config.minimumConfluenceThreshold * 100).toFixed(0)}%.
              </p>
            </div>
            <Button variant="secondary" onClick={reset}>
              Reset to default baseline
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <TechnicalDetails
        title="Active config diagnostics"
        description="Open to verify the saved baseline, active calibration patch, and final threshold used by the backtest."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Active calibration storage found", configResolution.activeCalibrationStorageFound ? "yes" : "no"],
            ["Merge status", configResolution.mergeStatusLabel],
            ["Default threshold", `${(configResolution.defaultConfluenceThreshold * 100).toFixed(0)}%`],
            ["Active threshold", activeCalibration ? `${(activeCalibration.activeConfigAfter.minimumConfluenceThreshold * 100).toFixed(0)}%` : "n/a"],
            ["Saved threshold", `${(configResolution.savedConfluenceThreshold * 100).toFixed(0)}%`],
            ["Final backtest threshold", `${(configResolution.finalBacktestConfluenceThreshold * 100).toFixed(0)}%`]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-border bg-background/45 p-3 text-xs text-muted-foreground">
          <div>Active ID: {configResolution.activeCalibrationId ?? "none"}</div>
          <div>Source trace: {configResolution.sourceTrace.join(" + ")}</div>
          <div>Patch: {JSON.stringify(configResolution.appliedPatch ?? {})}</div>
          {configResolution.mergeError ? <div className="text-amber-100">Merge warning: {configResolution.mergeError}</div> : null}
        </div>
      </TechnicalDetails>

      <TechnicalDetails
        title="View validation guide"
        description="Open for the longer step-by-step validation routine and overfitting warnings."
      >
        <ValidationGuideCard compact />
      </TechnicalDetails>

      <CalibrationAssistantPanel result={result} config={result.config} />

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
                  <CardTitle>Configuration</CardTitle>
                </div>
                <CardDescription>Saved locally and used by Replay and Performance backtest views.</CardDescription>
              </div>
              <Badge variant="secondary">{draftConfig.stopModel}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="backtest-symbol">Symbol</Label>
                <Select
                  id="backtest-symbol"
                  value={draftConfig.symbol}
                  options={symbolOptions}
                  onChange={(event) => patchConfig({ symbol: event.target.value as FuturesSymbol })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backtest-timeframe">Timeframe</Label>
                <Select
                  id="backtest-timeframe"
                  value={draftConfig.timeframe}
                  options={timeframeOptions}
                  onChange={(event) => patchConfig({ timeframe: event.target.value as Timeframe })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backtest-session">Session filter</Label>
                <Select
                  id="backtest-session"
                  value={draftConfig.sessionFilter}
                  options={sessionOptions}
                  onChange={(event) => patchConfig({ sessionFilter: event.target.value as ResolvedBacktestConfig["sessionFilter"] })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backtest-regime">Market regime</Label>
                <Select
                  id="backtest-regime"
                  value={draftConfig.marketRegime}
                  options={regimeOptions}
                  onChange={(event) => patchConfig({ marketRegime: event.target.value as MarketRegime })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backtest-stop-model">Stop model</Label>
                <Select
                  id="backtest-stop-model"
                  value={draftConfig.stopModel}
                  options={stopModelOptions}
                  onChange={(event) => patchConfig({ stopModel: event.target.value as ResolvedBacktestConfig["stopModel"] })}
                />
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs uppercase text-muted-foreground">Direction filters</p>
                <div className="mt-3 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draftConfig.allowLong}
                      onChange={(event) => patchConfig({ allowLong: event.target.checked })}
                    />
                    Allow long
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draftConfig.allowShort}
                      onChange={(event) => patchConfig({ allowShort: event.target.checked })}
                    />
                    Allow short
                  </label>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {numberFields.map((field) => (
                <div key={field.key} className="space-y-2 rounded-lg border border-border bg-background/45 p-3">
                  <Label htmlFor={`backtest-${field.key}`} className="text-xs">
                    {field.label}
                  </Label>
                  <Input
                    id={`backtest-${field.key}`}
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={String(draftConfig[field.key])}
                    onChange={(event) => patchNumber(field.key, event.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">{field.detail}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Agent Weights</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used only inside CIO synthesis for this mock backtest. Total {agentWeightTotal.toFixed(2)}.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => patchConfig({ agentWeights: defaultBacktestAgentWeights })}
                >
                  Reset weights
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {Object.entries(draftConfig.agentWeights).map(([agentId, value]) => (
                  <div key={agentId} className="space-y-2">
                    <Label htmlFor={`agent-weight-${agentId}`} className="text-xs">
                      {agentWeightLabels[agentId as BacktestAgentWeightId]}
                    </Label>
                    <Input
                      id={`agent-weight-${agentId}`}
                      type="number"
                      min="0"
                      max="1.5"
                      step="0.01"
                      value={String(value)}
                      onChange={(event) => patchAgentWeight(agentId as BacktestAgentWeightId, event.target.value)}
                      className="font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={run}>
                <Activity className="h-4 w-4" aria-hidden="true" />
                Run Backtest
              </Button>
              <Button variant="secondary" onClick={saveOnly}>
                <Target className="h-4 w-4" aria-hidden="true" />
                Save Config
              </Button>
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset to Defaults
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ICT confluence scoring weights from Settings remain active and compatible with these backtest gates.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Run Summary</CardTitle>
                <CardDescription>{describeBacktestConfig(result.config)}</CardDescription>
              </div>
              <Badge variant="secondary">{result.config.symbol} {result.config.timeframe}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="Total trades" value={String(summary.totalTrades)} detail={`${summary.directionalTrades} directional`} />
              <MetricCard label="Win rate" value={formatPercent(summary.winRate)} detail={`${summary.wins} target hit(s)`} />
              <MetricCard label="Average R" value={formatSigned(summary.averageR, 2)} detail="Per resolved record" tone={summary.averageR >= 0 ? "positive" : "danger"} />
              <MetricCard label="Max drawdown" value={`${summary.maxDrawdown.toFixed(2)}R`} detail="Equity curve" />
              <MetricCard label="Best trade" value={`${formatSigned(summary.bestTrade?.rMultiple ?? 0, 2)}R`} detail={summary.bestTrade?.outcome.replace("_", " ") ?? "n/a"} tone="positive" />
              <MetricCard label="Worst trade" value={`${formatSigned(summary.worstTrade?.rMultiple ?? 0, 2)}R`} detail={summary.worstTrade?.outcome.replace("_", " ") ?? "n/a"} tone="danger" />
            </div>

            {summary.totalTrades === 0 ? (
              <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">Why no trades?</p>
                    <p className="mt-1">
                      {zeroTradeDiagnostics[0]?.explanation ??
                        "The current settings did not produce any valid simulated trade records."}
                    </p>
                  </div>
                  <Badge variant="warning">cannot evaluate</Badge>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {zeroTradeDiagnostics.slice(0, 4).map((item) => (
                    <div key={`${item.reasonCode}-${item.currentValue}`} className="rounded-md border border-amber-200/20 bg-amber-200/5 p-2">
                      <p className="font-medium">{item.reasonCode.replace(/_/g, " ")}</p>
                      <p className="mt-1 text-xs text-amber-100/80">{item.suggestedFix}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Equity Curve Summary</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {summary.equityCurve.length} points, final {formatSigned(lastEquity, 2)}R, max drawdown {summary.maxDrawdown.toFixed(2)}R.
                  </p>
                </div>
                <Badge variant={lastEquity >= 0 ? "success" : "danger"}>{formatSigned(lastEquity, 2)}R</Badge>
              </div>
              <div className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={summary.equityCurve}>
                    <XAxis dataKey="index" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8 }} />
                    <Line type="monotone" dataKey="equityR" stroke="#2dd4bf" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Skipped Signals</p>
                  <p className="mt-1 text-xs text-muted-foreground">Decision points filtered before outcome scoring.</p>
                </div>
                <Badge variant={summary.skippedSignals ? "warning" : "success"}>{summary.skippedSignals}</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {summary.skipReasons.length ? (
                  summary.skipReasons.map((item) => (
                    <div key={item.reason} className="flex items-start justify-between gap-3 rounded-md border border-border bg-card/45 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{item.reason}</span>
                      <span className="font-mono">{item.count}</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-border bg-card/45 px-3 py-2 text-sm text-muted-foreground">
                    No signals were skipped by the active config.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <TechnicalDetails
        title="View recent simulated records"
        description="Open for the latest mock-candle trade records generated by the saved run configuration."
      >
      <Card>
        <CardHeader>
          <CardTitle>Recent Simulated Records</CardTitle>
          <CardDescription>Latest mock-candle trades from the saved run configuration.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-3 pr-3">Decision</th>
                <th className="py-3 pr-3">Bias</th>
                <th className="py-3 pr-3">Confidence</th>
                <th className="py-3 pr-3">Outcome</th>
                <th className="py-3 pr-3">R</th>
                <th className="py-3 pr-3">Entry</th>
                <th className="py-3 pr-3">Invalidation</th>
                <th className="py-3 pr-3">Target</th>
              </tr>
            </thead>
            <tbody>
              {result.trades.slice(-10).reverse().map((trade) => (
                <tr key={trade.id} className="border-b border-border/70">
                  <td className="py-3 pr-3 font-mono">{trade.decisionIndex + 1}</td>
                  <td className="py-3 pr-3">
                    <Badge variant={biasVariant(trade.bias)}>{trade.bias}</Badge>
                  </td>
                  <td className="py-3 pr-3 font-mono">{formatPercent(trade.confidence)}</td>
                  <td className="py-3 pr-3">{trade.outcome.replace("_", " ")}</td>
                  <td className="py-3 pr-3 font-mono">{formatSigned(trade.rMultiple, 2)}R</td>
                  <td className="py-3 pr-3 font-mono">{trade.entryPrice.toFixed(2)}</td>
                  <td className="py-3 pr-3 font-mono">{trade.invalidation.toFixed(2)}</td>
                  <td className="py-3 pr-3 font-mono">{trade.target.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!result.trades.length ? (
            <div className="mt-3 rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              No simulated trades passed the current filters. Review skipped signal reasons above.
            </div>
          ) : null}
        </CardContent>
      </Card>
      </TechnicalDetails>

      <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
        <TimerReset className="mr-2 inline h-4 w-4 text-primary" aria-hidden="true" />
        Config changes are local-first and use only `mockCandles`; no live data, broker API, websocket, or order routing
        is present.
      </div>
    </div>
  );
}
