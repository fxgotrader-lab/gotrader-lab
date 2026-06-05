import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, MessageSquareText, PlayCircle, ShieldCheck } from "lucide-react";

import { IctAdvisorSummaryPanel } from "@/components/advisor/IctAdvisorSummaryPanel";
import { LLMAdvisoryReviewPanel } from "@/components/dashboard/LLMAdvisoryReviewPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildManualReplayResearchReport,
  buildMarketScorecardResearchReport,
  appendIctApprovedProfileOptimizationJournalEvent,
  buildIctApprovedProfileOptimizationJournalEvent,
  buildIctMarketScorecard,
  DEFAULT_ICT_MARKET_SCORECARD_SYMBOLS,
  listIctResearchReports,
  optimizeApprovedProfileFromReplayResults,
  researchReportSourceLabel,
  runIctRealReplay,
  runManualIctReplayReview,
  saveIctResearchReport,
  summarizeIctResearchReport,
  type IctApprovedProfileOptimizationResult,
  type IctMarketScorecard,
  type IctMarketScorecardConfig,
  type IctMarketScorecardStatus,
  type IctManualReplayReviewRequest,
  type IctManualReplayReviewResult,
  type IctManualReplayReviewStatus,
  type IctResearchReport,
  type IctResearchReportSaveResult
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
type MarketScorecardRunStatus = "idle" | "running" | "completed" | "unavailable" | "failed";
type ProfileOptimizationRunStatus = "idle" | "running" | "completed" | "unavailable" | "failed";

export function ResearchAdvisorView() {
  const [snapshot, setSnapshot] = useState<ResearchRuntimeSnapshot>();
  const [manualReplayStatus, setManualReplayStatus] = useState<IctManualReplayReviewStatus>("idle");
  const [manualReplayResult, setManualReplayResult] = useState<IctManualReplayReviewResult>();
  const [manualReplayError, setManualReplayError] = useState<string>();
  const [marketScorecardStatus, setMarketScorecardStatus] = useState<MarketScorecardRunStatus>("idle");
  const [marketScorecard, setMarketScorecard] = useState<IctMarketScorecard>();
  const [marketScorecardError, setMarketScorecardError] = useState<string>();
  const [profileOptimizationStatus, setProfileOptimizationStatus] = useState<ProfileOptimizationRunStatus>("idle");
  const [profileOptimization, setProfileOptimization] = useState<IctApprovedProfileOptimizationResult>();
  const [profileOptimizationError, setProfileOptimizationError] = useState<string>();
  const [savedReports, setSavedReports] = useState<IctResearchReport[]>([]);
  const [manualReportSaveResult, setManualReportSaveResult] = useState<IctResearchReportSaveResult>();
  const [scorecardReportSaveResult, setScorecardReportSaveResult] = useState<IctResearchReportSaveResult>();

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
    const refreshReports = () => setSavedReports(listIctResearchReports());
    refreshReports();
    window.addEventListener("gotrader:ict-research-report-saved", refreshReports);
    window.addEventListener("storage", refreshReports);
    return () => {
      window.removeEventListener("gotrader:ict-research-report-saved", refreshReports);
      window.removeEventListener("storage", refreshReports);
    };
  }, []);

  useEffect(() => {
    setManualReplayStatus("idle");
    setManualReplayResult(undefined);
    setManualReplayError(undefined);
    setMarketScorecardStatus("idle");
    setMarketScorecard(undefined);
    setMarketScorecardError(undefined);
    setProfileOptimizationStatus("idle");
    setProfileOptimization(undefined);
    setProfileOptimizationError(undefined);
    setManualReportSaveResult(undefined);
    setScorecardReportSaveResult(undefined);
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

  const marketScorecardConfig = useMemo<IctMarketScorecardConfig>(
    () => ({
      requestedSymbols: [...DEFAULT_ICT_MARKET_SCORECARD_SYMBOLS],
      primaryTimeframe: snapshot?.marketData.timeframe ?? "5m",
      htfTimeframes: manualReplayRequest.htfTimeframes,
      candleLimit: 1000,
      replayWindowSize: 80,
      lookaheadCandles: 12
    }),
    [manualReplayRequest.htfTimeframes, snapshot?.marketData.timeframe]
  );

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
  const runMarketScorecard = async () => {
    if (marketScorecardStatus === "running") return;
    setMarketScorecardStatus("running");
    setMarketScorecardError(undefined);
    try {
      const result = await buildIctMarketScorecard(marketScorecardConfig);
      setMarketScorecard(result);
      setMarketScorecardStatus(result.summary.completedSymbols > 0 ? "completed" : "unavailable");
    } catch (error) {
      setMarketScorecard(undefined);
      setMarketScorecardStatus("failed");
      setMarketScorecardError(error instanceof Error ? error.message : String(error));
    }
  };
  const runProfileOptimization = async () => {
    if (profileOptimizationStatus === "running") return;
    setProfileOptimizationStatus("running");
    setProfileOptimizationError(undefined);
    try {
      const replayRun = await runIctRealReplay(
        {
          requestedSymbols: [manualReplayRequest.requestedSymbol],
          primaryTimeframes: [manualReplayRequest.primaryTimeframe],
          htfTimeframes: manualReplayRequest.htfTimeframes,
          candleLimit: manualReplayRequest.candleLimit,
          replayWindowSize: manualReplayRequest.replayWindowSize,
          lookaheadCandles: manualReplayRequest.lookaheadCandles,
          researchOnly: true
        },
        {
          appendJournal: false,
          includeDiagnostics: true,
          includeReplayResults: true
        }
      );
      const result = optimizeApprovedProfileFromReplayResults(replayRun.replayResults ?? [], "balanced_quality");
      appendIctApprovedProfileOptimizationJournalEvent(buildIctApprovedProfileOptimizationJournalEvent(result));
      setProfileOptimization(result);
      setProfileOptimizationStatus(result.baseline.totalSignals > 0 ? "completed" : "unavailable");
    } catch (error) {
      setProfileOptimization(undefined);
      setProfileOptimizationStatus("failed");
      setProfileOptimizationError(error instanceof Error ? error.message : String(error));
    }
  };
  const saveManualReplayReport = () => {
    if (!manualReplayResult || manualReplayResult.status !== "completed") return;
    const saveResult = saveIctResearchReport(buildManualReplayResearchReport(manualReplayResult));
    setManualReportSaveResult(saveResult);
    setSavedReports(listIctResearchReports());
  };
  const saveMarketScorecardReport = () => {
    if (!marketScorecard || marketScorecardStatus !== "completed") return;
    const saveResult = saveIctResearchReport(buildMarketScorecardResearchReport(marketScorecard));
    setScorecardReportSaveResult(saveResult);
    setSavedReports(listIctResearchReports());
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_82%_6%,rgba(168,85,247,0.16),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-5 shadow-[0_0_70px_rgba(8,145,178,0.13)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-300">Research Advisor Workspace</p>
            <h2 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-normal text-slate-50 md:text-3xl">
              <MessageSquareText className="h-6 w-6 text-cyan-300" aria-hidden="true" />
              ICT decision review
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Full-size advisory board for deterministic ICT/Grinch review plus local LLM or phone OpenClaw explanation. Compact packets only; GoTrader gates remain authoritative.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">advisory-only</Badge>
            <Badge variant="danger">execution none</Badge>
            <Badge variant="secondary">readiness override none</Badge>
            <Button variant="secondary" size="sm">
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {["Setup", "Replay", "Scorecard", "Diagnostics", "Journal"].map((label) => (
            <span key={label} className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs font-medium text-slate-300">
              {label}
            </span>
          ))}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AdvisorReadout label="Research source" value={snapshot.marketData.activeResearchSourceLabel} detail={activeSource.provider.replace(/_/g, " ")} />
          <AdvisorReadout label="Symbol mapping" value={`${brokerSymbol} -> ${snapshot.marketData.symbol}`} detail={snapshot.mt5ReadOnly.displayLabel ?? "MT5 selected mapping"} />
          <AdvisorReadout label="Primary timeframe" value={snapshot.marketData.timeframe} detail={`${activeSource.candleCount.toLocaleString()} candles`} />
          <AdvisorReadout label="Higher timeframe context" value={htfSummary} detail="context-only; no broker authority" />
          <AdvisorReadout label="Regime" value={formatToken(snapshot.regime.label)} detail={`${Math.round(snapshot.regime.confidence * 100)}% / ${snapshot.regime.dataQuality}`} />
          <AdvisorReadout label="Grinch profile" value={snapshot.latestResearchCycle.activeGrinchProfileSummary?.profile ?? "not_present"} detail={snapshot.latestResearchCycle.activeGrinchProfileSummary?.hardGateReason ?? "no hard gate"} />
          <AdvisorReadout label="Readiness" value={snapshot.readiness.readinessState} detail={snapshot.readiness.nextAction} />
          <AdvisorReadout label="Last candle" value={formatDate(activeSource.lastTimestamp)} detail={activeSource.fingerprint.slice(0, 20)} />
        </div>
        <div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm leading-5 text-amber-100">
          MT5 read-only market data is CFD/proxy or broker market data for research context only. It is not CME futures broker truth and cannot place, modify, or route orders.
        </div>
      </section>

      <IctAdvisorSummaryPanel snapshot={snapshot} />

      <ManualReplayReviewPanel
        brokerSymbol={brokerSymbol}
        onRun={runManualReplayReview}
        onSave={saveManualReplayReport}
        request={manualReplayRequest}
        result={manualReplayResult}
        saveResult={manualReportSaveResult}
        status={manualReplayStatus}
        error={manualReplayError}
      />

      <ApprovedProfileOptimizerPanel
        error={profileOptimizationError}
        onRun={runProfileOptimization}
        request={manualReplayRequest}
        result={profileOptimization}
        status={profileOptimizationStatus}
      />

      <MarketScorecardPanel
        config={marketScorecardConfig}
        error={marketScorecardError}
        onRun={runMarketScorecard}
        onSave={saveMarketScorecardReport}
        scorecard={marketScorecard}
        saveResult={scorecardReportSaveResult}
        status={marketScorecardStatus}
      />

      <SavedResearchReportsPanel reports={savedReports} />

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
  onSave,
  request,
  result,
  saveResult,
  status
}: {
  brokerSymbol: string;
  error?: string;
  onRun: () => Promise<void>;
  onSave: () => void;
  request: IctManualReplayReviewRequest;
  result?: IctManualReplayReviewResult;
  saveResult?: IctResearchReportSaveResult;
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
          <Button type="button" size="sm" variant="secondary" onClick={onSave} disabled={result?.status !== "completed"}>
            Save Replay Report
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
      {saveResult ? <SaveResultNotice result={saveResult} /> : null}
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

function ApprovedProfileOptimizerPanel({
  error,
  onRun,
  request,
  result,
  status
}: {
  error?: string;
  onRun: () => Promise<void>;
  request: IctManualReplayReviewRequest;
  result?: IctApprovedProfileOptimizationResult;
  status: ProfileOptimizationRunStatus;
}) {
  const statusVariant =
    status === "completed" ? "success" : status === "unavailable" || status === "running" ? "warning" : status === "failed" ? "danger" : "secondary";
  const statusMessage =
    status === "idle"
      ? "Idle. Profile optimization runs only after explicit user action and does not change production settings."
      : status === "running"
        ? "Running compact real replay optimization..."
        : status === "completed"
          ? "Approved-profile optimization completed."
          : status === "unavailable"
            ? "Optimization unavailable: replay produced no research signals."
            : `Optimization failed: ${error ?? "unknown_error"}.`;
  const recommended = result?.recommendedProfile;
  const yesNo = (value?: boolean) => (value ? "yes" : "no");
  const tooFewSignals =
    recommended && recommended.results.approvedCount > 0 && recommended.results.approvedCount < Math.max(3, recommended.results.totalSignalsBefore * 0.03);

  return (
    <section data-testid="ict-approved-profile-optimizer" className="rounded-xl border border-violet-300/15 bg-slate-950/85 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">Optimize Approved Profile</p>
          <h3 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-50">
            <BarChart3 className="h-5 w-5 text-violet-300" aria-hidden="true" />
            Research-only profile settings recommendation
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Tests approved-profile settings against compact replay outcomes to reduce noisy ICT signals. It recommends a draft profile only; no thresholds are changed automatically.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge data-testid="ict-approved-profile-optimizer-status" variant={statusVariant}>{formatToken(status)}</Badge>
          <Badge variant="danger">authority none</Badge>
          <Badge variant="secondary">researchOnly true</Badge>
          <Button type="button" size="sm" onClick={onRun} disabled={status === "running"}>
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {status === "running" ? "Optimizing..." : "Run Profile Optimization"}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdvisorReadout label="Requested symbol" value={request.requestedSymbol} detail="uses MT5 mapping when available" />
        <AdvisorReadout label="Primary timeframe" value={request.primaryTimeframe} detail={`${request.candleLimit.toLocaleString()} candle limit`} />
        <AdvisorReadout label="HTF timeframes" value={request.htfTimeframes.join(", ")} detail="profile evidence context" />
        <AdvisorReadout label="Objective" value={formatToken(result?.objective ?? "balanced_quality")} detail="target-first, RR, and noise balance" />
      </div>
      <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-300">{statusMessage}</p>
      {result && recommended ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AdvisorReadout label="Baseline target-first" value={pct(result.baseline.targetFirstRate)} detail={`${result.baseline.totalSignals.toLocaleString()} replay signals`} />
            <AdvisorReadout label="Baseline average RR" value={rr(result.baseline.averageRrAchieved)} />
            <AdvisorReadout label="Recommended confidence" value={`${recommended.minConfidence}%`} detail={recommended.label} />
            <AdvisorReadout label="Recommended min RR" value={rr(recommended.minRr)} />
            <AdvisorReadout label="Signal reduction" value={pct(recommended.results.signalReductionPct)} detail={`${recommended.results.approvedCount} approved / ${recommended.results.rejectedCount} rejected`} />
            <AdvisorReadout label="Improved target-first" value={pct(recommended.results.targetFirstRate)} detail={`score ${recommended.score.toFixed(2)}`} />
            <AdvisorReadout label="Improved average RR" value={rr(recommended.results.averageRrAchieved)} />
            <AdvisorReadout label="Invalidation-first" value={pct(recommended.results.invalidationFirstRate)} />
            <AdvisorReadout label="HTF alignment" value={yesNo(recommended.requireHtfAlignment)} />
            <AdvisorReadout label="FVG required" value={yesNo(recommended.requireFvgPresent)} />
            <AdvisorReadout label="SMT confirmation" value={yesNo(recommended.requireSmtConfirmationForIndex)} />
            <AdvisorReadout label="News filters" value={recommended.rejectMediumNewsRisk ? "high + medium" : "high only"} />
          </div>
          {tooFewSignals ? (
            <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm leading-5 text-amber-100">
              Warning: this profile leaves a small approved sample. Keep it draft-only until additional replay windows confirm the edge.
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <AdvisorList label="Strengths" values={recommended.strengths} empty="none" />
            <AdvisorList label="Weaknesses" values={recommended.weaknesses} empty="none" />
            <AdvisorList label="Recommendation" values={[result.recommendationSummary, result.nextTestSuggestion]} empty="none" />
            <AdvisorList
              label="Safety"
              values={[
                "Draft recommendation only; no production profile mutation.",
                `Authority ${result.authority.executionAuthority}/${result.authority.brokerAuthority}/${result.authority.readinessOverrideAuthority}.`,
                "Raw candles, snapshots, secrets, account data, orders, and positions excluded."
              ]}
              empty="none"
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

function MarketScorecardPanel({
  config,
  error,
  onRun,
  onSave,
  scorecard,
  saveResult,
  status
}: {
  config: IctMarketScorecardConfig;
  error?: string;
  onRun: () => Promise<void>;
  onSave: () => void;
  scorecard?: IctMarketScorecard;
  saveResult?: IctResearchReportSaveResult;
  status: MarketScorecardRunStatus;
}) {
  const statusVariant = marketScorecardBadgeVariant(status);
  const statusMessage =
    status === "idle"
      ? "Idle. Market scorecard runs only after explicit user action."
      : status === "running"
        ? "Running replay scorecard across configured markets with compact output only..."
        : status === "completed"
          ? "Market scorecard completed."
          : status === "unavailable"
            ? "No configured market completed replay. Check MT5 read-only availability and symbol mappings."
            : `Market scorecard failed: ${error ?? "unknown_error"}.`;
  const configuredSymbols = config.requestedSymbols.join(", ");

  return (
    <section data-testid="ict-market-scorecard" className="rounded-xl border border-emerald-300/15 bg-slate-950/85 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">ICT Market Scorecard</p>
          <h3 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-50">
            <BarChart3 className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            Side-by-side replay quality
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Compares configured markets with real replay, diagnostics, approved-profile, SMT, and news/session risk summaries. It runs only on demand and exposes compact research-only metrics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge data-testid="ict-market-scorecard-status" variant={statusVariant}>{formatToken(status)}</Badge>
          <Badge variant="danger">authority none</Badge>
          <Badge variant="secondary">researchOnly true</Badge>
          <Button type="button" size="sm" onClick={onRun} disabled={status === "running"}>
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {status === "running" ? "Running..." : "Run Market Scorecard"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onSave} disabled={status !== "completed" || !scorecard}>
            Save Scorecard Report
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdvisorReadout label="Configured symbols" value={configuredSymbols} detail="MNQ maps to USTECH, ES to US500, YM to US30." />
        <AdvisorReadout label="Primary timeframe" value={config.primaryTimeframe} detail={`${config.candleLimit.toLocaleString()} candle limit per market`} />
        <AdvisorReadout label="HTF timeframes" value={config.htfTimeframes.join(", ")} detail="context-only" />
        <AdvisorReadout label="Replay shape" value={`${config.replayWindowSize}/${config.lookaheadCandles}`} detail="window / lookahead candles" />
      </div>
      <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-300">{statusMessage}</p>
      {saveResult ? <SaveResultNotice result={saveResult} /> : null}
      {scorecard ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AdvisorReadout label="Completed" value={scorecard.summary.completedSymbols.toLocaleString()} detail={`${scorecard.summary.unavailableSymbols} unavailable`} />
            <AdvisorReadout label="Research-preferred" value={scorecard.summary.researchPreferredSymbols.join(", ") || "none"} />
            <AdvisorReadout label="Watchlist-only" value={scorecard.summary.watchlistOnlySymbols.join(", ") || "none"} />
            <AdvisorReadout label="Noisy" value={scorecard.summary.noisySymbols.join(", ") || "none"} />
            <AdvisorReadout label="Best target-first" value={scorecard.summary.bestApprovedTargetFirstSymbol ?? "n/a"} detail="approved-profile basis" />
            <AdvisorReadout label="Best average RR" value={scorecard.summary.bestApprovedRrSymbol ?? "n/a"} detail="approved-profile basis" />
            <AdvisorReadout label="Best approved/rejected" value={scorecard.summary.bestApprovedRejectedRatioSymbol ?? "n/a"} detail="approved-profile ratio" />
            <AdvisorReadout label="Cleanest symbol" value={scorecard.summary.cleanestSymbol ?? "n/a"} detail="research scorecard only" />
            <AdvisorReadout label="Generated" value={formatDate(scorecard.generatedAt)} detail={scorecard.runId} />
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-3 font-semibold">Symbol</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Approved target-first</th>
                  <th className="px-3 py-3 font-semibold">Approved RR</th>
                  <th className="px-3 py-3 font-semibold">A / W / R</th>
                  <th className="px-3 py-3 font-semibold">Signal reduction</th>
                  <th className="px-3 py-3 font-semibold">SMT</th>
                  <th className="px-3 py-3 font-semibold">Risk blocks</th>
                  <th className="px-3 py-3 font-semibold">Top setup</th>
                  <th className="px-3 py-3 font-semibold">No-trade reason</th>
                  <th className="px-3 py-3 font-semibold">Safety</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {scorecard.symbols.map((symbol) => {
                  const noTradeReason = symbol.mostCommonNoTradeReasons[0];
                  return (
                    <tr key={`${symbol.requestedSymbol}:${symbol.primaryTimeframe}`} className="text-slate-300">
                      <td className="px-3 py-3 align-top">
                        <p className="font-semibold text-slate-100">{symbol.requestedSymbol}</p>
                        <p className="text-xs text-slate-500">{symbol.brokerSymbol} / {symbol.primaryTimeframe}</p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Badge variant={marketScorecardBadgeVariant(symbol.status)}>{formatToken(symbol.status)}</Badge>
                        <p className="mt-1 max-w-[220px] text-xs leading-4 text-slate-500">{symbol.statusReason}</p>
                      </td>
                      <td className="px-3 py-3 align-top">{pct(symbol.approvedTargetFirstRate)}</td>
                      <td className="px-3 py-3 align-top">{rr(symbol.approvedAverageRr)}</td>
                      <td className="px-3 py-3 align-top">{symbol.approvedCount} / {symbol.watchlistCount} / {symbol.rejectedCount}<span className="block text-xs text-slate-500">ratio {symbol.approvedRejectedRatio.toFixed(2)}</span></td>
                      <td className="px-3 py-3 align-top">{pct(symbol.signalReductionPct)}</td>
                      <td className="px-3 py-3 align-top">{pct(symbol.smtConfirmRate)} / {pct(symbol.smtRejectRate)}</td>
                      <td className="px-3 py-3 align-top">{symbol.newsBlockedCount ?? 0} blocked / {symbol.newsCautionCount ?? 0} caution</td>
                      <td className="px-3 py-3 align-top">{symbol.topSetup ? formatToken(symbol.topSetup) : "n/a"}</td>
                      <td className="px-3 py-3 align-top">{noTradeReason ? `${formatToken(noTradeReason.reason)} (${noTradeReason.count})` : "none"}</td>
                      <td className="px-3 py-3 align-top">raw excluded / none</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-3">
            <AdvisorReadout label="Safety" value="raw candles excluded" detail="No raw candles, snapshots, secrets, account/order/position data." />
            <AdvisorReadout
              label="Authority"
              value={`${scorecard.authority.executionAuthority}/${scorecard.authority.brokerAuthority}/${scorecard.authority.readinessOverrideAuthority}`}
              detail="Scorecard cannot promote readiness."
            />
            <AdvisorReadout label="Journal" value="compact scorecard event" detail="ict_market_scorecard_summary / researchOnly true" />
          </div>
        </>
      ) : null}
    </section>
  );
}

function marketScorecardBadgeVariant(
  status: IctMarketScorecardStatus | MarketScorecardRunStatus
): "success" | "warning" | "danger" | "secondary" {
  if (status === "completed" || status === "research_preferred") return "success";
  if (status === "running" || status === "watchlist_only" || status === "insufficient_data") return "warning";
  if (status === "failed" || status === "unavailable") return "danger";
  return "secondary";
}

function SaveResultNotice({ result }: { result: IctResearchReportSaveResult }) {
  const variant = result.status === "saved" ? "success" : result.status === "failed" ? "danger" : "warning";
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-300">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={variant}>{formatToken(result.status)}</Badge>
        <span>{result.message}</span>
      </div>
      <div className="mt-2 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
        <span>Report ID: {result.reportId ?? "n/a"}</span>
        <span>Location: {result.path ?? "not persisted"}</span>
      </div>
    </div>
  );
}

function SavedResearchReportsPanel({ reports }: { reports: IctResearchReport[] }) {
  return (
    <section data-testid="ict-saved-research-reports" className="rounded-xl border border-white/10 bg-slate-950/65 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Saved Research Reports</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-50">Compact local report history</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Saved reports are local, compact, and research-only. The list shows summaries only; raw replay windows, candles, snapshots, secrets, account data, orders, and positions are not stored.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{reports.length} saved</Badge>
          <Badge variant="danger">authority none</Badge>
        </div>
      </div>
      {reports.length ? (
        <div className="mt-4 grid gap-3">
          {reports.slice(0, 6).map((report) => (
            <div key={report.reportId} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100">{report.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{researchReportSourceLabel(report.source)} / saved {formatDate(report.savedAt)}</p>
                </div>
                <Badge variant="secondary">{report.reportId}</Badge>
              </div>
              <p className="mt-2 text-sm leading-5 text-slate-300">{summarizeIctResearchReport(report)}</p>
              <p className="mt-2 text-xs text-slate-500">Research-only report. Authority {report.authority.executionAuthority}/{report.authority.brokerAuthority}/{report.authority.readinessOverrideAuthority}; raw data excluded.</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-400">
          No saved reports yet. Run Manual ICT Replay Review or ICT Market Scorecard, then save the compact report.
        </p>
      )}
    </section>
  );
}

function AdvisorReadout({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-100">{value}</p>
      {detail ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function AdvisorList({ empty, label, values }: { empty: string; label: string; values: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-5 text-slate-100">{values.length ? values.slice(0, 5).join("; ") : empty}</p>
    </div>
  );
}
