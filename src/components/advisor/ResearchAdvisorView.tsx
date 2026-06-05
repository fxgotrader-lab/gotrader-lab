import { useEffect, useMemo, useState } from "react";
import { BarChart3, MessageSquareText, PlayCircle, ShieldCheck } from "lucide-react";

import { IctAdvisorSummaryPanel } from "@/components/advisor/IctAdvisorSummaryPanel";
import { LLMAdvisoryReviewPanel } from "@/components/dashboard/LLMAdvisoryReviewPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  runManualIctReplayReview,
  type IctManualReplayReviewRequest,
  type IctManualReplayReviewResult,
  type IctManualReplayReviewStatus
} from "@/lib/ict-strategy-suite";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  MARKET_DATA_IMPORT_UPDATED_EVENT
} from "@/lib/marketData";
import {
  MT5_HIGHER_TIMEFRAME_SOURCES_UPDATED_EVENT
} from "@/lib/integrations/mt5/mt5MultiTimeframe";
import { MT5_READ_ONLY_UPDATED_EVENT } from "@/lib/integrations/mt5";
import { RESEARCH_CYCLE_UPDATED_EVENT } from "@/lib/researchCycle";
import { resolveResearchRuntimeSnapshot, type ResearchRuntimeSnapshot } from "@/lib/runtime";
import { WALK_FORWARD_UPDATED_EVENT } from "@/lib/walkForward";

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : "n/a");
const formatToken = (value?: string) => (value ?? "pending").replace(/_/g, " ");
const pct = (value?: number) => (typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a");
const rr = (value?: number) => (typeof value === "number" ? `${value.toFixed(2)}R` : "n/a");

export function ResearchAdvisorView() {
  const [snapshot, setSnapshot] = useState<ResearchRuntimeSnapshot>();
  const [manualReplayStatus, setManualReplayStatus] = useState<IctManualReplayReviewStatus>("idle");
  const [manualReplayResult, setManualReplayResult] = useState<IctManualReplayReviewResult>();
  const [manualReplayError, setManualReplayError] = useState<string>();

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void resolveResearchRuntimeSnapshot()
        .then((nextSnapshot) => {
          if (mounted) {
            setSnapshot(nextSnapshot);
          }
        })
        .catch(() => undefined);
    };
    const events = [
      CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
      MARKET_DATA_IMPORT_UPDATED_EVENT,
      MT5_HIGHER_TIMEFRAME_SOURCES_UPDATED_EVENT,
      MT5_READ_ONLY_UPDATED_EVENT,
      RESEARCH_CYCLE_UPDATED_EVENT,
      WALK_FORWARD_UPDATED_EVENT,
      "storage"
    ];
    events.forEach((eventName) => window.addEventListener(eventName, refresh));
    refresh();
    return () => {
      mounted = false;
      events.forEach((eventName) => window.removeEventListener(eventName, refresh));
    };
  }, []);

  useEffect(() => {
    setManualReplayStatus("idle");
    setManualReplayResult(undefined);
    setManualReplayError(undefined);
  }, [snapshot?.marketData.activeResearchSource.fingerprint]);

  const htfSummary = useMemo(
    () =>
      snapshot?.mt5ReadOnly.higherTimeframeSources?.length
        ? snapshot.mt5ReadOnly.higherTimeframeSources.map((source) => `${source.timeframe}:${source.candleCount.toLocaleString()}`).join(", ")
        : "missing/not fetched",
    [snapshot?.mt5ReadOnly.higherTimeframeSources]
  );

  const manualReplayRequest = useMemo<IctManualReplayReviewRequest>(() => {
    const primaryTimeframe = snapshot?.marketData.timeframe ?? "5m";
    const htfTimeframes = snapshot?.mt5ReadOnly.higherTimeframeSources
      ?.map((source) => source.timeframe)
      .filter((timeframe) => timeframe !== primaryTimeframe);
    return {
      requestedSymbol: snapshot?.marketData.symbol ?? "MNQ",
      primaryTimeframe,
      htfTimeframes: htfTimeframes?.length ? htfTimeframes : ["15m", "1h"],
      candleLimit: 1000,
      replayWindowSize: 80,
      lookaheadCandles: 12
    };
  }, [snapshot?.marketData.symbol, snapshot?.marketData.timeframe, snapshot?.mt5ReadOnly.higherTimeframeSources]);

  if (!snapshot) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Research Advisor Workspace</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-50">Loading runtime snapshot</h2>
          <p className="mt-2 text-sm text-slate-400">Preparing compact advisory context. Deterministic research remains available.</p>
        </section>
      </div>
    );
  }

  const activeSource = snapshot.marketData.activeResearchSource;
  const brokerSymbol = snapshot.mt5ReadOnly.brokerSymbol ?? activeSource.provenance.providerSymbol ?? "n/a";
  const runManualReplayReview = async () => {
    if (manualReplayStatus === "running") return;
    setManualReplayStatus("running");
    setManualReplayError(undefined);
    try {
      const result = await runManualIctReplayReview(manualReplayRequest);
      setManualReplayResult(result);
      setManualReplayStatus(result.status);
      setManualReplayError(undefined);
    } catch (error) {
      setManualReplayResult(undefined);
      setManualReplayStatus("failed");
      setManualReplayError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <section className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-5 shadow-[0_0_45px_rgba(8,145,178,0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Research Advisor Workspace</p>
            <h2 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-normal text-slate-50">
              <MessageSquareText className="h-5 w-5 text-cyan-300" aria-hidden="true" />
              Advisory chat and source context
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Full-size advisory workspace for local LLM or phone OpenClaw review. GoTrader sends compact research packets only; deterministic gates remain authoritative.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="warning">advisory-only</Badge>
            <Badge variant="danger">execution none</Badge>
            <Badge variant="secondary">readiness override none</Badge>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AdvisorReadout label="Research source" value={snapshot.marketData.activeResearchSourceLabel} detail={activeSource.provider.replace(/_/g, " ")} />
          <AdvisorReadout label="Symbol mapping" value={`${brokerSymbol} -> ${snapshot.marketData.symbol}`} detail={snapshot.mt5ReadOnly.displayLabel ?? "MT5 selected mapping"} />
          <AdvisorReadout label="Primary timeframe" value={snapshot.marketData.timeframe} detail={`${activeSource.candleCount.toLocaleString()} candles`} />
          <AdvisorReadout label="Higher timeframe context" value={htfSummary} detail="context-only; no broker authority" />
          <AdvisorReadout label="Regime" value={formatToken(snapshot.regime.label)} detail={`${Math.round(snapshot.regime.confidence * 100)}% / ${snapshot.regime.dataQuality}`} />
          <AdvisorReadout label="Grinch profile" value={snapshot.latestResearchCycle.activeGrinchProfileSummary?.profile ?? "not_present"} detail={snapshot.latestResearchCycle.activeGrinchProfileSummary?.hardGateReason ?? "no hard gate"} />
          <AdvisorReadout label="Readiness" value={snapshot.readiness.readinessState} detail={snapshot.readiness.nextAction} />
          <AdvisorReadout label="Last candle" value={formatDate(activeSource.lastTimestamp)} detail={activeSource.fingerprint.slice(0, 20)} />
        </div>
        <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm leading-5 text-amber-100">
          MT5 read-only market data is CFD/proxy or broker market data for research context only. It is not CME futures broker truth and cannot place, modify, or route orders.
        </div>
      </section>

      <IctAdvisorSummaryPanel snapshot={snapshot} />

      <ManualReplayReviewPanel
        brokerSymbol={brokerSymbol}
        onRun={runManualReplayReview}
        request={manualReplayRequest}
        result={manualReplayResult}
        status={manualReplayStatus}
        error={manualReplayError}
      />

      <LLMAdvisoryReviewPanel snapshot={snapshot} />

      <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-50">Packet Safety Contract</h3>
        </div>
        <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-3">
          <AdvisorReadout label="Excluded" value="candles / raw snapshots" detail="No candle arrays, raw source objects, logs, screenshots, or base64 payloads." />
          <AdvisorReadout label="Excluded" value="secrets / credentials" detail="No MT5 credentials, account data, orders, or positions." />
          <AdvisorReadout label="Authority" value="none" detail="OpenClaw and LLM advice cannot promote readiness or execute anything." />
        </div>
      </section>
    </div>
  );
}

function ManualReplayReviewPanel({
  brokerSymbol,
  error,
  onRun,
  request,
  result,
  status
}: {
  brokerSymbol: string;
  error?: string;
  onRun: () => Promise<void>;
  request: IctManualReplayReviewRequest;
  result?: IctManualReplayReviewResult;
  status: IctManualReplayReviewStatus;
}) {
  const statusVariant =
    status === "completed" ? "success" : status === "unavailable" || status === "running" ? "warning" : status === "failed" ? "danger" : "secondary";
  const statusMessage =
    status === "idle"
      ? "Idle. Real MT5 replay review runs only after explicit user action."
      : status === "running"
        ? "Running real MT5 replay review with compact output only..."
        : status === "completed"
          ? "Manual replay review completed."
          : status === "unavailable"
            ? `Replay unavailable: ${result?.unavailableReason ?? "mt5_unavailable_or_not_configured"}.`
            : `Replay failed: ${error ?? result?.errors[0] ?? "unknown_error"}.`;
  const rowLabel = (row: { key: string; totalSignals: number; targetFirstRate: number; averageRrAchieved: number }) =>
    `${formatToken(row.key)}: ${row.totalSignals} signals / ${pct(row.targetFirstRate)} / ${rr(row.averageRrAchieved)}`;

  return (
    <section data-testid="ict-manual-replay-review" className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Manual ICT Replay Review</p>
          <h3 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-50">
            <BarChart3 className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            Real-data replay on demand
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Runs the real MT5 replay runner only when requested, then stores and displays compact research-only metrics. Raw candles, snapshots, secrets, account data, orders, and positions are excluded.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge data-testid="ict-manual-replay-status" variant={statusVariant}>{formatToken(status)}</Badge>
          <Badge variant="danger">authority none</Badge>
          <Badge variant="secondary">researchOnly true</Badge>
          <Button type="button" size="sm" onClick={onRun} disabled={status === "running"}>
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {status === "running" ? "Running..." : "Run Real Replay Review"}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdvisorReadout label="Requested symbol" value={request.requestedSymbol} detail={`broker ${result?.brokerSymbol ?? brokerSymbol}`} />
        <AdvisorReadout label="Primary timeframe" value={request.primaryTimeframe} detail={`${request.candleLimit.toLocaleString()} candle limit`} />
        <AdvisorReadout label="HTF timeframes" value={request.htfTimeframes.join(", ")} detail="context-only" />
        <AdvisorReadout label="Replay shape" value={`${request.replayWindowSize}/${request.lookaheadCandles}`} detail="window / lookahead candles" />
      </div>
      <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-300">{statusMessage}</p>
      {result ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AdvisorReadout label="Run ID" value={result.runId ?? "n/a"} detail={formatDate(result.generatedAt)} />
            <AdvisorReadout label="Total windows" value={result.totalWindows.toLocaleString()} />
            <AdvisorReadout label="Total signals" value={result.totalSignals.toLocaleString()} />
            <AdvisorReadout label="Total no-trades" value={result.totalNoTrades.toLocaleString()} />
            <AdvisorReadout label="Target-first rate" value={pct(result.targetFirstRate)} />
            <AdvisorReadout label="Invalidation-first rate" value={pct(result.invalidationFirstRate)} />
            <AdvisorReadout label="Average RR achieved" value={rr(result.averageRrAchieved)} />
            <AdvisorReadout label="Approved target-first" value={pct(result.approvedTargetFirstRate)} detail={rr(result.approvedAverageRr)} />
            <AdvisorReadout label="Approved" value={result.approvedProfileCounts.totalApproved.toLocaleString()} detail="approved profile count" />
            <AdvisorReadout label="Watchlist" value={result.approvedProfileCounts.totalWatchlist.toLocaleString()} />
            <AdvisorReadout label="Rejected" value={result.approvedProfileCounts.totalRejected.toLocaleString()} />
            <AdvisorReadout label="No-trade profile" value={result.approvedProfileCounts.totalNoTrade.toLocaleString()} />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <AdvisorList
              label="Most common no-trade reasons"
              values={result.mostCommonNoTradeReasons.map((item) => `${item.reason} (${item.count})`)}
              empty="none"
            />
            <AdvisorList
              label="Top calibration filter improvements"
              values={result.topCalibrationFilterImprovements.map((item) => `${item.label}: ${pct(item.targetFirstRateChange)} / ${rr(item.averageRrChange)}`)}
              empty="none"
            />
            <AdvisorList
              label="Best / worst setup"
              values={[
                result.bestSetup ? `Best ${rowLabel(result.bestSetup)}` : "",
                result.worstSetup ? `Worst ${rowLabel(result.worstSetup)}` : ""
              ].filter(Boolean)}
              empty="none"
            />
            <AdvisorList
              label="Approved-profile comparison"
              values={result.approvedProfileComparison.map(
                (profile) =>
                  `${profile.label}: ${profile.totalApproved} approved / ${profile.totalWatchlist} watchlist / ${profile.totalRejected} rejected`
              )}
              empty="none"
            />
            <AdvisorList
              label="SMT confirmation / rejection"
              values={[
                ...result.smtSummary.confirmation.map(rowLabel),
                ...result.smtSummary.rejection.map(rowLabel),
                ...result.smtSummary.divergenceTypes.map(rowLabel)
              ]}
              empty="none"
            />
            <AdvisorList
              label="News / session risk"
              values={[
                ...result.newsSessionRiskSummary.newsRiskLevels.map(rowLabel),
                ...result.newsSessionRiskSummary.sessionRiskStates.map(rowLabel),
                ...result.newsSessionRiskSummary.riskGovernorActions.map(rowLabel)
              ]}
              empty="none"
            />
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-3">
            <AdvisorReadout label="Safety" value="raw candles excluded" detail="No raw candles, snapshots, secrets, account/order/position data." />
            <AdvisorReadout
              label="Authority"
              value={`${result.authority.executionAuthority}/${result.authority.brokerAuthority}/${result.authority.readinessOverrideAuthority}`}
              detail="Replay review cannot promote readiness."
            />
            <AdvisorReadout label="Journal" value="compact manual event" detail="ict_manual_replay_review / researchOnly true" />
          </div>
        </>
      ) : null}
    </section>
  );
}

function AdvisorReadout({ detail, label, value }: { detail?: string; label: string; value: string }) {
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
      <p className="mt-1 text-sm font-semibold leading-5 text-slate-100">{values.length ? values.slice(0, 5).join("; ") : empty}</p>
    </div>
  );
}
