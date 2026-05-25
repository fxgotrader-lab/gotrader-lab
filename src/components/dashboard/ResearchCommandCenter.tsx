import { ArrowRight, ClipboardCheck, ExternalLink, MessageSquareText, Route, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  latestAutoResearchCycle,
  loadAutoResearchState,
} from "@/lib/autoResearch";
import { getCommunicationSummary, inAppCommunicationSpec } from "@/lib/communications/communicationSpec";
import {
  getLLMReadinessImpact,
  latestLLMAdvisoryRun,
  loadLLMResearchState,
  providerStatusForMode,
} from "@/lib/llm";
import { evaluateReadinessGate, loadManualApprovalRecord } from "@/lib/readiness";
import { loadLatestResearchQualityReview } from "@/lib/researchQuality";
import { loadSelfImprovementState } from "@/lib/selfImprovement";
import {
  countCompletedRunbookItems,
  loadSimulationRunbookState,
  simulationRunbookChecklist,
} from "@/lib/simulationRunbook";
import type { LabState } from "@/lib/types";
import { loadLatestValidationReport } from "@/lib/validation";

import { AutomationTimeline, type AutomationTimelineEvent } from "./AutomationTimeline";
import { AutoResearchStatusCard } from "./AutoResearchStatusCard";
import { formatDateTime, formatNumber } from "./dashboardFormatters";
import { LLMAgentStatusCard } from "./LLMAgentStatusCard";
import { ReadinessSummaryCard } from "./ReadinessSummaryCard";
import { SafetyLockCard } from "./SafetyLockCard";
import { SelfImprovementStatusCard } from "./SelfImprovementStatusCard";
import { SimulationBridgeStatusCard } from "./SimulationBridgeStatusCard";
import { SystemStatusGrid } from "./SystemStatusGrid";
import { ValidationStatusCard } from "./ValidationStatusCard";

type ResearchCommandCenterProps = {
  state: LabState;
};

export function ResearchCommandCenter({ state }: ResearchCommandCenterProps) {
  const llmState = loadLLMResearchState();
  const latestLLMRun = latestLLMAdvisoryRun(llmState);
  const providerStatus = providerStatusForMode(llmState.providerMode);
  const autoResearchState = loadAutoResearchState();
  const latestAutoResearch = latestAutoResearchCycle(autoResearchState);
  const validationReport = loadLatestValidationReport();
  const researchQuality = loadLatestResearchQualityReview();
  const selfImprovement = loadSelfImprovementState();
  const latestProposal =
    selfImprovement.proposals.find((proposal) => proposal.proposalId === selfImprovement.latestProposalId) ??
    selfImprovement.proposals[0];
  const runbook = loadSimulationRunbookState();
  const completedRunbookItems = countCompletedRunbookItems(runbook);
  const manualApproval = loadManualApprovalRecord();
  const readiness = evaluateReadinessGate({
    validation: validationReport,
    quality: researchQuality,
    runbook,
  });
  const latestHandoff = state.handoffExports[0];
  const communicationSummary = getCommunicationSummary(inAppCommunicationSpec.sampleMessages);

  const recommendedAction = getRecommendedAction({
    completedRunbookItems,
    latestAutoResearch: Boolean(latestAutoResearch),
    latestLLMRunPassed: Boolean(latestLLMRun?.advisoryPassed),
    latestProposalStatus: latestProposal?.status,
    providerConfigured: providerStatus.configured || Boolean(latestLLMRun?.providerConfigured),
    qualityRun: Boolean(researchQuality),
    readinessFailedCount: readiness.failedRequirements.length,
    runbookComplete: completedRunbookItems === simulationRunbookChecklist.length,
    validationRun: Boolean(validationReport),
  });

  const timelineEvents = buildTimelineEvents({
    autoResearchTimestamp: latestAutoResearch?.timestamp,
    autoResearchStatus: latestAutoResearch?.status,
    completedRunbookItems,
    llmRunTimestamp: latestLLMRun?.timestamp,
    llmRunPassed: Boolean(latestLLMRun?.advisoryPassed),
    proposalTimestamp: latestProposal?.timestamp,
    proposalStatus: latestProposal?.status,
    qualityTimestamp: researchQuality?.generatedAt,
    readiness,
    runbookTimestamp: runbook.verifiedAt,
    totalRunbookItems: simulationRunbookChecklist.length,
    validationTimestamp: validationReport?.generatedAt,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-white/10 bg-slate-950/80 p-5 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">AI research command center</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-50">GoTrader AI Lab Dashboard</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Monitor LLM advisory review, autonomous configuration search, validation, self-improvement proposals,
            readiness gating, and the simulation-only go-trader bridge from one cockpit.
          </p>
        </div>
        <Badge variant="danger" className="w-fit text-sm">
          Broker execution disabled
        </Badge>
      </div>

      <SystemStatusGrid />

      <Card className="border-cyan-400/20 bg-cyan-950/20">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base text-cyan-100">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Recommended Next Action
            </CardTitle>
            <p className="mt-1 text-xs text-cyan-100/70">{recommendedAction.reason}</p>
          </div>
          <Badge variant="warning">Human approval center</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xl font-semibold text-cyan-50">{recommendedAction.title}</div>
            <p className="mt-1 max-w-3xl text-sm text-cyan-100/75">{recommendedAction.detail}</p>
          </div>
          <Link to={recommendedAction.href}>
            <Button className="w-full md:w-auto">
              Go there
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <SafetyLockCard />

      <div className="grid gap-5 xl:grid-cols-2">
        <AICommunicationsCard summary={communicationSummary} />
        <LLMAgentStatusCard latestRun={latestLLMRun} providerStatus={providerStatus} state={llmState} />
        <AutoResearchStatusCard cycle={latestAutoResearch} />
        <ValidationStatusCard report={validationReport} qualityReview={researchQuality} />
        <ResearchQualityStatusCard quality={researchQuality} />
        <SelfImprovementStatusCard proposal={latestProposal} />
        <ReadinessSummaryCard manualApproval={manualApproval} readiness={readiness} />
        <SimulationBridgeStatusCard
          completedRunbookItems={completedRunbookItems}
          handoff={latestHandoff}
          runbook={runbook}
          totalRunbookItems={simulationRunbookChecklist.length}
        />
        <RunSequenceGuide />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <AutomationTimeline events={timelineEvents} />
        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-base text-slate-100">Readiness Impact Summary</CardTitle>
            <p className="text-xs text-slate-500">Why the system can monitor research but cannot execute.</p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <p>{getLLMReadinessImpact(llmState)}</p>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Gate blockers</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">{readiness.failedRequirements.length}</div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Latest handoff</div>
              <div className="mt-1 break-all text-slate-200">{latestHandoff?.filename ?? "No handoff exported yet"}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AICommunicationsCard({
  summary,
}: {
  summary: ReturnType<typeof getCommunicationSummary>;
}) {
  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <MessageSquareText className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            AI Communications
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Primary in-app channel for agent messages and approvals.</p>
        </div>
        <Badge variant={summary.actionRequiredCount > 0 ? "warning" : "secondary"}>
          {summary.actionRequiredCount} action required
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Unread messages" value={String(summary.unreadMessages)} />
          <StatusLine label="Action required" value={String(summary.actionRequiredCount)} />
          <StatusLine label="Latest agent message" value={summary.latestAgentMessage?.title ?? "No messages"} />
          <StatusLine label="Latest critical warning" value={summary.latestCriticalWarning?.title ?? "No critical warning"} />
        </div>
        <div className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs text-cyan-100">
          App-first communication. Discord, Telegram, and Hermes are optional notification routes only.
        </div>
        <Link to="/communications">
          <Button variant="secondary" className="w-full justify-between">
            Open communications
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function ResearchQualityStatusCard({ quality }: { quality: ReturnType<typeof loadLatestResearchQualityReview> }) {
  const topWeakness = quality?.topWeaknesses[0];
  const topStrength = quality?.topStrengths[0];

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <ClipboardCheck className="h-4 w-4 text-lime-300" aria-hidden="true" />
            Research Quality Status
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Weaknesses, strengths, and readiness grade from validation.</p>
        </div>
        <Badge variant={quality?.readinessGrade === "Paper-Demo Candidate" ? "success" : quality ? "warning" : "secondary"}>
          {quality?.readinessGrade ?? "Not run"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Latest review" value={formatDateTime(quality?.generatedAt)} />
          <StatusLine label="Readiness score" value={formatNumber(quality?.readinessScore, 1)} />
          <StatusLine label="Top weakness" value={topWeakness?.title ?? "Run review first"} />
          <StatusLine label="Top strength" value={topStrength?.title ?? "Run review first"} />
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
          {quality?.recommendedNextStep ?? "Run validation first, then run the research quality review."}
        </div>
        <Link to="/research-quality">
          <Button variant="secondary" className="w-full justify-between">
            Open research quality
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function RunSequenceGuide() {
  const sequence = [
    ["Start local LLM bridge", "/llm-agents"],
    ["Run GPT Advisory Review", "/llm-agents"],
    ["Run Auto Research Cycle", "/auto-research"],
    ["Review Calibration Proposal", "/self-improvement"],
    ["Run Validation Suite", "/validation"],
    ["Run Research Quality Review", "/research-quality"],
    ["Check Readiness Gate", "/readiness-gate"],
    ["Verify Simulation Bridge", "/simulation-runbook"],
  ];

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-slate-100">
          <Route className="h-4 w-4 text-cyan-300" aria-hidden="true" />
          Run Sequence Guide
        </CardTitle>
        <p className="text-xs text-slate-500">Preferred order for the AI-driven research loop.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {sequence.map(([label, href], index) => (
          <Link
            key={label}
            to={href}
            className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/5"
          >
            <span>
              <span className="mr-2 font-mono text-xs text-slate-500">{index + 1}.</span>
              {label}
            </span>
            <ExternalLink className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 truncate font-medium text-slate-200">{value}</div>
    </div>
  );
}

function getRecommendedAction({
  completedRunbookItems,
  latestAutoResearch,
  latestLLMRunPassed,
  latestProposalStatus,
  providerConfigured,
  qualityRun,
  readinessFailedCount,
  runbookComplete,
  validationRun,
}: {
  completedRunbookItems: number;
  latestAutoResearch: boolean;
  latestLLMRunPassed: boolean;
  latestProposalStatus?: string;
  providerConfigured: boolean;
  qualityRun: boolean;
  readinessFailedCount: number;
  runbookComplete: boolean;
  validationRun: boolean;
}) {
  if (!providerConfigured) {
    return {
      title: "Configure/start local LLM bridge",
      reason: "Real research mode requires a secure local provider boundary before LLM advisory can pass.",
      detail: "Start the local bridge with the API key in PowerShell, then run GPT Advisory Review.",
      href: "/llm-agents",
    };
  }
  if (!latestLLMRunPassed) {
    return {
      title: "Run LLM advisory review",
      reason: "Paper-Demo Candidate is blocked until the required LLM advisory review passes.",
      detail: "LLM agents can review research context, but they remain advisory-only and cannot execute trades.",
      href: "/llm-agents",
    };
  }
  if (!latestAutoResearch) {
    return {
      title: "Run auto-research cycle",
      reason: "No autonomous research configuration search has been recorded yet.",
      detail: "Let the supervisor compare bounded candidate configurations and create a proposal only if stability improves.",
      href: "/auto-research",
    };
  }
  if (latestProposalStatus === "proposed" || latestProposalStatus === "testing") {
    return {
      title: "Review self-improvement proposal",
      reason: "A calibration proposal is waiting for human review.",
      detail: "Approve only after simulation results improve stability, not just headline profit.",
      href: "/self-improvement",
    };
  }
  if (!validationRun) {
    return {
      title: "Run validation suite",
      reason: "The dashboard needs scenario validation before readiness can improve.",
      detail: "Run conservative, aggressive, session, direction, confidence, and stop-model checks.",
      href: "/validation",
    };
  }
  if (!qualityRun) {
    return {
      title: "Run research-quality review",
      reason: "Validation results need quality analysis before readiness can be trusted.",
      detail: "Review weaknesses, false positives, drawdown clusters, and session consistency.",
      href: "/research-quality",
    };
  }
  if (readinessFailedCount > 0) {
    return {
      title: "Review readiness gate",
      reason: `${readinessFailedCount} blocker${readinessFailedCount === 1 ? "" : "s"} still prevent Paper-Demo Candidate.`,
      detail: "Use the debugger to see the current value, required value, and suggested fix for each blocker.",
      href: "/readiness-gate",
    };
  }
  if (!runbookComplete || completedRunbookItems < simulationRunbookChecklist.length) {
    return {
      title: "Verify simulation bridge",
      reason: "The go-trader bridge must prove broker execution is skipped and trades remain zero.",
      detail: "Complete the simulation runbook after a scheduler one-cycle run.",
      href: "/simulation-runbook",
    };
  }
  return {
    title: "Do not proceed to broker demo",
    reason: "Research monitoring is complete for now, but execution remains disabled.",
    detail: "Keep broker-demo work separate until a future implementation adds explicit risk gates and paper-only controls.",
    href: "/readiness-gate",
  };
}

function buildTimelineEvents({
  autoResearchStatus,
  autoResearchTimestamp,
  completedRunbookItems,
  llmRunPassed,
  llmRunTimestamp,
  proposalStatus,
  proposalTimestamp,
  qualityTimestamp,
  readiness,
  runbookTimestamp,
  totalRunbookItems,
  validationTimestamp,
}: {
  autoResearchStatus?: string;
  autoResearchTimestamp?: string;
  completedRunbookItems: number;
  llmRunPassed: boolean;
  llmRunTimestamp?: string;
  proposalStatus?: string;
  proposalTimestamp?: string;
  qualityTimestamp?: string;
  readiness: ReturnType<typeof evaluateReadinessGate>;
  runbookTimestamp?: string;
  totalRunbookItems: number;
  validationTimestamp?: string;
}): AutomationTimelineEvent[] {
  return [
    {
      label: "LLM advisory run",
      timestamp: llmRunTimestamp,
      status: llmRunPassed ? "complete" : llmRunTimestamp ? "attention" : "missing",
      detail: llmRunPassed ? "Configured LLM advisory review passed." : "LLM advisory review is required before Paper-Demo Candidate.",
      href: "/llm-agents",
    },
    {
      label: "Auto research cycle",
      timestamp: autoResearchTimestamp,
      status: autoResearchTimestamp ? "complete" : "missing",
      detail: autoResearchStatus ? `Latest cycle status: ${autoResearchStatus}.` : "No auto-research cycle recorded yet.",
      href: "/auto-research",
    },
    {
      label: "Validation run",
      timestamp: validationTimestamp,
      status: validationTimestamp ? "complete" : "missing",
      detail: validationTimestamp ? "Scenario validation has been run." : "Run validation to generate scenario evidence.",
      href: "/validation",
    },
    {
      label: "Research quality review",
      timestamp: qualityTimestamp,
      status: qualityTimestamp ? "complete" : "missing",
      detail: qualityTimestamp ? "Research quality review is available." : "Run quality review after validation.",
      href: "/research-quality",
    },
    {
      label: "Self-improvement proposal",
      timestamp: proposalTimestamp,
      status: proposalStatus === "accepted" ? "complete" : proposalTimestamp ? "attention" : "missing",
      detail: proposalStatus ? `Latest proposal status: ${proposalStatus}.` : "No calibration proposal has been created.",
      href: "/self-improvement",
    },
    {
      label: "Readiness gate update",
      timestamp: readiness.evaluatedAt,
      status: readiness.failedRequirements.length === 0 ? "complete" : "attention",
      detail: `${readiness.state}; ${readiness.failedRequirements.length} failed requirement${readiness.failedRequirements.length === 1 ? "" : "s"}.`,
      href: "/readiness-gate",
    },
    {
      label: "Simulation bridge verification",
      timestamp: runbookTimestamp,
      status: completedRunbookItems === totalRunbookItems && runbookTimestamp ? "complete" : "attention",
      detail: `${completedRunbookItems}/${totalRunbookItems} runbook checks complete; broker execution must stay skipped.`,
      href: "/simulation-runbook",
    },
  ];
}
