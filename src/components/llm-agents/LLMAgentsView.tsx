import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  BrainCircuit,
  ClipboardCheck,
  Download,
  FileJson,
  Play,
  ShieldAlert,
  SlidersHorizontal,
  TerminalSquare,
  Upload
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Textarea } from "@/components/ui/textarea";
import {
  buildLLMResearchContextPacket,
  createLLMContextPacket,
  getLLMReadinessImpact,
  importLLMAgentResponse,
  LLM_LOCAL_COMMAND_ENV_VAR,
  LLM_RESEARCH_UPDATED_EVENT,
  loadLLMResearchState,
  providerStatusForMode,
  recordLLMContextExport,
  recordLLMResponseImport,
  recordLLMUnsafeResponseRejection,
  requiredLLMAgents,
  runLocalBridgeAdvisory,
  runLLMAgentOrchestrator,
  saveLLMAdvisoryRun,
  serializeLLMContextPacket,
  validateLLMContextPacket
} from "@/lib/llm";
import type { LLMAdvisoryRun, LLMProviderMode, LLMResearchContextPacket, LLMResearchState } from "@/lib/llm";
import type { LLMContextPacketValidationResult } from "@/lib/llm/validateLLMContextPacket";
import type { LLMAgentResponseImportResult } from "@/lib/llm/importLLMAgentResponse";
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
const latestLLMContextFilename = "latest-llm-context.json";
const localBridgeEndpoint = "http://127.0.0.1:8787/llm/run-advisory";
const llmRequestPath = "C:/Users/andre/OneDrive/Documents/gotrader/llm/requests/latest-llm-context.json";
const llmResponsePath = "C:/Users/andre/OneDrive/Documents/gotrader/llm/responses/latest-llm-response.json";
const sampleResponseHint = `Paste the contents of llm/responses/latest-llm-response.json here.

Expected shape:
[
  {
    "agentId": "llm-ict-liquidity-reviewer",
    "mode": "advisory_only",
    "executionAuthority": "none",
    "brokerAuthority": "none",
    "readinessOverrideAuthority": "none"
  }
]`;

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
  const [contextJson, setContextJson] = useState("");
  const [contextValidation, setContextValidation] = useState<LLMContextPacketValidationResult>();
  const [importJson, setImportJson] = useState("");
  const [importResult, setImportResult] = useState<LLMAgentResponseImportResult>();
  const [bridgeStatus, setBridgeStatus] = useState<{
    state: "idle" | "running" | "complete" | "error";
    message?: string;
    responseFile?: string;
  }>({ state: "idle" });
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

  const downloadJson = (filename: string, contents: string) => {
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const exportContextPacket = (stableFilename = false) => {
    const packet = createLLMContextPacket({
      state,
      validation: latestValidation,
      quality: latestQuality,
      readiness,
      runbook,
      providerMode: "local_command"
    });
    const validation = validateLLMContextPacket(packet);
    const json = serializeLLMContextPacket(packet);

    setContextPacket(packet);
    setContextJson(json);
    setContextValidation(validation);
    setLlmState(recordLLMContextExport(packet.timestamp));
    downloadJson(stableFilename ? latestLLMContextFilename : `llm-context-${packet.packetId}.json`, json);
  };

  const validateImportedResponse = () => {
    const result = importLLMAgentResponse(importJson, contextPacket?.packetId ?? llmState.latestRunId ?? "manual_file_import");
    setImportResult(result);
    return result;
  };

  const importResponse = () => {
    const result = validateImportedResponse();
    if (!result.run || !result.valid) {
      setLlmState(recordLLMUnsafeResponseRejection(Math.max(1, result.unsafeResponseRejections)));
      return;
    }

    setLlmState(recordLLMResponseImport(result.run, result.run.timestamp));
  };

  const runBridgeAdvisory = async () => {
    setBusy(true);
    setBridgeStatus({ state: "running", message: "Sending advisory context to the local LLM bridge." });
    const packet = createLLMContextPacket({
      state,
      validation: latestValidation,
      quality: latestQuality,
      readiness,
      runbook,
      providerMode: "local_command"
    });
    const validation = validateLLMContextPacket(packet);
    const json = serializeLLMContextPacket(packet);
    setContextPacket(packet);
    setContextJson(json);
    setContextValidation(validation);

    if (!validation.valid) {
      setBridgeStatus({ state: "error", message: validation.errors.join(" ") });
      setBusy(false);
      return;
    }

    try {
      const bridgeResult = await runLocalBridgeAdvisory(packet);
      const responseJson = JSON.stringify(bridgeResult.responses, null, 2);
      setImportJson(responseJson);
      const result = importLLMAgentResponse(responseJson, packet.packetId);
      setImportResult(result);
      if (!result.run || !result.valid) {
        setLlmState(recordLLMUnsafeResponseRejection(Math.max(1, result.unsafeResponseRejections)));
        setBridgeStatus({
          state: "error",
          message: "Local bridge returned a response that failed frontend advisory validation.",
          responseFile: bridgeResult.responseFile
        });
      } else {
        setLlmState(recordLLMResponseImport(result.run, result.run.timestamp));
        setBridgeStatus({
          state: "complete",
          message: "GPT advisory review imported successfully.",
          responseFile: bridgeResult.responseFile
        });
      }
    } catch (error) {
      setBridgeStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Local LLM bridge request failed."
      });
    } finally {
      setBusy(false);
    }
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

      <TechnicalDetails
        title="View supported research modes"
        description="Open for the definitions of llm_required, fallback, mock, local command, and future API modes."
      >
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
      </TechnicalDetails>

      <SafetyLockBanner message="LLM agents are required for real research mode, but advisory only. They cannot execute trades or override readiness gates." />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle>Automated Local GPT Bridge</CardTitle>
              </div>
              <CardDescription>
                Calls the localhost bridge so GPT advisory output is generated, validated, saved, and imported
                automatically.
              </CardDescription>
            </div>
            <Badge variant={bridgeStatus.state === "complete" ? "success" : bridgeStatus.state === "error" ? "danger" : "warning"}>
              {bridgeStatus.state}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
            LLM agents are advisory only. They cannot execute trades, approve trades, or override readiness gates.
          </div>
          <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs text-muted-foreground">Bridge endpoint</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">{localBridgeEndpoint}</p>
              </div>
              <Button onClick={runBridgeAdvisory} disabled={busy}>
                <BrainCircuit className="h-4 w-4" aria-hidden="true" />
                Run GPT Advisory Review
              </Button>
              {bridgeStatus.message ? (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    bridgeStatus.state === "error"
                      ? "border-rose-400/25 bg-rose-400/10 text-rose-100"
                      : bridgeStatus.state === "complete"
                        ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                        : "border-border bg-background/45 text-muted-foreground"
                  }`}
                >
                  {bridgeStatus.message}
                  {bridgeStatus.responseFile ? (
                    <p className="mt-2 break-all font-mono text-xs">{bridgeStatus.responseFile}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-sm font-semibold">Start the local bridge in PowerShell</p>
              <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-background/75 p-3 font-mono text-xs leading-5 text-slate-200">
{`$env:OPENAI_API_KEY = "..."
$env:GOTRADER_LLM_MODEL = "gpt-5.5"
node scripts/llm-local-bridge-server.mjs`}
              </pre>
              <p className="mt-3 text-xs text-muted-foreground">
                If the server is not running, the app will show “Local LLM bridge server is not running.”
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <TechnicalDetails
          title="View provider setup instructions"
          description="Open for local command, PowerShell environment, and secure provider boundary details."
        >
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
            <CardDescription>No API keys can live in frontend code. GPT-5.5 runs through a secure local command.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs text-muted-foreground">Preferred first real path</p>
                <p className="mt-1 font-mono text-sm text-foreground">local_command</p>
              </div>
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs text-muted-foreground">Secure GPT provider script</p>
                <p className="mt-1 break-all font-mono text-sm text-foreground">
                  scripts/gpt55-llm-agent-provider.mjs
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Environment variable</p>
              <p className="mt-1 break-all font-mono text-sm text-foreground">{LLM_LOCAL_COMMAND_ENV_VAR}</p>
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-background/75 p-3 font-mono text-xs leading-5 text-slate-200">
{`$env:OPENAI_API_KEY = "..."
$env:GOTRADER_LLM_MODEL = "gpt-5.5"
$env:${LLM_LOCAL_COMMAND_ENV_VAR} = "node scripts/gpt55-llm-agent-provider.mjs"

# provider reads restricted research JSON on stdin
# provider prints validated advisory JSON on stdout only`}
            </pre>
            <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3 text-emerald-100">
              The OpenAI key stays in the local shell environment. The browser app only stores provider status and
              advisory run metadata.
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3 text-muted-foreground">
              Frontend cannot spawn local commands. A local bridge, backend endpoint, Supabase Edge Function, or future
              secure service must own real model calls. See docs/gpt55-api-setup.md for setup and validation.
            </div>
          </CardContent>
        </Card>
        </TechnicalDetails>
      </div>

      <TechnicalDetails
        title="View manual file workflow"
        description="Open for context export/import, local file paths, command snippets, validation messages, and raw JSON."
      >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FileJson className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle>Advanced Manual Workflow</CardTitle>
              </div>
              <CardDescription>
                Fallback path: export context from the app, run GPT-5.5 in PowerShell, then import validated advisory responses.
              </CardDescription>
            </div>
            <Badge variant="warning">manual fallback</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
            Browser code cannot call GPT or hold API keys. This workflow keeps the key in PowerShell and imports only
            advisory-only JSON.
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Latest context export", llmState.latestContextExportAt ?? "none"],
              ["Latest response import", llmState.latestResponseImportAt ?? "none"],
              ["Contexts exported", String(llmState.totalContextExports)],
              ["Responses imported", String(llmState.totalResponseImports)]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 break-words font-mono text-xs text-foreground">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Recommended request path</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground">{llmRequestPath}</p>
            </div>
            <div className="rounded-md border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Recommended response path</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground">{llmResponsePath}</p>
            </div>
          </div>

          <pre className="overflow-x-auto rounded-lg border border-border bg-background/75 p-3 font-mono text-xs leading-5 text-slate-200">
{`$env:OPENAI_API_KEY = "..."
$env:GOTRADER_LLM_MODEL = "gpt-5.5"
node scripts/gpt55-llm-agent-provider.mjs --input-file llm/requests/latest-llm-context.json --output-file llm/responses/latest-llm-response.json`}
          </pre>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => exportContextPacket(false)}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Export LLM Context Packet
            </Button>
            <Button variant="secondary" onClick={() => exportContextPacket(true)}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download as latest-llm-context.json
            </Button>
          </div>

          {contextValidation ? (
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Context Export Validation</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The packet must remain advisory-only before it leaves the browser.
                  </p>
                </div>
                <Badge variant={contextValidation.valid ? "success" : "danger"}>
                  {contextValidation.valid ? "valid" : "invalid"}
                </Badge>
              </div>
              {contextValidation.errors.length ? (
                <div className="mt-3 space-y-1">
                  {contextValidation.errors.map((error) => (
                    <div key={error} className="rounded-md border border-rose-400/20 bg-rose-400/5 px-2 py-1 text-xs text-rose-100">
                      {error}
                    </div>
                  ))}
                </div>
              ) : null}
              {contextValidation.warnings.length ? (
                <div className="mt-3 space-y-1">
                  {contextValidation.warnings.map((warning) => (
                    <div key={warning} className="rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
                      {warning}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-semibold">Import LLM Agent Response</h3>
              </div>
              <Textarea
                value={importJson}
                onChange={(event) => setImportJson(event.target.value)}
                placeholder={sampleResponseHint}
                className="min-h-[300px] font-mono text-xs"
                aria-label="LLM agent response JSON"
              />
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={validateImportedResponse}>
                  <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                  Validate imported response
                </Button>
                <Button onClick={importResponse}>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Import response locally
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs text-muted-foreground">Latest imported response summary</p>
                <p className="mt-2 text-sm text-foreground">
                  {llmState.latestResponseImportAt
                    ? `${latestRun?.responses.length ?? 0} LLM agent responses imported.`
                    : "No real local-command LLM response has been imported yet."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant={latestRun?.advisoryPassed ? "success" : "warning"}>
                    {latestRun?.advisoryPassed ? "advisory passed" : "pending valid import"}
                  </Badge>
                  <Badge variant={llmState.unsafeResponseRejections ? "danger" : "success"}>
                    unsafe rejections {llmState.unsafeResponseRejections}
                  </Badge>
                </div>
              </div>

              {importResult ? (
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Response Import Validation</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Imported JSON must be advisory-only and include all required LLM agents.
                      </p>
                    </div>
                    <Badge variant={importResult.valid ? "success" : "danger"}>
                      {importResult.valid ? "valid" : "invalid"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-md border border-border bg-card/45 p-2 text-xs">
                      responses {importResult.responses.length}
                    </div>
                    <div className="rounded-md border border-border bg-card/45 p-2 text-xs">
                      unsafe rejections {importResult.unsafeResponseRejections}
                    </div>
                  </div>
                  {importResult.errors.length ? (
                    <div className="mt-3 space-y-1">
                      {importResult.errors.map((error) => (
                        <div key={error} className="rounded-md border border-rose-400/20 bg-rose-400/5 px-2 py-1 text-xs text-rose-100">
                          {error}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {importResult.warnings.length ? (
                    <div className="mt-3 space-y-1">
                      {importResult.warnings.map((warning) => (
                        <div key={warning} className="rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
                          {warning}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {contextJson ? (
            <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-background/75 p-4 font-mono text-xs leading-5 text-slate-200">
              {contextJson}
            </pre>
          ) : null}
        </CardContent>
      </Card>
      </TechnicalDetails>

      <TechnicalDetails
        title="View required agent roster"
        description="Open for the complete list of required LLM reviewers and mock/local command controls."
      >
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
      </TechnicalDetails>

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

      <TechnicalDetails
        title="View restricted context packet"
        description="Open for the full research context JSON sent to a secure provider boundary."
      >
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
      </TechnicalDetails>
    </div>
  );
}
