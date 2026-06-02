import { Link } from "react-router-dom";
import { Bot, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { AgentLayer, LabState } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

const layerOrder: AgentLayer[] = ["macro", "market_context", "strategy", "cio"];
const layerLabel = (layer: AgentLayer) => layer === "market_context" ? "market context" : layer;

export function AgentRoster({ state }: { state: LabState }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Agent registry</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Research Agents</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Macro, futures market context, strategy, ICT, and CIO agents generate simulated market views and track prompt
            performance over time. Equity-style sector agents are deprecated for the main futures workflow.
          </p>
        </div>
        <Badge variant="warning">Prompt changes require approval</Badge>
      </div>

      {layerOrder.map((layer) => {
        const agents = state.agents.filter((agent) => agent.layer === layer);
        return (
          <section key={layer} className="space-y-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-lg font-semibold capitalize">{layerLabel(layer)} layer</h3>
              <Badge variant="muted">{agents.length}</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent) => (
                <Link key={agent.id} to={`/agents/${agent.id}`} className="block">
                  <Card className="h-full transition-colors hover:border-primary/40 hover:bg-card">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="rounded-md border border-border bg-secondary/60 p-2">
                            <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="truncate">{agent.name}</CardTitle>
                            <CardDescription>{agent.domain}</CardDescription>
                          </div>
                        </div>
                        <Badge variant={agent.active ? "success" : "muted"}>{agent.active ? "active" : "paused"}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Confidence</p>
                          <p className="font-mono">{formatPercent(agent.confidence)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Hit rate</p>
                          <p className="font-mono">{formatPercent(agent.hitRate)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Sharpe</p>
                          <p className="font-mono">{agent.sharpeLike.toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Decision weight</span>
                          <span>{formatPercent(agent.weight)}</span>
                        </div>
                        <Progress value={agent.weight * 100} />
                      </div>
                      <div className="rounded-md border border-border bg-background/45 p-2 text-xs text-muted-foreground">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span>Metric provenance</span>
                          <Badge variant={agent.wins + agent.losses > 0 ? "secondary" : "warning"}>
                            {agent.wins + agent.losses > 0 ? "simulated" : "insufficient"}
                          </Badge>
                        </div>
                        Sample {agent.wins + agent.losses}; local agent registry; regime context applied during research-cycle debate when available.
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
