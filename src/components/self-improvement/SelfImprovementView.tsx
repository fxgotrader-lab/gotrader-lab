import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FlaskConical, History, ShieldAlert, SlidersHorizontal, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  approveCalibrationProposal,
  createCalibrationProposal,
  evaluateCalibrationProposal,
  loadSelfImprovementState,
  rejectCalibrationProposal,
  revertCalibrationProposal,
  SELF_IMPROVEMENT_UPDATED_EVENT,
  upsertCalibrationProposal
} from "@/lib/selfImprovement";
import type { CalibrationProposal, CalibrationProposalMetrics, SelfImprovementState } from "@/lib/selfImprovement";
import { describeBacktestConfig, loadBacktestConfig } from "@/lib/backtesting";
import { labStorage } from "@/lib/storage";
import { formatPercent } from "@/lib/utils";
import { loadLatestResearchQualityReview } from "@/lib/researchQuality";
import { loadLatestValidationReport } from "@/lib/validation";

const formatNumber = (value: number, digits = 2) => value.toFixed(digits);
const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : "none");
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
  const [reviewerName, setReviewerName] = useState("local user");
  const [approvalNotes, setApprovalNotes] = useState("");
  const latestValidation = loadLatestValidationReport();
  const latestQuality = loadLatestResearchQualityReview();
  const baselineConfig = useMemo(() => loadBacktestConfig(), [state.latestProposalId]);
  const latestAdvisory = labStorage.load().advisoryResponses?.[0];
  const latestProposal = state.proposals.find((proposal) => proposal.proposalId === state.latestProposalId) ?? state.proposals[0];
  const canAccept =
    latestProposal?.status === "testing" &&
    latestProposal.comparisonResult?.improved &&
    latestProposal.comparisonResult.stabilityImproved;

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
  };

  const testProposal = () => {
    if (!latestProposal) {
      return;
    }
    const tested = evaluateCalibrationProposal(latestProposal);
    setState(upsertCalibrationProposal(tested, "tested", "Ran deterministic mock-data validation against proposed settings."));
  };

  const acceptProposal = () => {
    if (!latestProposal || !canAccept) {
      return;
    }
    const approved = window.confirm(
      "Accept this simulation calibration proposal and update active Backtest Lab settings? Broker execution remains disabled."
    );
    if (approved) {
      setState(approveCalibrationProposal(latestProposal.proposalId, reviewerName, approvalNotes));
    }
  };

  const rejectProposal = () => {
    if (!latestProposal) {
      return;
    }
    setState(rejectCalibrationProposal(latestProposal.proposalId, reviewerName, approvalNotes));
  };

  const revertProposal = () => {
    if (!latestProposal) {
      return;
    }
    const approved = window.confirm("Revert this accepted simulation calibration back to its saved baseline?");
    if (approved) {
      setState(revertCalibrationProposal(latestProposal.proposalId, reviewerName, approvalNotes));
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

      <Card>
        <CardHeader>
          <CardTitle>Current Proposal</CardTitle>
          <CardDescription>
            Auto Research proposals remain proposal-ready only until the user tests and approves them.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-xs text-muted-foreground">Intent</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={latestProposal?.proposalIntent === "paper_demo_candidate_review" ? "warning" : "secondary"}>
                {intentLabel(latestProposal?.proposalIntent)}
              </Badge>
              <Badge variant={statusVariant(latestProposal?.status)}>{latestProposal?.status ?? "none"}</Badge>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-xs text-muted-foreground">Approval posture</p>
            <p className="mt-1 text-sm text-foreground">
              {latestProposal
                ? latestProposal.proposalIntent === "research_calibration_candidate"
                  ? "Research calibration candidate only. It is not approved and does not mark Paper-Demo Candidate readiness."
                  : latestProposal.proposalIntent === "paper_demo_candidate_review"
                    ? "Paper-demo candidate review only. It still cannot enable demo execution or bypass readiness."
                    : "Manual proposal. It still requires simulation testing and explicit approval."
                : "No proposal has been created yet."}
            </p>
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
                <Badge variant={latestProposal?.proposalIntent === "paper_demo_candidate_review" ? "warning" : "secondary"}>
                  {intentLabel(latestProposal?.proposalIntent)}
                </Badge>
                {latestProposal?.proposalIntent === "research_calibration_candidate" ? (
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
                <Badge variant={latestProposal?.comparisonResult?.improved ? "success" : "warning"}>
                  {latestProposal?.comparisonResult?.recommendation ?? "not tested"}
                </Badge>
              </div>
              <p className="text-muted-foreground">{latestProposal?.comparisonResult?.summary ?? "Run a simulation test to compare."}</p>
            </div>
            {latestProposal?.comparisonResult && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3">
                  <p className="mb-2 font-medium text-emerald-100">Improved</p>
                  <ul className="space-y-1 text-xs text-emerald-50">
                    {latestProposal.comparisonResult.positiveChanges.map((item) => <li key={item}>{item}</li>)}
                    {!latestProposal.comparisonResult.positiveChanges.length && <li>No clear positive change.</li>}
                  </ul>
                </div>
                <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3">
                  <p className="mb-2 font-medium text-amber-100">Neutral</p>
                  <ul className="space-y-1 text-xs text-amber-50">
                    {latestProposal.comparisonResult.neutralChanges.map((item) => <li key={item}>{item}</li>)}
                    {!latestProposal.comparisonResult.neutralChanges.length && <li>No neutral factors.</li>}
                  </ul>
                </div>
                <div className="rounded-lg border border-red-300/25 bg-red-300/10 p-3">
                  <p className="mb-2 font-medium text-red-100">Worse</p>
                  <ul className="space-y-1 text-xs text-red-50">
                    {latestProposal.comparisonResult.negativeChanges.map((item) => <li key={item}>{item}</li>)}
                    {!latestProposal.comparisonResult.negativeChanges.length && <li>No material negative change.</li>}
                  </ul>
                </div>
              </div>
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
                Accept Proposal
              </Button>
              <Button variant="secondary" onClick={rejectProposal} disabled={!latestProposal}>
                Reject
              </Button>
              <Button variant="destructive" onClick={revertProposal} disabled={latestProposal?.status !== "accepted"}>
                Revert
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {[
              "Proposal mode must remain simulation.",
              "Broker authority, execution authority, and readiness override authority must remain none.",
              "A simulation test must run before acceptance.",
              "Comparison must improve stability, not merely profit.",
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
