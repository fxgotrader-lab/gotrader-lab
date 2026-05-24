import { Activity, BarChart3, LineChart as LineChartIcon, Percent, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard } from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { LabState, MarketBias } from "@/lib/types";
import { aggregatePortfolioMetrics } from "@/lib/scoring";
import { formatPercent, formatSigned } from "@/lib/utils";

function biasVariant(bias: MarketBias) {
  if (bias === "bullish") {
    return "success" as const;
  }
  if (bias === "bearish") {
    return "danger" as const;
  }
  return "warning" as const;
}

export function DashboardOverview({ state }: { state: LabState }) {
  const metrics = aggregatePortfolioMetrics(state);
  const confidenceData = state.agents
    .filter((agent) => agent.layer !== "cio")
    .slice(0, 12)
    .map((agent) => ({
      name: agent.name.replace(" Agent", ""),
      confidence: Math.round(agent.confidence * 100),
      weight: Math.round(agent.weight * 100)
    }));
  const cio = state.agents.find((agent) => agent.layer === "cio");
  const recentMutations = state.promptMutations.slice(0, 4);
  const recentRecommendations = state.recommendations.slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">ATLAS-style research console</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Simulation Command Dashboard</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Multi-agent futures research for ES, NQ, MES, and MNQ using mock data, local memory, prompt scoring, and
            simulation-only recommendations.
          </p>
        </div>
        <Badge variant="warning">Research only, not financial advice</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Active agents" value={String(metrics.activeAgents)} detail="Macro, sector, strategy, CIO" icon={<Activity className="h-4 w-4" />} />
        <MetricCard
          label="CIO confidence"
          value={formatPercent(metrics.confidence)}
          detail="Composite thesis confidence"
          icon={<Percent className="h-4 w-4" />}
        />
        <MetricCard
          label="Simulated PnL"
          value={formatSigned(metrics.simulatedPnl, 1)}
          detail="Mock outcome points"
          tone={metrics.simulatedPnl >= 0 ? "positive" : "danger"}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <MetricCard label="Hit rate" value={formatPercent(metrics.hitRate)} detail="Scored mock recommendations" icon={<BarChart3 className="h-4 w-4" />} />
        <MetricCard
          label="Sharpe-like"
          value={metrics.sharpeLike.toFixed(2)}
          detail={`Drawdown ${formatPercent(metrics.drawdown)}`}
          icon={<LineChartIcon className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Confidence by Agent</CardTitle>
            <CardDescription>Mock confidence calibration across active research agents.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={confidenceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-20} height={72} textAnchor="end" />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip
                    cursor={{ fill: "rgba(45,212,191,0.08)" }}
                    contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8 }}
                  />
                  <Bar dataKey="confidence" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agent Weights</CardTitle>
            <CardDescription>Decision-layer blend for the simulation engine.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.agents
              .filter((agent) => agent.active)
              .sort((a, b) => b.weight - a.weight)
              .slice(0, 8)
              .map((agent) => (
                <div key={agent.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{agent.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{formatPercent(agent.weight)}</span>
                  </div>
                  <Progress value={agent.weight * 100} />
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent Recommendations</CardTitle>
            <CardDescription>All entries are mock research outputs and cannot execute trades.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentRecommendations.map((recommendation) => {
              const agent = state.agents.find((item) => item.id === recommendation.agentId);
              return (
                <div key={recommendation.id} className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{agent?.name ?? recommendation.agentId}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant={biasVariant(recommendation.bias)}>{recommendation.bias}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{formatPercent(recommendation.confidence)}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{recommendation.reasoning}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Prompt Mutations</CardTitle>
            <CardDescription>Candidate prompts require user confirmation before activation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentMutations.map((mutation) => {
              const agent = state.agents.find((item) => item.id === mutation.agentId);
              return (
                <div key={mutation.id} className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{agent?.name}</div>
                    <Badge variant={mutation.status === "accepted" ? "success" : mutation.status === "rejected" ? "danger" : "warning"}>
                      {mutation.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{mutation.proposedDiffSummary}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {cio ? (
        <Card>
          <CardHeader>
            <CardTitle>CIO Confidence History</CardTitle>
            <CardDescription>Local simulated calibration trend for the decision layer.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cio.confidenceHistory.map((item, index) => ({ label: `T${index + 1}`, value: Math.round(item.value * 100) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[40, 100]} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="value" stroke="#facc15" strokeWidth={2} dot={{ fill: "#facc15", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
