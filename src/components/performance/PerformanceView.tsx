import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ShieldAlert, Trophy } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard } from "@/components/MetricCard";
import { MetricProvenanceDetails } from "@/components/common/MetricProvenanceDetails";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { WhyNotReadyCard } from "@/components/common/WhyNotReadyCard";
import { SimulatedAccountCard } from "@/components/dashboard/SimulatedAccountCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  detectCanonicalMetricsMismatch,
  normalizeCycleMetricsForDisplay
} from "@/lib/performance/canonicalMetrics";
import { buildSimulatedAccountFromCanonicalMetrics } from "@/lib/performance/simulatedAccount";
import { latestResearchCycleRun, loadResearchCycleState } from "@/lib/researchCycle";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeFingerprintLabel,
  selectRuntimeProvenanceWarnings,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";
import { aggregatePortfolioMetrics, identifyWeakestAgent } from "@/lib/scoring";
import type { LabState } from "@/lib/types";
import { formatPercent, formatSigned } from "@/lib/utils";
import { loadLatestValidationReport } from "@/lib/validation";

export function PerformanceView({ state }: { state: LabState }) {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();
  const metrics = aggregatePortfolioMetrics(state);
  const weakest = identifyWeakestAgent(state);
  const latestCycle = latestResearchCycleRun(loadResearchCycleState());
  const latestValidation = loadLatestValidationReport();
  const canonicalMetrics = runtimeSnapshot?.performance.canonicalPerformanceMetrics ?? normalizeCycleMetricsForDisplay(latestCycle, latestValidation);
  const derivedCanonicalMetrics = normalizeCycleMetricsForDisplay(latestCycle, latestValidation);
  const canonicalMismatchWarnings = detectCanonicalMetricsMismatch(latestCycle?.canonicalMetrics, derivedCanonicalMetrics);
  const simulatedAccount = useMemo(
    () => runtimeSnapshot?.performance.simulatedAccountSummary ?? buildSimulatedAccountFromCanonicalMetrics(canonicalMetrics),
    [canonicalMetrics, runtimeSnapshot]
  );
  const chartData = state.agents
    .filter((agent) => agent.layer !== "cio")
    .map((agent) => ({
      name: agent.name.replace(" Agent", ""),
      hitRate: Math.round(agent.hitRate * 100),
      calibration: Math.round(agent.confidenceCalibration * 100),
      drawdown: Math.round(agent.drawdown * 100)
    }))
    .slice(0, 14);

  useEffect(() => {
    let mounted = true;
    resolveResearchRuntimeSnapshot({ labState: state }).then((snapshot) => {
      if (mounted) {
        setRuntimeSnapshot(snapshot);
      }
    }).catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [state]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Simulation scorecard</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Performance</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Performance uses latest research cycle only. Research-cycle metrics come from the same canonical latest-cycle
            snapshot used by Dashboard. Legacy agent scorecards remain separate local research diagnostics.
          </p>
        </div>
        <Badge variant="warning">Simulation only</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Simulated PnL" value={formatSigned(metrics.simulatedPnl, 1)} detail="Local mock points" tone={metrics.simulatedPnl >= 0 ? "positive" : "danger"} />
        <MetricCard label="Portfolio hit rate" value={formatPercent(metrics.hitRate)} detail="Recommendation score >= 0.60" />
        <MetricCard label="Drawdown" value={formatPercent(metrics.drawdown)} detail="Weighted active agents" />
        <MetricCard label="Sharpe-like" value={metrics.sharpeLike.toFixed(2)} detail="Heuristic score" />
        <MetricCard label="Stored outcomes" value={String(state.outcomes.length)} detail="Local memory rows" />
      </div>

      <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
        <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
        Simulation only. No broker connection. No real trades.
      </div>

      <Card className="border-cyan-300/20 bg-cyan-300/10">
        <CardContent className="grid gap-3 p-4 text-sm text-cyan-100 md:grid-cols-2 xl:grid-cols-6">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">Metrics source</p>
            <p className="mt-1 break-all font-mono text-xs">
              {runtimeSnapshot
                ? runtimeSnapshot.performance.canonicalPerformanceMetrics?.metricSourceLabel ?? "no completed research cycle"
                : canonicalMetrics ? `latest research cycle ${canonicalMetrics.sourceCycleId}` : "no completed research cycle"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">Data source</p>
            <p className="mt-1">{canonicalMetrics?.dataSource ?? "n/a"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">Candle window</p>
            <p className="mt-1">{canonicalMetrics?.candleWindow ?? "n/a"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">P&amp;L assumption</p>
            <p className="mt-1">{canonicalMetrics?.pnlAssumption ?? "Run AI Research Cycle to estimate simulation P&L."}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">Run fingerprint</p>
            <p className="mt-1 break-all font-mono text-xs">{selectRuntimeFingerprintLabel(runtimeSnapshot)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">Runtime snapshot</p>
            <p className="mt-1">{runtimeSnapshot ? runtimeSnapshot.snapshotId : "loading"}</p>
          </div>
        </CardContent>
      </Card>
      {selectRuntimeProvenanceWarnings(runtimeSnapshot).length ? (
        <Card className="border-amber-300/25 bg-amber-300/10">
          <CardContent className="p-4 text-sm text-amber-100">
            {selectRuntimeProvenanceWarnings(runtimeSnapshot).join(" ")}
          </CardContent>
        </Card>
      ) : null}

      {canonicalMismatchWarnings.length ? (
        <Card className="border-amber-300/25 bg-amber-300/10">
          <CardContent className="p-4 text-sm text-amber-100">
            Performance is using the stored canonical latest-cycle metrics as source of truth. Derived summary mismatch: {canonicalMismatchWarnings.join(" ")}
          </CardContent>
        </Card>
      ) : null}

      <WhyNotReadyCard context="performance" snapshot={runtimeSnapshot} />

      <SimulatedAccountCard account={simulatedAccount} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Research trades" value={String(canonicalMetrics?.totalTrades ?? 0)} detail={canonicalMetrics?.metricSourceLabel ?? "Latest cycle not available"} />
        <MetricCard label="Research win rate" value={formatPercent(canonicalMetrics?.winRate ?? 0)} detail={`${canonicalMetrics?.winningTrades ?? 0} target hit(s)`} />
        <MetricCard label="Average R" value={formatSigned(canonicalMetrics?.averageR ?? 0, 2)} detail="Canonical latest cycle" tone={(canonicalMetrics?.averageR ?? 0) >= 0 ? "positive" : "danger"} />
        <MetricCard label="Max drawdown" value={`${(canonicalMetrics?.maxDrawdownR ?? 0).toFixed(2)}R`} detail="Canonical latest cycle" />
        <MetricCard label="Profit factor" value={canonicalMetrics?.profitFactor === null || canonicalMetrics?.profitFactor === undefined ? "n/a" : canonicalMetrics.profitFactor.toFixed(2)} detail="Canonical latest cycle" />
        <MetricCard label="Stability score" value={String(canonicalMetrics?.stabilityScore ?? 0)} detail={`Readiness ${canonicalMetrics?.readinessScore ?? 0}`} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Canonical Metric Diagnostics</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Dashboard cycle ID and Performance cycle ID both resolve to {canonicalMetrics?.sourceCycleId ?? "no cycle"}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{canonicalMetrics?.symbol ?? "n/a"}</Badge>
            <Badge variant="secondary">{canonicalMetrics?.timeframe ?? "n/a"}</Badge>
            <Badge variant="secondary">skipped {canonicalMetrics?.skippedSignals ?? 0}</Badge>
            <Badge variant="secondary">false + {canonicalMetrics?.falsePositiveCount ?? 0}</Badge>
            <Badge variant="secondary">calibration {formatPercent(canonicalMetrics?.confidenceCalibration ?? 0)}</Badge>
          </div>
        </CardContent>
      </Card>

      <TechnicalDetails
        title="View metric provenance"
        description="Open for the full run/source fingerprint behind the Performance metrics."
      >
        <MetricProvenanceDetails snapshot={runtimeSnapshot} />
      </TechnicalDetails>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Canonical Research Metrics</CardTitle>
            <CardDescription>Same latest-cycle values displayed on Dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              ["Cycle", canonicalMetrics?.sourceCycleId ?? "none"],
              ["Generated", canonicalMetrics?.generatedAt ? new Date(canonicalMetrics.generatedAt).toLocaleString() : "n/a"],
              ["Data source", canonicalMetrics?.dataSource ?? "n/a"],
              ["Raw candles", String(canonicalMetrics?.rawCandleCount ?? 0)],
              ["Processed candles", String(canonicalMetrics?.processedCandleCount ?? 0)],
              ["Active calibration", canonicalMetrics?.activeCalibrationId ?? "none"]
            ].map(([label, value]) => (
              <div key={label} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/45 p-3 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="break-all font-mono text-xs text-foreground">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Agent Hit Rate and Calibration</CardTitle>
            <CardDescription>Comparison of simulated accuracy and confidence calibration.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-22} textAnchor="end" height={80} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8 }} />
                  <Bar dataKey="hitRate" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="calibration" fill="#facc15" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weakest Agent Loop</CardTitle>
            <CardDescription>The next prompt candidate targets the lowest current score.</CardDescription>
          </CardHeader>
          <CardContent>
            {weakest ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-4">
                  <div className="flex items-center gap-2 font-medium text-amber-100">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    {weakest.name}
                  </div>
                  <p className="mt-2 text-sm text-amber-100/80">{weakest.description}</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>Hit rate</span>
                      <span className="font-mono">{formatPercent(weakest.hitRate)}</span>
                    </div>
                    <Progress value={weakest.hitRate * 100} />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>Calibration</span>
                      <span className="font-mono">{formatPercent(weakest.confidenceCalibration)}</span>
                    </div>
                    <Progress value={weakest.confidenceCalibration * 100} />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>Drawdown</span>
                      <span className="font-mono">{formatPercent(weakest.drawdown)}</span>
                    </div>
                    <Progress value={weakest.drawdown * 100} />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  After outcome scoring, the system proposes a single prompt mutation for the weakest agent and stores it
                  as a candidate until the user accepts or rejects it.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Outcome Log</CardTitle>
          <CardDescription>Stored simulated market outcomes used for scoring recommendations.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-3 pr-3">Symbol</th>
                <th className="py-3 pr-3">Session</th>
                <th className="py-3 pr-3">Actual bias</th>
                <th className="py-3 pr-3">Move</th>
                <th className="py-3 pr-3">Target reached</th>
                <th className="py-3 pr-3">Invalidation</th>
                <th className="py-3 pr-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {state.outcomes.map((outcome) => (
                <tr key={outcome.id} className="border-b border-border/70">
                  <td className="py-3 pr-3 font-mono">{outcome.symbol}</td>
                  <td className="py-3 pr-3">{outcome.session}</td>
                  <td className="py-3 pr-3">
                    <Badge variant={outcome.actualBias === "bullish" ? "success" : outcome.actualBias === "bearish" ? "danger" : "warning"}>
                      {outcome.actualBias}
                    </Badge>
                  </td>
                  <td className="py-3 pr-3 font-mono">{formatSigned(outcome.priceMove, 1)}</td>
                  <td className="py-3 pr-3">{outcome.liquidityTargetReached ? <Trophy className="h-4 w-4 text-emerald-300" /> : "No"}</td>
                  <td className="py-3 pr-3">{outcome.invalidationHit ? "Hit" : "Held"}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{outcome.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
