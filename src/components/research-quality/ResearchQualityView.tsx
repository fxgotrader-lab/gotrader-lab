import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Download,
  Gauge,
  Layers3,
  Play,
  ShieldAlert,
  SlidersHorizontal,
  Target
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ValidationGuideCard } from "@/components/validation/ValidationGuideCard";
import {
  analyzeValidationResults,
  loadLatestResearchQualityReview,
  saveLatestResearchQualityReview
} from "@/lib/researchQuality";
import type { ResearchQualityReadinessGrade, ResearchQualityReview } from "@/lib/researchQuality";
import {
  loadLatestValidationReport,
  VALIDATION_REPORT_UPDATED_EVENT
} from "@/lib/validation";
import type { ValidationReadinessStatus, ValidationSuiteReport } from "@/lib/validation";

const readinessVariant = (status: ValidationReadinessStatus) =>
  status === "green" ? "success" : status === "yellow" ? "warning" : "danger";

const gradeVariant = (grade: ResearchQualityReadinessGrade) =>
  grade === "Paper-Demo Candidate" ? "success" : grade === "Research Ready" ? "warning" : "danger";

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
const formatR = (value: number) => `${value.toFixed(2)}R`;
const formatProfitFactor = (value: number | null) => (value === null ? "n/a" : value >= 99 ? "uncapped" : value.toFixed(2));

const downloadReview = (review: ResearchQualityReview) => {
  const blob = new Blob([JSON.stringify(review, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gotrader-research-quality-${review.generatedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export function ResearchQualityView() {
  const [validationReport, setValidationReport] = useState<ValidationSuiteReport | undefined>(() =>
    loadLatestValidationReport()
  );
  const [review, setReview] = useState<ResearchQualityReview | undefined>(() => loadLatestResearchQualityReview());

  useEffect(() => {
    const refreshValidationReport = () => setValidationReport(loadLatestValidationReport());
    window.addEventListener(VALIDATION_REPORT_UPDATED_EVENT, refreshValidationReport);
    window.addEventListener("storage", refreshValidationReport);
    return () => {
      window.removeEventListener(VALIDATION_REPORT_UPDATED_EVENT, refreshValidationReport);
      window.removeEventListener("storage", refreshValidationReport);
    };
  }, []);

  const runReview = () => {
    if (!validationReport) {
      return;
    }
    const nextReview = analyzeValidationResults(validationReport);
    saveLatestResearchQualityReview(nextReview);
    setReview(nextReview);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Research quality</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Quality Review</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Turn validation results into a structured decision review: weak ICT assumptions, session quality, false
            positives, drawdown clusters, agent usefulness, and paper-demo readiness.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={runReview} disabled={!validationReport}>
            <Play className="h-4 w-4" aria-hidden="true" />
            Run Quality Review
          </Button>
          <Button variant="outline" disabled={!review} onClick={() => review && downloadReview(review)}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export JSON
          </Button>
        </div>
      </div>

      <Card className="border-amber-300/25 bg-amber-300/10">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span>Simulation/backtesting review only. No broker connection. No real trades.</span>
          </div>
          <Badge variant="warning">No execution path</Badge>
        </CardContent>
      </Card>

      <ValidationGuideCard compact />

      {!validationReport ? (
        <Card>
          <CardHeader>
            <CardTitle>Run Validation First</CardTitle>
            <CardDescription>
              Research quality review needs a completed strategy validation report before it can score assumptions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>Go to Validation, run the simulated suite, then return here for quality review.</span>
            <Link
              to="/validation"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              Open Validation
            </Link>
          </CardContent>
        </Card>
      ) : !review ? (
        <Card>
          <CardHeader>
            <CardTitle>Quality Review Ready</CardTitle>
            <CardDescription>
              Latest validation report: {validationReport.generatedAt}. Run the quality review to classify strategy
              readiness.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The review is deterministic and reads only the local validation report stored in this browser.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Readiness Grade</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  {review.readinessGrade}
                  <Badge variant={gradeVariant(review.readinessGrade)}>{review.readinessStatus}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Review generated {review.generatedAt}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Readiness Score</CardDescription>
                <CardTitle className="text-2xl">{review.readinessScore}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Inherited from validation calibration</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>False-Positive Patterns</CardDescription>
                <CardTitle className="text-2xl">{review.falsePositivePatterns.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Estimated from weak scenario outcomes</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Agent Reviews</CardDescription>
                <CardTitle className="text-2xl">{review.agentUsefulness.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Internal research agents only</CardContent>
            </Card>
          </div>

          <Card className={review.readinessGrade === "Paper-Demo Candidate" ? "border-emerald-400/25" : "border-rose-400/25"}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-200" aria-hidden="true" />
                <CardTitle>Broker-Demo Gate</CardTitle>
              </div>
              <CardDescription>{review.recommendedNextStep}</CardDescription>
            </CardHeader>
            <CardContent className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              Do not proceed to broker demo unless readiness is Paper-Demo Candidate.
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top 5 Weaknesses</CardTitle>
                <CardDescription>Assumptions that need more simulated evidence or calibration.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {review.topWeaknesses.map((item) => (
                  <div key={`${item.title}-${item.evidence}`} className="rounded-lg border border-border bg-background/45 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{item.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
                      </div>
                      <Badge variant={readinessVariant(item.severity)}>{item.severity}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{item.evidence}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top 5 Strengths</CardTitle>
                <CardDescription>Current evidence that can be preserved while calibrating.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {review.topStrengths.map((item) => (
                  <div key={`${item.title}-${item.evidence}`} className="rounded-lg border border-border bg-background/45 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{item.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
                      </div>
                      <Badge variant={readinessVariant(item.severity)}>{item.severity}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{item.evidence}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle>Suggested Calibration Changes</CardTitle>
              </div>
              <CardDescription>Human-reviewed changes to consider before rerunning validation.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {review.suggestedCalibrationChanges.map((change) => (
                <div key={`${change.parameter}-${change.suggestedValue}`} className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{change.parameter}</div>
                    <Badge variant={change.priority === "high" ? "danger" : change.priority === "medium" ? "warning" : "muted"}>
                      {change.priority}
                    </Badge>
                  </div>
                  <div className="mt-2 font-mono text-sm">{change.suggestedValue}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{change.rationale}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
                  <CardTitle>Session Comparison</CardTitle>
                </div>
                <CardDescription>NY AM vs London validation slices.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-3 pr-4 font-medium">Session</th>
                        <th className="py-3 pr-4 font-medium">Ready</th>
                        <th className="py-3 pr-4 font-medium">Trades</th>
                        <th className="py-3 pr-4 font-medium">Win</th>
                        <th className="py-3 pr-4 font-medium">Avg R</th>
                        <th className="py-3 pr-4 font-medium">PF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {review.sessionComparison.map((session) => (
                        <tr key={session.session}>
                          <td className="py-3 pr-4">
                            <div className="font-medium">{session.session}</div>
                            <div className="text-xs text-muted-foreground">{session.note}</div>
                          </td>
                          <td className="py-3 pr-4">
                            <Badge variant={readinessVariant(session.readiness)}>{session.readiness}</Badge>
                          </td>
                          <td className="py-3 pr-4 font-mono">{session.totalTrades}</td>
                          <td className="py-3 pr-4 font-mono">{formatPercent(session.winRate)}</td>
                          <td className="py-3 pr-4 font-mono">{formatR(session.averageR)}</td>
                          <td className="py-3 pr-4 font-mono">{formatProfitFactor(session.profitFactor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
                  <CardTitle>Threshold Sensitivity</CardTitle>
                </div>
                <CardDescription>How confluence and confidence filters changed simulated quality.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[review.confluenceThresholdSensitivity, review.confidenceThresholdSensitivity].map((sensitivity) => (
                  <div key={sensitivity.dimension} className="rounded-lg border border-border bg-background/45 p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium capitalize">{sensitivity.dimension}</div>
                      <Badge variant={Math.abs(sensitivity.scoreSpread) >= 10 ? "warning" : "muted"}>
                        score spread {sensitivity.scoreSpread}
                      </Badge>
                    </div>
                    <div className="mt-2 text-muted-foreground">{sensitivity.conclusion}</div>
                    <div className="mt-2 font-mono text-xs text-muted-foreground">
                      Trades spread {sensitivity.tradeSpread}
                    </div>
                  </div>
                ))}
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="font-medium">Long vs short</div>
                  <div className="mt-1 text-muted-foreground">{review.longShortComparison.note}</div>
                  <div className="mt-2 font-mono text-xs text-muted-foreground">
                    Best {review.longShortComparison.bestDirection}; worst {review.longShortComparison.worstDirection}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>False Positive Patterns</CardTitle>
              <CardDescription>Scenarios where confidence, confluence, or target logic produced fragile theses.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-3 pr-4 font-medium">Scenario</th>
                      <th className="py-3 pr-4 font-medium">Est. False Positives</th>
                      <th className="py-3 pr-4 font-medium">Win</th>
                      <th className="py-3 pr-4 font-medium">Confidence</th>
                      <th className="py-3 pr-4 font-medium">Worst R</th>
                      <th className="py-3 pr-4 font-medium">Mitigation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {review.falsePositivePatterns.map((pattern) => (
                      <tr key={pattern.scenarioName} className="align-top">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{pattern.scenarioName}</div>
                          <div className="text-xs text-muted-foreground">{pattern.pattern}</div>
                        </td>
                        <td className="py-3 pr-4 font-mono">{pattern.estimatedFalsePositives}</td>
                        <td className="py-3 pr-4 font-mono">{formatPercent(pattern.winRate)}</td>
                        <td className="py-3 pr-4 font-mono">{formatPercent(pattern.averageConfidence)}</td>
                        <td className="py-3 pr-4 font-mono">{formatR(pattern.worstR)}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{pattern.mitigation}</td>
                      </tr>
                    ))}
                    {!review.falsePositivePatterns.length && (
                      <tr>
                        <td className="py-4 text-muted-foreground" colSpan={6}>
                          No major false-positive pattern was isolated in the latest mock validation sample.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Drawdown Cluster Notes</CardTitle>
                <CardDescription>Risk concentrations that should block premature demo planning.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {review.drawdownClusters.slice(0, 6).map((cluster) => (
                  <div key={cluster.scenarioName} className="rounded-lg border border-border bg-background/45 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{cluster.scenarioName}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{cluster.notes}</div>
                      </div>
                      <Badge variant={readinessVariant(cluster.clusterRisk)}>{cluster.clusterRisk}</Badge>
                    </div>
                    <div className="mt-2 font-mono text-xs text-muted-foreground">
                      Max DD {formatR(cluster.maxDrawdown)}; worst {formatR(cluster.worstTradeR)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-primary" aria-hidden="true" />
                  <CardTitle>Agent Usefulness</CardTitle>
                </div>
                <CardDescription>Whether internal agents contributed useful CIO alignment.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-3 pr-4 font-medium">Agent</th>
                        <th className="py-3 pr-4 font-medium">Score</th>
                        <th className="py-3 pr-4 font-medium">Align</th>
                        <th className="py-3 pr-4 font-medium">Confidence</th>
                        <th className="py-3 pr-4 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {review.agentUsefulness.map((agent) => (
                        <tr key={agent.agentId}>
                          <td className="py-3 pr-4">
                            <div className="font-medium">{agent.name}</div>
                            <div className="text-xs text-muted-foreground">{agent.evidence}</div>
                          </td>
                          <td className="py-3 pr-4 font-mono">{agent.usefulnessScore}</td>
                          <td className="py-3 pr-4 font-mono">{formatPercent(agent.averageAlignment)}</td>
                          <td className="py-3 pr-4 font-mono">{formatPercent(agent.averageConfidence)}</td>
                          <td className="py-3 pr-4">
                            <Badge variant={agent.recommendation === "increase" ? "success" : agent.recommendation === "decrease" ? "danger" : "muted"}>
                              {agent.recommendation}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle>Invalidation / Target Quality</CardTitle>
              </div>
              <CardDescription>Stop model and target placement quality from simulated outcomes.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {review.invalidationTargetQuality.map((item) => (
                <div key={item.model} className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="font-medium">{item.model}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground">
                    <span>Avg {formatR(item.averageR)}</span>
                    <span>DD {formatR(item.maxDrawdown)}</span>
                    <span>Best {formatR(item.bestTradeR)}</span>
                    <span>Worst {formatR(item.worstTradeR)}</span>
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">{item.verdict}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
