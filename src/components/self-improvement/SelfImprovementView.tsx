import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, FlaskConical, History, ShieldAlert, SlidersHorizontal, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  applyAcceptedCalibrationToActiveBaseline,
  approveCalibrationProposal,
  canApproveProposal,
  createCalibrationProposal,
  evaluateCalibrationProposal,
  loadSelfImprovementState,
  rejectCalibrationProposal,
  resolveActiveBacktestConfig,
  revertCalibrationProposal,
  SELF_IMPROVEMENT_UPDATED_EVENT,
  upsertCalibrationProposal
} from "@/lib/selfImprovement";
import type { CalibrationProposal, CalibrationProposalMetrics, SelfImprovementState } from "@/lib/selfImprovement";
import { describeBacktestConfig } from "@/lib/backtesting";
import { latestResearchCycleRun } from "@/lib/researchCycle";
import { labStorage } from "@/lib/storage";
import { formatPercent, safeArray } from "@/lib/utils";
import { loadLatestResearchQualityReview } from "@/lib/researchQuality";
import { loadLatestValidationReport } from "@/lib/validation";

const formatNumber = (value: number, digits = 2) => value.toFixed(digits);
const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : "none");
const formatOptionalPercent = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? formatPercent(value) : "n/a";
const problemLabel = (value: string) => value.replace(/_/g, " ");
const intentLabel = (value?: string) =>
  value === "paper_demo_candidate_review"
    ? "Paper-demo candidate review"
    : value === "research_calibration_candidate"
      ? "Research calibration candidate"
      : "Manual calibration proposal";
const statusVariant = (status?: string) =>
  status === "accepted" ? "success" : status === "rejected" || status === "reverted" ? "danger" : status === "testing" ? "warning" : "muted";
const readinessVariant = (status?: string) =>
  status === "green" ? "success" : status === "yellow" ? "warning" : status === "red" ? "danger" : "muted";
const verdictVariant = (verdict?: string) =>
  verdict === "paper_demo_review_candidate" || verdict === "strong_research_candidate"
    ? "success"
    : verdict === "research_candidate"
      ? "warning"
      : verdict === "needs_follow_up"
        ? "warning"
        : verdict === "reject"
          ? "danger"
          : "muted";
const formatToken = (value?: string) => (value ?? "not tested").replace(/_/g, " ");
const deltaClass = (tone: "positive" | "negative" | "neutral") =>
  tone === "positive" ? "text-emerald-200" : tone === "negative" ? "text-red-200" : "text-muted-foreground";
const deltaPrefix = (value: number) => (value > 0 ? "+" : "");

const MetricsGrid = ({ metrics }: { metrics?: CalibrationProposalMetrics }) => {
  if (!metrics) {
    return <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">Not tested yet.</div>;
  }

  const rows = [
    ["Total trades", String(metrics.totalTrades)],
    ["Win rate", formatPercent(metrics.winRate, 1)],
    ["Average R", `${formatNumber(metrics.averageR)}R`],
    ["Max drawdown", `${formatNumber(metrics.maxDrawdown)}R`],
    ["Profit factor", metrics.profitFactor === null ? "n/a" : formatNumber(metrics.profitFactor)],
    ["Skipped signals", String(metrics.skippedSignals)],
    ["False positives", String(metrics.falsePositiveCount)],
    ["Confidence calibration", formatPercent(metrics.confidenceCalibration, 1)],
    ["Readiness score", String(metrics.readinessScore)],
    ["Stability score", String(metrics.stabilityScore)]
  ];

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
        </div>
      ))}
      <div className="rounded-lg border border-border bg-background/45 p-3">
        <p className="text-xs text-muted-foreground">Readiness</p>
        <Badge className="mt-1" variant={readinessVariant(metrics.readinessStatus)}>
          {metrics.readinessStatus}
        </Badge>
      </div>
    </div>
  );
};

const ChangeList = ({ proposal }: { proposal?: CalibrationProposal }) => {
  if (!proposal) {
    return <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">No proposal created yet.</div>;
  }

  const changes = proposal.proposedChanges;
  const rows = [
    ["Confluence threshold", changes.confluenceThreshold],
    ["Confidence threshold", changes.confidenceThreshold],
    ["Session filter", changes.sessionFilter],
    ["Stop model", changes.stopModel],
    ["Target R multiple", changes.targetRMultiple],
    ["Agent weights", changes.agentWeights ? Object.entries(changes.agentWeights).map(([key, value]) => `${key}: ${value}`).join(", ") : undefined],
    ["ICT scoring weights", changes.ictScoringWeights ? Object.entries(changes.ictScoringWeights).map(([key, value]) => `${key}: ${value}`).join(", ") : undefined]
  ].filter(([, value]) => value !== undefined);

  return (
    <div className="space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background/45 p-3 text-sm">
          <span className="shrink-0 text-muted-foreground">{label}</span>
          <span className="min-w-0 max-w-full break-words text-right font-mono text-foreground">{String(value)}</span>
        </div>
      ))}
    </div>
  );
};

type ComparisonDirection = "higher" | "lower" | "neutral";

interface ComparisonRow {
  label: string;
  before?: number | null;
  after?: number | null;
  format: (value?: number | null) => string;
  direction: ComparisonDirection;
  interpretation: string;
}

const countFormat = (value?: number | null) => (typeof value === "number" ? String(Math.round(value)) : "n/a");
const percentFormat = (value?: number | null) => (typeof value === "number" ? formatPercent(value, 1) : "n/a");
const rFormat = (value?: number | null) => (typeof value === "number" ? `${formatNumber(value)}R` : "n/a");
const numberFormat = (value?: number | null) => (typeof value === "number" ? formatNumber(value) : "n/a");

const comparisonTone = (direction: ComparisonDirection, delta: number) => {
  if (Math.abs(delta) < 0.005 || direction === "neutral") {
    return "neutral" as const;
  }
  const improved = direction === "higher" ? delta > 0 : delta < 0;
  return improved ? ("positive" as const) : ("negative" as const);
};

const comparisonChange = (row: ComparisonRow) => {
  if (typeof row.before !== "number" || typeof row.after !== "number") {
    return { label: "not tested", tone: "neutral" as const };
  }
  const delta = row.after - row.before;
  const tone = comparisonTone(row.direction, delta);
  const formatted =
    row.format === percentFormat
      ? `${deltaPrefix(delta)}${formatPercent(delta, 1)}`
      : row.format === rFormat
        ? `${deltaPrefix(delta)}${formatNumber(delta)}R`
        : `${deltaPrefix(delta)}${formatNumber(delta)}`;
  return { label: formatted, tone };
};

const ComparisonTable = ({ before, after }: { before?: CalibrationProposalMetrics; after?: CalibrationProposalMetrics }) => {
  const rows: ComparisonRow[] = [
    {
      label: "Total trades",
      before: before?.totalTrades,
      after: after?.totalTrades,
      format: countFormat,
      direction: "neutral",
      interpretation: "Sample size should stay large enough to trust the test."
    },
    {
      label: "Win rate",
      before: before?.winRate,
      after: after?.winRate,
      format: percentFormat,
      direction: "higher",
      interpretation: "Higher is useful only if drawdown and sample size remain stable."
    },
    {
      label: "Average R",
      before: before?.averageR,
      after: after?.averageR,
      format: rFormat,
      direction: "higher",
      interpretation: "Prefer steady average R over one large simulated winner."
    },
    {
      label: "Max drawdown",
      before: before?.maxDrawdown,
      after: after?.maxDrawdown,
      format: rFormat,
      direction: "lower",
      interpretation: "Lower drawdown is the primary stability improvement."
    },
    {
      label: "Profit factor",
      before: before?.profitFactor,
      after: after?.profitFactor,
      format: numberFormat,
      direction: "higher",
      interpretation: "Higher is better, but not if it comes from too few trades."
    },
    {
      label: "Skipped signals",
      before: before?.skippedSignals,
      after: after?.skippedSignals,
      format: countFormat,
      direction: "lower",
      interpretation: "Lower can help, unless weaker filters increase false positives."
    },
    {
      label: "False positives",
      before: before?.falsePositiveCount,
      after: after?.falsePositiveCount,
      format: countFormat,
      direction: "lower",
      interpretation: "Lower means the proposal is filtering poor theses more cleanly."
    },
    {
      label: "Confidence calibration",
      before: before?.confidenceCalibration,
      after: after?.confidenceCalibration,
      format: percentFormat,
      direction: "higher",
      interpretation: "Higher means confidence is closer to realized mock outcomes."
    },
    {
      label: "Readiness score",
      before: before?.readinessScore,
      after: after?.readinessScore,
      format: countFormat,
      direction: "higher",
      interpretation: "Higher helps only after stability checks pass."
    },
    {
      label: "Stability score",
      before: before?.stabilityScore,
      after: after?.stabilityScore,
      format: countFormat,
      direction: "higher",
      interpretation: "This is the key promotion score for self-improvement."
    }
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[900px] table-fixed border-separate border-spacing-0 text-left text-sm">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[43%]" />
        </colgroup>
        <thead className="bg-muted/55 text-xs uppercase text-muted-foreground">
          <tr>
            {["Metric", "Before", "After", "Change", "Interpretation"].map((header) => (
              <th
                key={header}
                className={
                  header === "Metric"
                    ? "px-3 py-2 text-left font-medium"
                    : header === "Interpretation"
                      ? "border-l border-border/70 px-3 py-2 text-left font-medium"
                      : "border-l border-border/70 px-3 py-2 text-right font-medium tabular-nums"
                }
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const change = comparisonChange(row);
            return (
              <tr key={row.label} className="border-t border-border bg-background/35 align-top">
                <td className="px-3 py-3 font-medium text-foreground">{row.label}</td>
                <td className="whitespace-nowrap border-l border-border/70 px-3 py-3 text-right font-mono tabular-nums text-slate-200">
                  {row.format(row.before)}
                </td>
                <td className="whitespace-nowrap border-l border-border/70 px-3 py-3 text-right font-mono tabular-nums text-slate-200">
                  {row.format(row.after)}
                </td>
                <td className={`whitespace-nowrap border-l border-border/70 px-3 py-3 text-right font-mono tabular-nums ${deltaClass(change.tone)}`}>
                  {change.label}
                </td>
                <td className="border-l border-border/70 px-3 py-3 text-muted-foreground">
                  <span className="block max-w-full whitespace-normal break-words leading-5">{row.interpretation}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export function SelfImprovementView() {
  const [state, setState] = useState<SelfImprovementState>(() => loadSelfImprovementState());
  const [searchParams, setSearchParams] = useSearchParams();
  const [reviewerName, setReviewerName] = useState("local user");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [proposalFilter, setProposalFilter] = useState("");
  const latestValidation = loadLatestValidationReport();
  const latestQuality = loadLatestResearchQualityReview();
  const latestCycleRun = latestResearchCycleRun();
  const queryProposalId = searchParams.get("proposalId") ?? undefined;
  const generatedProposalFromCycle =
    latestCycleRun?.latestGeneratedProposal ?? latestCycleRun?.autoResearchCycle?.createdProposal;
  const generatedProposalId = latestCycleRun?.createdProposalId ?? generatedProposalFromCycle?.proposalId;
  const generatedProposalStored = Boolean(
    generatedProposalId && safeArray(state.proposals).some((proposal) => proposal.proposalId === generatedProposalId)
  );
  const importableCycleProposal = generatedProposalFromCycle && !generatedProposalStored
    ? generatedProposalFromCycle
    : undefined;
  const baselineResolution = useMemo(
    () => resolveActiveBacktestConfig(),
    [state.latestProposalId, state.lastAcceptedProposalId, state.activeResearchCalibration?.approvedAt]
  );
  const baselineConfig = baselineResolution.config;
  const latestAdvisory = labStorage.load().advisoryResponses?.[0];
  const storedQueryProposal = queryProposalId
    ? safeArray(state.proposals).find((proposal) => proposal.proposalId === queryProposalId)
    : undefined;
  const generatedQueryProposal =
    queryProposalId && generatedProposalFromCycle?.proposalId === queryProposalId
      ? generatedProposalFromCycle
      : undefined;
  const latestProposal =
    storedQueryProposal ??
    generatedQueryProposal ??
    safeArray(state.proposals).find((proposal) => proposal.proposalId === state.latestProposalId) ??
    safeArray(state.proposals)[0] ??
    generatedProposalFromCycle;
  const latestProposalPersisted = Boolean(
    latestProposal && safeArray(state.proposals).some((proposal) => proposal.proposalId === latestProposal.proposalId)
  );
  const filteredProposals = safeArray(state.proposals).filter((proposal) => {
    const query = proposalFilter.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return [
      proposal.proposalId,
      proposal.status,
      proposal.proposalIntent,
      proposal.targetProblem,
      proposal.reason
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
  });
  const effectiveProposalIntent =
    latestProposal?.proposalIntent ??
    (latestProposal?.sourceCandidateId || latestProposal?.reason.includes("Auto Research")
      ? "research_calibration_candidate"
      : undefined);
  const isResearchCalibration = effectiveProposalIntent === "research_calibration_candidate";
  const approvalCheck = latestProposalPersisted
    ? canApproveProposal(latestProposal)
    : {
        canApprove: false,
        reason: latestProposal ? "Import proposal from latest research cycle first." : "No proposal selected.",
        reasons: [latestProposal ? "Import proposal from latest research cycle first." : "No proposal selected."]
      };
  const canAccept = approvalCheck.canApprove;
  const acceptedButActiveStorageMissing = Boolean(
    latestProposal?.status === "accepted" &&
      (!baselineResolution.activeCalibrationStorageFound ||
        baselineResolution.activeCalibrationId !== latestProposal.proposalId)
  );
  const rejectDisabledReason = !latestProposal
    ? "No proposal selected."
    : !latestProposalPersisted
      ? "Import proposal from latest research cycle first."
    : latestProposal.status === "accepted"
      ? "Proposal already accepted."
      : latestProposal.status === "rejected"
        ? "Proposal already rejected."
        : latestProposal.status === "reverted"
          ? "Proposal was reverted."
          : "";

  useEffect(() => {
    const refresh = () => setState(loadSelfImprovementState());
    window.addEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const createProposal = () => {
    const proposal = createCalibrationProposal(latestAdvisory?.advisoryAgent === "Hermes" ? "hermes" : "openclaw");
    setState(upsertCalibrationProposal(proposal, "created", "Created calibration proposal from latest validation weakness data."));
    setActionMessage("");
  };

  const importLatestCycleProposal = () => {
    if (!importableCycleProposal) {
      setActionMessage(
        generatedProposalId
          ? "Latest research cycle has a proposal ID but no recoverable proposal snapshot. Rerun the AI Research Cycle to regenerate it."
          : "No latest research-cycle proposal is available to import."
      );
      return;
    }
    const nextState = upsertCalibrationProposal(
      importableCycleProposal,
      "created",
      "Imported proposal from latest AI Research Cycle summary."
    );
    setState(nextState);
    setSearchParams({ proposalId: importableCycleProposal.proposalId });
    setActionMessage(`Imported proposal ${importableCycleProposal.proposalId} from the latest research cycle.`);
  };

  const testProposal = () => {
    if (!latestProposal) {
      return;
    }
    if (!latestProposalPersisted) {
      setActionMessage("Import proposal from latest research cycle before testing it.");
      return;
    }
    const tested = evaluateCalibrationProposal(latestProposal);
    setState(upsertCalibrationProposal(tested, "tested", "Ran deterministic mock-data validation against proposed settings."));
    setActionMessage("");
  };

  const acceptProposal = () => {
    if (!latestProposal || !approvalCheck.canApprove) {
      setActionMessage(approvalCheck.reason ?? "Proposal cannot be approved yet.");
      return;
    }
    const nextState = approveCalibrationProposal(latestProposal.proposalId, reviewerName, approvalNotes);
    setState(nextState);
    const threshold = nextState.activeResearchCalibration?.activeConfigAfter.minimumConfluenceThreshold;
    setActionMessage(
      `Active calibration stored. Next AI Research Cycle will use threshold ${
        typeof threshold === "number" ? `${Math.round(threshold * 100)}%` : "from the approved baseline"
      }.`
    );
    setApprovalNotes("");
  };

  const applyAcceptedToActiveBaseline = () => {
    if (!latestProposal || latestProposal.status !== "accepted") {
      setActionMessage("Only accepted proposals can be applied to the active baseline.");
      return;
    }
    const nextState = applyAcceptedCalibrationToActiveBaseline(latestProposal.proposalId, reviewerName, approvalNotes);
    setState(nextState);
    const threshold = nextState.activeResearchCalibration?.activeConfigAfter.minimumConfluenceThreshold;
    setActionMessage(
      `Active calibration stored. Next AI Research Cycle will use threshold ${
        typeof threshold === "number" ? `${Math.round(threshold * 100)}%` : "from the approved baseline"
      }.`
    );
    setApprovalNotes("");
  };

  const rejectProposal = () => {
    if (!latestProposal || rejectDisabledReason) {
      setActionMessage(rejectDisabledReason || "Proposal cannot be rejected.");
      return;
    }
    setState(rejectCalibrationProposal(latestProposal.proposalId, reviewerName, approvalNotes));
    setActionMessage("Research calibration rejected. No settings changed.");
    setApprovalNotes("");
  };

  const revertProposal = () => {
    if (!latestProposal) {
      return;
    }
    const approved = window.confirm("Revert this accepted simulation calibration back to its saved baseline?");
    if (approved) {
      setState(revertCalibrationProposal(latestProposal.proposalId, reviewerName, approvalNotes));
      setActionMessage("Calibration reverted to the saved simulation baseline.");
      setApprovalNotes("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Calibration loop</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Self-Improvement</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Accept OpenClaw/Hermes-style advisory calibration proposals, test them in simulation, and promote only after
            they improve stability with explicit user approval.
          </p>
        </div>
        <Badge variant="warning">Simulation research only</Badge>
      </div>

      <SafetyLockBanner message="Simulation self-improvement only. No broker execution, readiness override, paper/demo enablement, or real trades." />

      {actionMessage ? (
        <Card className="border-emerald-300/25 bg-emerald-300/10">
          <CardContent className="p-4 text-sm font-medium text-emerald-100">{actionMessage}</CardContent>
        </Card>
      ) : null}

      {generatedProposalId ? (
        <Card className={generatedProposalStored ? "border-emerald-300/25 bg-emerald-300/10" : "border-amber-300/25 bg-amber-300/10"}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Latest Generated Proposal</CardTitle>
                <CardDescription>
                  Latest AI Research Cycle proposal snapshot. It must be stored here before approval or rejection.
                </CardDescription>
              </div>
              <Badge variant={generatedProposalStored ? "success" : "warning"}>
                {generatedProposalStored ? "stored in self-improvement" : "import available"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <p className="font-mono text-xs text-foreground break-all">{generatedProposalId}</p>
              <p className="mt-1 text-muted-foreground">
                {generatedProposalFromCycle
                  ? generatedProposalFromCycle.reason
                  : "The latest research cycle reported a proposal ID, but this older summary does not contain a recoverable proposal snapshot."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/self-improvement?proposalId=${encodeURIComponent(generatedProposalId)}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium shadow-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out hover:bg-secondary/60 hover:shadow-sm active:scale-[0.98] active:bg-secondary/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Open proposal
              </Link>
              {!generatedProposalStored ? (
                <Button onClick={importLatestCycleProposal} disabled={!importableCycleProposal}>
                  Import proposal from latest research cycle
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Current Proposal</CardTitle>
          <CardDescription>
            Auto Research proposals remain proposal-ready only until the user tests and approves them.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
          <div className={`rounded-lg border bg-background/45 p-3 ${
            queryProposalId && latestProposal?.proposalId === queryProposalId ? "border-cyan-300/40" : "border-border"
          }`}>
            <p className="text-xs text-muted-foreground">Proposal ID</p>
            <p className="mt-1 break-all font-mono text-xs text-foreground">{latestProposal?.proposalId ?? "none"}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-xs text-muted-foreground">Intent</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={effectiveProposalIntent === "paper_demo_candidate_review" ? "warning" : "secondary"}>
                {intentLabel(effectiveProposalIntent)}
              </Badge>
              <Badge variant={statusVariant(latestProposal?.status)}>{latestProposal?.status ?? "none"}</Badge>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-xs text-muted-foreground">Approval posture</p>
            <p className="mt-1 text-sm text-foreground">
              {latestProposal
                ? effectiveProposalIntent === "research_calibration_candidate"
                  ? "Research calibration candidate only. It is not approved and does not mark Paper-Demo Candidate readiness."
                  : effectiveProposalIntent === "paper_demo_candidate_review"
                    ? "Paper-demo candidate review only. It still cannot enable demo execution or bypass readiness."
                    : "Manual proposal. It still requires simulation testing and explicit approval."
                : "No proposal has been created yet."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/10">
        <CardContent className="grid gap-3 p-4 text-sm text-primary md:grid-cols-3">
          <div>
            <div className="text-xs uppercase opacity-70">Active calibration storage found</div>
            <div className="mt-1 font-mono">{baselineResolution.activeCalibrationStorageFound ? "yes" : "no"}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Config merge</div>
            <div className="mt-1 font-mono">{baselineResolution.mergeStatusLabel}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Resolved threshold</div>
            <div className="mt-1 font-mono">{(baselineResolution.finalBacktestConfluenceThreshold * 100).toFixed(0)}%</div>
          </div>
        </CardContent>
      </Card>

      <TechnicalDetails
        title="View baseline and detected weaknesses"
        description="Open for active local simulation settings and the evidence used to generate proposals."
      >
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Current Baseline</CardTitle>
            </div>
            <CardDescription>Active local simulation settings before any proposal is approved.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border bg-background/45 p-3 font-mono text-sm text-slate-200">
              {describeBacktestConfig(baselineConfig)}
            </div>
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-xs text-emerald-100">
              Config merge: {baselineResolution.mergeStatusLabel}. Final confluence threshold{" "}
              {(baselineResolution.finalBacktestConfluenceThreshold * 100).toFixed(0)}%.
              {baselineResolution.activeCalibrationId ? ` Applied to baseline: ${baselineResolution.activeCalibrationId}.` : ""}
              <span className="block pt-1">
                Active calibration storage found: {baselineResolution.activeCalibrationStorageFound ? "yes" : "no"}.
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {[
                ["Confluence", formatPercent(baselineConfig.minimumConfluenceThreshold, 0)],
                ["Confidence", formatPercent(baselineConfig.minimumConfidenceThreshold, 0)],
                ["Session", baselineConfig.sessionFilter],
                ["Stop model", baselineConfig.stopModel],
                ["Target", `${baselineConfig.targetRMultiple.toFixed(2)}R`],
                ["Decision interval", `${baselineConfig.decisionInterval} candles`]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-200" aria-hidden="true" />
              <CardTitle>Detected Weaknesses</CardTitle>
            </div>
            <CardDescription>Latest validation and research quality evidence used for proposal generation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-border bg-background/45 p-3">
              <span className="text-muted-foreground">Validation run</span>
              <span className="font-mono text-xs text-foreground">{formatDate(latestValidation?.generatedAt)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-background/45 p-3">
              <span className="text-muted-foreground">Research quality</span>
              <span className="font-mono text-xs text-foreground">{formatDate(latestQuality?.generatedAt)}</span>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3 text-muted-foreground">
              {latestQuality?.topWeaknesses[0]?.detail ??
                latestValidation?.calibration.weakICTRules[0] ??
                "No saved validation data yet. The proposal generator will use deterministic mock candles for a baseline."}
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3 text-muted-foreground">
              Latest advisory recommendation:{" "}
              <span className="font-mono text-foreground">{latestAdvisory?.proceedRecommendation ?? "none imported"}</span>
            </div>
          </CardContent>
        </Card>
      </div>
      </TechnicalDetails>

      <TechnicalDetails
        title="View full change history"
        description="Open for the local audit trail for calibration proposals and decisions."
      >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle>Proposed Calibration</CardTitle>
              </div>
              <CardDescription>Small, approval-gated changes that can only affect simulation calibration.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={createProposal}>Create OpenClaw Proposal</Button>
              <Button variant="secondary" onClick={testProposal} disabled={!latestProposal}>
                Run Simulation Test
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-background/45 p-3">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant={statusVariant(latestProposal?.status)}>{latestProposal?.status ?? "none"}</Badge>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Proposal intent</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={effectiveProposalIntent === "paper_demo_candidate_review" ? "warning" : "secondary"}>
                  {intentLabel(effectiveProposalIntent)}
                </Badge>
                {isResearchCalibration ? (
                  <span className="text-xs text-muted-foreground">Proposal-ready, not approved, and not Paper-Demo Candidate.</span>
                ) : null}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Target problem</p>
              <p className="mt-1 text-sm text-foreground">{latestProposal ? problemLabel(latestProposal.targetProblem) : "none"}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Reason</p>
              <p className="mt-1 text-sm text-foreground">{latestProposal?.reason ?? "Create a proposal to begin."}</p>
            </div>
            {latestProposal?.targetProblem === "trade_generation_blocked" ? (
              <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-emerald-100/70">Trade-generation recovery</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  <div className="rounded-md border border-emerald-200/20 bg-emerald-200/5 p-2">
                    <p className="text-xs text-emerald-100/70">Before recovery</p>
                    <p className="mt-1 font-mono text-lg text-emerald-50">{latestProposal.tradesBeforeRecovery ?? 0} trades</p>
                  </div>
                  <div className="rounded-md border border-emerald-200/20 bg-emerald-200/5 p-2">
                    <p className="text-xs text-emerald-100/70">After recovery</p>
                    <p className="mt-1 font-mono text-lg text-emerald-50">{latestProposal.tradesAfterRecovery ?? 0} trades</p>
                  </div>
                  <div className="rounded-md border border-emerald-200/20 bg-emerald-200/5 p-2">
                    <p className="text-xs text-emerald-100/70">Observed ICT</p>
                    <p className="mt-1 font-mono text-lg text-emerald-50">{formatOptionalPercent(latestProposal.observedICTConfluence)}</p>
                  </div>
                  <div className="rounded-md border border-emerald-200/20 bg-emerald-200/5 p-2">
                    <p className="text-xs text-emerald-100/70">Active threshold</p>
                    <p className="mt-1 font-mono text-lg text-emerald-50">{formatOptionalPercent(latestProposal.activeConfluenceThreshold)}</p>
                  </div>
                  <div className="rounded-md border border-emerald-200/20 bg-emerald-200/5 p-2">
                    <p className="text-xs text-emerald-100/70">Recovery threshold</p>
                    <p className="mt-1 font-mono text-lg text-emerald-50">{formatOptionalPercent(latestProposal.recoveryConfluenceThreshold)}</p>
                  </div>
                  <div className="rounded-md border border-emerald-200/20 bg-emerald-200/5 p-2">
                    <p className="text-xs text-emerald-100/70">Proposed threshold</p>
                    <p className="mt-1 font-mono text-lg text-emerald-50">{formatOptionalPercent(latestProposal.proposedConfluenceThreshold ?? latestProposal.proposedChanges.confluenceThreshold)}</p>
                  </div>
                </div>
                {latestProposal.thresholdCalculation ? (
                  <p className="mt-3 rounded-md border border-emerald-200/20 bg-emerald-200/5 p-2 text-xs text-emerald-100/80">
                    {latestProposal.thresholdCalculation}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1">
                  {(latestProposal.qualityGatesPassed ?? []).map((gate) => (
                    <Badge key={gate} variant="success">{gate}</Badge>
                  ))}
                </div>
                <p className="mt-3 text-xs text-emerald-100/80">
                  This proposal calibrates confluence to the recovery-tested level after simulated evidence. It is not applied until approved.
                </p>
              </div>
            ) : null}
            {isResearchCalibration && latestProposal ? (
              <div className="rounded-lg border border-primary/25 bg-primary/10 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-primary/80">Research calibration evidence</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
                    <p className="text-xs text-muted-foreground">Score before</p>
                    <p className="mt-1 font-mono text-sm">{latestProposal.baselineStabilityScore ?? latestProposal.beforeMetrics.stabilityScore}</p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
                    <p className="text-xs text-muted-foreground">Score after</p>
                    <p className="mt-1 font-mono text-sm">{latestProposal.candidateStabilityScore ?? latestProposal.afterMetrics?.stabilityScore ?? "not tested"}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2 text-xs text-primary">
                  {(latestProposal.improvementSummary ?? []).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                  {(latestProposal.notReadyReasons ?? []).length ? (
                    <p>Why not paper-demo ready: {(latestProposal.notReadyReasons ?? []).join(" ")}</p>
                  ) : null}
                  <p>{latestProposal.nextValidationRequirement ?? "Rerun validation after approval."}</p>
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Expected improvement</p>
              <p className="mt-1 text-sm text-foreground">{latestProposal?.expectedImprovement ?? "n/a"}</p>
            </div>
          </div>
          <ChangeList proposal={latestProposal} />
        </CardContent>
      </Card>
      </TechnicalDetails>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Simulation Test Result</CardTitle>
            <CardDescription>Candidate settings are tested against deterministic mock candle validation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <MetricsGrid metrics={latestProposal?.afterMetrics} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Before/After Comparison</CardTitle>
            <CardDescription>Promotion requires stability improvement, not merely higher profit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ComparisonTable before={latestProposal?.beforeMetrics} after={latestProposal?.afterMetrics} />
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Comparison</span>
                <Badge variant={verdictVariant(latestProposal?.comparisonResult?.promotionVerdict)}>
                  {formatToken(latestProposal?.comparisonResult?.promotionVerdict)}
                </Badge>
              </div>
              <p className="text-muted-foreground">{latestProposal?.comparisonResult?.summary ?? "Run a simulation test to compare."}</p>
            </div>
            {latestProposal?.comparisonResult && (
              <>
                {safeArray(latestProposal.comparisonResult.criticalRegressions).length ? (
                  <div className="rounded-lg border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-50">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">Do not approve yet</p>
                        <p className="mt-1 text-red-100/80">
                          This proposal improved some stability metrics, but critical trade-quality regressions must be resolved first.
                        </p>
                      </div>
                      <Badge variant="danger">blocked</Badge>
                    </div>
                    <ul className="mt-3 space-y-1 text-xs">
                      {safeArray(latestProposal.comparisonResult.criticalRegressions).map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3">
                    <p className="mb-2 font-medium text-emerald-100">Improved metrics</p>
                    <ul className="space-y-1 text-xs text-emerald-50">
                      {safeArray(latestProposal.comparisonResult.improvedMetrics).map((item) => <li key={item}>{item}</li>)}
                      {!safeArray(latestProposal.comparisonResult.improvedMetrics).length && <li>No clear improvement.</li>}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-red-300/25 bg-red-300/10 p-3">
                    <p className="mb-2 font-medium text-red-100">Worsened metrics</p>
                    <ul className="space-y-1 text-xs text-red-50">
                      {safeArray(latestProposal.comparisonResult.worsenedMetrics).map((item) => <li key={item}>{item}</li>)}
                      {!safeArray(latestProposal.comparisonResult.worsenedMetrics).length && <li>No material regression.</li>}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3">
                    <p className="mb-2 font-medium text-amber-100">Sanity checks</p>
                    <ul className="space-y-1 text-xs text-amber-50">
                      {safeArray(latestProposal.comparisonResult.sanityWarnings).map((item) => <li key={item}>{item}</li>)}
                      {!safeArray(latestProposal.comparisonResult.sanityWarnings).length && <li>No suspicious metric pattern found.</li>}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3">
                    <p className="mb-2 font-medium text-cyan-100">Recommended follow-up</p>
                    <p className="text-xs text-cyan-50">
                      {latestProposal.comparisonResult.followUpSearchDirection ??
                        "No follow-up required by the current promotion guard. Approval is still manual."}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
            <CardTitle>Approval Panel</CardTitle>
          </div>
          <CardDescription>User approval is required before active simulation settings are changed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="reviewer-name">Reviewer name</Label>
              <Input id="reviewer-name" value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="approval-notes">Approval or rejection notes</Label>
              <textarea
                id="approval-notes"
                value={approvalNotes}
                onChange={(event) => setApprovalNotes(event.target.value)}
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Record why this proposal was accepted, rejected, or reverted."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={acceptProposal} disabled={!canAccept}>
                {isResearchCalibration ? "Approve research calibration" : "Accept Proposal"}
              </Button>
              {acceptedButActiveStorageMissing ? (
                <Button variant="secondary" onClick={applyAcceptedToActiveBaseline}>
                  Apply to active baseline
                </Button>
              ) : null}
              <Button variant="secondary" onClick={rejectProposal} disabled={Boolean(rejectDisabledReason)}>
                Reject calibration
              </Button>
              <Button variant="destructive" onClick={revertProposal} disabled={latestProposal?.status !== "accepted"}>
                Revert
              </Button>
              <Link
                to="/dashboard"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium shadow-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out hover:bg-secondary/60 hover:shadow-sm active:scale-[0.98] active:bg-secondary/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Rerun cycle after approval
              </Link>
            </div>
            {(!canAccept || rejectDisabledReason) && (
              <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">
                {!canAccept ? `Approval disabled: ${approvalCheck.reason}` : null}
                {!canAccept && rejectDisabledReason ? " " : ""}
                {rejectDisabledReason ? `Reject disabled: ${rejectDisabledReason}` : null}
                {acceptedButActiveStorageMissing ? (
                  <span className="block pt-1">
                    This accepted proposal is not stored in the active baseline key yet. Use “Apply to active baseline.”
                  </span>
                ) : null}
              </div>
            )}
          </div>
          <div className="space-y-3">
            {[
              "Proposal mode must remain simulation.",
              "Broker authority, execution authority, and readiness override authority must remain none.",
              "Proposal must include approved research/backtest setting changes.",
              "Proposal must include simulation metrics before acceptance.",
              "Comparison must pass balanced guards for stability, trade quality, sample size, and readiness.",
              "Acceptance only updates local simulation calibration settings."
            ].map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-lg border border-border bg-background/45 p-3 text-sm">
                {index < 3 || canAccept ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
                )}
                <span className="leading-5">{item}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <TechnicalDetails
        title="View proposal history"
        description="Open for all local proposals, including proposed, testing, accepted, rejected, and reverted."
      >
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Proposal History</CardTitle>
                <CardDescription>Search by proposal ID, status, target problem, or reason.</CardDescription>
              </div>
              <div className="w-full max-w-sm">
                <Label htmlFor="proposal-filter" className="sr-only">Search proposals</Label>
                <Input
                  id="proposal-filter"
                  value={proposalFilter}
                  onChange={(event) => setProposalFilter(event.target.value)}
                  placeholder="Search proposal ID, status, or reason"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredProposals.map((proposal) => (
              <Link
                key={proposal.proposalId}
                to={`/self-improvement?proposalId=${encodeURIComponent(proposal.proposalId)}`}
                className={`block rounded-lg border bg-background/45 p-3 text-sm transition hover:bg-secondary/40 ${
                  latestProposal?.proposalId === proposal.proposalId ? "border-cyan-300/45" : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-xs text-foreground">{proposal.proposalId}</p>
                    <p className="mt-1 line-clamp-2 text-muted-foreground">{proposal.reason}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Badge variant={statusVariant(proposal.status)}>{proposal.status}</Badge>
                    <Badge variant="secondary">{intentLabel(proposal.proposalIntent)}</Badge>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                  <span>Target: {problemLabel(proposal.targetProblem)}</span>
                  <span>Proposed ICT: {formatOptionalPercent(proposal.proposedConfluenceThreshold ?? proposal.proposedChanges.confluenceThreshold)}</span>
                  <span>Active ICT: {formatOptionalPercent(proposal.activeConfluenceThreshold)}</span>
                  <span>Recovery trades: {proposal.tradesAfterRecovery ?? "n/a"}</span>
                </div>
              </Link>
            ))}
            {!filteredProposals.length ? (
              <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
                No proposals match the current filter.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </TechnicalDetails>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" aria-hidden="true" />
            <CardTitle>Change History</CardTitle>
          </div>
          <CardDescription>Local audit trail for calibration proposals and decisions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {state.auditTrail.slice(0, 12).map((entry) => (
            <div key={entry.id} className="grid gap-2 rounded-lg border border-border bg-background/45 p-3 text-sm md:grid-cols-[10rem_8rem_minmax(0,1fr)]">
              <span className="font-mono text-xs text-muted-foreground">{formatDate(entry.timestamp)}</span>
              <Badge variant={statusVariant(entry.action)}>{entry.action}</Badge>
              <span className="min-w-0 break-words text-muted-foreground">{entry.notes}</span>
            </div>
          ))}
          {!state.auditTrail.length && (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              No calibration proposal history yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
