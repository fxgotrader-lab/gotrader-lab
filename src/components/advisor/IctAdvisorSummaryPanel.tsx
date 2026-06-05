import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BrainCircuit, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildIctAdvisorPacketFromRuntime,
  formatIctAdvisorSignalSummary,
  type IctAdvisorPacket
} from "@/lib/ict-strategy-suite";
import type { ResearchRuntimeSnapshot } from "@/lib/runtime";

const formatToken = (value?: string) => (value ?? "pending").replace(/_/g, " ");
const pct = (value?: number) => (typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a");
const compactPrice = (value?: number) => (typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "n/a");

export function IctAdvisorSummaryPanel({
  mode = "full",
  snapshot
}: {
  mode?: "compact" | "full";
  snapshot?: ResearchRuntimeSnapshot;
}) {
  const [packet, setPacket] = useState<IctAdvisorPacket>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let mounted = true;
    if (!snapshot) {
      setPacket(undefined);
      return () => {
        mounted = false;
      };
    }
    void buildIctAdvisorPacketFromRuntime(snapshot)
      .then((nextPacket) => {
        if (mounted) {
          setPacket(nextPacket);
          setError(undefined);
        }
      })
      .catch((reason) => {
        if (mounted) {
          setPacket(undefined);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      mounted = false;
    };
  }, [snapshot?.snapshotId, snapshot?.marketData.activeResearchSource.sourceId, snapshot?.marketData.activeResearchSource.fingerprint, snapshot?.mt5ReadOnly.higherTimeframeSources?.map((source) => source.fingerprint).join("|")]);

  const recommended = packet?.recommendedSignal;
  const phaseOneSignals = useMemo(() => packet?.signals ?? [], [packet?.signals]);

  if (mode === "compact") {
    return (
      <section className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">ICT Advisor Phase 1</p>
            <h3 className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-50">
              <BrainCircuit className="h-4 w-4 text-cyan-300" aria-hidden="true" />
              Deterministic strategy summary
            </h3>
          </div>
          <Badge variant={recommended?.decision === "research_only" ? "success" : "warning"}>
            {formatToken(recommended?.decision)}
          </Badge>
        </div>
        {packet ? (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <AdvisorMini label="Composite bias" value={formatToken(packet.compactSummary.compositeBias)} />
              <AdvisorMini label="Draw" value={packet.compactSummary.drawOnLiquidity ?? "none"} />
              <AdvisorMini label="Setup" value={formatToken(packet.compactSummary.setup)} />
              <AdvisorMini label="Confidence" value={pct(packet.compactSummary.confidence)} />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              {recommended?.summary ?? "ICT advisor summary pending."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm">
                <Link to="/advisor" className="inline-flex items-center gap-2">
                  Open Advisor
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
              <Badge variant="secondary">journal {packet.journalStatus}</Badge>
              <Badge variant="danger">authority none</Badge>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-400">{error ?? "Waiting for active canonical research source."}</p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">ICT Strategy Suite Phase 1</p>
          <h3 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-50">
            <BrainCircuit className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            Deterministic ICT Advisor
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Uses the active canonical research source plus higher-timeframe MT5 contexts locally, then emits compact advisor signals only. Raw candles, raw snapshots, account data, order data, positions, and secrets are excluded.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={recommended?.decision === "research_only" ? "success" : "warning"}>{formatToken(recommended?.decision)}</Badge>
          <Badge variant="danger">execution none</Badge>
          <Badge variant="secondary">compact packet</Badge>
        </div>
      </div>
      {packet ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AdvisorMini label="Symbol mapping" value={`${packet.brokerSymbol} -> ${packet.requestedSymbol}`} detail={packet.activeSource.provider.replace(/_/g, " ")} />
            <AdvisorMini label="Primary timeframe" value={packet.primaryTimeframe} detail={`${packet.activeSource.candleCount.toLocaleString()} candles`} />
            <AdvisorMini label="HTF context" value={packet.htfTimeframes.length ? packet.htfTimeframes.join(", ") : "missing"} detail="15m / 1h when fetched" />
            <AdvisorMini label="Composite bias" value={formatToken(packet.compactSummary.compositeBias)} detail={recommended?.bias.primary ? `primary ${recommended.bias.primary}` : undefined} />
            <AdvisorMini label="Draw-on-liquidity" value={packet.compactSummary.drawOnLiquidity ?? "none"} />
            <AdvisorMini label="Swept liquidity" value={recommended?.liquiditySwept ? `${recommended.liquiditySwept.type} @ ${compactPrice(recommended.liquiditySwept.price)}` : "none"} />
            <AdvisorMini label="FVG / displacement" value={recommended?.fairValueGap ? `${recommended.fairValueGap.direction} FVG` : recommended?.displacement ? `${recommended.displacement.direction} displacement` : "missing"} />
            <AdvisorMini label="Journal" value={packet.journalStatus} detail={`${packet.journalEvents.length} compact events`} />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.6fr)]">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Phase 1 signals</p>
              <div className="mt-3 grid gap-2">
                {phaseOneSignals.map((signal) => (
                  <div key={signal.strategyId} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100">{signal.strategyId}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={signal.decision === "research_only" ? "success" : "warning"}>{formatToken(signal.decision)}</Badge>
                        <Badge variant="secondary">{pct(signal.confidence)}</Badge>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{formatIctAdvisorSignalSummary(signal)}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-300">{signal.summary}</p>
                    {signal.noTradeReasons.length ? (
                      <p className="mt-2 text-xs leading-5 text-amber-100">Blocked: {signal.noTradeReasons.slice(0, 3).join("; ")}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Packet safety</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-300">
                <AdvisorMini label="Raw candles" value={packet.safetyLocks.rawCandlesIncluded ? "included" : "excluded"} />
                <AdvisorMini label="Raw snapshots" value={packet.safetyLocks.rawSnapshotsIncluded ? "included" : "excluded"} />
                <AdvisorMini label="Secrets" value={packet.safetyLocks.secretsIncluded ? "included" : "excluded"} />
                <AdvisorMini label="Account/order/position" value={packet.safetyLocks.accountDataIncluded || packet.safetyLocks.orderDataIncluded || packet.safetyLocks.positionDataIncluded ? "included" : "excluded"} />
                <AdvisorMini label="Authority" value={`${packet.authority.executionAuthority}/${packet.authority.brokerAuthority}/${packet.authority.readinessOverrideAuthority}`} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
          {error ?? "ICT Advisor is waiting for the active canonical research source to hydrate."}
        </p>
      )}
    </section>
  );
}
function AdvisorMini({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-100">{value}</p>
      {detail ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}
