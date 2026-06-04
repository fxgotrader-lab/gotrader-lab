import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, FlaskConical, History, ShieldAlert, SlidersHorizontal, XCircle } from "lucide-react";
import { MetricProvenanceDetails } from "@/components/common/MetricProvenanceDetails";
import { WhyNotReadyCard } from "@/components/common/WhyNotReadyCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  applyAcceptedCalibrationToActiveBaseline,
  attachProposalMetricsSnapshot,
  approveCalibrationProposal,
  buildGrinchCalibrationProposalIntentDetails,
  calibrationMetricsFromCanonicalPerformance,
  canApproveProposal,
  createCalibrationProposal,
  createGrinchCalibrationDraftProposal,
  effectiveProposalComparison,
  evaluateCalibrationProposal,
  hasMaterialProposalMetricChange,
  isNoOpProposalSnapshot,
  loadSelfImprovementState,
  proposalSnapshotMismatchReasons,
  rejectCalibrationProposal,
  resolveActiveBacktestConfig,
  revertCalibrationProposal,
  SELF_IMPROVEMENT_UPDATED_EVENT,
  summarizeValidationMetrics,
  upsertCalibrationProposal
} from "@/lib/selfImprovement";
import type { CalibrationProposal, CalibrationProposalMetrics, SelfImprovementState } from "@/lib/selfImprovement";
import type { AutoResearchCandidateResult } from "@/lib/autoResearch";
import { describeBacktestConfig } from "@/lib/backtesting";
import { evidenceScoreVariant, selectEvidenceReadinessImpact, selectWeakestEvidenceLabel } from "@/lib/evidence";
import { maturityGradeLabel, maturityGradeVariant, selectMaturityNextRequirement } from "@/lib/maturity";
import { canonicalMetricsForRun, type CanonicalPerformanceMetrics } from "@/lib/performance/canonicalMetrics";
import { latestResearchCycleRun } from "@/lib/researchCycle";
import { buildResearchCommitteeReport } from "@/lib/researchCommittee";
import { loadActiveMt5ReadOnlyCandleFeed } from "@/lib/integrations/mt5";
import { loadActiveTradingViewMcpChartFeed } from "@/lib/integrations/tradingview";
import { resolveChartDisplayCandleSource } from "@/lib/marketData";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeConfigSummary,
  selectRuntimeFingerprintLabel,
  selectRuntimeMetricSourceLabel,
  selectRuntimeSourceLabel,
  selectRuntimeWarnings,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";
import { labStorage } from "@/lib/storage";
import { buildGrinchProfileEvidenceDiagnostics } from "@/lib/strategyLibrary";
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
      : value === "grinch_profile_calibration_intent"
        ? "Grinch profile calibration intent"
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
        : verdict === "reject" || verdict === "no_material_change"
        ? "danger"
        : "muted";
const executableStatusVariant = (status?: string) =>
  status === "executable" ? "success" : status === "diagnostic_only" ? "secondary" : "warning";
const replayReviewVariant = (status?: string) =>
  status === "supportive"
    ? "success"
    : status === "rejected_for_current_window"
      ? "danger"
      : status === "evidence_not_supportive"
        ? "warning"
        : "secondary";
const checklistStatusVariant = (status?: string) =>
  status === "pass" ? "success" : status === "fail" ? "danger" : status === "warning" ? "warning" : "muted";
const formatToken = (value?: string) => (value ?? "not tested").replace(/_/g, " ");
const tradeQualityTargets = new Set([
  "high_drawdown",
  "low_win_rate",
  "weak_average_r",
  "false_positives",
  "poor_session_performance"
]);
const isTradeQualityProposal = (proposal?: CalibrationProposal) =>
  Boolean(proposal && tradeQualityTargets.has(proposal.targetProblem));
const proposalFocusLabels = (proposal?: CalibrationProposal) => {
  if (!proposal) {
    return [];
  }
  const labels: string[] = [];
  if (proposal.proposedChanges.targetRMultiple !== undefined) {
    labels.push("Target model");
  }
  if (proposal.proposedChanges.sessionFilter !== undefined) {
    labels.push("Session filter");
  }
  if (proposal.proposedChanges.stopModel !== undefined) {
    labels.push("Stop model");
  }
  if (
    proposal.baselineConfig.allowLong !== proposal.proposedConfig.allowLong ||
    proposal.baselineConfig.allowShort !== proposal.proposedConfig.allowShort
  ) {
    labels.push("Direction filter");
  }
  if (proposal.proposedChanges.confluenceThreshold !== undefined || proposal.proposedChanges.confidenceThreshold !== undefined) {
    labels.push("Quality threshold");
  }
  return labels;
};
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

  if (!rows.length) {
    return (
      <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
        Draft proposal only. No simulation config changes, Grinch thresholds, timing windows, profile gates, or trading
        logic are proposed by this intent.
      </div>
    );
  }

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
const sourceDateFormat = (value?: string) => (value ? new Date(value).toLocaleString() : "n/a");

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

interface SourceComparisonRow {
  label: string;
  latestCycle?: number | null;
  proposalBefore?: number | null;
  proposalAfter?: number | null;
  format: (value?: number | null) => string;
  meaning: string;
}

const MetricSourceComparisonTable = ({
  latestCycle,
  proposalBefore,
  proposalAfter
}: {
  latestCycle?: CanonicalPerformanceMetrics;
  proposalBefore?: CalibrationProposalMetrics;
  proposalAfter?: CalibrationProposalMetrics;
}) => {
  const rows: SourceComparisonRow[] = [
    {
      label: "Win rate",
      latestCycle: latestCycle?.winRate,
      proposalBefore: proposalBefore?.winRate,
      proposalAfter: proposalAfter?.winRate,
      format: percentFormat,
      meaning: "Dashboard uses the latest research cycle. Proposal columns use the stored candidate snapshot."
    },
    {
      label: "Total trades",
      latestCycle: latestCycle?.totalTrades,
      proposalBefore: proposalBefore?.totalTrades,
      proposalAfter: proposalAfter?.totalTrades,
      format: countFormat,
      meaning: "Different candle windows, candidates, or cycles can produce different trade counts."
    },
    {
      label: "Average R",
      latestCycle: latestCycle?.averageR,
      proposalBefore: proposalBefore?.averageR,
      proposalAfter: proposalAfter?.averageR,
      format: rFormat,
      meaning: "Use this to compare trade quality within the same proposal snapshot only."
    },
    {
      label: "Max drawdown",
      latestCycle: latestCycle?.maxDrawdownR,
      proposalBefore: proposalBefore?.maxDrawdown,
      proposalAfter: proposalAfter?.maxDrawdown,
      format: rFormat,
      meaning: "Lower proposal drawdown is useful only if win rate, R, and sample size stay credible."
    },
    {
      label: "Profit factor",
      latestCycle: latestCycle?.profitFactor,
      proposalBefore: proposalBefore?.profitFactor,
      proposalAfter: proposalAfter?.profitFactor,
      format: numberFormat,
      meaning: "Profit factor is a supporting metric, not a standalone approval reason."
    },
    {
      label: "Readiness score",
      latestCycle: latestCycle?.readinessScore,
      proposalBefore: proposalBefore?.readinessScore,
      proposalAfter: proposalAfter?.readinessScore,
      format: countFormat,
      meaning: "Latest readiness and proposal readiness may be from different source runs."
    },
    {
      label: "Stability score",
      latestCycle: latestCycle?.stabilityScore,
      proposalBefore: proposalBefore?.stabilityScore,
      proposalAfter: proposalAfter?.stabilityScore,
      format: countFormat,
      meaning: "Proposal stability belongs to the candidate that created the snapshot."
    }
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[920px] table-fixed border-separate border-spacing-0 text-left text-sm">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[18%]" />
          <col className="w-[16%]" />
          <col className="w-[16%]" />
          <col className="w-[32%]" />
        </colgroup>
        <thead className="bg-muted/55 text-xs uppercase text-muted-foreground">
          <tr>
            {["Metric", "Latest Dashboard Cycle", "Proposal Before", "Proposal After", "Difference / Meaning"].map((header) => (
              <th
                key={header}
                className={
                  header === "Metric" || header === "Difference / Meaning"
                    ? "px-3 py-2 text-left font-medium"
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
            const latestDiffersFromAfter =
              typeof row.latestCycle === "number" &&
              typeof row.proposalAfter === "number" &&
              Math.abs(row.latestCycle - row.proposalAfter) > 0.0005;
            return (
              <tr key={row.label} className="border-t border-border bg-background/35 align-top">
                <td className="px-3 py-3 font-medium text-foreground">{row.label}</td>
                <td className="whitespace-nowrap border-l border-border/70 px-3 py-3 text-right font-mono tabular-nums text-slate-200">
                  {row.format(row.latestCycle)}
                </td>
                <td className="whitespace-nowrap border-l border-border/70 px-3 py-3 text-right font-mono tabular-nums text-slate-200">
                  {row.format(row.proposalBefore)}
                </td>
                <td className="whitespace-nowrap border-l border-border/70 px-3 py-3 text-right font-mono tabular-nums text-slate-200">
                  {row.format(row.proposalAfter)}
                </td>
                <td className="border-l border-border/70 px-3 py-3 text-muted-foreground">
                  <span className={latestDiffersFromAfter ? "text-amber-100" : ""}>
                    {latestDiffersFromAfter ? "Different source/run. " : ""}
                    {row.meaning}
                  </span>
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
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();
  const latestValidation = loadLatestValidationReport();
  const latestQuality = loadLatestResearchQualityReview();
  const latestCycleRun = latestResearchCycleRun();
  const queryProposalId = searchParams.get("proposalId") ?? undefined;
  const generatedProposalFromCycle =
    latestCycleRun?.latestGeneratedProposal ?? latestCycleRun?.autoResearchCycle?.createdProposal;
  const latestCycleCanonicalMetrics = runtimeSnapshot?.performance.canonicalPerformanceMetrics ?? canonicalMetricsForRun(latestCycleRun);
  const runtimeWarnings = selectRuntimeWarnings(runtimeSnapshot);
  const researchCommitteeReport = useMemo(
    () => (runtimeSnapshot ? buildResearchCommitteeReport(runtimeSnapshot) : undefined),
    [runtimeSnapshot]
  );
  const paperDemoChecklist = researchCommitteeReport?.paperDemoChecklist;
  const paperDemoChecklistBlockers = paperDemoChecklist?.proposalEligibleBlockers.length
    ? paperDemoChecklist.proposalEligibleBlockers
    : paperDemoChecklist
      ? paperDemoChecklist.items.filter((entry) => entry.status !== "pass").slice(0, 3)
      : [
          {
            id: "runtime_pending",
            label: "Runtime checklist pending",
            status: "warning",
            nextAction: "Activate MT5 Research Mode or wait for the runtime snapshot before generating checklist-based proposals.",
            proposalEligible: false
          }
        ];
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
  const baselineConfig = runtimeSnapshot?.activeConfig.resolvedBacktestConfig ?? baselineResolution.config;
  const latestAdvisory = labStorage.load().advisoryResponses?.[0];
  const latestBacktest = runtimeSnapshot?.latestResearchCycle.latestBacktestSummary;
  const latestGrinchScore =
    runtimeSnapshot?.latestResearchCycle.grinchStrategyScore ?? latestBacktest?.grinchSummary?.latestScore;
  const grinchDiagnosticCandles = useMemo(() => {
    const tradingViewFeed = loadActiveTradingViewMcpChartFeed();
    const mt5Feed = loadActiveMt5ReadOnlyCandleFeed();
    const displaySource = runtimeSnapshot
      ? resolveChartDisplayCandleSource(runtimeSnapshot.marketData.preparedSource, tradingViewFeed, mt5Feed)
      : undefined;
    return displaySource?.activeResearchCandleSource ?? [];
  }, [
    runtimeSnapshot?.marketData.activeResearchSource.fingerprint,
    runtimeSnapshot?.marketData.preparedSource
  ]);
  const grinchProfileDiagnostics = useMemo(
    () =>
      buildGrinchProfileEvidenceDiagnostics({
        candles: grinchDiagnosticCandles,
        phase1: runtimeSnapshot?.latestResearchCycle.grinchPhase1Summary,
        reversal: runtimeSnapshot?.latestResearchCycle.grinchPhase2ReversalSummary,
        consolidation: runtimeSnapshot?.latestResearchCycle.grinchPhase3ConsolidationSummary,
        score: latestGrinchScore,
        profileCandidateCounts: latestBacktest?.grinchSummary?.profileCandidateCounts,
        noValidProfileCount: latestBacktest?.grinchSummary?.noValidProfileSignals,
        regimeLabel: runtimeSnapshot?.regime.label,
        regimeDataQuality: runtimeSnapshot?.regime.dataQuality,
        sessionTimeMapping: runtimeSnapshot?.latestResearchCycle.grinchPhase1Summary?.sessionTimeMapping
      }),
    [
      grinchDiagnosticCandles,
      latestBacktest?.grinchSummary?.noValidProfileSignals,
      latestBacktest?.grinchSummary?.profileCandidateCounts,
      latestGrinchScore,
      runtimeSnapshot?.latestResearchCycle.grinchPhase1Summary,
      runtimeSnapshot?.latestResearchCycle.grinchPhase2ReversalSummary,
      runtimeSnapshot?.latestResearchCycle.grinchPhase3ConsolidationSummary,
      runtimeSnapshot?.regime.dataQuality,
      runtimeSnapshot?.regime.label
    ]
  );
  const grinchCalibrationSourceContext = useMemo(
    () => ({
      provider: runtimeSnapshot?.marketData.activeResearchSource.provider,
      dataSourceLabel:
        runtimeSnapshot?.marketData.activeResearchSource.provenance.sourceLabel ??
        latestCycleCanonicalMetrics?.dataSource,
      requestedSymbol: runtimeSnapshot?.marketData.symbol ?? latestCycleCanonicalMetrics?.symbol,
      brokerSymbol:
        runtimeSnapshot?.marketData.activeResearchSource.provenance.providerSymbol ??
        runtimeSnapshot?.marketData.activeResearchSource.symbol,
      timeframe: runtimeSnapshot?.marketData.activeResearchSource.timeframe ?? latestCycleCanonicalMetrics?.timeframe,
      candleCount: runtimeSnapshot?.marketData.activeResearchSource.candleCount ?? latestCycleCanonicalMetrics?.rawCandleCount,
      sourceFingerprint:
        runtimeSnapshot?.marketData.activeResearchSource.fingerprint ??
        latestCycleCanonicalMetrics?.sourceCycleId,
      regimeLabel: runtimeSnapshot?.regime.label,
      regimeDataQuality: runtimeSnapshot?.regime.dataQuality
    }),
    [
      latestCycleCanonicalMetrics?.dataSource,
      latestCycleCanonicalMetrics?.rawCandleCount,
      latestCycleCanonicalMetrics?.symbol,
      latestCycleCanonicalMetrics?.timeframe,
      runtimeSnapshot?.marketData.activeResearchSource.candleCount,
      runtimeSnapshot?.marketData.activeResearchSource.fingerprint,
      runtimeSnapshot?.marketData.activeResearchSource.provider,
      runtimeSnapshot?.marketData.activeResearchSource.provenance.providerSymbol,
      runtimeSnapshot?.marketData.activeResearchSource.provenance.sourceLabel,
      runtimeSnapshot?.marketData.activeResearchSource.symbol,
      runtimeSnapshot?.marketData.activeResearchSource.timeframe,
      runtimeSnapshot?.marketData.symbol,
      runtimeSnapshot?.regime.dataQuality,
      runtimeSnapshot?.regime.label
    ]
  );
  const grinchCalibrationIntent = useMemo(
    () =>
      latestGrinchScore?.noValidProfile
        ? buildGrinchCalibrationProposalIntentDetails({
            expansionReplayDiagnostics: grinchProfileDiagnostics.expansionReplayDiagnostics,
            report: grinchProfileDiagnostics.calibrationReport,
            sourceContext: grinchCalibrationSourceContext
          })
        : undefined,
    [
      grinchCalibrationSourceContext,
      grinchProfileDiagnostics.calibrationReport,
      grinchProfileDiagnostics.expansionReplayDiagnostics,
      latestGrinchScore?.noValidProfile
    ]
  );
  const grinchDraftBeforeMetrics = useMemo(
    () =>
      latestCycleCanonicalMetrics
        ? calibrationMetricsFromCanonicalPerformance(latestCycleCanonicalMetrics)
        : latestValidation
          ? summarizeValidationMetrics(latestValidation)
          : undefined,
    [latestCycleCanonicalMetrics, latestValidation]
  );
  const grinchCalibrationDraftProposal = useMemo(
    () =>
      grinchCalibrationIntent && grinchDraftBeforeMetrics
        ? createGrinchCalibrationDraftProposal({
            baselineConfig,
            beforeMetrics: grinchDraftBeforeMetrics,
            expansionReplayDiagnostics: grinchProfileDiagnostics.expansionReplayDiagnostics,
            report: grinchProfileDiagnostics.calibrationReport,
            sourceContext: grinchCalibrationSourceContext
          })
        : undefined,
    [
      baselineConfig,
      grinchCalibrationIntent,
      grinchDraftBeforeMetrics,
      grinchProfileDiagnostics.calibrationReport,
      grinchProfileDiagnostics.expansionReplayDiagnostics,
      grinchCalibrationSourceContext
    ]
  );
  const existingGrinchDraftProposal = grinchCalibrationIntent
    ? safeArray(state.proposals).find(
        (proposal) =>
          proposal.proposalIntent === "grinch_profile_calibration_intent" &&
          proposal.proposalIntentDetails?.candidateFamily === grinchCalibrationIntent.candidateFamily &&
          proposal.proposalIntentDetails?.reportFingerprint === grinchCalibrationIntent.reportFingerprint &&
          proposal.proposalIntentDetails?.sourceFingerprint === grinchCalibrationIntent.sourceFingerprint &&
          proposal.status === "proposed"
      )
    : undefined;
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
  const latestProposalIntentIsStale = Boolean(
    latestProposal?.proposalIntentDetails &&
      grinchCalibrationIntent &&
      (latestProposal.proposalIntentDetails.reportFingerprint !== grinchCalibrationIntent.reportFingerprint ||
        latestProposal.proposalIntentDetails.sourceFingerprint !== grinchCalibrationIntent.sourceFingerprint ||
        latestProposal.proposalIntentDetails.candidateFamily !== grinchCalibrationIntent.candidateFamily)
  );
  const latestProposalPersisted = Boolean(
    latestProposal && safeArray(state.proposals).some((proposal) => proposal.proposalId === latestProposal.proposalId)
  );
  const sourceCandidatesForLatestProposal = useMemo(() => {
    const cycle = latestCycleRun?.autoResearchCycle;
    const candidates = [
      cycle?.bestCandidate,
      cycle?.recoveryResult,
      cycle?.tradeQualityBestCandidate,
      ...safeArray(cycle?.candidateResults),
      ...safeArray(cycle?.closestCandidates),
      ...safeArray(cycle?.rejectedCandidates),
      ...safeArray(cycle?.adaptivePasses).map((pass) => pass.bestCandidatePerPass)
    ].filter((candidate): candidate is AutoResearchCandidateResult => Boolean(candidate));
    const unique = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
    return [...unique.values()];
  }, [latestCycleRun]);
  const sourceCandidateForLatestProposal = latestProposal?.sourceCandidateId
    ? sourceCandidatesForLatestProposal.find((candidate) => candidate.candidateId === latestProposal.sourceCandidateId)
    : undefined;
  const snapshotBeforeMetrics = latestProposal?.metricsSnapshot?.beforeMetrics ?? latestProposal?.beforeMetrics;
  const snapshotAfterMetrics = latestProposal?.metricsSnapshot?.afterMetrics ?? latestProposal?.afterMetrics;
  const snapshotComparisonResult = effectiveProposalComparison(latestProposal);
  const proposalMismatchReasons = proposalSnapshotMismatchReasons(latestProposal);
  const proposalIsNoOp = isNoOpProposalSnapshot(latestProposal);
  const proposalHasMaterialChange = hasMaterialProposalMetricChange(latestProposal);
  const proposalHasAnyAfterMetrics = Boolean(snapshotAfterMetrics || latestProposal?.afterMetrics);
  const showMetricMismatchWarning =
    proposalMismatchReasons.length > 0 ||
    proposalIsNoOp ||
    (latestProposal && proposalHasAnyAfterMetrics && !proposalHasMaterialChange);
  const proposalAndCycleSourcesDiffer = Boolean(
    latestProposal?.metricsSnapshot?.sourceCycleId &&
      latestCycleCanonicalMetrics?.sourceCycleId &&
      latestProposal.metricsSnapshot.sourceCycleId !== latestCycleCanonicalMetrics.sourceCycleId
  );
  const proposalSnapshotHasCandidateSource = Boolean(latestProposal?.metricsSnapshot?.sourceCandidateId);
  const proposalMetricSourceDiffersFromDashboard = Boolean(
    latestProposal?.metricsSnapshot &&
      latestCycleCanonicalMetrics &&
      (proposalAndCycleSourcesDiffer || proposalSnapshotHasCandidateSource)
  );
  const proposalDisplayedWinRate = snapshotAfterMetrics?.winRate ?? snapshotBeforeMetrics?.winRate;
  const selfImprovementWinRateDiffersFromDashboard = Boolean(
    typeof latestCycleCanonicalMetrics?.winRate === "number" &&
      typeof proposalDisplayedWinRate === "number" &&
      Math.abs(latestCycleCanonicalMetrics.winRate - proposalDisplayedWinRate) > 0.0005
  );
  const metricSourceWarningActive = proposalMetricSourceDiffersFromDashboard || selfImprovementWinRateDiffersFromDashboard;
  const latestCycleUsesActiveBaseline = Boolean(
    latestCycleCanonicalMetrics &&
      (baselineResolution.activeCalibrationId
        ? latestCycleCanonicalMetrics.activeCalibrationId === baselineResolution.activeCalibrationId
        : !latestCycleCanonicalMetrics.activeCalibrationId)
  );
  const activeBaselineMetrics = latestCycleUsesActiveBaseline ? latestCycleCanonicalMetrics : undefined;
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
  const isTradeQualityCalibration = isTradeQualityProposal(latestProposal);
  const tradeQualitySampleMinimum = latestProposal
    ? Math.max(30, Math.floor((snapshotBeforeMetrics?.totalTrades ?? 0) * 0.5))
    : 30;
  const tradeQualityAfterTrades = snapshotAfterMetrics?.totalTrades ?? 0;
  const tradeQualitySampleAcceptable = tradeQualityAfterTrades >= tradeQualitySampleMinimum;
  const tradeQualityFocusLabels = proposalFocusLabels(latestProposal);
  const tradeQualityWinRateImproved = snapshotAfterMetrics && snapshotBeforeMetrics
    ? snapshotAfterMetrics.winRate > snapshotBeforeMetrics.winRate
    : false;
  const tradeQualityAverageRImproved = snapshotAfterMetrics && snapshotBeforeMetrics
    ? snapshotAfterMetrics.averageR > snapshotBeforeMetrics.averageR
    : false;
  const walkForwardApprovalBlocked = Boolean(
    latestProposal &&
      runtimeSnapshot?.walkForward.proposalValidated &&
      (runtimeSnapshot.walkForward.verdict === "fail" || runtimeSnapshot.walkForward.verdict === "insufficient_evidence")
  );
  const baseApprovalCheck = latestProposalPersisted
    ? canApproveProposal(latestProposal)
    : {
        canApprove: false,
        reason: latestProposal ? "Import proposal from latest research cycle first." : "No proposal selected.",
        reasons: [latestProposal ? "Import proposal from latest research cycle first." : "No proposal selected."]
      };
  const approvalCheck = walkForwardApprovalBlocked
    ? {
        canApprove: false,
        reason:
          runtimeSnapshot?.walkForward.verdict === "insufficient_evidence"
            ? "Do not approve yet - walk-forward evidence is insufficient."
            : "Do not approve yet - walk-forward failed.",
        reasons: [
          runtimeSnapshot?.walkForward.verdict === "insufficient_evidence"
            ? "Do not approve yet - walk-forward evidence is insufficient."
            : "Do not approve yet - walk-forward failed.",
          ...(runtimeSnapshot?.walkForward.failureDiagnostics?.repeatedFailureReasons ?? []),
          ...(baseApprovalCheck.reasons ?? [])
        ]
      }
    : baseApprovalCheck;
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
    const refresh = () => {
      setState(loadSelfImprovementState());
      void resolveResearchRuntimeSnapshot().then(setRuntimeSnapshot).catch(() => undefined);
    };
    refresh();
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

  const createGrinchDraftProposal = () => {
    if (existingGrinchDraftProposal) {
      setSearchParams({ proposalId: existingGrinchDraftProposal.proposalId });
      setActionMessage(`Opened matching current Grinch draft proposal ${existingGrinchDraftProposal.proposalId}.`);
      return;
    }
    if (!grinchCalibrationDraftProposal) {
      setActionMessage(
        grinchCalibrationIntent
          ? "Run an AI Research Cycle first so the draft can attach real baseline metrics."
          : "No active Grinch no-valid-profile calibration report is available."
      );
      return;
    }
    const nextState = upsertCalibrationProposal(
      grinchCalibrationDraftProposal,
      "created",
      "Created draft Grinch profile calibration proposal intent. No thresholds or trading logic were changed."
    );
    setState(nextState);
    setSearchParams({ proposalId: grinchCalibrationDraftProposal.proposalId });
    setActionMessage(`Created draft Grinch calibration proposal ${grinchCalibrationDraftProposal.proposalId}.`);
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

  const rebuildProposalSnapshot = () => {
    if (!latestProposal) {
      setActionMessage("No proposal selected.");
      return;
    }
    if (!latestProposalPersisted) {
      setActionMessage("Import proposal from latest research cycle before rebuilding its snapshot.");
      return;
    }
    const sourceCandidate = sourceCandidateForLatestProposal;
    if (!sourceCandidate) {
      setActionMessage("Source candidate is not available in the latest research cycle summary. Rerun the AI Research Cycle to regenerate it.");
      return;
    }

    const rebuilt = attachProposalMetricsSnapshot(
      {
        ...latestProposal,
        afterMetrics: sourceCandidate.metrics,
        comparisonResult: sourceCandidate.comparisonResult,
        candidateStabilityScore: sourceCandidate.metrics.stabilityScore,
        sourceCandidateId: sourceCandidate.candidateId,
        sourceCandidateLabel: sourceCandidate.label
      },
      {
        sourceCycleId: latestCycleRun?.autoResearchCycle?.cycleId ?? latestCycleRun?.cycleId,
        sourceCandidateId: sourceCandidate.candidateId,
        dataSource: latestCycleRun?.dataSourceLabel ?? latestProposal.metricsSnapshot?.dataSource,
        candleWindow:
          latestProposal.metricsSnapshot?.candleWindow ??
          (typeof latestCycleRun?.researchWindowCandles === "number" && typeof latestCycleRun?.processedCandleCount === "number"
            ? `${latestCycleRun.researchWindowCandles} raw window / ${latestCycleRun.processedCandleCount} processed ${latestCycleRun.researchTimeframe ?? "candles"}`
            : undefined),
        searchMode: latestCycleRun?.effectiveSearchMode ?? latestProposal.metricsSnapshot?.searchMode,
        activeCalibrationIdUsed: latestCycleRun?.activeCalibrationId ?? latestProposal.metricsSnapshot?.activeCalibrationIdUsed
      }
    );
    const nextState = upsertCalibrationProposal(
      rebuilt,
      "tested",
      "Rebuilt canonical proposal metrics snapshot from the source Auto Research candidate."
    );
    setState(nextState);
    setActionMessage("Rebuilt proposal snapshot from source candidate.");
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

      <WhyNotReadyCard context="self_improvement" snapshot={runtimeSnapshot} />

      <Card className="border-cyan-400/20 bg-cyan-400/5">
        <CardContent className="grid gap-3 p-4 text-sm text-cyan-50 md:grid-cols-5">
          <div>
            <div className="text-xs uppercase opacity-70">Metrics source</div>
            <div className="mt-1 font-mono">{selectRuntimeMetricSourceLabel(runtimeSnapshot)}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Runtime data source</div>
            <div className="mt-1 font-mono">{selectRuntimeSourceLabel(runtimeSnapshot)}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Active baseline</div>
            <div className="mt-1 font-mono">{selectRuntimeConfigSummary(runtimeSnapshot)}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Latest proposal</div>
            <div className="mt-1 break-all font-mono">{runtimeSnapshot?.proposal.latestProposalId ?? "none"}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Proposal fingerprint</div>
            <div className="mt-1 break-all font-mono">
              {selectRuntimeFingerprintLabel(runtimeSnapshot, latestProposal?.metricsSnapshot ? "proposal_snapshot" : "latest_cycle")}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-cyan-300/25 bg-cyan-300/10">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Paper-Demo checklist blockers</CardTitle>
              <CardDescription>
                Checklist blockers eligible for proposal generation. This panel cannot auto-apply, enable paper/demo,
                or promote readiness.
              </CardDescription>
            </div>
            <Badge variant={paperDemoChecklist?.paperDemoCandidate ? "success" : paperDemoChecklist ? "warning" : "secondary"}>
              {paperDemoChecklist ? `${paperDemoChecklist.passCount}/${paperDemoChecklist.items.length} pass` : "runtime pending"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-cyan-50">
          <div className="rounded-lg border border-cyan-300/20 bg-background/35 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">Primary blocker</p>
            <p className="mt-1 text-foreground">{paperDemoChecklist?.primaryBlocker ?? "Runtime snapshot has not resolved yet."}</p>
            <p className="mt-2 text-xs text-cyan-100/75">
              No auto-apply. No readiness promotion. Checklist evidence is reporting-only and keeps authority none.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {paperDemoChecklistBlockers.map((entry) => (
              <div key={entry.id} className="rounded-md border border-cyan-300/20 bg-background/35 p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-foreground">{entry.label}</span>
                  <Badge variant={checklistStatusVariant(entry.status)}>{entry.status.replace(/_/g, " ")}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{entry.nextAction}</p>
                <p className="mt-1 text-cyan-100/70">Proposal eligible: {entry.proposalEligible ? "yes" : "no"}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {researchCommitteeReport ? (
        <Card className="border-violet-300/20 bg-violet-300/10">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Reflection Memory</CardTitle>
                <CardDescription>
                  Deterministic proposal support check from the latest Research Decision Log. No LLM or auto-apply required.
                  Reflection support does not mark Paper-Demo Candidate readiness.
                </CardDescription>
              </div>
              <Badge
                variant={
                  researchCommitteeReport.reflectionMemory.calibrationProposalSupport.status === "supported"
                    ? "success"
                    : researchCommitteeReport.reflectionMemory.calibrationProposalSupport.status === "not_supported"
                      ? "danger"
                      : "warning"
                }
              >
                {researchCommitteeReport.reflectionMemory.calibrationProposalSupport.status.replace(/_/g, " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-violet-50">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-violet-300/20 bg-background/35 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-violet-100/70">Current proposal</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">{latestProposal?.proposalId ?? "none selected"}</p>
              </div>
              <div className="rounded-lg border border-violet-300/20 bg-background/35 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-violet-100/70">Research verdict</p>
                <p className="mt-1 font-mono text-sm text-foreground">
                  {researchCommitteeReport.finalResearchChairSynthesis.verdict.replace(/_/g, " ")}
                </p>
              </div>
              <div className="rounded-lg border border-violet-300/20 bg-background/35 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-violet-100/70">Repeated blocker</p>
                <p className="mt-1 text-sm text-foreground">
                  {researchCommitteeReport.reflectionMemory.repeatedBlocker?.replace(/_/g, " ") ?? "none recorded"}
                </p>
              </div>
              <div className="rounded-lg border border-violet-300/20 bg-background/35 p-3">
                <p className="text-xs tracking-[0.08em] text-violet-100/70">Latest Decision Log</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">
                  {researchCommitteeReport.decisionLogEntry.decisionId}
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-violet-300/20 bg-background/35 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-violet-100/70">Proposal support</p>
              <p className="mt-1 text-foreground">
                {researchCommitteeReport.reflectionMemory.calibrationProposalSupport.reason}
              </p>
              <p className="mt-2 text-xs text-violet-100/75">
                Next test: {researchCommitteeReport.reflectionMemory.whatToTestNext}
              </p>
            </div>
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-amber-100/75">Advisory readiness distinction</p>
                  <p className="mt-1 text-foreground">
                    {researchCommitteeReport.readinessDistinction.riskChairSummary}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={researchCommitteeReport.readinessDistinction.researchReady ? "success" : "warning"}>
                    Research Ready {researchCommitteeReport.readinessDistinction.researchReadyLabel}
                  </Badge>
                  <Badge variant={researchCommitteeReport.readinessDistinction.paperDemoCandidate ? "success" : "warning"}>
                    Paper-Demo Candidate {researchCommitteeReport.readinessDistinction.paperDemoCandidateLabel}
                  </Badge>
                </div>
              </div>
              <p className="mt-2 text-xs leading-5 text-amber-100/80">
                Advisory note is non-authoritative. No auto-apply, no readiness promotion, and no threshold change can come from this panel.
                {` ${researchCommitteeReport.readinessDistinction.confidenceNotice}`}
              </p>
              <p className="mt-2 text-xs text-amber-100">
                Paper-demo blocker: {researchCommitteeReport.readinessDistinction.paperDemoBlocker}
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {researchCommitteeReport.readinessDistinction.recommendedNextWork.map((item) => (
                  <div key={item} className="rounded-md border border-amber-300/20 bg-background/35 p-2 text-xs text-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            {paperDemoChecklist ? (
              <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/75">Paper-Demo checklist blockers</p>
                    <p className="mt-1 text-foreground">
                      {paperDemoChecklist.paperDemoCandidate
                        ? "Checklist gates are clear for review, but this panel still cannot promote readiness."
                        : paperDemoChecklist.primaryBlocker}
                    </p>
                  </div>
                  <Badge variant={paperDemoChecklist.paperDemoCandidate ? "success" : "warning"}>
                    {paperDemoChecklist.passCount}/{paperDemoChecklist.items.length} pass
                  </Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-cyan-100/80">
                  Proposal generation may target eligible checklist blockers only. It cannot auto-apply, enable paper/demo,
                  or override readiness.
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {(paperDemoChecklist.proposalEligibleBlockers.length
                    ? paperDemoChecklist.proposalEligibleBlockers
                    : paperDemoChecklist.items.filter((entry) => entry.status !== "pass").slice(0, 3)
                  ).map((entry) => (
                    <div key={entry.id} className="rounded-md border border-cyan-300/20 bg-background/35 p-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-foreground">{entry.label}</span>
                        <Badge variant={checklistStatusVariant(entry.status)}>{entry.status.replace(/_/g, " ")}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{entry.nextAction}</p>
                      <p className="mt-1 text-cyan-100/70">Proposal eligible: {entry.proposalEligible ? "yes" : "no"}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className={metricSourceWarningActive ? "border-amber-300/25 bg-amber-300/10" : "border-emerald-300/25 bg-emerald-300/10"}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Metric Source</CardTitle>
              <CardDescription>
                Self-Improvement can show proposal snapshots from a candidate while Dashboard shows the latest research cycle.
              </CardDescription>
            </div>
            <Badge variant={metricSourceWarningActive ? "warning" : "success"}>
              {metricSourceWarningActive ? "different metric sources" : "same cycle/source"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className={`space-y-4 text-sm ${metricSourceWarningActive ? "text-amber-100" : "text-emerald-100"}`}>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-current/20 bg-background/35 p-3">
              <p className="text-xs uppercase tracking-[0.14em] opacity-70">Proposal Snapshot Metrics</p>
              <p className="mt-1 break-all font-mono text-xs">
                {latestProposal?.metricsSnapshot
                  ? `proposal snapshot ${latestProposal.metricsSnapshot.proposalId}`
                  : latestProposal
                    ? `proposal ${latestProposal.proposalId}`
                    : "no proposal selected"}
              </p>
              <p className="mt-2 text-xs opacity-80">
                Win rate: {snapshotAfterMetrics ? formatPercent(snapshotAfterMetrics.winRate, 1) : "not tested"}
              </p>
            </div>
            <div className="rounded-lg border border-current/20 bg-background/35 p-3">
              <p className="text-xs uppercase tracking-[0.14em] opacity-70">Latest Research Cycle Metrics</p>
              <p className="mt-1 break-all font-mono text-xs">
                {latestCycleCanonicalMetrics ? `latest research cycle ${latestCycleCanonicalMetrics.sourceCycleId}` : "no completed cycle metrics"}
              </p>
              <p className="mt-2 text-xs opacity-80">
                Win rate: {latestCycleCanonicalMetrics ? formatPercent(latestCycleCanonicalMetrics.winRate, 1) : "n/a"}
              </p>
            </div>
            <div className="rounded-lg border border-current/20 bg-background/35 p-3">
              <p className="text-xs uppercase tracking-[0.14em] opacity-70">Active Baseline Metrics</p>
              <p className="mt-1 break-all font-mono text-xs">
                {activeBaselineMetrics
                  ? `latest run with active baseline ${activeBaselineMetrics.sourceCycleId}`
                  : baselineResolution.activeCalibrationId
                    ? `active calibration ${baselineResolution.activeCalibrationId}; rerun cycle for metrics`
                    : "default baseline; rerun cycle for current metrics"}
              </p>
              <p className="mt-2 text-xs opacity-80">
                Win rate: {activeBaselineMetrics ? formatPercent(activeBaselineMetrics.winRate, 1) : "n/a"}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-current/20 bg-background/35 p-3">
            {metricSourceWarningActive ? (
              <p>
                Different metric sources: do not compare these as the same run. Dashboard shows the latest research cycle;
                this proposal shows the stored before/after snapshot from cycle{" "}
                <span className="font-mono">{latestProposal?.metricsSnapshot?.sourceCycleId ?? "unknown"}</span>
                {latestProposal?.metricsSnapshot?.sourceCandidateId ? (
                  <>
                    {" "}and candidate <span className="font-mono">{latestProposal.metricsSnapshot.sourceCandidateId}</span>
                  </>
                ) : null}
                .
              </p>
            ) : (
              <p>Metrics are from the same cycle/source.</p>
            )}
          </div>

          <div className="grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Dashboard cycleId", latestCycleCanonicalMetrics?.sourceCycleId ?? "none"],
              ["Proposal ID", latestProposal?.proposalId ?? "none"],
              ["Source cycleId", latestProposal?.metricsSnapshot?.sourceCycleId ?? "none"],
              ["Source candidateId", latestProposal?.metricsSnapshot?.sourceCandidateId ?? "none"],
              ["Generated at", sourceDateFormat(latestProposal?.metricsSnapshot?.generatedAt)],
              ["Data source", latestProposal?.metricsSnapshot?.dataSource ?? latestCycleCanonicalMetrics?.dataSource ?? "unknown"],
              ["Candle window", latestProposal?.metricsSnapshot?.candleWindow ?? latestCycleCanonicalMetrics?.candleWindow ?? "unknown"],
              ["Active calibration ID", latestProposal?.metricsSnapshot?.activeCalibrationIdUsed ?? latestCycleCanonicalMetrics?.activeCalibrationId ?? "none"],
              ["Search mode", latestProposal?.metricsSnapshot?.searchMode ?? "n/a"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-current/15 bg-background/35 p-2">
                <p className="uppercase tracking-[0.12em] opacity-65">{label}</p>
                <p className="mt-1 break-all font-mono text-[11px]">{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-violet-300/20 bg-violet-300/10">
        <CardContent className="grid gap-3 p-4 text-sm text-violet-50 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="font-medium">Evidence behind proposal</div>
            <div className="mt-1 text-violet-100/75">
              {selectEvidenceReadinessImpact(runtimeSnapshot?.evidence.evidenceLedgerSummary)} Weakest area:{" "}
              {selectWeakestEvidenceLabel(runtimeSnapshot?.evidence.evidenceLedgerSummary)}.
            </div>
          </div>
          <Badge variant={evidenceScoreVariant(runtimeSnapshot?.evidence.evidenceQualityScore)}>
            Evidence {runtimeSnapshot?.evidence.evidenceQualityScore ?? 0}/100
          </Badge>
        </CardContent>
      </Card>

      <Card className="border-fuchsia-300/20 bg-fuchsia-300/10">
        <CardContent className="grid gap-3 p-4 text-sm text-fuchsia-50 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="font-medium">Maturity impact of active calibration</div>
            <div className="mt-1 text-fuchsia-100/75">
              {runtimeSnapshot?.maturity.maturitySummary.activeCalibrationId
                ? `Active calibration ${runtimeSnapshot.maturity.maturitySummary.activeCalibrationId} has survived ${runtimeSnapshot.maturity.maturitySummary.cyclesWithCurrentCalibration} cycle(s).`
                : "Default baseline is active. A newly approved calibration starts with lower maturity until it survives fresh research cycles."}{" "}
              {selectMaturityNextRequirement(runtimeSnapshot?.maturity.maturitySummary)}
            </div>
          </div>
          <Badge variant={maturityGradeVariant(runtimeSnapshot?.maturity.maturityGrade)}>
            {maturityGradeLabel(runtimeSnapshot?.maturity.maturityGrade)} / {runtimeSnapshot?.maturity.maturityScore ?? 0}
          </Badge>
        </CardContent>
      </Card>

      <Card className="border-cyan-300/20 bg-cyan-300/10">
        <CardContent className="grid gap-3 p-4 text-sm text-cyan-50 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="font-medium">Walk-forward validation before approval</div>
            <div className="mt-1 text-cyan-100/75">
              {latestProposal
                ? runtimeSnapshot?.walkForward.proposalValidated
                  ? `This proposal has walk-forward validation: ${runtimeSnapshot.walkForward.windowsTested} window(s), overfit risk ${runtimeSnapshot.walkForward.overfitRisk ?? "unknown"}.`
                  : "This proposal has not been walk-forward validated yet. Treat one-window proposal evidence as preliminary."
                : "No proposal selected for walk-forward validation."}
            </div>
            {walkForwardApprovalBlocked ? (
              <div className="mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-amber-100">
                <div className="font-medium">
                  {runtimeSnapshot?.walkForward.verdict === "insufficient_evidence"
                    ? "Do not approve yet - walk-forward evidence is insufficient."
                    : "Do not approve yet - walk-forward failed."}
                </div>
                <div className="mt-1">
                  {runtimeSnapshot?.walkForward.failureDiagnostics?.summary ??
                    "The latest proposal needs more walk-forward evidence or targeted follow-up research."}
                </div>
                <div className="mt-2 text-xs">
                  Top reason: {runtimeSnapshot?.walkForward.failureDiagnostics?.repeatedFailureReasons?.[0] ?? "not recorded"}.
                </div>
              </div>
            ) : null}
          </div>
          <Badge
            variant={
              runtimeSnapshot?.walkForward.verdict === "robust_research" ||
              runtimeSnapshot?.walkForward.verdict === "paper_demo_review_candidate"
                ? "success"
                : runtimeSnapshot?.walkForward.verdict === "fail"
                  ? "danger"
                  : runtimeSnapshot?.walkForward.verdict === "insufficient_evidence"
                    ? "warning"
                  : "warning"
            }
          >
            {runtimeSnapshot?.walkForward.verdict?.replace(/_/g, " ") ?? "not run"}
          </Badge>
        </CardContent>
      </Card>

      {actionMessage ? (
        <Card className="border-emerald-300/25 bg-emerald-300/10">
          <CardContent className="p-4 text-sm font-medium text-emerald-100">{actionMessage}</CardContent>
        </Card>
      ) : null}

      <Card className="border-amber-300/25 bg-amber-300/10">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Grinch Calibration Proposal Intent</CardTitle>
              <CardDescription>
                Draft proposal only. It chooses the strongest Grinch near-miss family for controlled research, not auto-apply.
              </CardDescription>
            </div>
            <Badge variant={grinchCalibrationIntent ? "warning" : "secondary"}>
              {grinchCalibrationIntent ? "draft available" : "no active no-valid-profile report"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-amber-50">
          {grinchCalibrationIntent ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-amber-300/20 bg-background/35 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Title</p>
                  <p className="mt-1 font-semibold text-foreground">{grinchCalibrationIntent.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{grinchCalibrationIntent.targetSubsystem}</p>
                </div>
                <div className="rounded-lg border border-amber-300/20 bg-background/35 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Current strongest near-miss</p>
                  <p className="mt-1 font-semibold text-foreground">{grinchCalibrationIntent.sourceProfile ?? "unknown profile"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Near miss {grinchCalibrationIntent.nearMissScore ?? "n/a"}/100
                  </p>
                </div>
                <div className="rounded-lg border border-amber-300/20 bg-background/35 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Recommended family</p>
                  <p className="mt-1 font-mono text-sm text-foreground">{grinchCalibrationIntent.candidateFamily.replace(/_/g, " ")}</p>
                  <Badge className="mt-2" variant={executableStatusVariant(grinchCalibrationIntent.executableStatus)}>
                    {grinchCalibrationIntent.executableStatusLabel}
                  </Badge>
                  {grinchCalibrationIntent.replayReview ? (
                    <Badge className="mt-2" variant={replayReviewVariant(grinchCalibrationIntent.replayReview.status)}>
                      replay {grinchCalibrationIntent.replayReview.status.replace(/_/g, " ")}
                    </Badge>
                  ) : null}
                </div>
                <div className="rounded-lg border border-amber-300/20 bg-background/35 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Source context</p>
                  <p className="mt-1 font-mono text-sm text-foreground">
                    {grinchCalibrationIntent.sourceContext?.brokerSymbol ?? "unknown broker symbol"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Requested {grinchCalibrationIntent.sourceContext?.requestedSymbol ?? "unknown"} / {grinchCalibrationIntent.sourceContext?.candleCount ?? 0} candles
                  </p>
                </div>
                <div className="rounded-lg border border-amber-300/20 bg-background/35 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Auto-apply</p>
                  <p className="mt-1 font-mono text-sm text-foreground">blocked</p>
                  <p className="mt-1 text-xs text-muted-foreground">No thresholds or profile gates changed.</p>
                </div>
              </div>
              <div className="rounded-lg border border-amber-300/20 bg-background/35 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Reason</p>
                <p className="mt-1 text-foreground">{grinchCalibrationIntent.reason}</p>
                <p className="mt-2 text-xs text-muted-foreground">{grinchCalibrationIntent.executableStatusReason}</p>
                <p className="mt-1 text-xs text-amber-100">
                  {grinchCalibrationIntent.executableStatus === "executable"
                    ? `Executable Auto Research family: ${grinchCalibrationIntent.executableAutoResearchFamilies.map(formatToken).join(", ")}.`
                    : "Draft only: candidate family is not executable by Auto Research yet."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{grinchCalibrationIntent.nextImplementationStep}</p>
              </div>
              {grinchCalibrationIntent.replayReview ? (
                <div className="rounded-lg border border-amber-300/20 bg-background/35 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Expansion replay review</p>
                    <Badge variant={replayReviewVariant(grinchCalibrationIntent.replayReview.status)}>
                      {grinchCalibrationIntent.replayReview.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs md:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground">Reviewed</p>
                      <p className="mt-1 text-foreground">{grinchCalibrationIntent.replayReview.reviewed ? "yes" : "no"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Failed rule</p>
                      <p className="mt-1 text-foreground">{formatToken(grinchCalibrationIntent.replayReview.failedRule)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Replay near-miss</p>
                      <p className="mt-1 font-mono text-foreground">{grinchCalibrationIntent.replayReview.nearMissScore ?? "n/a"}/100</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Timing zone</p>
                      <p className="mt-1 text-foreground">{grinchCalibrationIntent.replayReview.timingZone ?? "unknown"}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{grinchCalibrationIntent.replayReview.failureReason}</p>
                  <p className="mt-1 text-xs text-amber-100">{grinchCalibrationIntent.replayReview.recommendation}</p>
                </div>
              ) : null}
              <div className="grid gap-2 text-xs md:grid-cols-2">
                <div className="rounded-lg border border-amber-300/20 bg-background/35 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Intent generated</p>
                  <p className="mt-1 font-mono text-foreground">{sourceDateFormat(grinchCalibrationIntent.generatedAt)}</p>
                  <p className="mt-1 truncate text-muted-foreground" title={grinchCalibrationIntent.reportFingerprint}>
                    Report {grinchCalibrationIntent.reportFingerprint}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-300/20 bg-background/35 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Source fingerprint</p>
                  <p className="mt-1 truncate font-mono text-foreground" title={grinchCalibrationIntent.sourceFingerprint}>
                    {grinchCalibrationIntent.sourceFingerprint ?? "unknown"}
                  </p>
                  <p className="mt-1 text-muted-foreground">Prior draft proposals stay historical when this fingerprint changes.</p>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-5">
                {grinchCalibrationIntent.requiredValidationSteps.map((step) => (
                  <div key={step.requirementId} className="rounded-lg border border-amber-300/20 bg-background/35 p-3">
                    <p className="text-xs font-medium text-amber-100">{step.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={createGrinchDraftProposal} disabled={!grinchCalibrationDraftProposal && !existingGrinchDraftProposal}>
                  {existingGrinchDraftProposal ? "Open existing Grinch draft" : "Create Grinch draft proposal"}
                </Button>
                <Badge variant="warning">draft proposal only</Badge>
                <Badge variant="muted">authority none</Badge>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              No Grinch no-valid-profile calibration report is active. Run an MT5 research cycle that produces a Grinch
              profile report before creating a draft proposal intent.
            </div>
          )}
        </CardContent>
      </Card>

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
          <CardTitle>Dashboard vs Proposal Metrics</CardTitle>
          <CardDescription>
            Use this panel to separate latest-cycle results from stored proposal before/after snapshots.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <MetricSourceComparisonTable
            latestCycle={latestCycleCanonicalMetrics}
            proposalBefore={snapshotBeforeMetrics}
            proposalAfter={snapshotAfterMetrics}
          />
          {metricSourceWarningActive ? (
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              These numbers come from different sources. A Dashboard win rate like 50% and a proposal snapshot win rate
              like 41% can both be correct when they come from different cycles, candidates, candle windows, or active
              calibrations.
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">
              Metrics are from the same cycle/source.
            </div>
          )}
          {proposalIsNoOp ? (
            <div className="rounded-lg border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-100">
              Proposal Before equals Proposal After across all material metrics. This is either a no-op proposal or a
              snapshot error; approval stays disabled until a candidate snapshot shows a real baseline-vs-candidate
              difference.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {latestProposal && showMetricMismatchWarning ? (
        <Card className="border-red-300/30 bg-red-300/10">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{proposalIsNoOp ? "No-Op Proposal Guard" : "Metric Snapshot Guard"}</CardTitle>
                <CardDescription>
                  {proposalIsNoOp
                    ? "Approval is blocked because Proposal Before and Proposal After are identical."
                    : "Approval is blocked until the canonical proposal snapshot matches the source candidate evidence."}
                </CardDescription>
              </div>
              <Badge variant="danger">approval blocked</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-red-50">
            <p>
              {proposalIsNoOp
                ? "Do not approve - no material change detected. This proposal does not materially change the baseline."
                : "Metric mismatch detected: candidate summary and proposal snapshot disagree."}
            </p>
            <ul className="space-y-1 text-xs text-red-100/85">
              {proposalMismatchReasons.length ? (
                proposalMismatchReasons.map((reason) => <li key={reason}>{reason}</li>)
              ) : (
                <li>Proposal has no material before/after metric change.</li>
              )}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={rebuildProposalSnapshot} disabled={!sourceCandidateForLatestProposal || !latestProposalPersisted}>
                Rebuild proposal snapshot from source candidate
              </Button>
              {!sourceCandidateForLatestProposal ? (
                <span className="text-xs text-red-100/70">Source candidate is missing from the latest compact cycle. Rerun the AI Research Cycle if needed.</span>
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
                    : effectiveProposalIntent === "grinch_profile_calibration_intent"
                      ? "Grinch profile calibration intent only. It is a draft investigation target and does not change strategy thresholds."
                    : "Manual proposal. It still requires simulation testing and explicit approval."
                : "No proposal has been created yet."}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-xs text-muted-foreground">Autonomous loop status</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge
                variant={
                  latestProposal?.autoApplyStatus === "auto_applied"
                    ? "success"
                    : latestProposal?.autoApplyStatus === "blocked"
                      ? "warning"
                      : "secondary"
                }
              >
                {latestProposal?.autoApplyStatus?.replace(/_/g, " ") ?? "not evaluated"}
              </Badge>
              {latestProposal?.autoApplyRunId ? <Badge variant="muted">{latestProposal.autoApplyRunId}</Badge> : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {latestProposal?.autoApplyStatus === "auto_applied"
                ? "Auto-applied as a research-only calibration. Rerun validation and readiness before any further review."
                : latestProposal?.autoApplyStatus === "blocked"
                  ? `Blocked: ${latestProposal.autoApplyBlockedReasons?.[0] ?? "autonomy safety policy did not allow auto-apply."}`
                : "No autonomous auto-apply decision has been recorded for this proposal."}
            </p>
          </div>
          {latestProposal?.proposalIntentDetails ? (
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 md:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-amber-100/75">Draft intent details</p>
                  <p className="mt-1 text-base font-semibold text-amber-50">{latestProposal.proposalIntentDetails.title}</p>
                  <p className="mt-1 text-sm text-amber-100/80">{latestProposal.proposalIntentDetails.reason}</p>
                  {latestProposalIntentIsStale ? (
                    <p className="mt-2 rounded-md border border-amber-300/25 bg-amber-300/10 p-2 text-xs text-amber-100">
                      Historical draft: the current calibration report/source fingerprint no longer matches this proposal.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="warning">draft proposal only</Badge>
                  <Badge variant={executableStatusVariant(latestProposal.proposalIntentDetails.executableStatus)}>
                    {latestProposal.proposalIntentDetails.executableStatusLabel}
                  </Badge>
                  {latestProposal.proposalIntentDetails.replayReview ? (
                    <Badge variant={replayReviewVariant(latestProposal.proposalIntentDetails.replayReview.status)}>
                      replay {latestProposal.proposalIntentDetails.replayReview.status.replace(/_/g, " ")}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <div className="rounded-md border border-amber-300/20 bg-background/35 p-2">
                  <p className="text-xs text-muted-foreground">Target subsystem</p>
                  <p className="mt-1 text-sm text-foreground">{latestProposal.proposalIntentDetails.targetSubsystem}</p>
                </div>
                <div className="rounded-md border border-amber-300/20 bg-background/35 p-2">
                  <p className="text-xs text-muted-foreground">Candidate family</p>
                  <p className="mt-1 font-mono text-sm text-foreground">
                    {latestProposal.proposalIntentDetails.candidateFamily.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-md border border-amber-300/20 bg-background/35 p-2">
                  <p className="text-xs text-muted-foreground">Auto-apply</p>
                  <p className="mt-1 font-mono text-sm text-foreground">
                    {latestProposal.proposalIntentDetails.autoApplyAllowed ? "allowed" : "blocked"}
                  </p>
                </div>
                <div className="rounded-md border border-amber-300/20 bg-background/35 p-2">
                  <p className="text-xs text-muted-foreground">Generated</p>
                  <p className="mt-1 font-mono text-sm text-foreground">{sourceDateFormat(latestProposal.proposalIntentDetails.generatedAt)}</p>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-amber-300/20 bg-background/35 p-2 text-xs">
                <p className="text-muted-foreground">Executable awareness</p>
                <p className="mt-1 text-foreground">{latestProposal.proposalIntentDetails.executableStatusReason}</p>
                <p className="mt-1 text-muted-foreground">
                  {latestProposal.proposalIntentDetails.executableStatus === "executable"
                    ? `Mapped Auto Research families: ${latestProposal.proposalIntentDetails.executableAutoResearchFamilies.map(formatToken).join(", ")}.`
                    : `Closest existing families: ${
                        latestProposal.proposalIntentDetails.closestAutoResearchFamilies.length
                          ? latestProposal.proposalIntentDetails.closestAutoResearchFamilies.map(formatToken).join(", ")
                          : "none"
                      }.`}
                </p>
                <p className="mt-1 text-amber-100">{latestProposal.proposalIntentDetails.nextImplementationStep}</p>
                <p className="mt-2 truncate text-muted-foreground" title={latestProposal.proposalIntentDetails.reportFingerprint}>
                  Report fingerprint: {latestProposal.proposalIntentDetails.reportFingerprint}
                </p>
                <p className="mt-1 truncate text-muted-foreground" title={latestProposal.proposalIntentDetails.sourceFingerprint}>
                  Source fingerprint: {latestProposal.proposalIntentDetails.sourceFingerprint ?? "unknown"}
                </p>
              </div>
              {latestProposal.proposalIntentDetails.replayReview ? (
                <div className="mt-3 rounded-md border border-amber-300/20 bg-background/35 p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-muted-foreground">Expansion replay review</p>
                    <Badge variant={replayReviewVariant(latestProposal.proposalIntentDetails.replayReview.status)}>
                      {latestProposal.proposalIntentDetails.replayReview.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-foreground">
                    Replay evidence reviewed: {latestProposal.proposalIntentDetails.replayReview.reviewed ? "yes" : "no"}.
                    Failed rule: {formatToken(latestProposal.proposalIntentDetails.replayReview.failedRule)}.
                    Near miss: {latestProposal.proposalIntentDetails.replayReview.nearMissScore ?? "n/a"}/100.
                  </p>
                  <p className="mt-1 text-muted-foreground">{latestProposal.proposalIntentDetails.replayReview.failureReason}</p>
                  <p className="mt-1 text-amber-100">{latestProposal.proposalIntentDetails.replayReview.recommendation}</p>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1">
                {latestProposal.proposalIntentDetails.requiredValidationSteps.map((step) => (
                  <Badge key={step.requirementId} variant="secondary">{step.label} required</Badge>
                ))}
              </div>
            </div>
          ) : null}
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
      <Card className="mt-5">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Proposal Impact Report</CardTitle>
              <CardDescription>
                Jesse-inspired before/after surface for regression warnings, regime effect, walk-forward effect, and auto-apply eligibility.
              </CardDescription>
            </div>
            <Badge variant={latestProposal ? "warning" : "secondary"}>
              {latestProposal ? latestProposal.status : "no current proposal"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {latestProposal ? (
            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Before metrics", snapshotBeforeMetrics ? `${snapshotBeforeMetrics.totalTrades} trades` : "n/a", snapshotBeforeMetrics ? `Win ${formatPercent(snapshotBeforeMetrics.winRate, 1)} / avg ${formatNumber(snapshotBeforeMetrics.averageR)}R` : "No proposal snapshot"],
                ["After metrics", snapshotAfterMetrics ? `${snapshotAfterMetrics.totalTrades} trades` : "not tested", snapshotAfterMetrics ? `Win ${formatPercent(snapshotAfterMetrics.winRate, 1)} / avg ${formatNumber(snapshotAfterMetrics.averageR)}R` : "Run simulation test"],
                ["Delta average R", snapshotBeforeMetrics && snapshotAfterMetrics ? `${formatNumber(snapshotAfterMetrics.averageR - snapshotBeforeMetrics.averageR)}R` : "n/a", "After minus before"],
                ["Regression warnings", String(snapshotComparisonResult?.criticalRegressions.length ?? 0), snapshotComparisonResult?.criticalRegressions[0] ?? "No comparison warning"],
                ["Regime-specific effect", "not segmented", "Proposal impact by regime is planned"],
                ["Walk-forward effect", runtimeSnapshot?.walkForward.proposalValidated ? "validated" : "not validated", runtimeSnapshot?.walkForward.recommendedNextAction ?? "Run walk-forward"],
                ["Auto-apply effect", latestProposal.autoApplyStatus?.replace(/_/g, " ") ?? "not evaluated", latestProposal.autoApplyBlockedReasons?.[0] ?? "Manual approval remains required"],
                ["Authority", "none", "Proposal cannot execute or override readiness"]
              ].map(([label, value, detail]) => (
                <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              No current proposal available.
            </div>
          )}
        </CardContent>
      </Card>
      <div className="mt-5 rounded-lg border border-border bg-background/45 p-3 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Advanced detail: runtime snapshot diagnostics</div>
        <div>Snapshot ID: {runtimeSnapshot?.snapshotId ?? "not loaded"}</div>
        <div>Metrics source: {selectRuntimeMetricSourceLabel(runtimeSnapshot)}</div>
        <div>Source trace: {runtimeSnapshot?.diagnostics.sourceTrace.join(" + ") ?? "n/a"}</div>
        {runtimeWarnings.length ? (
          <div className="mt-2 text-amber-100">Warnings: {runtimeWarnings.join(" ")}</div>
        ) : (
          <div className="mt-2 text-emerald-100">No runtime snapshot mismatch warnings.</div>
        )}
      </div>
      <div className="mt-5">
        <MetricProvenanceDetails snapshot={runtimeSnapshot} source={latestProposal?.metricsSnapshot ? "proposal_snapshot" : "latest_cycle"} />
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
                    <p className="mt-1 font-mono text-sm">{latestProposal.baselineStabilityScore ?? snapshotBeforeMetrics?.stabilityScore ?? "n/a"}</p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
                    <p className="text-xs text-muted-foreground">Score after</p>
                    <p className="mt-1 font-mono text-sm">{latestProposal.candidateStabilityScore ?? snapshotAfterMetrics?.stabilityScore ?? "not tested"}</p>
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
            {isTradeQualityCalibration && latestProposal ? (
              <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/75">Trade quality proposal</p>
                    <p className="mt-1 text-sm text-cyan-50">
                      Targets {problemLabel(latestProposal.targetProblem)} without granting readiness or execution authority.
                    </p>
                  </div>
                  <Badge variant={tradeQualitySampleAcceptable ? "success" : "warning"}>
                    {tradeQualitySampleAcceptable ? "sample acceptable" : "sample needs follow-up"}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Win rate", snapshotBeforeMetrics ? formatPercent(snapshotBeforeMetrics.winRate, 1) : "n/a", snapshotAfterMetrics ? formatPercent(snapshotAfterMetrics.winRate, 1) : "not tested"],
                    ["Average R", snapshotBeforeMetrics ? `${formatNumber(snapshotBeforeMetrics.averageR)}R` : "n/a", snapshotAfterMetrics ? `${formatNumber(snapshotAfterMetrics.averageR)}R` : "not tested"],
                    ["Max drawdown", snapshotBeforeMetrics ? `${formatNumber(snapshotBeforeMetrics.maxDrawdown)}R` : "n/a", snapshotAfterMetrics ? `${formatNumber(snapshotAfterMetrics.maxDrawdown)}R` : "not tested"],
                    ["Trades", String(snapshotBeforeMetrics?.totalTrades ?? "n/a"), snapshotAfterMetrics ? String(snapshotAfterMetrics.totalTrades) : "not tested"]
                  ].map(([label, beforeValue, afterValue]) => (
                    <div key={label} className="rounded-md border border-cyan-200/20 bg-cyan-200/5 p-2">
                      <p className="text-xs text-cyan-100/70">{label}</p>
                      <p className="mt-1 font-mono text-sm text-cyan-50">
                        {beforeValue} <span className="text-cyan-100/45">to</span> {afterValue}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {tradeQualityFocusLabels.length ? (
                    tradeQualityFocusLabels.map((label) => <Badge key={label} variant="secondary">{label}</Badge>)
                  ) : (
                    <Badge variant="muted">No focused config patch detected</Badge>
                  )}
                </div>
                <p className="mt-3 text-xs text-cyan-100/75">
                  Sample guard: after-metrics should keep at least {tradeQualitySampleMinimum} trades. If it falls below that,
                  treat the proposal as a follow-up candidate, not an approval-ready calibration.
                </p>
                {snapshotAfterMetrics ? (
                  <p className={`mt-2 rounded-md border p-2 text-xs ${
                    tradeQualityWinRateImproved && tradeQualityAverageRImproved
                      ? "border-emerald-200/20 bg-emerald-200/5 text-emerald-100"
                      : "border-amber-200/25 bg-amber-200/10 text-amber-100"
                  }`}>
                    {tradeQualityWinRateImproved && tradeQualityAverageRImproved
                      ? "Win rate and average R improved in the simulation result. Manual approval is still required."
                      : "Do not approve if win rate or average R did not improve. Run the next targeted quality test first."}
                  </p>
                ) : null}
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
            <CardTitle>Original Proposal Snapshot</CardTitle>
            <CardDescription>Default view uses the canonical metrics captured when this proposal was created.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <MetricsGrid metrics={snapshotAfterMetrics} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Before/After Comparison</CardTitle>
            <CardDescription>Promotion requires stability improvement, not merely higher profit. Values come from the original proposal snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ComparisonTable before={snapshotBeforeMetrics} after={snapshotAfterMetrics} />
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Comparison</span>
                <Badge variant={verdictVariant(snapshotComparisonResult?.promotionVerdict)}>
                  {formatToken(snapshotComparisonResult?.promotionVerdict)}
                </Badge>
              </div>
              <p className="text-muted-foreground">{snapshotComparisonResult?.summary ?? "Run a simulation test to compare."}</p>
            </div>
            {snapshotComparisonResult && (
              <>
                {safeArray(snapshotComparisonResult.criticalRegressions).length ? (
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
                      {safeArray(snapshotComparisonResult.criticalRegressions).map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3">
                    <p className="mb-2 font-medium text-emerald-100">Improved metrics</p>
                    <ul className="space-y-1 text-xs text-emerald-50">
                      {safeArray(snapshotComparisonResult.improvedMetrics).map((item) => <li key={item}>{item}</li>)}
                      {!safeArray(snapshotComparisonResult.improvedMetrics).length && <li>None</li>}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-red-300/25 bg-red-300/10 p-3">
                    <p className="mb-2 font-medium text-red-100">Worsened metrics</p>
                    <ul className="space-y-1 text-xs text-red-50">
                      {safeArray(snapshotComparisonResult.worsenedMetrics).map((item) => <li key={item}>{item}</li>)}
                      {!safeArray(snapshotComparisonResult.worsenedMetrics).length && <li>None</li>}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3">
                    <p className="mb-2 font-medium text-amber-100">Sanity checks</p>
                    <ul className="space-y-1 text-xs text-amber-50">
                      {safeArray(snapshotComparisonResult.sanityWarnings).map((item) => <li key={item}>{item}</li>)}
                      {!safeArray(snapshotComparisonResult.sanityWarnings).length && <li>No suspicious metric pattern found.</li>}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3">
                    <p className="mb-2 font-medium text-cyan-100">Recommended follow-up</p>
                    <p className="text-xs text-cyan-50">
                      {snapshotComparisonResult.followUpSearchDirection ??
                        "Run a different candidate search focused on win rate, average R, drawdown, session filter, or stop model."}
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
          {metricSourceWarningActive ? (
            <div className="xl:col-span-2 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              Approval note: this proposal snapshot is from an older or candidate-specific source compared with the latest
              Dashboard cycle. You can still approve a valid proposal, but treat its before/after metrics as the stored
              proposal evidence, not the latest-cycle performance result.
            </div>
          ) : null}
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
        title="View proposal metric diagnostics"
        description="Open for the canonical snapshot IDs and storage trace used to keep Dashboard, Auto Research, and Self-Improvement aligned."
      >
        <Card>
          <CardHeader>
            <CardTitle>Canonical Proposal Snapshot Diagnostics</CardTitle>
            <CardDescription>
              These values should match the Dashboard proposal link and the Auto Research source candidate for the same proposal ID.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Before metrics source", latestProposal?.metricsSnapshot?.beforeMetricsSource ?? "baseline metrics before candidate change"],
              ["After metrics source", latestProposal?.metricsSnapshot?.afterMetricsSource ?? "tested candidate metrics"],
              ["Before source cycle ID", latestProposal?.metricsSnapshot?.beforeSourceCycleId ?? latestProposal?.metricsSnapshot?.sourceCycleId ?? "none"],
              ["After source candidate ID", latestProposal?.metricsSnapshot?.afterSourceCandidateId ?? latestProposal?.metricsSnapshot?.sourceCandidateId ?? "none"],
              ["Dashboard proposal ID", latestCycleRun?.createdProposalId ?? generatedProposalId ?? "none"],
              ["Self-Improvement proposal ID", latestProposal?.proposalId ?? "none"],
              ["Source candidate ID", latestProposal?.metricsSnapshot?.sourceCandidateId ?? latestProposal?.sourceCandidateId ?? "none"],
              ["Source cycle ID", latestProposal?.metricsSnapshot?.sourceCycleId ?? latestCycleRun?.autoResearchCycle?.cycleId ?? latestCycleRun?.cycleId ?? "none"],
              ["Metric snapshot timestamp", formatDate(latestProposal?.metricsSnapshot?.generatedAt)],
              ["Data source", latestProposal?.metricsSnapshot?.dataSource ?? latestCycleRun?.dataSourceLabel ?? "unknown"],
              ["Candle window", latestProposal?.metricsSnapshot?.candleWindow ?? "missing"],
              ["Active calibration used", latestProposal?.metricsSnapshot?.activeCalibrationIdUsed ?? "none"],
              ["Latest cycle metrics ID", latestCycleCanonicalMetrics?.sourceCycleId ?? "none"],
              ["Latest cycle data source", latestCycleCanonicalMetrics?.dataSource ?? "n/a"],
              ["Latest cycle generated", formatDate(latestCycleCanonicalMetrics?.generatedAt)],
              ["Mismatch status", proposalMismatchReasons.length ? proposalMismatchReasons.join(" ") : proposalHasMaterialChange ? "none" : "no material metric change"],
              ["Source candidate available", sourceCandidateForLatestProposal ? "yes" : "no"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                <p className="mt-1 break-words font-mono text-xs text-foreground">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </TechnicalDetails>

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
