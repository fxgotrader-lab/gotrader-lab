import { useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Download, Play, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ValidationGuideCard } from "@/components/validation/ValidationGuideCard";
import { mockCandles } from "@/lib/mockData/mockCandles";
import {
  loadLatestValidationReport,
  runValidationSuite,
  saveLatestValidationReport
} from "@/lib/validation";
import type {
  ValidationReadinessStatus,
  ValidationScenarioResult,
  ValidationSuiteReport
} from "@/lib/validation";

const readinessVariant = (status: ValidationReadinessStatus) =>
  status === "green" ? "success" : status === "yellow" ? "warning" : "danger";

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
const formatNumber = (value: number, digits = 2) => value.toFixed(digits);
const formatProfitFactor = (value: number | null) => (value === null ? "n/a" : value >= 99 ? "uncapped" : value.toFixed(2));

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

const downloadReport = (report: ValidationSuiteReport) => {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gotrader-strategy-validation-${report.generatedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const topAgentFor = (scenario: ValidationScenarioResult) =>
  [...scenario.agentContributionSummary].sort(
    (a, b) => b.cioAlignmentRate + b.averageConfidence - (a.cioAlignmentRate + a.averageConfidence)
  )[0];

export function StrategyValidationView() {
  const [report, setReport] = useState<ValidationSuiteReport | undefined>(() => loadLatestValidationReport());
  const [isRunning, setIsRunning] = useState(false);

  const suiteStats = useMemo(() => {
    if (!report) {
      return undefined;
    }
    return {
      totalTrades: report.scenarios.reduce((sum, scenario) => sum + scenario.totalTrades, 0),
      averageWinRate: average(report.scenarios.map((scenario) => scenario.winRate)),
      averageR: average(report.scenarios.map((scenario) => scenario.averageR)),
      greenScenarios: report.scenarios.filter((scenario) => scenario.readiness === "green").length
    };
  }, [report]);

  const runSuite = () => {
    setIsRunning(true);
    const nextReport = runValidationSuite(mockCandles);
    saveLatestValidationReport(nextReport);
    setReport(nextReport);
    setIsRunning(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Strategy validation</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Validation & Calibration</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Run deterministic mock-candle validation across ICT thresholds, sessions, direction filters, and stop
            models before any broker-demo architecture work advances.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={runSuite} disabled={isRunning}>
            <Play className="h-4 w-4" aria-hidden="true" />
            {isRunning ? "Running" : "Run Validation Suite"}
          </Button>
          <Button variant="outline" disabled={!report} onClick={() => report && downloadReport(report)}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export JSON
          </Button>
        </div>
      </div>

      <SafetyLockBanner message="Simulation validation only. Mock OHLC only. No broker connection and no real trades." />

      <TechnicalDetails
        title="View validation methodology"
        description="Open for the full beginner workflow, weekly routine, and anti-overfitting guidance."
      >
        <ValidationGuideCard />
      </TechnicalDetails>

      {!report ? (
        <Card>
          <CardHeader>
            <CardTitle>No Validation Report Yet</CardTitle>
            <CardDescription>
              Run the suite to produce scenario comparisons, readiness scoring, and calibration recommendations.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The suite uses the existing simulation backtest engine and never connects to live data, brokers, or
            execution paths.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Readiness</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  {report.calibration.readinessScore}
                  <Badge variant={readinessVariant(report.calibration.readinessStatus)}>
                    {report.calibration.readinessStatus.toUpperCase()}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Generated {report.generatedAt}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Scenario Trades</CardDescription>
                <CardTitle className="text-2xl">{suiteStats?.totalTrades ?? 0}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Across 10 deterministic validation runs</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Average Win Rate</CardDescription>
                <CardTitle className="text-2xl">{formatPercent(suiteStats?.averageWinRate ?? 0)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Scenario-level average</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Average R</CardDescription>
                <CardTitle className="text-2xl">{formatNumber(suiteStats?.averageR ?? 0)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Mean simulated R multiple</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Green Scenarios</CardDescription>
                <CardTitle className="text-2xl">{suiteStats?.greenScenarios ?? 0}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Conservative evidence gates</CardContent>
            </Card>
          </div>

          <Card className={report.calibration.readinessStatus === "green" ? "border-emerald-400/25" : "border-rose-400/25"}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle>
                  {report.calibration.readinessStatus === "green"
                    ? "Conservative Simulation Gate Cleared"
                    : "Not Ready For Broker Demo"}
                </CardTitle>
              </div>
              <CardDescription>{report.calibration.recommendedNextStep}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Broker-demo implementation remains disabled. Validation is evidence gathering only and does not authorize
              order routing, broker credentials, or live market connectivity.
            </CardContent>
          </Card>

          <TechnicalDetails
            title="View full scenario comparison"
            description="Open for all validation scenario rows, raw metrics, top agent, and confidence calibration."
          >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle>Scenario Comparison</CardTitle>
              </div>
              <CardDescription>Each row is a separate mock-data backtest with a controlled parameter change.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-3 pr-4 font-medium">Scenario</th>
                      <th className="py-3 pr-4 font-medium">Ready</th>
                      <th className="py-3 pr-4 font-medium">Trades</th>
                      <th className="py-3 pr-4 font-medium">Win</th>
                      <th className="py-3 pr-4 font-medium">Avg R</th>
                      <th className="py-3 pr-4 font-medium">Drawdown</th>
                      <th className="py-3 pr-4 font-medium">Best/Worst</th>
                      <th className="py-3 pr-4 font-medium">Skipped</th>
                      <th className="py-3 pr-4 font-medium">PF</th>
                      <th className="py-3 pr-4 font-medium">Calibration</th>
                      <th className="py-3 pr-4 font-medium">Top Agent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.scenarios.map((scenario) => {
                      const topAgent = topAgentFor(scenario);
                      return (
                        <tr key={scenario.id} className="align-top">
                          <td className="py-3 pr-4">
                            <div className="font-medium text-foreground">{scenario.name}</div>
                            <div className="mt-1 max-w-xs text-xs text-muted-foreground">{scenario.description}</div>
                          </td>
                          <td className="py-3 pr-4">
                            <Badge variant={readinessVariant(scenario.readiness)}>{scenario.readiness}</Badge>
                          </td>
                          <td className="py-3 pr-4 font-mono">{scenario.totalTrades}</td>
                          <td className="py-3 pr-4 font-mono">{formatPercent(scenario.winRate)}</td>
                          <td className="py-3 pr-4 font-mono">{scenario.averageR.toFixed(2)}</td>
                          <td className="py-3 pr-4 font-mono">{scenario.maxDrawdown.toFixed(2)}R</td>
                          <td className="py-3 pr-4 font-mono">
                            {scenario.bestTradeR.toFixed(2)} / {scenario.worstTradeR.toFixed(2)}
                          </td>
                          <td className="py-3 pr-4 font-mono">{scenario.skippedSignals}</td>
                          <td className="py-3 pr-4 font-mono">{formatProfitFactor(scenario.profitFactor)}</td>
                          <td className="py-3 pr-4">
                            <div className="font-mono">{formatPercent(scenario.confidenceCalibration.score)}</div>
                            <div className="text-xs text-muted-foreground">
                              gap {formatPercent(scenario.confidenceCalibration.calibrationGap)}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <div>{topAgent?.name ?? "n/a"}</div>
                            <div className="text-xs text-muted-foreground">
                              align {formatPercent(topAgent?.cioAlignmentRate ?? 0)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          </TechnicalDetails>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
                  <CardTitle>Recommended Calibration Settings</CardTitle>
                </div>
                <CardDescription>Deterministic guidance from the latest validation suite.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="text-xs text-muted-foreground">Confluence threshold</div>
                  <div className="mt-1 font-mono text-2xl">
                    {report.calibration.recommendedConfluenceThreshold.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="text-xs text-muted-foreground">Confidence threshold</div>
                  <div className="mt-1 font-mono text-2xl">
                    {report.calibration.recommendedConfidenceThreshold.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="text-xs text-muted-foreground">Strongest scenario</div>
                  <div className="mt-1 font-medium">{report.calibration.strongestScenario}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="text-xs text-muted-foreground">Weakest scenario</div>
                  <div className="mt-1 font-medium">{report.calibration.weakestScenario}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="text-xs text-muted-foreground">Best session</div>
                  <div className="mt-1 font-medium">{report.calibration.bestSession}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="text-xs text-muted-foreground">Worst session</div>
                  <div className="mt-1 font-medium">{report.calibration.worstSession}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="text-xs text-muted-foreground">Best bias direction</div>
                  <div className="mt-1 font-medium">{report.calibration.bestBiasDirection}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="text-xs text-muted-foreground">Worst bias direction</div>
                  <div className="mt-1 font-medium">{report.calibration.worstBiasDirection}</div>
                </div>
              </CardContent>
            </Card>

            <TechnicalDetails
              title="View agent weight guidance"
              description="Open for suggested agent weight increases and decreases."
            >
            <Card>
              <CardHeader>
                <CardTitle>Agent Weight Guidance</CardTitle>
                <CardDescription>Suggested changes stay local and require human review.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <div className="mb-2 text-xs uppercase text-emerald-300">Increase</div>
                  <div className="space-y-2">
                    {report.calibration.agentWeightsToIncrease.length ? (
                      report.calibration.agentWeightsToIncrease.map((agent) => (
                        <div key={agent.agentId} className="rounded-md border border-border bg-background/45 p-3">
                          <div className="font-medium">{agent.name}</div>
                          <div className="text-xs text-muted-foreground">{agent.reason}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-border bg-background/45 p-3 text-muted-foreground">
                        No increase recommended.
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase text-rose-200">Decrease</div>
                  <div className="space-y-2">
                    {report.calibration.agentWeightsToDecrease.length ? (
                      report.calibration.agentWeightsToDecrease.map((agent) => (
                        <div key={agent.agentId} className="rounded-md border border-border bg-background/45 p-3">
                          <div className="font-medium">{agent.name}</div>
                          <div className="text-xs text-muted-foreground">{agent.reason}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-border bg-background/45 p-3 text-muted-foreground">
                        No decrease recommended.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            </TechnicalDetails>
          </div>

          <TechnicalDetails
            title="View weak ICT rule signals"
            description="Open for detailed ICT assumptions that need more simulation evidence."
          >
          <Card>
            <CardHeader>
              <CardTitle>Weak ICT Rule Signals</CardTitle>
              <CardDescription>Areas that need more simulation evidence before paper-demo planning.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {report.calibration.weakICTRules.map((rule) => (
                <div key={rule} className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
                  {rule}
                </div>
              ))}
            </CardContent>
          </Card>
          </TechnicalDetails>
        </>
      )}
    </div>
  );
}
