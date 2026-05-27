import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardList, PauseCircle, RotateCcw, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { MetricProvenanceDetails } from "@/components/common/MetricProvenanceDetails";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  allowResearchOverride,
  approveDemoCandidate,
  evaluateReadinessGate,
  latestApprovalTimestamp,
  loadManualApprovalRecord,
  pauseReadiness,
  rejectDemoCandidate,
  resetReadinessApproval
} from "@/lib/readiness";
import type { ManualApprovalRecord, ReadinessRequirementResult, ReadinessState } from "@/lib/readiness";
import { loadLatestResearchQualityReview } from "@/lib/researchQuality";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeFingerprintLabel,
  selectRuntimeMetricSourceLabel,
  selectRuntimeSourceLabel,
  selectRuntimeWarnings,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";
import { evidenceScoreVariant, selectEvidenceReadinessImpact } from "@/lib/evidence";
import { maturityGradeLabel, maturityGradeVariant, selectMaturityReadinessWarning } from "@/lib/maturity";
import { loadSelfImprovementState } from "@/lib/selfImprovement";
import { countCompletedRunbookItems, loadSimulationRunbookState, simulationRunbookChecklist } from "@/lib/simulationRunbook";
import { loadLatestValidationReport } from "@/lib/validation";

const stateVariant = (state: ReadinessState) =>
  state === "Paper-Demo Candidate" ? "success" : state === "Research Ready" ? "warning" : "danger";

const requirementVariant = (requirement: ReadinessRequirementResult) =>
  requirement.passed ? "success" : requirement.severity === "blocker" ? "danger" : "warning";

const approvalVariant = (status: ManualApprovalRecord["status"]) =>
  status === "approved"
    ? "success"
    : status === "rejected"
      ? "danger"
      : status === "paused" || status === "research_override"
        ? "warning"
        : "muted";

const routeLabels: Record<string, string> = {
  "/validation": "Run Validation",
  "/research-quality": "Run Research Quality",
  "/simulation-runbook": "Complete Simulation Runbook",
  "/backtest-lab": "Open Backtest Lab",
  "/readiness-gate": "Review Readiness Gate",
  "/llm-agents": "Open LLM Agents"
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

export function ReadinessGateView() {
  const [validation, setValidation] = useState(() => loadLatestValidationReport());
  const [quality, setQuality] = useState(() => loadLatestResearchQualityReview());
  const [runbook, setRunbook] = useState(() => loadSimulationRunbookState());
  const [approval, setApproval] = useState(() => loadManualApprovalRecord());
  const [selfImprovement, setSelfImprovement] = useState(() => loadSelfImprovementState());
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();
  const [reviewerName, setReviewerName] = useState(approval.reviewerName);
  const [notes, setNotes] = useState("");

  const computedGate = useMemo(
    () =>
      evaluateReadinessGate({
        validation,
        quality,
        runbook
      }),
    [validation, quality, runbook]
  );
  const gate = runtimeSnapshot?.readiness.readinessSnapshot ?? computedGate;
  const runtimeWarnings = selectRuntimeWarnings(runtimeSnapshot);

  const conservative = validation?.scenarios.find((scenario) => scenario.id === "conservative-confluence");
  const maxDrawdown = validation?.scenarios.reduce((max, scenario) => Math.max(max, scenario.maxDrawdown), 0) ?? 0;
  const falsePositiveCount = quality?.falsePositivePatterns.reduce((sum, item) => sum + item.estimatedFalsePositives, 0) ?? 0;
  const averageCalibration = validation?.scenarios.length
    ? validation.scenarios.reduce((sum, scenario) => sum + scenario.confidenceCalibration.score, 0) / validation.scenarios.length
    : 0;
  const sessionConsistency = Boolean(
    quality?.sessionComparison.some((session) => session.readiness !== "red" && session.totalTrades > 0 && session.averageR >= -0.1)
  );
  const runbookCompleted = countCompletedRunbookItems(runbook);
  const runbookCompletionPercent = Math.round((runbookCompleted / simulationRunbookChecklist.length) * 100);
  const missingPages = [
    !validation ? "/validation" : undefined,
    validation && !quality ? "/research-quality" : undefined,
    !runbook.verifiedAt || runbookCompleted < simulationRunbookChecklist.length ? "/simulation-runbook" : undefined
  ].filter((item): item is keyof typeof routeLabels => Boolean(item));
  const latestProposal =
    selfImprovement.proposals.find((proposal) => proposal.proposalId === selfImprovement.latestProposalId) ??
    selfImprovement.proposals[0];
  const latestProposalIntent =
    latestProposal?.proposalIntent ??
    (latestProposal?.sourceCandidateId || latestProposal?.reason.includes("Auto Research")
      ? "research_calibration_candidate"
      : undefined);
  const pendingResearchCalibrationProposal =
    latestProposalIntent === "research_calibration_candidate" &&
    (latestProposal.status === "proposed" || latestProposal.status === "testing");

  const refresh = () => {
    setValidation(loadLatestValidationReport());
    setQuality(loadLatestResearchQualityReview());
    setRunbook(loadSimulationRunbookState());
    setApproval(loadManualApprovalRecord());
    setSelfImprovement(loadSelfImprovementState());
    void resolveResearchRuntimeSnapshot().then(setRuntimeSnapshot).catch(() => undefined);
  };

  useEffect(() => {
    refresh();
  }, []);

  const approve = () => {
    if (gate.state !== "Paper-Demo Candidate") {
      return;
    }
    setApproval(
      approveDemoCandidate({
        gate,
        reviewerName,
        notes,
        validation,
        quality,
        runbook
      })
    );
    setNotes("");
  };

  const reject = () => {
    setApproval(rejectDemoCandidate(gate, reviewerName, notes));
    setNotes("");
  };

  const pause = () => {
    setApproval(pauseReadiness(gate, reviewerName, notes));
    setNotes("");
  };

  const researchOverride = () => {
    setApproval(
      allowResearchOverride(
        gate,
        reviewerName,
        notes || "Research-only override recorded. Paper-Demo Candidate remains blocked."
      )
    );
    setNotes("");
  };

  const reset = () => {
    const approved = window.confirm("Reset local readiness approval state?");
    if (approved) {
      setApproval(resetReadinessApproval(gate, reviewerName, notes || "Manual readiness reset."));
      setNotes("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Readiness gate</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Manual Approval Layer</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Blocks any future paper-demo path unless validation evidence, quality review, runbook verification, and
            local manual approval all agree.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={stateVariant(gate.state)}>{gate.state}</Badge>
          <Badge variant={approvalVariant(approval.status)}>approval: {approval.status}</Badge>
        </div>
      </div>

      <SafetyLockBanner message="Simulation-only readiness gating. Broker execution remains disabled." />

      <Card className="border-amber-300/25 bg-amber-300/10">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-medium">Evidence quality readiness impact</div>
            <div className="mt-1">{selectEvidenceReadinessImpact(runtimeSnapshot?.evidence.evidenceLedgerSummary)}</div>
          </div>
          <Badge variant={evidenceScoreVariant(runtimeSnapshot?.evidence.evidenceQualityScore)}>
            Evidence {runtimeSnapshot?.evidence.evidenceQualityScore ?? 0}/100
          </Badge>
        </CardContent>
      </Card>

      <Card className="border-violet-300/25 bg-violet-300/10">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-violet-100 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-medium">Research maturity readiness impact</div>
            <div className="mt-1">{selectMaturityReadinessWarning(runtimeSnapshot?.maturity.maturitySummary)}</div>
          </div>
          <Badge variant={maturityGradeVariant(runtimeSnapshot?.maturity.maturityGrade)}>
            {maturityGradeLabel(runtimeSnapshot?.maturity.maturityGrade)} / {runtimeSnapshot?.maturity.maturityScore ?? 0}
          </Badge>
        </CardContent>
      </Card>

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
            <div className="text-xs uppercase opacity-70">Actual blockers</div>
            <div className="mt-1 font-mono">{runtimeSnapshot?.readiness.actualBlockers.length ?? gate.failedRequirements.length}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">LLM advisory</div>
            <div className="mt-1 font-mono">{runtimeSnapshot?.llm.advisoryPassed ? "passed" : "missing or not passed"}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Run fingerprint</div>
            <div className="mt-1 break-all font-mono">{selectRuntimeFingerprintLabel(runtimeSnapshot)}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Gate Decision</CardTitle>
            </div>
            <CardDescription>Latest local evidence evaluation. Paper-Demo Candidate requires every check to pass.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-background/45 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Current readiness</div>
                  <div className="mt-1 text-3xl font-semibold">{gate.state}</div>
                  <div className="mt-2 text-sm text-muted-foreground">{gate.recommendedNextStep}</div>
                </div>
                <Badge variant={stateVariant(gate.state)}>{gate.failedRequirements.length} failed</Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <div className="text-xs text-muted-foreground">Passed requirements</div>
                <div className="mt-1 font-mono text-2xl">{gate.passedRequirements.length}</div>
              </div>
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <div className="text-xs text-muted-foreground">Failed requirements</div>
                <div className="mt-1 font-mono text-2xl">{gate.failedRequirements.length}</div>
              </div>
            </div>

            <div className="space-y-2">
              {gate.warnings.map((warning) => (
                <div key={warning} className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                  <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
                  {warning}
                </div>
              ))}
              {pendingResearchCalibrationProposal ? (
                <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                  <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
                  Pending research calibration approval before readiness can be reevaluated.
                  <Link
                    to="/self-improvement"
                    className="ml-2 inline-flex rounded-md border border-amber-200/25 px-2 py-1 text-xs font-medium text-amber-50 transition-colors hover:bg-amber-200/10"
                  >
                    Review proposal
                  </Link>
                </div>
              ) : null}
            </div>

            <Button variant="secondary" onClick={refresh}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Refresh Evidence
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Manual Approval Panel</CardTitle>
            </div>
            <CardDescription>Local single-user approval record. This does not enable broker execution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="readiness-reviewer">Reviewer name</Label>
                <Input
                  id="readiness-reviewer"
                  value={reviewerName}
                  placeholder="local user"
                  onChange={(event) => setReviewerName(event.target.value)}
                />
              </div>
              <div className="rounded-lg border border-border bg-background/45 p-3 text-sm">
                <div className="text-xs text-muted-foreground">Latest approval/rejection timestamp</div>
                <div className="mt-1 font-mono">{latestApprovalTimestamp(approval) ?? "none"}</div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="readiness-notes">Approval or rejection notes</Label>
              <Textarea
                id="readiness-notes"
                value={notes}
                placeholder="Record why this gate is approved, rejected, paused, or reset."
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Button onClick={approve} disabled={gate.state !== "Paper-Demo Candidate"}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Approve Demo Candidate
              </Button>
              <Button variant="destructive" onClick={reject}>
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Reject Demo Candidate
              </Button>
              <Button variant="secondary" onClick={pause}>
                <PauseCircle className="h-4 w-4" aria-hidden="true" />
                Pause Readiness
              </Button>
              <Button variant="outline" onClick={researchOverride}>
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Allow Research Override
              </Button>
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset Readiness
              </Button>
            </div>
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              Approve is disabled unless the evidence gate is Paper-Demo Candidate. Broker execution remains disabled
              even after approval.
            </div>
            <div className="rounded-md border border-primary/25 bg-primary/10 p-3 text-sm text-primary">
              Research Override can mark this as Research Ready for simulation notes only. It cannot mark Paper-Demo
              Candidate and does not permit broker/demo execution.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Why Approval Is Blocked</CardTitle>
          <CardDescription>
            Each gate requirement shows the current value, required value, explanation, and suggested fix. The actual
            Paper-Demo Candidate gate is unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {gate.failedRequirements.length ? (
            gate.failedRequirements.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-lg border border-border bg-background/45 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{item.label}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{item.explanation}</div>
                  </div>
                  <Badge variant={requirementVariant(item)}>failed</Badge>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-border bg-card/45 p-3 text-sm">
                    <div className="text-xs uppercase text-muted-foreground">Current value</div>
                    <div className="mt-1 font-mono">{item.currentValue}</div>
                  </div>
                  <div className="rounded-md border border-border bg-card/45 p-3 text-sm">
                    <div className="text-xs uppercase text-muted-foreground">Required value</div>
                    <div className="mt-1 font-mono">{item.requiredValue}</div>
                  </div>
                </div>
                <div className="mt-3 rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                  {item.suggestedFix}
                  {item.runPage ? (
                    <Link
                      to={item.runPage}
                      className="ml-2 inline-flex rounded-md border border-amber-200/25 px-2 py-1 text-xs font-medium text-amber-50 transition-colors hover:bg-amber-200/10"
                    >
                      {routeLabels[item.runPage]}
                    </Link>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100">
              Approval is not blocked by gate evidence. Manual approval still does not enable broker execution.
            </div>
          )}
          {gate.failedRequirements.length > 3 ? (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              {gate.failedRequirements.length - 3} additional blocker(s) are available in advanced readiness details.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <TechnicalDetails
        title="View all readiness inputs and audit trail"
        description="Open for debug inputs, every requirement row, evidence snapshots, and manual approval history."
      >
      <Card>
        <CardHeader>
          <CardTitle>Debug Readiness Inputs</CardTitle>
          <CardDescription>Raw local inputs used by the readiness debugger.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {missingPages.length ? (
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              Missing required data. Run:{" "}
              {missingPages.map((page, index) => (
                <span key={page}>
                  <Link to={page} className="font-semibold underline decoration-amber-100/40 underline-offset-4">
                    {page}
                  </Link>
                  {index < missingPages.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Latest validation", validation?.generatedAt ?? "missing"],
              ["Latest research quality", quality?.generatedAt ?? "missing"],
              ["Latest simulation runbook", runbook.verifiedAt ?? "missing"],
              ["Current readiness grade", quality?.readinessGrade ?? "missing"],
              ["Conservative scenario", conservative ? `${conservative.readiness}; ${conservative.averageR.toFixed(2)}R` : "missing"],
              ["Max drawdown", `${maxDrawdown.toFixed(2)}R`],
              ["False positives", String(falsePositiveCount)],
              ["Confidence calibration", formatPercent(averageCalibration)],
              ["Session consistency", sessionConsistency ? "pass" : "fail"],
              ["Runbook completion", `${runbookCompletionPercent}%`]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-background/45 p-3 text-sm">
                <div className="text-xs uppercase text-muted-foreground">{label}</div>
                <div className="mt-1 font-mono">{value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3 text-xs text-muted-foreground">
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
        <div className="mt-3">
          <MetricProvenanceDetails snapshot={runtimeSnapshot} />
        </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Failed Requirements</CardTitle>
            <CardDescription>Any failed blocker prevents Paper-Demo Candidate status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {gate.failedRequirements.length ? (
              gate.failedRequirements.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{item.label}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
                    </div>
                    <Badge variant={requirementVariant(item)}>{item.severity}</Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                No failed requirements in the latest evidence snapshot.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Passed Requirements</CardTitle>
            <CardDescription>Evidence that currently supports readiness progression.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {gate.passedRequirements.map((item) => (
              <div key={item.id} className="rounded-lg border border-border bg-background/45 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{item.label}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
                  </div>
                  <Badge variant="success">passed</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evidence Snapshots</CardTitle>
          <CardDescription>Read-only summary of the local inputs used by the gate.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/45 p-3 text-sm">
            <div className="font-medium">Validation</div>
            <div className="mt-2 space-y-1 text-muted-foreground">
              <div>{gate.validationSnapshot?.generatedAt ?? "missing"}</div>
              <div>status {gate.validationSnapshot?.readinessStatus ?? "n/a"}</div>
              <div>score {gate.validationSnapshot?.readinessScore ?? "n/a"}</div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3 text-sm">
            <div className="font-medium">Research Quality</div>
            <div className="mt-2 space-y-1 text-muted-foreground">
              <div>{gate.researchQualitySnapshot?.generatedAt ?? "missing"}</div>
              <div>grade {gate.researchQualitySnapshot?.readinessGrade ?? "n/a"}</div>
              <div>false positives {gate.researchQualitySnapshot?.falsePositiveCount ?? "n/a"}</div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3 text-sm">
            <div className="font-medium">Simulation Runbook</div>
            <div className="mt-2 space-y-1 text-muted-foreground">
              <div>{gate.runbookSnapshot?.verifiedAt ?? "missing"}</div>
              <div>
                checks {gate.runbookSnapshot?.completedChecks ?? 0}/{gate.runbookSnapshot?.totalChecks ?? 10}
              </div>
              <div>broker skipped {String(gate.runbookSnapshot?.brokerExecutionSkipped ?? false)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>Local manual approval history for the readiness gate.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {approval.auditTrail.length ? (
            approval.auditTrail.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-border bg-background/45 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-medium">{entry.action}</div>
                  <Badge variant={stateVariant(entry.readinessState)}>{entry.readinessState}</Badge>
                </div>
                <div className="mt-2 text-muted-foreground">
                  {entry.timestamp} by {entry.reviewerName}
                </div>
                {entry.notes ? <div className="mt-2 rounded-md border border-border bg-card/45 p-2 text-muted-foreground">{entry.notes}</div> : null}
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              No manual approval actions have been recorded yet.
            </div>
          )}
        </CardContent>
      </Card>
      </TechnicalDetails>
    </div>
  );
}
