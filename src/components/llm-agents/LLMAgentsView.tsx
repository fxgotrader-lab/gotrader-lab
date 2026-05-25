import { useEffect, useMemo, useState } from "react";
import { Bot, BrainCircuit, FileJson, Play, ShieldAlert, SlidersHorizontal, TerminalSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildLLMResearchContextPacket,
  getLLMReadinessImpact,
  LLM_LOCAL_COMMAND_ENV_VAR,
  LLM_RESEARCH_UPDATED_EVENT,
  loadLLMResearchState,
  providerStatusForMode,
  requiredLLMAgents,
  runLLMAgentOrchestrator,
  saveLLMAdvisoryRun
} from "@/lib/llm";
import type { LLMAdvisoryRun, LLMProviderMode, LLMResearchContextPacket, LLMResearchState } from "@/lib/llm";
import { evaluateReadinessGate } from "@/lib/readiness";
import { loadLatestResearchQualityReview } from "@/lib/researchQuality";
import {
  createCalibrationProposal,
  upsertCalibrationProposal
} from "@/lib/selfImprovement";
import { loadSimulationRunbookState } from "@/lib/simulationRunbook";
import type { LabState } from "@/lib/types";
import { loadLatestValidationReport } from "@/lib/validation";

const formatValue = (value: string) => value.replace(/_/g, " ");
const statusVariant = (status?: string) =>
  status === "complete" || status === "mock_complete"
    ? "success"
    : status === "rejected" || status === "error"
      ? "danger"
      : status === "fallback_complete"
        ? "warning"
        : "muted";
const providerVariant = (configured: boolean, providerMode: LLMProviderMode) =>
  configured && providerMode === "local_command" ? "success" : providerMode === "mock_llm" ? "warning" : "danger";

const RunSummary = ({ run }: { run?: LLMAdvisoryRun }) => {
  if (!run) {
    return (
      <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
        No LLM advisory run has been recorded yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {[
        ["Latest run", run.timestamp],
        ["Provider", formatValue(run.providerMode)],
        ["Status", formatValue(run.status)],
        ["Unsafe rejections", String(run.unsafeResponseRejections)],
        ["Advisory passed", run.advisoryPassed ? "yes" : "no"]
      ].map(([label, value]) => (
        <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 break-words font-mono text-sm text-foreground">{value}</p>
        </div>
      ))}
    </div>
  );
};

export function LLMAgentsView({ state }: { state: LabState }) {
  const [llmState, setLlmState] = useState<LLMResearchState>(() => loadLLMResearchState());
  const [contextPacket, setContextPacket] = useState<LLMResearchContextPacket>();
  const [busy, setBusy] = useState(false);
  const latestValidation = loadLatestValidationReport();
  const latestQuality = loadLatestResearchQualityReview();
  const runbook = loadSimulationRunbookState();
  const readiness = evaluateReadinessGate({
    validation: latestValidation,
    quality: latestQuality,
    runbook
  });
  const latestRun = llmState.runs.find((run) => run.runId === llmState.latestRunId) ?? llmState.runs[0];
  const providerStatus = providerStatusForMode(llmState.providerMode);
  const context = useMemo(
    () =>
      buildLLMResearchContextPacket({
        state,
        validation: latestValidation,
        quality: latestQuality,
        readiness,
        runbook,
        providerMode: llmState.providerMode
      }),
    [latestQuality, latestValidation, llmState.providerMode, readiness, runbook, state]
  );

  useEffect(() => {
    const refresh = () => setLlmState(loadLLMResearchState());
    window.addEventListener(LLM_RESEARCH_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(LLM_RESEARCH_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const runMock = async () => {
    setBusy(true);
    const mockContext = { ...context, providerMode: "mock_llm" as const };
    setContextPacket(mockContext);
    const run = await runLLMAgentOrchestrator(mockContext, "mock_llm");
    setLlmState(saveLLMAdvisoryRun(run, "local_command"));
    setBusy(false);
  };

  const checkLocalCommand = async () => {
    setBusy(true);
    const localContext = { ...context, providerMode: "local_command" as const };
    setContextPacket(localContext);
    const run = await runLLMAgentOrchestrator(localContext, "local_command");
    setLlmState(saveLLMAdvisoryRun(run, "local_command"));
    setBusy(false);
  };

  const createSelfImprovementProposal = () => {
    const hasSuggestion = latestRun?.responses.some((response) => response.suggestedCalibration.length > 0);
    if (!hasSuggestion) {
      window.alert("Run an LLM advisory review with calibration suggestions before creating a proposal.");
      return;
    }
    const proposal = createCalibrationProposal("openclaw");
    upsertCalibrationProposal(
      {
        ...proposal,
        reason: `LLM advisory suggestion: ${latestRun?.responses
          .flatMap((response) => response.suggestedCalibration)
          .slice(0, 2)
          .join(" ")}`
      },
      "created",
      "Created from LLM advisory suggestedCalibration. Proposal still requires simulation testing and approval."
    );
    window.alert("Created a simulation-only self-improvement proposal. Test it on /self-improvement before accepting.");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">LLM research layer</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">LLM Research Agents</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Real research mode requires advisory LLM agents through a secure provider boundary. Deterministic agents
            remain fallback-only baselines for testing and comparison.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">llm_required</Badge>
          <Badge variant={providerVariant(providerStatus.configured, llmState.providerMode)}>
            {formatValue(llmState.providerMode)}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Supported Research Modes</CardTitle>
          <CardDescription>Real research mode requires LLM review; fallback and mock paths are clearly limited.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            ["llm_required", "Production research mode. Requires configured LLM provider before research can be marked complete."],
            ["deterministic_fallback", "Fallback only for tests, offline UI, and non-LLM baseline comparison."],
            ["mock_llm", "Mock only for UI testing. Cannot satisfy Paper-Demo Candidate readiness."],
            ["local_command", "Preferred first real provider path through a secure local command bridge."],
            ["future_api", "Planning only until backend, Supabase Edge Function, or secure provider service exists."]
          ].map(([mode, detail]) => (
            <div key={mode} className="rounded-lg border border-border bg-background/45 p-3">
              <p className="font-mono text-sm text-foreground">{mode}</p>
              <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-amber-300/25 bg-amber-300/10">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <span>
              LLM agents are required for real research mode, but advisory only. They cannot execute trades or override
              readiness gates.
            </span>
          </div>
          <Badge variant="warning">No execution authority</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Research Mode Status</CardTitle>
            </div>
            <CardDescription>Production research mode requires a real provider boundary.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ["Research mode", "llm_required"],
              ["Provider mode", llmState.providerMode],
              ["Provider configured", providerStatus.configured ? "yes" : "no"],
              ["Deterministic fallback", "fallback only"],
              ["Mock LLM", "mock only"],
              ["Execution authority", "none"],
              ["Broker authority", "none"],
              ["Readiness override", "none"]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
                <span className="text-muted-foreground">{label}</span>
                <Badge variant={value === "none" || value === "no" ? "danger" : value.includes("only") ? "warning" : "success"}>
                  {formatValue(value)}
                </Badge>
              </div>
            ))}
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              {getLLMReadinessImpact(llmState)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TerminalSquare className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Provider Boundary</CardTitle>
            </div>
            <CardDescription>No API keys can live in frontend code. Use a secure provider boundary.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Preferred first real path</p>
              <p className="mt-1 font-mono text-sm text-foreground">local_command</p>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Environment variable</p>
              <p className="mt-1 break-all font-mono text-sm text-foreground">{LLM_LOCAL_COMMAND_ENV_VAR}</p>
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-background/75 p-3 font-mono text-xs leading-5 text-slate-200">
{`$env:${LLM_LOCAL_COMMAND_ENV_VAR} = "openclaw run gotrader-llm-agent-review"
# local bridge sends context JSON on stdin
# local bridge expects structured advisory JSON on stdout`}
            </pre>
            <div className="rounded-lg border border-border bg-background/45 p-3 text-muted-foreground">
              Frontend cannot spawn local commands. A local bridge, backend endpoint, Supabase Edge Function, or future
              secure service must own real model calls.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle>Required LLM Agents</CardTitle>
              </div>
              <CardDescription>These reviewers are required for real research mode.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={runMock} disabled={busy}>
                <Play className="h-4 w-4" aria-hidden="true" />
                Mock Test
              </Button>
              <Button variant="secondary" onClick={checkLocalCommand} disabled={busy}>
                Check Local Command
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {requiredLLMAgents.map((agent) => (
              <div key={agent.agentId} className="rounded-lg border border-border bg-background/45 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{agent.agentName}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{agent.role}</p>
                  </div>
                  <Badge variant="warning">required</Badge>
                </div>
              </div>
            ))}
          </div>
          <RunSummary run={latestRun} />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Latest LLM Advisory Outputs</CardTitle>
            </div>
            <CardDescription>Responses must be structured JSON and pass advisory-only validation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestRun?.responses.length ? (
              latestRun.responses.map((response) => {
                const validation = latestRun.validationResults[response.agentId];
                return (
                  <div key={response.agentId} className="rounded-lg border border-border bg-background/45 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{response.agentName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{response.reasoningSummary}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={validation?.valid ? "success" : "danger"}>
                          {validation?.valid ? "valid" : "rejected"}
                        </Badge>
                        <Badge variant="muted">{formatValue(response.bias)}</Badge>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="rounded-md border border-border bg-card/45 p-2 text-xs">
                        confidence {(response.confidence * 100).toFixed(0)}%
                      </div>
                      <div className="rounded-md border border-border bg-card/45 p-2 text-xs">
                        recommendation {formatValue(response.proceedRecommendation)}
                      </div>
                      <div className="rounded-md border border-border bg-card/45 p-2 text-xs">
                        calibration suggestions {response.suggestedCalibration.length}
                      </div>
                    </div>
                    {response.riskWarnings.length ? (
                      <div className="mt-3 rounded-md border border-amber-300/25 bg-amber-300/10 p-2 text-xs text-amber-100">
                        {response.riskWarnings.join(" ")}
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
                Run the mock test or configure a secure local command provider to see advisory outputs.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Self-Improvement Hook</CardTitle>
            </div>
            <CardDescription>LLM suggestedCalibration may seed a proposal, but cannot apply it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-border bg-background/45 p-3 text-muted-foreground">
              Any proposal created here must still be simulation-tested on /self-improvement and manually approved
              before active calibration settings change.
            </div>
            <Button onClick={createSelfImprovementProposal} disabled={!latestRun?.responses.length}>
              Create Calibration Proposal
            </Button>
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              LLM suggestions cannot alter broker settings, execution permissions, or readiness gates.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Restricted Context Packet</CardTitle>
          <CardDescription>Only research facts and safety constraints are sent to a future secure provider.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[520px] overflow-auto rounded-lg border border-border bg-background/75 p-4 font-mono text-xs leading-5 text-slate-200">
            {JSON.stringify(contextPacket ?? context, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
