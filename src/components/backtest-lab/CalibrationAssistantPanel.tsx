import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Compass, Lightbulb, Route, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BacktestResult, ResolvedBacktestConfig } from "@/lib/backtesting";
import { evaluateReadinessGate, loadManualApprovalRecord } from "@/lib/readiness";
import { loadLatestResearchQualityReview } from "@/lib/researchQuality";
import { countCompletedRunbookItems, loadSimulationRunbookState, simulationRunbookChecklist } from "@/lib/simulationRunbook";
import { loadLatestValidationReport } from "@/lib/validation";

const routeLinks = [
  { label: "Backtest Lab", href: "/backtest-lab" },
  { label: "Validation", href: "/validation" },
  { label: "Research Quality", href: "/research-quality" },
  { label: "Readiness Gate", href: "/readiness-gate" }
];

const readinessReasons = [
  "Drawdown is too high or clustered.",
  "Win rate is unstable across scenario slices.",
  "Average R is weak or depends on one large winner.",
  "False positives remain unexplained.",
  "Confidence or confluence thresholds are too loose.",
  "Session performance is weak or inconsistent.",
  "Stop model is too loose, too tight, or fragile.",
  "There are not enough trades to trust the sample.",
  "Aggressive settings look better than conservative settings."
];

const beginnerRecommendations = [
  "Change only one variable at a time.",
  "Start with conservative thresholds before chasing more trades.",
  "Compare NY AM vs London before using all sessions.",
  "Compare long-only and short-only performance separately.",
  "Compare latest swing, fixed ticks, and FVG invalidation stops.",
  "Prefer stable average R and controlled drawdown over highest profit."
];

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

function suggestedNextAdjustment(result: BacktestResult, config: ResolvedBacktestConfig) {
  const { summary } = result;
  if (summary.maxDrawdown >= 4) {
    return "Drawdown is high. Increase minimum confluence or confidence by 0.05, or restrict the session filter before rerunning.";
  }
  if (summary.totalTrades < 2 && summary.skippedSignals > 0) {
    return "Too few trades passed. Slightly lower one threshold by 0.05 or widen the session filter, then rerun.";
  }
  if (summary.winRate < 0.45 && summary.totalTrades >= 2) {
    return "Win rate is weak. Test NY AM vs London and compare stop models before changing target R.";
  }
  if (summary.averageR < 0.1 && summary.totalTrades >= 2) {
    return "Average R is weak. Compare target R multiple and stop model; do not raise risk to force better results.";
  }
  if (summary.skippedSignals > Math.max(3, summary.totalTrades * 2)) {
    return "Skipped signals are high. Inspect confluence, confidence, and agent weights before lowering every gate.";
  }
  if (config.minimumConfluenceThreshold < 0.35 || config.minimumConfidenceThreshold < 0.35) {
    return "Thresholds are aggressive. Run a conservative check before treating this result as meaningful.";
  }
  return "Next best step: keep this config as the baseline, run the validation suite, then compare research quality findings.";
}

export function CalibrationAssistantPanel({ result, config }: { result: BacktestResult; config: ResolvedBacktestConfig }) {
  const validation = loadLatestValidationReport();
  const quality = loadLatestResearchQualityReview();
  const runbook = loadSimulationRunbookState();
  const approval = loadManualApprovalRecord();
  const gate = evaluateReadinessGate({ validation, quality, runbook });
  const conservative = validation?.scenarios.find((scenario) => scenario.id === "conservative-confluence");
  const runbookComplete = countCompletedRunbookItems(runbook) === simulationRunbookChecklist.length;
  const pathChecks = [
    { label: "Baseline run complete", passed: result.decisions.length > 0 },
    { label: "Conservative scenario stable", passed: conservative?.readiness === "green" },
    { label: "Validation suite complete", passed: Boolean(validation) },
    { label: "Research quality review complete", passed: Boolean(quality) },
    { label: "Simulation runbook passed", passed: runbookComplete },
    { label: "Readiness gate reviewed", passed: approval.auditTrail.length > 0 }
  ];

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Calibration Assistant</CardTitle>
            </div>
            <CardDescription>Beginner-friendly help for why readiness may fail and what to try next.</CardDescription>
          </div>
          <Badge variant={gate.state === "Paper-Demo Candidate" ? "success" : gate.state === "Research Ready" ? "warning" : "danger"}>
            {gate.state}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
          <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
          Simulation calibration only. Do not connect broker execution until readiness is repeatedly Paper-Demo
          Candidate under conservative settings.
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-200" aria-hidden="true" />
                Why Readiness May Fail
              </div>
              <div className="grid gap-2">
                {readinessReasons.map((reason) => (
                  <div key={reason} className="rounded-md border border-border bg-card/45 px-3 py-2 text-sm text-muted-foreground">
                    {reason}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
                Suggested Next Adjustment
              </div>
              <p className="text-sm text-muted-foreground">{suggestedNextAdjustment(result, config)}</p>
              <div className="mt-3 grid gap-2 font-mono text-xs text-muted-foreground sm:grid-cols-2">
                <span>Win {formatPercent(result.summary.winRate)}</span>
                <span>Avg R {result.summary.averageR.toFixed(2)}</span>
                <span>DD {result.summary.maxDrawdown.toFixed(2)}R</span>
                <span>Skipped {result.summary.skippedSignals}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="mb-3 text-sm font-semibold">Beginner Recommendations</div>
              <div className="grid gap-2 md:grid-cols-2">
                {beginnerRecommendations.map((item) => (
                  <div key={item} className="rounded-md border border-border bg-card/45 px-3 py-2 text-sm text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Route className="h-4 w-4 text-primary" aria-hidden="true" />
                Readiness Path
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {pathChecks.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/45 px-3 py-2 text-sm">
                    <span>{item.label}</span>
                    <Badge variant={item.passed ? "success" : "warning"}>{item.passed ? "done" : "open"}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {routeLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background/60 px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
