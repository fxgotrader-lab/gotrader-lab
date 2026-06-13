import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpenCheck, ExternalLink, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SourceStatusBanner } from "@/components/common/SourceStatusBanner";
import { ValidationChainCard } from "@/components/common/ValidationChainCard";
import { WORKSPACE_CARD, WORKSPACE_PAGE, WORKSPACE_SECTION_LABEL } from "@/components/common/workspaceStyles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveSourceStatusSnapshot, type SourceStatusSnapshot } from "@/lib/sourceStatus";
import {
  createStrategyIntakeRecord,
  evaluateStrategyEligibility,
  listStrategyDefinitions,
  strategyEvidenceStatus,
  strategyStatusLabel,
  type StrategyDefinition,
  type StrategyEligibilityResult,
  type StrategyEvidenceSummary,
  type StrategyIntakeRecord
} from "@/lib/strategyLibrary";
import { latestValidationChainEntry, readValidationChainState, type ValidationChainEntry } from "@/lib/validationChain";
import { cn } from "@/lib/utils";

const formatToken = (value?: string) => (value?.trim() ? value : "unknown").replace(/_/g, " ");

const statusVariant = (status?: string) =>
  status === "paper_watchlist_candidate" || status === "paper_demo_watchlist"
    ? "success"
    : status === "paper_demo_blocked" || status === "retired"
      ? "danger"
      : status === "replay_required" || status === "walk_forward_required"
        ? "warning"
        : "secondary";

const eligibilityBadge = (result: StrategyEligibilityResult) =>
  result.eligible ? "eligible for next research gate" : formatToken(result.status);

function useStrategyLibraryContext() {
  const [source, setSource] = useState<SourceStatusSnapshot | undefined>();
  const [validationChain, setValidationChain] = useState<ValidationChainEntry | undefined>(() =>
    latestValidationChainEntry(readValidationChainState())
  );

  useEffect(() => {
    let active = true;
    const refreshSource = () => {
      void resolveSourceStatusSnapshot()
        .then((snapshot) => {
          if (active) setSource(snapshot);
        })
        .catch(() => {
          if (active) setSource(undefined);
        });
    };
    const refreshChain = () => setValidationChain(latestValidationChainEntry(readValidationChainState()));
    refreshSource();
    refreshChain();
    window.addEventListener("storage", refreshSource);
    window.addEventListener("storage", refreshChain);
    window.addEventListener("gotrader:validation-chain-updated", refreshChain);
    return () => {
      active = false;
      window.removeEventListener("storage", refreshSource);
      window.removeEventListener("storage", refreshChain);
      window.removeEventListener("gotrader:validation-chain-updated", refreshChain);
    };
  }, []);

  return { source, validationChain };
}

const evidenceFromValidation = (entry?: ValidationChainEntry): StrategyEvidenceSummary | undefined => {
  if (!entry) return undefined;
  return {
    sampleCount: entry.walkForwardResult?.tradeCount ?? entry.replayResult?.totalSignals,
    targetFirstRate: entry.replayResult?.targetFirstRate,
    averageRr: entry.replayResult?.averageRr,
    evidenceScore: entry.evidenceQuality?.evidenceQualityScore,
    maturityScore: entry.evidenceQuality?.maturityScore,
    oosVerdict: entry.walkForwardResult?.oosVerdict ?? entry.walkForwardResult?.verdict,
    sourceFingerprint: entry.sourceFingerprint
  };
};

const recognitionFor = (strategy: StrategyDefinition, entry?: ValidationChainEntry) => {
  const setupLabel = entry?.setupLabel ?? "";
  const normalized = setupLabel.toLowerCase();
  const presentConditions =
    strategy.id === "ict_cmd_short_paper_watchlist_v1" && /cmd|consolidation.*manipulation.*distribution/.test(normalized)
      ? ["consolidation_manipulation_distribution"]
      : [];
  return {
    modelName: setupLabel || strategy.name,
    setupName: setupLabel || strategy.description,
    family: strategy.family,
    side: strategy.side,
    presentConditions,
    missingConditions: strategy.requiredConditions
      .filter((condition) => !presentConditions.includes(condition.id))
      .map((condition) => condition.id)
  };
};

export function StrategyLibraryView() {
  const { source, validationChain } = useStrategyLibraryContext();
  const strategies = useMemo(() => listStrategyDefinitions(), []);
  const evidenceSummary = useMemo(() => evidenceFromValidation(validationChain), [validationChain]);
  const rows = useMemo(
    () =>
      strategies.map((strategy) => {
        const record = createStrategyIntakeRecord({
          strategyId: strategy.id,
          sourceStatus: source,
          recognition: recognitionFor(strategy, validationChain),
          validationChainEntry: validationChain,
          evidenceSummary
        });
        const eligibility = evaluateStrategyEligibility(record);
        return { strategy, record, eligibility };
      }),
    [evidenceSummary, source, strategies, validationChain]
  );
  const cmdRow = rows.find((row) => row.strategy.id === "ict_cmd_short_paper_watchlist_v1") ?? rows[0];
  const grinchRows = rows.filter((row) => row.strategy.family === "grinch");

  return (
    <div data-testid="strategy-library-view" className={WORKSPACE_PAGE}>
      <PageHeader
        eyebrow="Evidence / Strategy Library"
        title="Strategy Library"
        description="Registered research-only strategy families, intake safety, and deterministic eligibility gates. The library never creates broker execution, readiness overrides, or active calibration."
        badges={
          <>
            <Badge variant="danger">executionAuthority none</Badge>
            <Badge variant="secondary">compact intake only</Badge>
            <Badge variant="warning">Paper-Demo remains gated</Badge>
          </>
        }
      />

      <SourceStatusBanner />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <article data-testid="strategy-library-current-intake" className={cn(WORKSPACE_CARD, "p-5")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={WORKSPACE_SECTION_LABEL}>Current intake context</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-50">
                {source?.requestedSymbol ?? validationChain?.symbol ?? "MNQ"} / {source?.brokerSymbol ?? validationChain?.brokerSymbol ?? "USTECH"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Source fingerprint, validation-chain state, and compact evidence decide whether a strategy can progress.
                Recognition alone is not evidence.
              </p>
            </div>
            <Badge variant={source?.isMockOrSample ? "danger" : source?.isResearchActive ? "success" : "warning"}>
              {source?.isMockOrSample ? "mock/sample blocked" : source?.isResearchActive ? "research source active" : "source pending"}
            </Badge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Readout label="Provider" value={source?.sourceProvider ?? validationChain?.sourceStatus.sourceProvider ?? "pending"} />
            <Readout label="Timeframe" value={source?.primaryTimeframe ?? validationChain?.timeframe ?? "pending"} />
            <Readout label="Candles" value={source?.candleCount?.toLocaleString() ?? "0"} />
            <Readout label="Fingerprint" value={source?.sourceFingerprint ?? validationChain?.sourceFingerprint ?? "missing"} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Readout label="Latest validation" value={validationChain?.setupLabel ?? "none queued"} detail={validationChain?.hypothesisStatus ?? "validation required"} />
            <Readout
              label="Evidence status"
              value={cmdRow ? strategyEvidenceStatus(cmdRow.strategy, cmdRow.record) : "evidence_not_started"}
              detail={`E ${evidenceSummary?.evidenceScore ?? "n/a"} / M ${evidenceSummary?.maturityScore ?? "n/a"}`}
            />
            <Readout label="Authority" value="none / none / none" detail="No broker, order, position, or readiness mutation." />
          </div>
        </article>

        <article data-testid="strategy-library-cmd-card" className={cn(WORKSPACE_CARD, "p-5")}>
          <p className={WORKSPACE_SECTION_LABEL}>Strongest guarded lane</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">{cmdRow?.strategy.name ?? "CMD Paper-Watchlist Short"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            CMD can remain paper-watchlist research only. Independent-date validation blocks one-date clusters from
            Paper-Demo progression.
          </p>
          {cmdRow ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant={statusVariant(cmdRow.eligibility.status)}>{eligibilityBadge(cmdRow.eligibility)}</Badge>
                <Badge variant="warning">min 3 dates</Badge>
                <Badge variant="warning">min 2 rolling windows</Badge>
                <Badge variant="secondary">min 20 samples</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{cmdRow.eligibility.nextAction}</p>
              {cmdRow.eligibility.blockers.length ? (
                <ul className="mt-3 space-y-2 text-xs leading-5 text-rose-100">
                  {cmdRow.eligibility.blockers.slice(0, 4).map((blocker) => (
                    <li key={blocker} className="rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2">{blocker}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <StrategyCard
              key={row.strategy.id}
              strategy={row.strategy}
              record={row.record}
              eligibility={row.eligibility}
            />
          ))}
        </div>
        <aside className="grid content-start gap-4">
          <ValidationChainCard testId="strategy-library-validation-chain" detailed />
          <article className={cn(WORKSPACE_CARD, "p-5")}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <p className={WORKSPACE_SECTION_LABEL}>Safety contract</p>
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
              <li>No raw candle arrays in intake, journals, advisor packets, or OpenClaw drafts.</li>
              <li>No account, order, position, token, password, or MT5 credential fields.</li>
              <li>No applyCalibration, active calibration mutation, or auto-apply path.</li>
              <li>No Paper-Demo promotion from strategy definition alone.</li>
            </ul>
          </article>
          <article className={cn(WORKSPACE_CARD, "p-5")}>
            <p className={WORKSPACE_SECTION_LABEL}>Grinch families</p>
            <div className="mt-3 grid gap-2">
              {grinchRows.map((row) => (
                <div key={row.strategy.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-sm font-semibold text-slate-100">{row.strategy.name}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{row.eligibility.nextAction}</p>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}

function StrategyCard({
  strategy,
  record,
  eligibility
}: {
  strategy: StrategyDefinition;
  record: StrategyIntakeRecord;
  eligibility: StrategyEligibilityResult;
}) {
  return (
    <article
      data-testid={`strategy-library-card-${strategy.id}`}
      className={cn(WORKSPACE_CARD, "p-5")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BookOpenCheck className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            <p className={WORKSPACE_SECTION_LABEL}>{formatToken(strategy.family)}</p>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-50">{strategy.name}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{strategy.description}</p>
        </div>
        <Badge variant={statusVariant(eligibility.status)}>{strategyStatusLabel(eligibility.status)}</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Readout label="Side" value={formatToken(strategy.side)} />
        <Readout label="Minimum RR" value={`${strategy.minimumRR.toFixed(1)}R`} />
        <Readout label="Source" value={record.sourceProvider ?? "pending"} detail={record.sourceFingerprint ?? "fingerprint missing"} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ListBlock title="Required conditions" values={strategy.requiredConditions.map((condition) => condition.label)} />
        <ListBlock title="Current blockers" values={eligibility.blockers} empty="No blockers at this gate." tone="danger" />
      </div>
      <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-300">
        {eligibility.nextAction}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary">
          <Link to="/validation" className="inline-flex items-center gap-1">Open validation <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        </Button>
        <Button size="sm" variant="secondary">
          <Link to="/replay" className="inline-flex items-center gap-1">Open replay <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        </Button>
        <Button size="sm" variant="secondary">
          <Link to="/paper-demo" className="inline-flex items-center gap-1">Open Paper-Demo <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        </Button>
      </div>
    </article>
  );
}

function Readout({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-100" title={value}>{value}</p>
      {detail ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function ListBlock({
  title,
  values,
  empty = "None.",
  tone = "neutral"
}: {
  title: string;
  values: string[];
  empty?: string;
  tone?: "neutral" | "danger";
}) {
  const color = tone === "danger" ? "text-rose-100" : "text-slate-300";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">{title}</p>
      {values.length ? (
        <ul className={cn("mt-2 space-y-1 text-xs leading-5", color)}>
          {values.slice(0, 6).map((value) => <li key={value}>{value}</li>)}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-slate-500">{empty}</p>
      )}
    </div>
  );
}
