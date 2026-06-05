import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BrainCircuit, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildIctAdvisorPacketFromRuntime,
  buildIctReplayValidationFromRuntime,
  formatIctAdvisorSignalSummary,
  summarizeNewsSessionRisk,
  type IctAdvisorPacket,
  type IctReplayValidationReport
} from "@/lib/ict-strategy-suite";
import type { ResearchRuntimeSnapshot } from "@/lib/runtime";

const formatToken = (value?: string) => (value ?? "pending").replace(/_/g, " ");
const pct = (value?: number) => (typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a");
const compactPrice = (value?: number) => (typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "n/a");
const entryZoneLabel = (entryZone?: IctAdvisorPacket["recommendedSignal"]["entryZone"]) =>
  entryZone ? `${compactPrice(entryZone.low)} - ${compactPrice(entryZone.high)} (${compactPrice(entryZone.midpoint)} mid)` : "n/a";
const statusVariant = (status?: IctAdvisorPacket["approvedProfileDecision"]["status"]) =>
  status === "approved_research_candidate"
    ? "success"
    : status === "watchlist_candidate"
      ? "warning"
      : status === "rejected_candidate"
        ? "danger"
        : "secondary";
const smtVariant = (packet?: IctAdvisorPacket) =>
  packet?.compactSummary.smtRejectsCandidate
    ? "danger"
    : packet?.compactSummary.smtConfirmsCandidate
      ? "success"
      : packet?.compactSummary.smtDivergenceType === "insufficient_data"
        ? "warning"
        : "secondary";
const smtLabel = (packet?: IctAdvisorPacket) => {
  if (!packet?.compactSummary.smtDivergenceType) return "SMT pending";
  if (packet.compactSummary.smtRejectsCandidate) return "SMT rejects";
  if (packet.compactSummary.smtConfirmsCandidate) return "SMT confirms";
  return formatToken(packet.compactSummary.smtDivergenceType);
};
const riskVariant = (packet?: IctAdvisorPacket) =>
  packet?.compactSummary.riskGovernorAction === "reject_candidate" ||
  packet?.compactSummary.riskGovernorAction === "no_trade" ||
  packet?.compactSummary.sessionRiskState === "avoid"
    ? "danger"
    : packet?.compactSummary.riskGovernorAction === "downgrade_to_watchlist" ||
        packet?.compactSummary.sessionRiskState === "caution" ||
        packet?.compactSummary.newsRiskLevel === "medium"
      ? "warning"
      : "success";
const riskLabel = (packet?: IctAdvisorPacket) => {
  const action = packet?.compactSummary.riskGovernorAction;
  if (!action) return "Risk pending";
  if (action === "allow") return "Risk clear";
  if (action === "downgrade_to_watchlist") return "Risk caution";
  return "Risk blocked";
};

export function IctAdvisorSummaryPanel({
  mode = "full",
  snapshot
}: {
  mode?: "compact" | "full";
  snapshot?: ResearchRuntimeSnapshot;
}) {
  const [packet, setPacket] = useState<IctAdvisorPacket>();
  const [replayReport, setReplayReport] = useState<IctReplayValidationReport>();
  const [error, setError] = useState<string>();
  const [replayError, setReplayError] = useState<string>();

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

  useEffect(() => {
    let mounted = true;
    if (!snapshot || mode === "compact") {
      setReplayReport(undefined);
      return () => {
        mounted = false;
      };
    }
    void buildIctReplayValidationFromRuntime(snapshot, { maxCandles: 220, replayWindowSize: 60, lookaheadCandles: 12 })
      .then((report) => {
        if (mounted) {
          setReplayReport(report);
          setReplayError(undefined);
        }
      })
      .catch((reason) => {
        if (mounted) {
          setReplayReport(undefined);
          setReplayError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      mounted = false;
    };
  }, [mode, snapshot?.snapshotId, snapshot?.marketData.activeResearchSource.sourceId, snapshot?.marketData.activeResearchSource.fingerprint, snapshot?.mt5ReadOnly.higherTimeframeSources?.map((source) => source.fingerprint).join("|")]);

  const recommended = packet?.recommendedSignal;
  const phaseOneSignals = useMemo(() => (packet?.signals ?? []).filter((signal) => signal.phase === "phase_1"), [packet?.signals]);
  const phaseTwoSignals = useMemo(() => (packet?.signals ?? []).filter((signal) => signal.phase === "phase_2"), [packet?.signals]);
  const topPhaseTwo = phaseTwoSignals
    .slice()
    .sort((left, right) => {
      const statusWeight = (status?: string) =>
        status === "approved_research_candidate" ? 3 : status === "watchlist_candidate" ? 2 : status === "rejected_candidate" ? 1 : 0;
      return statusWeight(right.approvedProfileDecision?.status) - statusWeight(left.approvedProfileDecision?.status) || right.confidence - left.confidence;
    })[0];

  if (mode === "compact") {
    return (
      <section className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">ICT Advisor</p>
            <h3 className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-50">
              <BrainCircuit className="h-4 w-4 text-cyan-300" aria-hidden="true" />
              Deterministic strategy summary
            </h3>
          </div>
          <Badge variant={statusVariant(packet?.approvedProfileDecision.status)}>{formatToken(packet?.approvedProfileDecision.status)}</Badge>
          <Badge variant={smtVariant(packet)}>{smtLabel(packet)}</Badge>
          <Badge variant={riskVariant(packet)}>{riskLabel(packet)}</Badge>
        </div>
        {packet ? (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
              <AdvisorMini label="Composite bias" value={formatToken(packet.compactSummary.compositeBias)} />
              <AdvisorMini label="Phase 2 setup" value={formatToken(topPhaseTwo?.setup)} />
              <AdvisorMini label="SMT / RS" value={smtLabel(packet)} detail={packet.indexSmt?.relativeStrengthLeader ? `RS ${packet.indexSmt.relativeStrengthLeader}` : undefined} />
              <AdvisorMini label="Risk Governor" value={riskLabel(packet)} detail={formatToken(packet.compactSummary.sessionRiskState)} />
              <AdvisorMini label="Decision" value={formatToken(packet.compactSummary.decision)} />
              <AdvisorMini label="Setup" value={formatToken(packet.compactSummary.setup)} />
              <AdvisorMini label="Confidence" value={pct(packet.compactSummary.confidence)} />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              {recommended?.summary ?? "ICT advisor summary pending."} Approval score {packet.compactSummary.approvalScore}/100.
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
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">ICT Strategy Suite</p>
          <h3 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-50">
            <BrainCircuit className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            Deterministic ICT Advisor
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Uses the active canonical research source plus higher-timeframe MT5 contexts locally, then emits compact advisor signals only. Raw candles, raw snapshots, account data, order data, positions, and secrets are excluded.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusVariant(packet?.approvedProfileDecision.status)}>{formatToken(packet?.approvedProfileDecision.status)}</Badge>
          <Badge variant={smtVariant(packet)}>{smtLabel(packet)}</Badge>
          <Badge variant={riskVariant(packet)}>{riskLabel(packet)}</Badge>
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
            <AdvisorMini label="Active setup" value={formatToken(packet.compactSummary.setup)} />
            <AdvisorMini label="Research side" value={formatToken(packet.compactSummary.side)} />
            <AdvisorMini label="Decision" value={formatToken(packet.compactSummary.decision)} />
            <AdvisorMini label="Approved profile" value={formatToken(packet.approvedProfileDecision.status)} detail={packet.approvedProfileDecision.profileId.replace(/_/g, " ")} />
            <AdvisorMini label="Approval score" value={`${packet.approvedProfileDecision.approvalScore}/100`} />
            <AdvisorMini label="Confidence" value={pct(packet.compactSummary.confidence)} />
            <AdvisorMini
              label="SMT / RS"
              value={smtLabel(packet)}
              detail={packet.indexSmt ? `${formatToken(packet.indexSmt.divergenceType)} / ${packet.indexSmt.reason}` : "awaiting index comparison"}
            />
            <AdvisorMini label="RS leader" value={packet.indexSmt?.relativeStrengthLeader ?? "n/a"} detail={`weakness ${packet.indexSmt?.relativeWeaknessLeader ?? "n/a"}`} />
            <AdvisorMini label="Risk Governor" value={riskLabel(packet)} detail={summarizeNewsSessionRisk(packet.newsSessionRisk)} />
            <AdvisorMini label="News risk" value={formatToken(packet.compactSummary.newsRiskLevel)} detail={`${packet.compactSummary.blockingEventsCount ?? 0} block / ${packet.compactSummary.cautionEventsCount ?? 0} caution`} />
            <AdvisorMini label="Session risk" value={formatToken(packet.compactSummary.sessionRiskState)} detail={formatToken(packet.newsSessionRisk?.session.sessionName)} />
            <AdvisorMini label="Confidence adjustment" value={`${Math.round((packet.compactSummary.riskGovernorConfidenceAdjustment ?? 0) * 100)} pts`} />
            <AdvisorMini label="Draw-on-liquidity" value={packet.compactSummary.drawOnLiquidity ?? "none"} />
            <AdvisorMini label="Swept liquidity" value={recommended?.liquiditySwept ? `${recommended.liquiditySwept.type} @ ${compactPrice(recommended.liquiditySwept.price)}` : "none"} />
            <AdvisorMini label="Dealing range" value={formatToken(recommended?.dealingRange?.currentLocation)} detail={recommended?.dealingRange ? `${compactPrice(recommended.dealingRange.low)} / ${compactPrice(recommended.dealingRange.midpoint)} / ${compactPrice(recommended.dealingRange.high)}` : undefined} />
            <AdvisorMini label="Phase" value={formatToken(recommended?.phase)} />
            <AdvisorMini label="Order block" value={formatToken(recommended?.orderBlock?.variant)} detail={recommended?.orderBlock ? `${recommended.orderBlock.direction} / ${recommended.orderBlock.reason}` : undefined} />
            <AdvisorMini label="FVG / displacement" value={recommended?.fairValueGap ? `${recommended.fairValueGap.direction} FVG` : recommended?.displacement ? `${recommended.displacement.direction} displacement` : "missing"} />
            <AdvisorMini label="Entry zone" value={entryZoneLabel(recommended?.entryZone)} />
            <AdvisorMini label="Invalidation" value={compactPrice(recommended?.invalidation)} />
            <AdvisorMini label="Target" value={compactPrice(recommended?.target)} />
            <AdvisorMini label="RR estimate" value={typeof recommended?.rrEstimate === "number" ? `${recommended.rrEstimate.toFixed(2)}R` : "n/a"} />
            <AdvisorMini label="Journal" value={packet.journalStatus} detail={`${packet.journalEvents.length} compact events`} />
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Index SMT / Relative Strength</p>
                <p className="mt-1 text-xs text-slate-400">
                  Confirmation layer only. It can confirm, reject, or adjust confidence on existing ICT candidates, but it cannot create standalone signals.
                </p>
              </div>
              <Badge variant={smtVariant(packet)}>{smtLabel(packet)}</Badge>
            </div>
            {packet.indexSmt ? (
              <>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <AdvisorMini label="Index group" value="USTECH / US500 / US30" />
                  <AdvisorMini label="SMT type" value={formatToken(packet.indexSmt.divergenceType)} />
                  <AdvisorMini label="Confirms candidate" value={packet.indexSmt.confirmsCandidate ? "yes" : "no"} />
                  <AdvisorMini label="Rejects candidate" value={packet.indexSmt.rejectsCandidate ? "yes" : "no"} />
                  <AdvisorMini label="Confidence adjustment" value={`${Math.round(packet.indexSmt.confidenceAdjustment * 100)} pts`} />
                  <AdvisorMini label="RS leader" value={packet.indexSmt.relativeStrengthLeader ?? "n/a"} />
                  <AdvisorMini label="RS weakness" value={packet.indexSmt.relativeWeaknessLeader ?? "n/a"} />
                  <AdvisorMini label="Journal" value={`${packet.indexSmtJournalEvents.length} compact SMT events`} />
                </div>
                <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-300">
                  {packet.indexSmt.reason}
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {packet.indexSmt.instruments.map((instrument) => (
                    <AdvisorMini
                      key={instrument.brokerSymbol}
                      label={instrument.displayLabel}
                      value={`${instrument.dataStatus} / ${typeof instrument.relativeChangePct === "number" ? `${instrument.relativeChangePct.toFixed(2)}%` : "n/a"}`}
                      detail={`buy sweep ${instrument.sweptBuySide ? "yes" : "no"} / sell sweep ${instrument.sweptSellSide ? "yes" : "no"}`}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                Index SMT is waiting for the active index futures research context.
              </p>
            )}
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ICT News / Session Risk Governor</p>
                <p className="mt-1 text-xs text-slate-400">
                  Confirms acceptable timing or downgrades/rejects existing ICT candidates. It cannot create standalone signals, change readiness, or create execution intent.
                </p>
              </div>
              <Badge variant={riskVariant(packet)}>{riskLabel(packet)}</Badge>
            </div>
            {packet.newsSessionRisk ? (
              <>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <AdvisorMini label="News risk level" value={formatToken(packet.newsSessionRisk.newsRiskLevel)} />
                  <AdvisorMini label="Session state" value={formatToken(packet.newsSessionRisk.sessionRiskState)} detail={`${formatToken(packet.newsSessionRisk.session.sessionName)} ${packet.newsSessionRisk.session.localTime}`} />
                  <AdvisorMini label="Action" value={formatToken(packet.newsSessionRisk.riskGovernorAction)} />
                  <AdvisorMini label="Confidence adjustment" value={`${Math.round(packet.newsSessionRisk.riskGovernorConfidenceAdjustment * 100)} pts`} />
                  <AdvisorMini label="Blocking events" value={packet.newsSessionRisk.blockingEventsCount.toLocaleString()} />
                  <AdvisorMini label="Caution events" value={packet.newsSessionRisk.cautionEventsCount.toLocaleString()} />
                  <AdvisorMini label="Timing zone" value={packet.newsSessionRisk.session.timingZone} />
                  <AdvisorMini label="Journal" value={`${packet.newsSessionRiskJournalEvents.length} compact events`} />
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  <AdvisorList
                    label="Risk notes"
                    values={packet.newsSessionRisk.newsSessionRiskNotes}
                    empty="none"
                  />
                  <AdvisorList
                    label="Blocking / caution events"
                    values={[
                      ...packet.newsSessionRisk.blockingEvents.map((event) => `${event.title}: ${event.riskLevel}`),
                      ...packet.newsSessionRisk.cautionEvents.map((event) => `${event.title}: ${event.riskLevel}`)
                    ]}
                    empty="none"
                  />
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                News/session governor is waiting for an ICT candidate timestamp.
              </p>
            )}
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
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Phase 2 models</p>
              <div className="mt-3 grid gap-2">
                {phaseTwoSignals.map((signal) => (
                  <div key={signal.strategyId} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100">{signal.strategyId}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={statusVariant(signal.approvedProfileDecision?.status)}>{formatToken(signal.approvedProfileDecision?.status)}</Badge>
                        <Badge variant={signal.decision === "research_only" ? "success" : "warning"}>{formatToken(signal.decision)}</Badge>
                        <Badge variant="secondary">{pct(signal.confidence)}</Badge>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{formatIctAdvisorSignalSummary(signal)}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-300">{signal.summary}</p>
                    {signal.orderBlock ? (
                      <p className="mt-2 text-xs leading-5 text-cyan-100">
                        {formatToken(signal.orderBlock.variant)} / {signal.orderBlock.direction} / {signal.orderBlock.reason}
                      </p>
                    ) : null}
                    {signal.noTradeReasons.length ? (
                      <p className="mt-2 text-xs leading-5 text-amber-100">Blocked: {signal.noTradeReasons.slice(0, 3).join("; ")}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Recommended signal detail</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-300">
                <AdvisorList label="No-trade reasons" values={recommended?.noTradeReasons ?? []} empty="none" />
                <AdvisorList label="Approved profile reasons" values={packet.approvedProfileDecision.approvedReasons} empty="none" />
                <AdvisorList label="Rejection reasons" values={packet.approvedProfileDecision.rejectionReasons} empty="none" />
                <AdvisorList label="Watchlist reasons" values={packet.approvedProfileDecision.watchlistReasons} empty="none" />
                <AdvisorList label="Risk notes" values={recommended?.riskNotes ?? []} empty="none" />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Packet safety</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-300">
                <AdvisorMini label="Raw candles" value={packet.safetyLocks.rawCandlesIncluded ? "included" : "excluded"} />
                <AdvisorMini label="Raw snapshots" value={packet.safetyLocks.rawSnapshotsIncluded ? "included" : "excluded"} />
                <AdvisorMini label="Secrets" value={packet.safetyLocks.secretsIncluded ? "included" : "excluded"} />
                <AdvisorMini label="Account/order/position" value={packet.safetyLocks.accountDataIncluded || packet.safetyLocks.orderDataIncluded || packet.safetyLocks.positionDataIncluded ? "included" : "excluded"} />
                <AdvisorMini label="Authority" value={`${packet.authority.executionAuthority}/${packet.authority.brokerAuthority}/${packet.authority.readinessOverrideAuthority}`} />
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ICT Replay Validation</p>
                <p className="mt-1 text-xs text-slate-400">
                  Research-only historical replay of compact ICT advisor signals. Raw candles are used internally and excluded from the report.
                </p>
              </div>
              <Badge variant="danger">authority none</Badge>
            </div>
            {replayReport ? (
              <>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <AdvisorMini label="Replay windows" value={replayReport.summary.totalWindows.toLocaleString()} />
                  <AdvisorMini label="Total signals" value={replayReport.summary.totalSignals.toLocaleString()} />
                  <AdvisorMini label="Target-first rate" value={pct(replayReport.summary.targetFirstRate)} />
                  <AdvisorMini label="Invalidation-first rate" value={pct(replayReport.summary.invalidationFirstRate)} />
                  <AdvisorMini label="Average RR achieved" value={`${replayReport.summary.averageRrAchieved.toFixed(2)}R`} />
                  <AdvisorMini label="Partial targets" value={replayReport.summary.partialTargetCount.toLocaleString()} />
                  <AdvisorMini label="Stalled" value={replayReport.summary.stalledCount.toLocaleString()} />
                  <AdvisorMini label="No-trades" value={replayReport.summary.totalNoTrades.toLocaleString()} />
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  <AdvisorList
                    label="Most common no-trade reasons"
                    values={replayReport.summary.mostCommonNoTradeReasons.map((item) => `${item.reason} (${item.count})`)}
                    empty="none"
                  />
                  <AdvisorList
                    label="By-strategy target-first"
                    values={Object.entries(replayReport.summary.byStrategyId).map(([strategyId, summary]) => `${strategyId}: ${Math.round(summary.targetFirstRate * 100)}% / ${summary.totalSignals}`)}
                    empty="none"
                  />
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                {replayError ?? "Replay validation summary is waiting for compact source hydration."}
              </p>
            )}
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

function AdvisorList({ empty, label, values }: { empty: string; label: string; values: string[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{values.length ? values.slice(0, 4).join("; ") : empty}</p>
    </div>
  );
}
