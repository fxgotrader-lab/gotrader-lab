import { useEffect, useState } from "react";
import { BarChart3, ShieldAlert } from "lucide-react";

import { MetricProvenanceDetails } from "@/components/common/MetricProvenanceDetails";
import { AutonomySafetyPolicyPanel } from "@/components/autonomous-research/AutonomySafetyPolicyPanel";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  maturityGradeLabel,
  maturityGradeVariant,
  maturityScoreVariant,
  selectMaturityNextRequirement,
  selectMaturityReadinessWarning,
  selectMaturityTrendMessage
} from "@/lib/maturity";
import { latestAutoResearchCycle, loadAutoResearchState } from "@/lib/autoResearch";
import { RESEARCH_CYCLE_UPDATED_EVENT } from "@/lib/researchCycle";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  MARKET_DATA_IMPORT_UPDATED_EVENT
} from "@/lib/marketData";
import {
  ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT,
  SELF_IMPROVEMENT_UPDATED_EVENT
} from "@/lib/selfImprovement";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeFingerprintLabel,
  selectRuntimeSourceLabel,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";

const formatPercent = (value: number) => `${Math.round(value)}%`;

export function ResearchMaturityView() {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      resolveResearchRuntimeSnapshot()
        .then((snapshot) => {
          if (mounted) {
            setRuntimeSnapshot(snapshot);
          }
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
    window.addEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
    window.addEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      mounted = false;
      window.removeEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
      window.removeEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
      window.removeEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const summary = runtimeSnapshot?.maturity.maturitySummary;
  const breakdown = summary?.breakdown;
  const latestAutoResearch = latestAutoResearchCycle(loadAutoResearchState());

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Research maturity</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Maturity Score</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Measures how much confidence to place in the current active calibration across repeated cycles, data windows,
            evidence quality, LLM review, validation, and proposal history.
          </p>
        </div>
        <Badge variant={maturityGradeVariant(summary?.grade)}>{maturityGradeLabel(summary?.grade)}</Badge>
      </div>

      <SafetyLockBanner message="Research maturity can block advancement, but cannot approve execution, enable demo/live mode, or override readiness." />

      <Card className="border-cyan-400/20 bg-cyan-400/5">
        <CardContent className="grid gap-3 p-4 text-sm text-cyan-50 md:grid-cols-2 xl:grid-cols-5">
          <StatusTile label="Maturity score" value={summary ? `${summary.score}/100` : "loading"} />
          <StatusTile label="Grade" value={maturityGradeLabel(summary?.grade)} />
          <StatusTile label="Active data source" value={selectRuntimeSourceLabel(runtimeSnapshot)} />
          <StatusTile label="Active calibration" value={summary?.activeCalibrationId ?? "default baseline"} />
          <StatusTile label="Fingerprint" value={selectRuntimeFingerprintLabel(runtimeSnapshot)} />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-300" aria-hidden="true" />
              Current Maturity
            </CardTitle>
            <CardDescription>A single good run cannot produce high maturity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-3xl font-semibold">{summary?.score ?? 0}/100</div>
                <div className="mt-1 text-sm text-muted-foreground">{maturityGradeLabel(summary?.grade)}</div>
              </div>
              <Badge variant={maturityScoreVariant(summary?.score)}>{summary?.readinessTrend ?? "unknown"} trend</Badge>
            </div>
            <Progress value={summary?.score ?? 0} />
            <div className="rounded-lg border border-white/10 bg-background/45 p-3 text-sm text-muted-foreground">
              {selectMaturityTrendMessage(summary)}
            </div>
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
              {selectMaturityReadinessWarning(summary)}
            </div>
            <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3 text-sm text-cyan-100">
              Next maturity requirement: {selectMaturityNextRequirement(summary)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Survival and Coverage</CardTitle>
            <CardDescription>Current calibration maturity across repeated windows and cycles.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <StatusTile label="Calibration survival count" value={String(summary?.activeCalibrationSurvivalCount ?? 0)} />
            <StatusTile label="Cycles tested" value={String(summary?.cyclesTested ?? 0)} />
            <StatusTile label="Windows tested" value={String(summary?.dataWindowsTested ?? 0)} />
            <StatusTile label="Total simulated trades" value={String(summary?.totalSimulatedTrades ?? 0)} />
            <StatusTile label="LLM advisory passes" value={String(summary?.llmAdvisoryPassCount ?? 0)} />
            <StatusTile label="Walk-forward windows" value={String(summary?.walkForwardWindowsTested ?? 0)} />
            <StatusTile label="OOS windows passed" value={String(summary?.walkForwardOutOfSamplePassed ?? 0)} />
            <StatusTile label="Overfit risk" value={summary?.latestWalkForwardOverfitRisk ?? "unknown"} />
            <StatusTile label="Evidence score" value={`${summary?.evidenceQualityScore ?? 0}/100`} />
            <StatusTile label="Imported cycles" value={String(summary?.importedDataCycles ?? 0)} />
            <StatusTile label="Mock cycles" value={String(summary?.mockDataCycles ?? 0)} />
          </CardContent>
        </Card>
      </div>

      <AutonomySafetyPolicyPanel latestAutoResearch={latestAutoResearch} snapshot={runtimeSnapshot} />

      <Card>
        <CardHeader>
          <CardTitle>Score Breakdown</CardTitle>
          <CardDescription>How the maturity score is assembled from repeatability, evidence, and discipline.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {breakdown
            ? Object.entries(breakdown).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label.replace(/([A-Z])/g, " $1")}</div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <Progress value={value} className="h-2" />
                    <span className="font-mono text-xs text-foreground">{formatPercent(value)}</span>
                  </div>
                </div>
              ))
            : null}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Missing Requirements</CardTitle>
            <CardDescription>What currently caps maturity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary?.missingRequirements.length ? (
              summary.missingRequirements.map((item) => (
                <div key={item} className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                  {item}
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">
                No maturity caps beyond continued monitoring.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proposal Discipline</CardTitle>
            <CardDescription>Accepted, rejected, and failed/no-op proposal history.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <StatusTile label="Accepted" value={String(summary?.acceptedProposalCount ?? 0)} />
            <StatusTile label="Rejected" value={String(summary?.rejectedProposalCount ?? 0)} />
            <StatusTile label="No-op/failed" value={String(summary?.noOpOrFailedProposalCount ?? 0)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cycle and Window History</CardTitle>
          <CardDescription>Recent cycles used by the current maturity calculation.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-muted/45 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-medium">Cycle</th>
                <th className="px-3 py-3 font-medium">Source</th>
                <th className="px-3 py-3 font-medium">Window</th>
                <th className="px-3 py-3 text-right font-medium">Trades</th>
                <th className="px-3 py-3 text-right font-medium">Win</th>
                <th className="px-3 py-3 text-right font-medium">Avg R</th>
                <th className="px-3 py-3 text-right font-medium">DD</th>
                <th className="px-3 py-3 text-right font-medium">Readiness</th>
                <th className="px-3 py-3 font-medium">LLM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary?.cycleWindowHistory.map((cycle) => (
                <tr key={cycle.cycleId}>
                  <td className="px-3 py-3 font-mono text-xs">{cycle.cycleId}</td>
                  <td className="px-3 py-3">{cycle.dataSourceMode ?? "unknown"}</td>
                  <td className="px-3 py-3">{cycle.candleWindow ?? cycle.researchPreset ?? "unknown"}</td>
                  <td className="px-3 py-3 text-right font-mono">{cycle.totalTrades}</td>
                  <td className="px-3 py-3 text-right font-mono">{Math.round(cycle.winRate * 100)}%</td>
                  <td className="px-3 py-3 text-right font-mono">{cycle.averageR.toFixed(2)}R</td>
                  <td className="px-3 py-3 text-right font-mono">{cycle.maxDrawdownR.toFixed(2)}R</td>
                  <td className="px-3 py-3 text-right font-mono">{cycle.readinessScore}</td>
                  <td className="px-3 py-3">
                    <Badge variant={cycle.llmAdvisoryPassed ? "success" : "warning"}>{cycle.llmAdvisoryPassed ? "passed" : "missing"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!summary?.cycleWindowHistory.length ? (
            <div className="p-3 text-sm text-muted-foreground">Run AI Research Cycle to build maturity history.</div>
          ) : null}
        </CardContent>
      </Card>

      <TechnicalDetails title="View maturity provenance" description="Open for run fingerprint and runtime source diagnostics.">
        <MetricProvenanceDetails snapshot={runtimeSnapshot} />
      </TechnicalDetails>
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/45 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-xs text-foreground">{value}</p>
    </div>
  );
}
