import { useMemo, useState } from "react";
import { Check, GitBranch, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { AgentPromptVersion, LabState, PromptMutation } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

interface PromptLabActions {
  approveMutation(mutationId: string): void;
  rejectMutation(mutationId: string): void;
  rollbackPrompt(promptVersionId: string): void;
}

function statusVariant(status: string) {
  if (status === "active" || status === "accepted") {
    return "success" as const;
  }
  if (status === "rejected" || status === "reverted" || status === "rolled_back") {
    return "danger" as const;
  }
  return "warning" as const;
}

function scoreLine(label: string, before?: number, after?: number) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">
        {before === undefined ? "n/a" : label === "Sharpe-like" ? before.toFixed(2) : formatPercent(before)}
        {" → "}
        {after === undefined ? "pending" : label === "Sharpe-like" ? after.toFixed(2) : formatPercent(after)}
      </span>
    </div>
  );
}

export function PromptLab({ state, actions }: { state: LabState; actions: PromptLabActions }) {
  const [selectedPromptId, setSelectedPromptId] = useState(state.promptVersions[0]?.id ?? "");
  const sortedPrompts = useMemo(
    () => [...state.promptVersions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [state.promptVersions]
  );
  const selectedPrompt = state.promptVersions.find((prompt) => prompt.id === selectedPromptId) ?? sortedPrompts[0];
  const selectedAgent = state.agents.find((agent) => agent.id === selectedPrompt?.agentId);
  const selectedMutation = state.promptMutations.find(
    (mutation) => mutation.candidatePromptVersionId === selectedPrompt?.id || mutation.fromPromptVersionId === selectedPrompt?.id
  );

  const accept = (mutation: PromptMutation) => {
    const approved = window.confirm("Activate this candidate prompt for simulation? No live trading behavior is enabled.");
    if (approved) {
      actions.approveMutation(mutation.id);
    }
  };

  const reject = (mutation: PromptMutation) => {
    const approved = window.confirm("Reject this candidate prompt and keep the current active prompt?");
    if (approved) {
      actions.rejectMutation(mutation.id);
    }
  };

  const rollback = (prompt: AgentPromptVersion) => {
    const approved = window.confirm("Rollback this agent to the selected prompt version for local simulation?");
    if (approved) {
      actions.rollbackPrompt(prompt.id);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Prompt git history</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Prompt Lab</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Review prompt versions, candidate mutations, before/after performance, and explicit user decisions.
          </p>
        </div>
        <Badge variant="warning">Activation needs confirmation</Badge>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Version List</CardTitle>
            <CardDescription>Local history for agent prompts and mutations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sortedPrompts.map((prompt) => {
              const agent = state.agents.find((item) => item.id === prompt.agentId);
              return (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => setSelectedPromptId(prompt.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedPrompt?.id === prompt.id
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-background/45 hover:border-primary/30"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <GitBranch className="h-4 w-4 text-primary" aria-hidden="true" />
                      <span className="truncate font-medium">{agent?.name ?? prompt.agentId}</span>
                    </div>
                    <Badge variant={statusVariant(prompt.status)}>{prompt.status}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono">{prompt.version}</span>
                    <span>{new Date(prompt.createdAt).toLocaleDateString()}</span>
                    <span>{prompt.mutationReason}</span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {selectedPrompt ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{selectedAgent?.name ?? selectedPrompt.agentId}</CardTitle>
                  <CardDescription>
                    Version {selectedPrompt.version} created {new Date(selectedPrompt.createdAt).toLocaleString()}
                  </CardDescription>
                </div>
                <Badge variant={statusVariant(selectedPrompt.status)}>{selectedPrompt.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Mutation Reason</h3>
                <p className="mt-2 text-sm text-muted-foreground">{selectedPrompt.mutationReason}</p>
              </div>

              <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-background/65 p-4 font-mono text-sm leading-6 text-slate-200 scrollbar-thin">
                {selectedPrompt.prompt}
              </pre>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold">Comparison View</h3>
                {selectedMutation ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-muted-foreground">{selectedMutation.proposedDiffSummary}</p>
                    {scoreLine(
                      "Hit rate",
                      selectedMutation.oldPerformance.hitRate,
                      selectedMutation.candidatePerformance?.hitRate
                    )}
                    {scoreLine(
                      "Drawdown",
                      selectedMutation.oldPerformance.drawdown,
                      selectedMutation.candidatePerformance?.drawdown
                    )}
                    {scoreLine(
                      "Sharpe-like",
                      selectedMutation.oldPerformance.sharpeLike,
                      selectedMutation.candidatePerformance?.sharpeLike
                    )}
                    {scoreLine(
                      "Calibration",
                      selectedMutation.oldPerformance.confidenceCalibration,
                      selectedMutation.candidatePerformance?.confidenceCalibration
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Initial prompt version with no mutation comparison.</p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {selectedMutation?.status === "pending" ? (
                  <>
                    <Button onClick={() => accept(selectedMutation)}>
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Accept candidate
                    </Button>
                    <Button variant="destructive" onClick={() => reject(selectedMutation)}>
                      <X className="h-4 w-4" aria-hidden="true" />
                      Reject candidate
                    </Button>
                  </>
                ) : null}
                {selectedPrompt.status !== "active" && selectedPrompt.status !== "candidate" ? (
                  <Button variant="outline" onClick={() => rollback(selectedPrompt)}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Rollback
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Decision Log</CardTitle>
          <CardDescription>Approvals and rejections are persisted in local storage.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-3 pr-3">Date</th>
                <th className="py-3 pr-3">Entity</th>
                <th className="py-3 pr-3">Decision</th>
                <th className="py-3 pr-3">Reference</th>
              </tr>
            </thead>
            <tbody>
              {state.userApprovals.map((approval) => (
                <tr key={approval.id} className="border-b border-border/70">
                  <td className="py-3 pr-3">{new Date(approval.createdAt).toLocaleString()}</td>
                  <td className="py-3 pr-3">{approval.entityType}</td>
                  <td className="py-3 pr-3">
                    <Badge variant={approval.decision === "approved" ? "success" : "danger"}>{approval.decision}</Badge>
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{approval.entityId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
