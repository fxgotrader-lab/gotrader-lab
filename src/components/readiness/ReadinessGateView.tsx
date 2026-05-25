import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, PauseCircle, RotateCcw, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
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
import { loadSimulationRunbookState } from "@/lib/simulationRunbook";
import { loadLatestValidationReport } from "@/lib/validation";

const stateVariant = (state: ReadinessState) =>
  state === "Paper-Demo Candidate" ? "success" : state === "Research Ready" ? "warning" : "danger";

const requirementVariant = (requirement: ReadinessRequirementResult) =>
  requirement.passed ? "success" : requirement.severity === "blocker" ? "danger" : "warning";

const approvalVariant = (status: ManualApprovalRecord["status"]) =>
  status === "approved" ? "success" : status === "rejected" ? "danger" : status === "paused" ? "warning" : "muted";

export function ReadinessGateView() {
  const [validation, setValidation] = useState(() => loadLatestValidationReport());
  const [quality, setQuality] = useState(() => loadLatestResearchQualityReview());
  const [runbook, setRunbook] = useState(() => loadSimulationRunbookState());
  const [approval, setApproval] = useState(() => loadManualApprovalRecord());
  const [reviewerName, setReviewerName] = useState(approval.reviewerName);
  const [notes, setNotes] = useState("");

  const gate = useMemo(
    () =>
      evaluateReadinessGate({
        validation,
        quality,
        runbook
      }),
    [validation, quality, runbook]
  );

  const refresh = () => {
    setValidation(loadLatestValidationReport());
    setQuality(loadLatestResearchQualityReview());
    setRunbook(loadSimulationRunbookState());
    setApproval(loadManualApprovalRecord());
  };

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

      <Card className="border-amber-300/25 bg-amber-300/10">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span>Simulation-only readiness gating. Broker execution remains disabled.</span>
          </div>
          <Badge variant="warning">No execution enabled</Badge>
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
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset Readiness
              </Button>
            </div>
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              Approve is disabled unless the evidence gate is Paper-Demo Candidate. Broker execution remains disabled
              even after approval.
            </div>
          </CardContent>
        </Card>
      </div>

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
    </div>
  );
}
