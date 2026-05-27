import { AlertTriangle, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  diagnoseAutonomySafety,
  formatAutonomyBlocker,
  type ScenarioSelectionReasoning
} from "@/lib/autonomousResearch";
import type { AutoResearchCycle } from "@/lib/autoResearch";
import type { ResearchRuntimeSnapshot } from "@/lib/runtime";
import { safeTopN } from "@/lib/utils";

const flagVariant = (active: boolean) => (active ? "danger" : "success");
const formatScenario = (value?: string) => (value ?? "not selected").replace(/_/g, " ");

export function AutonomySafetyPolicyPanel({
  latestAutoResearch,
  snapshot
}: {
  latestAutoResearch?: AutoResearchCycle;
  snapshot?: ResearchRuntimeSnapshot;
}) {
  const diagnosis = diagnoseAutonomySafety(snapshot, latestAutoResearch);
  const scenario: ScenarioSelectionReasoning = diagnosis.scenarioSelection;

  return (
    <Card className="border-amber-300/25 bg-amber-300/10">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-amber-50">
            <ShieldAlert className="h-4 w-4 text-amber-200" aria-hidden="true" />
            Autonomy Safety Policy
          </CardTitle>
          <p className="mt-1 text-xs text-amber-100/75">
            Auto-apply is blocked when regime evidence, walk-forward evidence, maturity, or scenario reasoning is not strong enough.
          </p>
        </div>
        <Badge variant={diagnosis.autoApplyBlocked ? "danger" : "success"}>
          {diagnosis.autoApplyBlocked ? "auto-apply blocked" : "research-only clear"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-amber-50">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PolicyTile
            label="Latest blocker diagnosis"
            value={safeTopN(diagnosis.blockerCategories, 2).map(formatAutonomyBlocker).join(", ") || "none"}
          />
          <PolicyTile label="Selected scenario family" value={formatScenario(scenario.selectedScenarioFamily)} />
          <PolicyTile
            label="Regime mismatch pause"
            value={diagnosis.regimeMismatchPaused ? "paused for human review" : "not detected"}
          />
          <PolicyTile
            label="Walk-forward evidence"
            value={diagnosis.walkForwardEvidenceSufficient ? "sufficient" : diagnosis.walkForwardEvidenceStatus.replace(/_/g, " ")}
          />
          <PolicyTile
            label="Maturity drop guard"
            value={diagnosis.maturityDropBlocked ? "blocked" : `max drop ${diagnosis.policy.maxMaturityDropPerAutoApply} pts`}
          />
          <PolicyTile label="Trend history" value={diagnosis.trendStatus.message} />
          <PolicyTile label="Evidence score" value={`${diagnosis.evidenceQualityScore}/100`} />
          <PolicyTile label="Maturity" value={`${diagnosis.maturityGrade.replace(/_/g, " ")} / ${diagnosis.maturityScore}/100`} />
        </div>
        <div className="rounded-md border border-amber-200/20 bg-amber-200/5 p-3">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Scenario selection reasoning
          </div>
          <p className="mt-1 text-amber-100/80">{scenario.reasoningSummary}</p>
          {diagnosis.blockReasons.length ? (
            <ul className="mt-2 space-y-1 text-xs text-amber-100/80">
              {safeTopN(diagnosis.blockReasons, 4).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Badge variant={flagVariant(diagnosis.regimeMismatchPaused)}>
            {diagnosis.regimeMismatchPaused ? "regime review required" : "regime policy clear"}
          </Badge>
          <Badge variant={flagVariant(!diagnosis.walkForwardEvidenceSufficient)}>
            {diagnosis.walkForwardEvidenceSufficient ? "walk-forward sufficient" : "walk-forward blocks auto-apply"}
          </Badge>
          <Badge variant={flagVariant(diagnosis.maturityDropBlocked)}>
            {diagnosis.maturityDropBlocked ? "maturity drop blocked" : "maturity guard active"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function PolicyTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-amber-200/20 bg-amber-200/5 p-3">
      <div className="text-xs uppercase tracking-[0.14em] text-amber-100/60">{label}</div>
      <div className="mt-1 break-words font-medium text-amber-50">{value}</div>
    </div>
  );
}
