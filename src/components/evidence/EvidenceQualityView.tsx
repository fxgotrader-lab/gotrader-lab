import { useEffect, useState } from "react";
import { DatabaseZap, ShieldAlert } from "lucide-react";

import { MetricProvenanceDetails } from "@/components/common/MetricProvenanceDetails";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { SourceStatusBanner } from "@/components/common/SourceStatusBanner";
import { EvidenceWorkspaceSummary } from "@/components/common/EvidenceWorkspaceSummary";
import { PageHeader } from "@/components/common/PageHeader";
import { WorkspaceEmptyState } from "@/components/common/WorkspaceEmptyState";
import { WORKSPACE_PAGE } from "@/components/common/workspaceStyles";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { ValidationChainCard } from "@/components/common/ValidationChainCard";
import { recordEvidenceUpdateInValidationChain } from "@/lib/validationChain";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  evidenceScoreVariant,
  evidenceSourceLabel,
  evidenceSourceVariant,
  selectEvidenceReadinessImpact,
  selectStrongestEvidenceLabel,
  selectWeakestEvidenceLabel
} from "@/lib/evidence";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  MARKET_DATA_IMPORT_UPDATED_EVENT
} from "@/lib/marketData";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeDataBadge,
  selectRuntimeFingerprintLabel,
  selectRuntimeSourceLabel,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";

export function EvidenceQualityView() {
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
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      mounted = false;
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const summary = runtimeSnapshot?.evidence.evidenceLedgerSummary;
  const entries = summary?.entries ?? [];

  useEffect(() => {
    // After a walk-forward pass, fold the deterministic evidence/maturity
    // snapshot into the validation chain (no readiness promotion).
    if (!runtimeSnapshot) return;
    recordEvidenceUpdateInValidationChain({
      evidenceQualityScore: runtimeSnapshot.evidence.evidenceLedgerSummary.overallScore,
      maturityScore: runtimeSnapshot.maturity.maturityScore,
      maturityGrade: String(runtimeSnapshot.maturity.maturityGrade)
    });
  }, [runtimeSnapshot]);

  return (
    <div className={WORKSPACE_PAGE} data-testid="evidence-workspace">
      <PageHeader
        eyebrow="Evidence quality"
        title="Evidence Ledger"
        description="What research inputs are real, derived, mock, or missing before agents, readiness, and Paper-Demo review use them. Scores inform confidence — they do not enable execution."
        badges={<Badge variant="warning">Research confidence only</Badge>}
      />

      <SourceStatusBanner />
      <EvidenceWorkspaceSummary
        evidenceScore={summary?.overallScore}
        maturityScore={runtimeSnapshot?.maturity.maturityScore}
        missingEvidence={selectWeakestEvidenceLabel(summary)}
        paperDemoBlocker={runtimeSnapshot?.readiness.actualBlockers[0] ?? "Paper-Demo checklist is reporting-only."}
      />
      <ValidationChainCard testId="evidence-validation-chain" />

      {!runtimeSnapshot ? (
        <WorkspaceEmptyState
          testId="evidence-loading-state"
          tone="loading"
          title="Loading evidence ledger"
          message="Resolving runtime snapshot and source fingerprint. Evidence scores appear when research cycles or imports populate the ledger."
        />
      ) : null}

      <SafetyLockBanner message="Evidence quality can reduce readiness confidence, but cannot approve readiness or enable execution." />

      <Card className="border-cyan-400/20 bg-cyan-400/5">
        <CardContent className="grid gap-3 p-4 text-sm text-cyan-50 md:grid-cols-2 xl:grid-cols-5">
          <StatusTile label="Overall score" value={summary ? `${summary.overallScore}/100` : "loading"} />
          <StatusTile label="Real evidence coverage" value={summary ? `${summary.realEvidenceCoverage}%` : "loading"} />
          <StatusTile label="Active source" value={selectRuntimeSourceLabel(runtimeSnapshot)} />
          <StatusTile label="Data mode" value={selectRuntimeDataBadge(runtimeSnapshot)} />
          <StatusTile label="Fingerprint" value={selectRuntimeFingerprintLabel(runtimeSnapshot)} />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseZap className="h-4 w-4 text-cyan-300" aria-hidden="true" />
              Evidence Summary
            </CardTitle>
            <CardDescription>What the current runtime can trust, and what remains weak or unavailable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <StatusTile label="Strongest real evidence" value={selectStrongestEvidenceLabel(summary)} />
            <StatusTile label="Weakest evidence area" value={selectWeakestEvidenceLabel(summary)} />
            <StatusTile label="Mock/planned/unavailable count" value={String(summary?.mockPlannedUnavailableCount ?? 0)} />
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
              {selectEvidenceReadinessImpact(summary)}
            </div>
            <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3 text-cyan-100">
              Next data improvement: {summary?.nextDataImprovement ?? "Load the runtime snapshot first."}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category Counts</CardTitle>
            <CardDescription>Source classes used by the current evidence ledger.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            {summary
              ? Object.entries(summary.sourceCounts).map(([sourceType, count]) => (
                  <div key={sourceType} className="flex items-center justify-between rounded-lg border border-border bg-background/45 p-3">
                    <span className="capitalize text-muted-foreground">{evidenceSourceLabel(sourceType as never)}</span>
                    <Badge variant={evidenceSourceVariant(sourceType as never)}>{count}</Badge>
                  </div>
                ))
              : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evidence Ledger Table</CardTitle>
          <CardDescription>Every major source category used by research, LLM review, debate, readiness, and self-improvement.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="border-b border-border bg-muted/45 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-medium">Category</th>
                <th className="px-3 py-3 font-medium">Source</th>
                <th className="px-3 py-3 text-right font-medium">Score</th>
                <th className="px-3 py-3 text-right font-medium">Completeness</th>
                <th className="px-3 py-3 text-right font-medium">Freshness</th>
                <th className="px-3 py-3 text-right font-medium">Reliability</th>
                <th className="px-3 py-3 text-right font-medium">Coverage</th>
                <th className="px-3 py-3 font-medium">Limitations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((item) => (
                <tr key={item.entryId} className="align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium">{item.category}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.notes}</div>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={evidenceSourceVariant(item.sourceType)}>{evidenceSourceLabel(item.sourceType)}</Badge>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Badge variant={evidenceScoreVariant(item.qualityScore)}>{item.qualityScore}</Badge>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{Math.round(item.completeness * 100)}%</td>
                  <td className="px-3 py-3 text-right font-mono">{Math.round(item.freshness * 100)}%</td>
                  <td className="px-3 py-3 text-right font-mono">{Math.round(item.reliability * 100)}%</td>
                  <td className="px-3 py-3 text-right font-mono">{Math.round(item.coverage * 100)}%</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{item.limitations.join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!entries.length ? (
            <div className="p-3 text-sm text-muted-foreground">Evidence ledger is loading.</div>
          ) : null}
        </CardContent>
      </Card>

      <TechnicalDetails
        title="View evidence provenance"
        description="Open for runtime fingerprint, readiness warnings, and LLM context impact."
      >
        <div className="space-y-3">
          <MetricProvenanceDetails snapshot={runtimeSnapshot} />
          <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">LLM context impact</div>
            <p className="mt-2">{summary?.llmContextImpact ?? "Evidence quality summary has not loaded."}</p>
            {summary?.readinessEvidenceWarnings.length ? (
              <ul className="mt-3 space-y-1 text-amber-100">
                {summary.readinessEvidenceWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            ) : null}
          </div>
        </div>
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
