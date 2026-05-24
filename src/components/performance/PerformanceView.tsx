import { useMemo } from "react";
import { AlertTriangle, Activity, ShieldAlert, Trophy } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard } from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { runBacktest } from "@/lib/backtesting";
import { mockCandles } from "@/lib/mockData/mockCandles";
import { aggregatePortfolioMetrics, identifyWeakestAgent } from "@/lib/scoring";
import type { LabState } from "@/lib/types";
import { formatPercent, formatSigned } from "@/lib/utils";

const biasVariant = (bias?: string) => {
  if (bias === "bullish") {
    return "success" as const;
  }
  if (bias === "bearish") {
    return "danger" as const;
  }
  return "warning" as const;
};

export function PerformanceView({ state }: { state: LabState }) {
  const metrics = aggregatePortfolioMetrics(state);
  const weakest = identifyWeakestAgent(state);
  const backtest = useMemo(() => runBacktest(mockCandles, { symbol: "NQ", timeframe: "5m" }), []);
  const backtestSummary = backtest.summary;
  const chartData = state.agents
    .filter((agent) => agent.layer !== "cio")
    .map((agent) => ({
      name: agent.name.replace(" Agent", ""),
      hitRate: Math.round(agent.hitRate * 100),
      calibration: Math.round(agent.confidenceCalibration * 100),
      drawdown: Math.round(agent.drawdown * 100)
    }))
    .slice(0, 14);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Simulation scorecard</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Performance</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Scores are generated from mock recommendations and outcomes. They are designed for prompt research, not live
            trading decisions.
          </p>
        </div>
        <Badge variant="warning">Mock outcomes only</Badge>
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Backtest trades" value={String(backtestSummary.totalTrades)} detail={`${backtestSummary.directionalTrades} directional`} />
        <MetricCard label="Backtest win rate" value={formatPercent(backtestSummary.winRate)} detail={`${backtestSummary.wins} target hit(s)`} />
        <MetricCard label="Average R" value={formatSigned(backtestSummary.averageR, 2)} detail="Per simulated record" tone={backtestSummary.averageR >= 0 ? "positive" : "danger"} />
        <MetricCard label="Max drawdown" value={`${backtestSummary.maxDrawdown.toFixed(2)}R`} detail="Replay equity curve" />
        <MetricCard label="Best trade" value={`${formatSigned(backtestSummary.bestTrade?.rMultiple ?? 0, 2)}R`} detail={backtestSummary.bestTrade?.outcome.replace("_", " ") ?? "n/a"} tone="positive" />
        <MetricCard label="Worst trade" value={`${formatSigned(backtestSummary.worstTrade?.rMultiple ?? 0, 2)}R`} detail={backtestSummary.worstTrade?.outcome.replace("_", " ") ?? "n/a"} tone="danger" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Backtest Equity Curve</CardTitle>
            <CardDescription>Cumulative simulated R from deterministic mock-candle replay.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={backtestSummary.equityCurve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="index" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="equityR" stroke="#2dd4bf" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Strategy / Agent Attribution</CardTitle>
            <CardDescription>How often each internal agent aligned with the CIO replay thesis.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {backtestSummary.agentAttribution.map((agent) => (
              <div key={agent.agentId} className="rounded-lg border border-border bg-background/45 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">{agent.totalOpinions} replay opinions</p>
                  </div>
                  <Badge variant="secondary">{formatPercent(agent.cioAlignmentRate)}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <span>Bull {agent.bullishCount}</span>
                  <span>Bear {agent.bearishCount}</span>
                  <span>Neutral {agent.neutralCount}</span>
                  <span>Conf {formatPercent(agent.averageConfidence)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backtest Trade List</CardTitle>
          <CardDescription>Simulated target, invalidation, and expiry outcomes from mock OHLC only.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-3 pr-3">Decision</th>
                <th className="py-3 pr-3">Bias</th>
                <th className="py-3 pr-3">Confidence</th>
                <th className="py-3 pr-3">Outcome</th>
                <th className="py-3 pr-3">R</th>
                <th className="py-3 pr-3">MFE</th>
                <th className="py-3 pr-3">MAE</th>
                <th className="py-3 pr-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {backtest.trades.map((trade) => (
                <tr key={trade.id} className="border-b border-border/70">
                  <td className="py-3 pr-3 font-mono">{trade.decisionIndex + 1}</td>
                  <td className="py-3 pr-3">
                    <Badge variant={biasVariant(trade.bias)}>{trade.bias}</Badge>
                  </td>
                  <td className="py-3 pr-3 font-mono">{formatPercent(trade.confidence)}</td>
                  <td className="py-3 pr-3">{trade.outcome.replace("_", " ")}</td>
                  <td className="py-3 pr-3 font-mono">{formatSigned(trade.rMultiple, 2)}R</td>
                  <td className="py-3 pr-3 font-mono">{trade.maxFavorableExcursion.toFixed(2)}</td>
                  <td className="py-3 pr-3 font-mono">{trade.maxAdverseExcursion.toFixed(2)}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{trade.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

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
