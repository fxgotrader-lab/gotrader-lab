import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, ExternalLink, ShieldAlert, Trash2 } from "lucide-react";

import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  AGENT_AUDIT_UPDATED_EVENT,
  auditAgentDebateSession,
  auditAutoResearchDecision,
  auditCioSynthesis,
  auditReadinessGate,
  auditSelfImprovementDecision,
  buildAgentAuditTraces,
  clearAgentAuditHistory,
  loadAgentAuditState,
  saveAgentAuditTraces,
  summarizeAgentAudit
} from "@/lib/agentAudit";
import { latestAgentDebateSession, loadAgentDebateState } from "@/lib/agentDebate";
import type { AgentAuditVerdict, AgentDecisionTrace } from "@/lib/agentAudit";
import { latestAutoResearchCycle, loadAutoResearchState } from "@/lib/autoResearch";
import { latestLLMAdvisoryRun, loadLLMResearchState } from "@/lib/llm";
import { evaluateReadinessGate } from "@/lib/readiness";
import { loadLatestResearchQualityReview } from "@/lib/researchQuality";
import { latestResearchCycleRun } from "@/lib/researchCycle";
import { loadSelfImprovementState } from "@/lib/selfImprovement";
import { labStorage } from "@/lib/storage";
import { safeArray, safeTopN } from "@/lib/utils";
import { loadLatestValidationReport } from "@/lib/validation";
import { loadSimulationRunbookState } from "@/lib/simulationRunbook";

const verdictVariant = (verdict: AgentAuditVerdict) =>
  verdict === "reliable"
    ? "success"
    : verdict === "unsafe_rejected" || verdict === "inconsistent"
      ? "danger"
      : verdict === "weak_evidence"
        ? "warning"
        : "secondary";

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : "none");
const formatDecisionType = (value: string) => value.replace(/_/g, " ");

function createTracesFromCurrentState() {
  const lab = labStorage.load();
  const latestThesis = safeArray(lab.tradeTheses)[0];
  const latestDebate = latestThesis
    ? safeArray(lab.debateSessions).find((debate) => debate.cioThesisId === latestThesis.id)
    : safeArray(lab.debateSessions)[0];
  const selfImprovement = loadSelfImprovementState();
  const latestProposal =
    safeArray(selfImprovement.proposals).find((proposal) => proposal.proposalId === selfImprovement.latestProposalId) ??
    safeArray(selfImprovement.proposals)[0];
  const readiness = evaluateReadinessGate({
    validation: loadLatestValidationReport(),
    quality: loadLatestResearchQualityReview(),
    runbook: loadSimulationRunbookState()
  });
  const latestCycle = latestResearchCycleRun();
  const autoResearchCycle = latestCycle?.autoResearchCycle ?? latestAutoResearchCycle(loadAutoResearchState());
  const agentDebateSession = latestAgentDebateSession(loadAgentDebateState());

  return [
    ...buildAgentAuditTraces({
      thesis: latestThesis,
      debateMessages: latestDebate?.messages,
      llmRun: latestLLMAdvisoryRun(loadLLMResearchState())
    }),
    ...auditCioSynthesis(latestThesis, latestDebate?.messages ?? []),
    ...auditAgentDebateSession(agentDebateSession),
    ...auditAutoResearchDecision(autoResearchCycle),
    ...auditSelfImprovementDecision(latestProposal),
    ...auditReadinessGate(readiness)
  ];
}

export function AgentAuditView() {
  const [state, setState] = useState(() => loadAgentAuditState());
  const [selectedTraceId, setSelectedTraceId] = useState<string>();
  const [verdictFilter, setVerdictFilter] = useState("all");
  const summary = useMemo(() => summarizeAgentAudit(state), [state]);
  const traces = safeArray(state.traces).filter((trace) => verdictFilter === "all" || trace.auditVerdict === verdictFilter);
  const selectedTrace =
    traces.find((trace) => trace.traceId === selectedTraceId) ??
    traces[0] ??
    safeArray(state.traces)[0];

  useEffect(() => {
    const refresh = () => setState(loadAgentAuditState());
    window.addEventListener(AGENT_AUDIT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(AGENT_AUDIT_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const runAudit = () => {
    const nextTraces = createTracesFromCurrentState();
    setState(saveAgentAuditTraces(nextTraces));
    setSelectedTraceId(nextTraces[0]?.traceId);
  };

  const clearAudit = () => {
    setState(clearAgentAuditHistory());
    setSelectedTraceId(undefined);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Explainability</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Agent Decision Audit</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Inspect why agents, CIO synthesis, Auto Research, LLM advisory, self-improvement, and readiness gates reached
            their latest conclusions.
          </p>
        </div>
        <Badge variant="warning">Research audit only</Badge>
      </div>

      <SafetyLockBanner message="Agent audit is research/explainability only. It cannot execute trades, approve trades, or override readiness gates." />

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Latest audit" value={formatDate(summary.latestAuditAt)} />
        <SummaryCard label="Strongest agent" value={summary.strongestAgent?.agentName ?? "none"} />
        <SummaryCard label="Weakest agent" value={summary.weakestAgent?.agentName ?? "none"} />
        <SummaryCard label="Needs review" value={String(summary.needsReviewCount)} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              Audit Controls
            </CardTitle>
            <CardDescription>Creates compact traces from the latest local research state and keeps only the latest 20.</CardDescription>
          </div>
          <Badge variant={summary.unsafeRejectedCount > 0 ? "danger" : "secondary"}>
            {summary.unsafeRejectedCount} unsafe rejected
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button onClick={runAudit}>Run Agent Audit</Button>
            <Button variant="destructive" onClick={clearAudit}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Clear Agent Audit History
            </Button>
          </div>
          <div className="w-full md:w-56">
            <Select
              value={verdictFilter}
              onChange={(event) => setVerdictFilter(event.target.value)}
              options={[
                { label: "All verdicts", value: "all" },
                { label: "Reliable", value: "reliable" },
                { label: "Needs review", value: "needs_review" },
                { label: "Weak evidence", value: "weak_evidence" },
                { label: "Inconsistent", value: "inconsistent" },
                { label: "Unsafe rejected", value: "unsafe_rejected" }
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Latest Decision Traces</CardTitle>
            <CardDescription>Score and verdict by agent or research subsystem.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {traces.map((trace) => (
              <button
                key={trace.traceId}
                type="button"
                onClick={() => setSelectedTraceId(trace.traceId)}
                className={`w-full rounded-lg border p-3 text-left transition hover:bg-secondary/50 ${
                  selectedTrace?.traceId === trace.traceId ? "border-primary/50 bg-primary/10" : "border-border bg-background/45"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{trace.agentName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDecisionType(trace.decisionType)}</p>
                  </div>
                  <Badge variant={verdictVariant(trace.auditVerdict)}>{trace.auditVerdict.replace(/_/g, " ")}</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDate(trace.timestamp)}</span>
                  <span className="font-mono">{trace.auditScore.toFixed(1)}</span>
                </div>
              </button>
            ))}
            {!traces.length ? (
              <div className="rounded-lg border border-border bg-background/45 p-4 text-sm text-muted-foreground">
                No audit traces yet. Run the dashboard AI Research Cycle or click Run Agent Audit.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <DecisionPathViewer trace={selectedTrace} />
      </div>

      <TechnicalDetails
        title="Needs Review and Unsafe Queues"
        description="Open for weak evidence, inconsistent decisions, and rejected unsafe response summaries."
      >
        <div className="grid gap-5 xl:grid-cols-2">
          <TraceQueue
            title="Needs Review Queue"
            traces={safeArray(state.traces).filter((trace) => ["needs_review", "weak_evidence", "inconsistent"].includes(trace.auditVerdict))}
          />
          <TraceQueue
            title="Unsafe Response Rejected Queue"
            traces={safeArray(state.traces).filter((trace) => trace.auditVerdict === "unsafe_rejected")}
          />
        </div>
      </TechnicalDetails>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <div className="mt-1 truncate font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function DecisionPathViewer({ trace }: { trace?: AgentDecisionTrace }) {
  if (!trace) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Select a trace to inspect the decision path.</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{trace.agentName}</CardTitle>
          <CardDescription>{trace.traceId}</CardDescription>
        </div>
        <Badge variant={verdictVariant(trace.auditVerdict)}>{trace.auditVerdict.replace(/_/g, " ")}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryCard label="Audit score" value={trace.auditScore.toFixed(1)} />
          <SummaryCard label="Decision type" value={formatDecisionType(trace.decisionType)} />
          <SummaryCard label="Final bias" value={trace.finalBias ?? "none"} />
        </div>
        <div className="rounded-lg border border-border bg-background/45 p-3 text-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Final recommendation</p>
          <p className="mt-2 text-foreground">{trace.finalRecommendation}</p>
          {trace.relatedPage ? (
            <Link to={trace.relatedPage} className="mt-3 inline-flex items-center gap-2 text-xs text-primary hover:underline">
              Open related workflow
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <EvidenceList title="Input Facts" items={trace.inputFacts} />
          <EvidenceList title="Evidence Used" items={trace.evidenceUsed} />
          <EvidenceList title="Missing Evidence" items={trace.evidenceMissing} tone="warning" />
          <EvidenceList title="Evidence Ignored" items={trace.evidenceIgnored} tone="warning" />
          <EvidenceList title="Thresholds Used" items={trace.thresholdsUsed} />
          <EvidenceList title="Decision Rules Applied" items={trace.decisionRulesApplied} />
          <EvidenceList title="Safety Authority Check" items={trace.safetyConstraintsChecked} tone="success" />
          <EvidenceList title="Possible Failure Modes" items={trace.possibleFailureModes} tone="warning" />
        </div>
      </CardContent>
    </Card>
  );
}

function EvidenceList({
  title,
  items,
  tone = "default"
}: {
  title: string;
  items: string[];
  tone?: "default" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-300/25 bg-amber-300/10"
      : tone === "success"
        ? "border-emerald-300/25 bg-emerald-300/10"
        : "border-border bg-background/45";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      <ul className="space-y-1 text-sm text-foreground">
        {safeTopN(items, 8).map((item) => <li key={item}>{item}</li>)}
        {!items.length ? <li className="text-muted-foreground">None recorded.</li> : null}
      </ul>
    </div>
  );
}

function TraceQueue({ title, traces }: { title: string; traces: AgentDecisionTrace[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-amber-200" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {safeTopN(traces, 8).map((trace) => (
          <div key={trace.traceId} className="rounded-lg border border-border bg-background/45 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{trace.agentName}</span>
              <Badge variant={verdictVariant(trace.auditVerdict)}>{trace.auditVerdict.replace(/_/g, " ")}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{safeArray(trace.evidenceMissing)[0] ?? trace.finalRecommendation}</p>
          </div>
        ))}
        {!traces.length ? <p className="text-sm text-muted-foreground">No traces in this queue.</p> : null}
      </CardContent>
    </Card>
  );
}
