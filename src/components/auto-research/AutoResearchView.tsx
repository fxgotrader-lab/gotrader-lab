import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, BrainCircuit, ClipboardList, Play, ShieldAlert, SlidersHorizontal, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  AUTO_RESEARCH_UPDATED_EVENT,
  autoResearchSearchModes,
  latestAutoResearchCycle,
  loadAutoResearchState,
  runAutoResearchCycle
} from "@/lib/autoResearch";
import type {
  AutoResearchCandidateResult,
  AutoResearchSearchMode,
  AutoResearchState
} from "@/lib/autoResearch";
import { describeBacktestConfig, loadBacktestConfig } from "@/lib/backtesting";
import { formatPercent, formatSigned } from "@/lib/utils";

const searchModeOptions = autoResearchSearchModes.map((mode) => ({
  label: mode.replace(/_/g, " "),
  value: mode
}));
const maxCandidateOptions = [2, 3, 4, 6, 8, 10, 12].map((count) => ({
  label: `${count} candidates`,
  value: String(count)
}));
const statusVariant = (status?: string) =>
  status === "proposal_created" || status === "completed"
    ? "success"
    : status === "failed"
      ? "danger"
      : status === "running"
        ? "warning"
        : "muted";

const formatProfitFactor = (value: number | null) => (value === null ? "n/a" : value >= 99 ? "uncapped" : value.toFixed(2));

const CandidateTable = ({ candidates }: { candidates: AutoResearchCandidateResult[] }) => (
  <div className="overflow-x-auto rounded-lg border border-border">
    <table className="w-full min-w-[980px] text-left text-sm">
      <thead className="border-b border-border bg-muted/45 text-xs uppercase text-muted-foreground">
        <tr>
          <th className="px-3 py-3 font-medium">Candidate</th>
          <th className="px-3 py-3 text-right font-medium">Score</th>
          <th className="px-3 py-3 text-right font-medium">Trades</th>
          <th className="px-3 py-3 text-right font-medium">Win</th>
          <th className="px-3 py-3 text-right font-medium">Avg R</th>
          <th className="px-3 py-3 text-right font-medium">Max DD</th>
          <th className="px-3 py-3 text-right font-medium">False +</th>
          <th className="px-3 py-3 text-right font-medium">PF</th>
          <th className="px-3 py-3 font-medium">Changed</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {candidates.map((candidate) => (
          <tr key={candidate.candidateId} className="align-top">
            <td className="px-3 py-3">
              <div className="font-medium">{candidate.label}</div>
              <div className="mt-1 max-w-md text-xs text-muted-foreground">{candidate.rationale}</div>
            </td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{candidate.scoreBreakdown.totalScore}</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{candidate.metrics.totalTrades}</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{formatPercent(candidate.metrics.winRate, 0)}</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{formatSigned(candidate.metrics.averageR, 2)}R</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{candidate.metrics.maxDrawdown.toFixed(2)}R</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{candidate.metrics.falsePositiveCount}</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{formatProfitFactor(candidate.metrics.profitFactor)}</td>
            <td className="px-3 py-3">
              <div className="flex flex-wrap gap-1">
                {candidate.changedParameters.map((item) => (
                  <Badge key={item} variant="muted">{item}</Badge>
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {!candidates.length ? (
      <div className="p-3 text-sm text-muted-foreground">Run an Auto Research cycle to compare candidates.</div>
    ) : null}
  </div>
);

export function AutoResearchView() {
  const [state, setState] = useState<AutoResearchState>(() => loadAutoResearchState());
  const [searchMode, setSearchMode] = useState<AutoResearchSearchMode>("conservative");
  const [maxCandidateCount, setMaxCandidateCount] = useState("6");
  const [isRunning, setIsRunning] = useState(false);
  const baselineConfig = useMemo(() => loadBacktestConfig(), [state.latestCycleId]);
  const latestCycle = latestAutoResearchCycle(state);
  const bestCandidate = latestCycle?.bestCandidate;

  useEffect(() => {
    const refresh = () => setState(loadAutoResearchState());
    window.addEventListener(AUTO_RESEARCH_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(AUTO_RESEARCH_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const runCycle = () => {
    setIsRunning(true);
    const cycle = runAutoResearchCycle({
      searchMode,
      maxCandidateCount: Number(maxCandidateCount),
      createProposal: true
    });
    setState(loadAutoResearchState());
    setIsRunning(false);
    if (cycle.status === "failed") {
      window.alert(cycle.error ?? "Auto Research cycle failed.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Autonomous research</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Auto Research Supervisor</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Search bounded research configurations, run mock-data validation, compare stability, and create
            approval-gated calibration proposals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">Simulation only</Badge>
          <Badge variant="muted">No execution authority</Badge>
        </div>
      </div>

      <Card className="border-amber-300/25 bg-amber-300/10">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <span>
              Auto Research may create calibration proposals, but cannot execute trades, enable broker/demo/live mode,
              or override readiness.
            </span>
          </div>
          <Badge variant="warning">Approval required</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Baseline and Search Controls</CardTitle>
            </div>
            <CardDescription>Active simulation settings are used as the baseline. They are not changed automatically.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-background/45 p-3 font-mono text-sm text-slate-200">
              {describeBacktestConfig(baselineConfig)}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="auto-search-mode">Search mode</Label>
                <Select
                  id="auto-search-mode"
                  value={searchMode}
                  options={searchModeOptions}
                  onChange={(event) => setSearchMode(event.target.value as AutoResearchSearchMode)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auto-max-candidates">Max candidate count</Label>
                <Select
                  id="auto-max-candidates"
                  value={maxCandidateCount}
                  options={maxCandidateOptions}
                  onChange={(event) => setMaxCandidateCount(event.target.value)}
                />
              </div>
            </div>
            <Button onClick={runCycle} disabled={isRunning}>
              <Play className="h-4 w-4" aria-hidden="true" />
              Run Auto Research Cycle
            </Button>
            <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-primary">
              <BrainCircuit className="mr-2 inline h-4 w-4" aria-hidden="true" />
              LLM supervisor required for full autonomous research mode. Deterministic search is baseline optimizer only.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Best Candidate</CardTitle>
            </div>
            <CardDescription>Selected by stability-first score, not highest profit alone.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {bestCandidate ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background/45 p-3">
                  <div>
                    <p className="font-medium">{bestCandidate.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{bestCandidate.rationale}</p>
                  </div>
                  <Badge variant={bestCandidate.scoreBreakdown.stabilityImproved ? "success" : "warning"}>
                    score {bestCandidate.scoreBreakdown.totalScore}
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Max DD", `${bestCandidate.metrics.maxDrawdown.toFixed(2)}R`],
                    ["Avg R", `${formatSigned(bestCandidate.metrics.averageR, 2)}R`],
                    ["Trades", String(bestCandidate.metrics.totalTrades)],
                    ["Calibration", formatPercent(bestCandidate.metrics.confidenceCalibration, 0)]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
                {latestCycle?.createdProposalId ? (
                  <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                    Created proposal {latestCycle.createdProposalId}. Review and test it on{" "}
                    <Link to="/self-improvement" className="font-semibold underline underline-offset-4">
                      /self-improvement
                    </Link>
                    .
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                    No proposal was created because the best candidate did not clear the stability-first promotion gate.
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
                No cycle has selected a best candidate yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Candidate Comparison</CardTitle>
              <CardDescription>Every candidate runs through mock backtesting, validation, and research quality review.</CardDescription>
            </div>
            <Badge variant={statusVariant(latestCycle?.status)}>{latestCycle?.status ?? "idle"}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <CandidateTable candidates={latestCycle?.candidateResults ?? []} />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Stability Score Breakdown</CardTitle>
            <CardDescription>Drawdown, calibration, false positives, and sample quality lead the score.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {bestCandidate ? (
              Object.entries({
                drawdown: bestCandidate.scoreBreakdown.drawdownScore,
                averageR: bestCandidate.scoreBreakdown.averageRScore,
                winRate: bestCandidate.scoreBreakdown.winRateScore,
                falsePositive: bestCandidate.scoreBreakdown.falsePositiveScore,
                confidence: bestCandidate.scoreBreakdown.confidenceCalibrationScore,
                session: bestCandidate.scoreBreakdown.sessionConsistencyScore,
                tradeCount: bestCandidate.scoreBreakdown.tradeCountScore,
                skippedBalance: bestCandidate.scoreBreakdown.skippedSignalBalanceScore,
                profitFactor: bestCandidate.scoreBreakdown.profitFactorScore,
                robustness: bestCandidate.scoreBreakdown.robustnessScore
              }).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground md:col-span-2 xl:col-span-5">
                Run a cycle to see the stability score breakdown.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rejected Candidates</CardTitle>
            <CardDescription>Rejected candidates and the reason they did not become the proposal seed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestCycle?.rejectedCandidates.length ? (
              latestCycle.rejectedCandidates.map((candidate) => (
                <div key={candidate.candidateId} className="rounded-lg border border-border bg-background/45 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{candidate.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{candidate.rejectionReasons.join(" ") || "Lower score than best candidate."}</p>
                    </div>
                    <Badge variant="muted">{candidate.scoreBreakdown.totalScore}</Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
                No rejected candidates yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
            <CardTitle>Audit Trail</CardTitle>
          </div>
          <CardDescription>Every Auto Research decision is logged locally.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {state.auditTrail.slice(0, 12).map((entry) => (
            <div key={entry.id} className="grid gap-2 rounded-lg border border-border bg-background/45 p-3 text-sm md:grid-cols-[10rem_10rem_minmax(0,1fr)]">
              <span className="font-mono text-xs text-muted-foreground">{entry.timestamp}</span>
              <Badge variant="muted">{entry.action}</Badge>
              <span className="min-w-0 break-words text-muted-foreground">{entry.notes}</span>
            </div>
          ))}
          {!state.auditTrail.length ? (
            <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              No Auto Research cycle has run yet.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
            <CardTitle>Authority Boundaries</CardTitle>
          </div>
          <CardDescription>The supervisor can optimize research assumptions only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            "Execution authority: none",
            "Broker authority: none",
            "Readiness override authority: none",
            "Proposal approval authority: user only",
            "API key authority: none",
            "Live/demo mode authority: none",
            "Contract sizing authority: none",
            "Order placement authority: none"
          ].map((item) => (
            <div key={item} className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
