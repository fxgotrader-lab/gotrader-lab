import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard } from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { LabState } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

export function AgentDetail({ state }: { state: LabState }) {
  const { id } = useParams();
  const agent = state.agents.find((item) => item.id === id);

  if (!agent) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Agent not found.</p>
          <Button variant="secondary" className="mt-4" onClick={() => window.history.back()}>
            Back to agents
          </Button>
        </CardContent>
      </Card>
    );
  }

  const prompt = state.promptVersions.find((item) => item.id === agent.currentPromptVersionId);
  const recommendations = state.recommendations.filter((item) => item.agentId === agent.id).slice(0, 6);
  const mutations = state.promptMutations.filter((item) => item.agentId === agent.id);
  const historyData = agent.confidenceHistory.map((item, index) => ({
    label: `T${index + 1}`,
    confidence: Math.round(item.value * 100)
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Link to="/agents" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to agents
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-semibold tracking-normal">{agent.name}</h2>
            <Badge variant="secondary">{agent.layer}</Badge>
            <Badge variant={agent.active ? "success" : "muted"}>{agent.active ? "active" : "paused"}</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{agent.description}</p>
        </div>
        <Badge variant="warning">Simulation-only analysis</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Confidence" value={formatPercent(agent.confidence)} detail="Current self-rating" />
        <MetricCard label="Hit rate" value={formatPercent(agent.hitRate)} detail={`${agent.wins}W / ${agent.losses}L`} />
        <MetricCard label="Drawdown" value={formatPercent(agent.drawdown)} detail="Mock max drawdown" />
        <MetricCard label="Sharpe-like" value={agent.sharpeLike.toFixed(2)} detail="Simulation score" />
        <MetricCard label="Calibration" value={formatPercent(agent.confidenceCalibration)} detail="Confidence vs score" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Current System Prompt</CardTitle>
            <CardDescription>Prompt version {prompt?.version ?? "unknown"} stored in local prompt history.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-background/65 p-4 font-mono text-sm leading-6 text-slate-200">
              {agent.currentSystemPrompt}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Confidence History</CardTitle>
            <CardDescription>Local simulated confidence trend.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyData}>
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[30, 100]} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="confidence" stroke="#2dd4bf" strokeWidth={2} dot={{ fill: "#2dd4bf", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Recommendations</CardTitle>
            <CardDescription>Mock recommendations emitted by this agent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.length ? (
              recommendations.map((recommendation) => (
                <div key={recommendation.id} className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">
                      {recommendation.symbol} {recommendation.timeframe}
                    </div>
                    <Badge variant={recommendation.bias === "bullish" ? "success" : recommendation.bias === "bearish" ? "danger" : "warning"}>
                      {recommendation.bias}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{recommendation.reasoning}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recommendation.ictTags.map((tag) => (
                      <Badge key={tag} variant="muted">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No recommendations yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prompt Mutations</CardTitle>
            <CardDescription>Accepted and rejected prompt evolution for this agent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mutations.length ? (
              mutations.map((mutation) => (
                <div key={mutation.id} className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {mutation.status === "accepted" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-4 w-4 text-amber-200" aria-hidden="true" />
                      )}
                      <span className="font-medium capitalize">{mutation.status}</span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(mutation.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{mutation.proposedDiffSummary}</p>
                  <Separator className="my-3" />
                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <span>Before {formatPercent(mutation.oldPerformance.hitRate)} hit rate</span>
                    <span>
                      After{" "}
                      {mutation.candidatePerformance ? formatPercent(mutation.candidatePerformance.hitRate) : "pending"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No prompt mutations for this agent yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
