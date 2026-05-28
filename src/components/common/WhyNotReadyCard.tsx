import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResearchRuntimeSnapshot } from "@/lib/runtime";
import { formatPercent, safeTopN } from "@/lib/utils";

const hasText = (value?: string) => Boolean(value && value.trim().length);

const unique = (items: string[]) => Array.from(new Set(items.filter(hasText)));

export function WhyNotReadyCard({
  context = "runtime",
  snapshot
}: {
  context?: "command_center" | "performance" | "readiness" | "self_improvement" | "runtime";
  snapshot?: ResearchRuntimeSnapshot;
}) {
  const metrics = snapshot?.performance.canonicalPerformanceMetrics;
  const winRate = metrics?.winRate;
  const readinessState = snapshot?.readiness.readinessState ?? "Not Ready";
  const goodWinRate = typeof winRate === "number" && winRate >= 0.45;
  const blockers = unique([
    ...(snapshot?.readiness.actualBlockers ?? []),
    metrics && metrics.totalTrades < 30 ? `Sample size is still small: ${metrics.totalTrades} simulated trade(s).` : "",
    snapshot?.walkForward.verdict === "insufficient_evidence"
      ? `Walk-forward evidence is insufficient: ${snapshot.walkForward.windowsTested} window(s) tested.`
      : "",
    snapshot?.walkForward.verdict === "fail" ? "Walk-forward validation failed or showed unstable out-of-sample behavior." : "",
    snapshot && !snapshot.walkForward.latestRun ? "Walk-forward validation has not produced a current passing result." : "",
    snapshot && snapshot.evidence.evidenceQualityScore < 70
      ? `Evidence quality is limited: ${snapshot.evidence.evidenceQualityScore}/100.`
      : "",
    snapshot && snapshot.maturity.maturityScore < 70
      ? `Research maturity is still building: ${snapshot.maturity.maturityGrade.replace(/_/g, " ")} / ${snapshot.maturity.maturityScore}.`
      : ""
  ]);
  const warnings = unique(snapshot?.readiness.warnings ?? []);
  const topReason = blockers[0] ?? warnings[0] ?? snapshot?.readiness.nextAction ?? "Run the autonomous research loop to refresh readiness evidence.";
  const contextLabel = context.replace(/_/g, " ");

  return (
    <Card className="border-amber-300/25 bg-amber-300/10">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Why Not Ready?</CardTitle>
            <CardDescription>
              Win rate is only one metric. Readiness also requires sample size, average R, drawdown, walk-forward,
              evidence quality, maturity, and false-positive control.
            </CardDescription>
          </div>
          <Badge variant={readinessState === "Paper-Demo Candidate" ? "success" : goodWinRate ? "warning" : "danger"}>
            {readinessState}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-amber-100">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-amber-200/20 bg-background/30 p-3">
            <div className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Good metric</div>
            <div className="mt-1 font-mono text-lg">
              {typeof winRate === "number" ? `Win rate ${formatPercent(winRate, 1)}` : "Win rate not available"}
            </div>
            <p className="mt-1 text-xs text-amber-100/75">
              {goodWinRate ? "Promising, but not sufficient by itself." : "Win rate still needs improvement."}
            </p>
          </div>
          <div className="rounded-lg border border-amber-200/20 bg-background/30 p-3 md:col-span-2">
            <div className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Top blocking evidence</div>
            <p className="mt-1 text-sm">{topReason}</p>
            <p className="mt-2 text-xs text-amber-100/70">
              Source: {metrics?.metricSourceLabel ?? snapshot?.latestResearchCycle.latestCycleId ?? contextLabel}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-amber-200/20 bg-background/30 p-3">
          <div className="text-xs uppercase tracking-[0.14em] text-amber-100/70">Blocking evidence checklist</div>
          {blockers.length ? (
            <ul className="mt-2 grid gap-2 md:grid-cols-2">
              {safeTopN(blockers, 6).map((blocker) => (
                <li key={blocker} className="rounded-md border border-amber-100/15 bg-amber-100/5 px-3 py-2">
                  {blocker}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-amber-100/75">
              No active blocker is recorded, but Paper-Demo Candidate still requires current walk-forward, evidence, maturity, and approval checks.
            </p>
          )}
        </div>
        <p className="rounded-lg border border-amber-200/20 bg-background/30 p-3 font-medium">
          Conclusion: {readinessState === "Paper-Demo Candidate" ? "review-ready, but execution is still disabled." : "Promising, but not robust enough."}
        </p>
      </CardContent>
    </Card>
  );
}
