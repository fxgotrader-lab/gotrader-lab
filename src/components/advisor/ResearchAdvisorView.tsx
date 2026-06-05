import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BarChart3, MessageSquareText, PlayCircle, Send, ShieldCheck, Sparkles } from "lucide-react";

import { IctAdvisorSummaryPanel } from "@/components/advisor/IctAdvisorSummaryPanel";
import { LLMAdvisoryReviewPanel } from "@/components/dashboard/LLMAdvisoryReviewPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  appendIctMonteCarloJournalEvent,
  buildLatestMonteCarloSnapshot,
  buildLatestReplaySnapshot,
  buildLatestScorecardSnapshot,
  buildManualReplayResearchReport,
  buildIctAdvisorPacketFromRuntime,
  buildIctCurrentReadFromPacket,
  buildIctMonteCarloJournalEvent,
  buildMarketScorecardResearchReport,
  appendIctApprovedProfileOptimizationJournalEvent,
  buildIctApprovedProfileOptimizationJournalEvent,
  buildIctMarketScorecard,
  DEFAULT_ICT_MARKET_SCORECARD_SYMBOLS,
  extractMonteCarloOutcomesFromManualReplay,
  extractMonteCarloOutcomesFromMarketScorecard,
  listIctResearchReports,
  optimizeApprovedProfileFromReplayResults,
  readLatestResearchState,
  researchReportSourceLabel,
  runMonteCarloBatch,
  runIctRealReplay,
  runManualIctReplayReview,
  saveLatestResearchStatePatch,
  saveIctResearchReport,
  summarizeIctResearchReport,
  ICT_LATEST_RESEARCH_STATE_UPDATED_EVENT,
  type IctApprovedProfileOptimizationResult,
  type IctAdvisorPacket,
  type IctCurrentRead,
  type IctLatestResearchState,
  type IctMarketScorecard,
  type IctMarketScorecardConfig,
  type IctMarketScorecardStatus,
  type IctManualReplayReviewRequest,
  type IctManualReplayReviewResult,
  type IctManualReplayReviewStatus,
  type IctMonteCarloSummary,
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
const compactPrice = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "n/a";
type MarketScorecardRunStatus = "idle" | "running" | "completed" | "unavailable" | "failed";
type ProfileOptimizationRunStatus = "idle" | "running" | "completed" | "unavailable" | "failed";
type MonteCarloRunStatus = "idle" | "running" | "completed" | "unavailable" | "failed";
type AdvisorChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: string;
};

const createAdvisorMessage = (role: AdvisorChatMessage["role"], content: string): AdvisorChatMessage => ({
  id: `advisor_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  timestamp: new Date().toISOString()
});

const approvalVariant = (status?: IctAdvisorPacket["approvedProfileDecision"]["status"]) =>
  status === "approved_research_candidate"
    ? "success" as const
    : status === "watchlist_candidate"
      ? "warning" as const
      : status === "rejected_candidate" || status === "no_trade"
        ? "danger" as const
        : "secondary" as const;
const approvalLabel = (status?: IctAdvisorPacket["approvedProfileDecision"]["status"]) => {
  if (status === "approved_research_candidate") return "Approved";
  if (status === "watchlist_candidate") return "Watchlist";
  if (status === "rejected_candidate") return "Rejected";
  if (status === "no_trade") return "No Trade";
  return "Pending";
};
const riskVariant = (packet?: IctAdvisorPacket) =>
  packet?.compactSummary.riskGovernorAction === "reject_candidate" ||
  packet?.compactSummary.riskGovernorAction === "no_trade" ||
  packet?.compactSummary.sessionRiskState === "avoid"
    ? "danger" as const
    : packet?.compactSummary.riskGovernorAction === "downgrade_to_watchlist" ||
        packet?.compactSummary.sessionRiskState === "caution" ||
        packet?.compactSummary.newsRiskLevel === "medium"
      ? "warning" as const
      : packet
        ? "success" as const
        : "secondary" as const;
const riskLabel = (packet?: IctAdvisorPacket) => {
  const action = packet?.compactSummary.riskGovernorAction;
  if (!action) return "Risk: Pending";
  if (action === "allow") return "Risk: Clear";
  if (action === "downgrade_to_watchlist") return "Risk: Caution";
  return "Risk: Blocked";
};
const smtLabel = (packet?: IctAdvisorPacket) => {
  if (packet?.compactSummary.smtRejectsCandidate) return "SMT: Rejects";
  if (packet?.compactSummary.smtConfirmsCandidate) return "SMT: Confirms";
  return packet?.compactSummary.smtDivergenceType ? `SMT: ${formatToken(packet.compactSummary.smtDivergenceType)}` : "SMT: Pending";
};
const entryZoneLabel = (entryZone?: IctAdvisorPacket["recommendedSignal"]["entryZone"]) =>
  entryZone ? `${compactPrice(entryZone.low)}-${compactPrice(entryZone.high)}` : "n/a";

function buildLocalAdvisorReply(
  prompt: string,
  packet: IctAdvisorPacket | undefined,
  currentRead: IctCurrentRead,
  snapshot: ResearchRuntimeSnapshot,
  manualReplayStatus: IctManualReplayReviewStatus,
  marketScorecardStatus: MarketScorecardRunStatus,
  profileOptimizationStatus: ProfileOptimizationRunStatus
) {
  const lower = prompt.toLowerCase();
  if (!packet) {
    return `Advisor chat is UI-ready, but the current ICT read is ${formatToken(currentRead.dataStatus)}. ${currentRead.topReasons[0] ?? "No compact advisor packet is available yet."}`;
  }
  if (lower.includes("no trade") || lower.includes("why")) {
    const reasons = currentRead.topReasons.length
      ? currentRead.topReasons.slice(0, 3).join("; ")
      : "No explicit no-trade reason is available in the compact packet.";
    return `${approvalLabel(currentRead.approvedStatus)} context: ${reasons} Next action: ${currentRead.nextAction} Authority remains none.`;
  }
  if (lower.includes("risk")) {
    const notes = packet.recommendedSignal.riskNotes.length ? packet.recommendedSignal.riskNotes.slice(0, 3).join("; ") : "No additional risk notes in the compact packet.";
    return `${riskLabel(packet)}. News/session: ${formatToken(packet.compactSummary.sessionRiskState)}. ${notes}`;
  }
  if (lower.includes("smt")) {
    return `${smtLabel(packet)}. Relative strength leader: ${packet.compactSummary.relativeStrengthLeader ?? "n/a"}. Relative weakness: ${packet.compactSummary.relativeWeaknessLeader ?? "n/a"}.`;
  }
  if (lower.includes("replay")) {
    return `Replay status: ${formatToken(manualReplayStatus)}. Replay does not auto-run from page load; use the quick action or lower replay panel when you want a real replay review.`;
  }
  if (lower.includes("scorecard")) {
    return `Market scorecard status: ${formatToken(marketScorecardStatus)}. It remains idle until explicitly run.`;
  }
  if (lower.includes("optimize") || lower.includes("profile")) {
    return `Profile optimizer status: ${formatToken(profileOptimizationStatus)}. Optimization is research-only and cannot auto-apply thresholds or promote readiness.`;
  }
  if (lower.includes("bias") || lower.includes("setup") || lower.includes("current")) {
    return `Current read: ${formatToken(currentRead.bias)} bias, ${formatToken(currentRead.bestSetup)} setup, ${formatToken(currentRead.side)} side, ${pct(currentRead.confidence)} confidence, ${formatToken(currentRead.approvedStatus)}. ${packet.recommendedSignal.summary}`;
  }
  return `Current GoTrader read: ${formatToken(currentRead.bias)} / ${approvalLabel(currentRead.approvedStatus)} / ${formatToken(currentRead.riskStatus)}. Source ${snapshot.marketData.activeResearchSource.provider.replace(/_/g, " ")} remains read-only with authority none.`;
}

export function ResearchAdvisorView() {
  const [snapshot, setSnapshot] = useState<ResearchRuntimeSnapshot>();
  const [manualReplayStatus, setManualReplayStatus] = useState<IctManualReplayReviewStatus>("idle");
  const [manualReplayResult, setManualReplayResult] = useState<IctManualReplayReviewResult>();
  const [manualReplayError, setManualReplayError] = useState<string>();
  const [marketScorecardStatus, setMarketScorecardStatus] = useState<MarketScorecardRunStatus>("idle");
  const [marketScorecard, setMarketScorecard] = useState<IctMarketScorecard>();
  const [marketScorecardError, setMarketScorecardError] = useState<string>();
  const [monteCarloStatus, setMonteCarloStatus] = useState<MonteCarloRunStatus>("idle");
  const [monteCarloSummary, setMonteCarloSummary] = useState<IctMonteCarloSummary>();
  const [monteCarloError, setMonteCarloError] = useState<string>();
  const [profileOptimizationStatus, setProfileOptimizationStatus] = useState<ProfileOptimizationRunStatus>("idle");
  const [profileOptimization, setProfileOptimization] = useState<IctApprovedProfileOptimizationResult>();
  const [profileOptimizationError, setProfileOptimizationError] = useState<string>();
  const [savedReports, setSavedReports] = useState<IctResearchReport[]>([]);
  const [latestResearchState, setLatestResearchState] = useState<IctLatestResearchState>();
  const [manualReportSaveResult, setManualReportSaveResult] = useState<IctResearchReportSaveResult>();
  const [scorecardReportSaveResult, setScorecardReportSaveResult] = useState<IctResearchReportSaveResult>();
  const [advisorPacket, setAdvisorPacket] = useState<IctAdvisorPacket>();
  const [advisorPacketError, setAdvisorPacketError] = useState<string>();
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<AdvisorChatMessage[]>([
    createAdvisorMessage(
      "assistant",
      "Advisor chat is UI-ready. I can summarize the current deterministic GoTrader read, setup blockers, replay status, risk, and SMT context. OpenClaw advisory can be connected separately when configured."
    )
  ]);

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
    const refreshLatestState = () => setLatestResearchState(readLatestResearchState());
    refreshLatestState();
    window.addEventListener(ICT_LATEST_RESEARCH_STATE_UPDATED_EVENT, refreshLatestState);
    window.addEventListener("storage", refreshLatestState);
    return () => {
      window.removeEventListener(ICT_LATEST_RESEARCH_STATE_UPDATED_EVENT, refreshLatestState);
      window.removeEventListener("storage", refreshLatestState);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!snapshot) {
      setAdvisorPacket(undefined);
      setAdvisorPacketError(undefined);
      return () => {
        mounted = false;
      };
    }
    void buildIctAdvisorPacketFromRuntime(snapshot)
      .then((packet) => {
        if (mounted) {
          setAdvisorPacket(packet);
          setAdvisorPacketError(undefined);
        }
      })
      .catch((error) => {
        if (mounted) {
          setAdvisorPacket(undefined);
          setAdvisorPacketError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      mounted = false;
    };
  }, [snapshot?.snapshotId, snapshot?.marketData.activeResearchSource.sourceId, snapshot?.marketData.activeResearchSource.fingerprint, snapshot?.mt5ReadOnly.higherTimeframeSources?.map((source) => source.fingerprint).join("|")]);

  useEffect(() => {
    setManualReplayStatus("idle");
    setManualReplayResult(undefined);
    setManualReplayError(undefined);
    setMarketScorecardStatus("idle");
    setMarketScorecard(undefined);
    setMarketScorecardError(undefined);
    setMonteCarloStatus("idle");
    setMonteCarloSummary(undefined);
    setMonteCarloError(undefined);
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
  const currentRead = useMemo(() => buildIctCurrentReadFromPacket(advisorPacket, latestResearchState), [advisorPacket, latestResearchState]);

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
    setMonteCarloStatus("idle");
    setMonteCarloSummary(undefined);
    setMonteCarloError(undefined);
    try {
      const result = await runManualIctReplayReview(manualReplayRequest);
      setManualReplayResult(result);
      setManualReplayStatus(result.status);
      if (result.status === "completed") {
        setLatestResearchState(
          saveLatestResearchStatePatch({ latestReplay: buildLatestReplaySnapshot(result) }, "manual_replay_review")
        );
      }
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
      if (result.summary.completedSymbols > 0) {
        setLatestResearchState(
          saveLatestResearchStatePatch({ latestScorecard: buildLatestScorecardSnapshot(result) }, "market_scorecard")
        );
      }
    } catch (error) {
      setMarketScorecard(undefined);
      setMarketScorecardStatus("failed");
      setMarketScorecardError(error instanceof Error ? error.message : String(error));
    }
  };
  const runMonteCarloRobustness = async () => {
    if (monteCarloStatus === "running") return;
    setMonteCarloStatus("running");
    setMonteCarloError(undefined);
    try {
      const manualOutcomes = extractMonteCarloOutcomesFromManualReplay(manualReplayResult);
      const scorecardOutcomes = extractMonteCarloOutcomesFromMarketScorecard(marketScorecard);
      if (!manualReplayResult || manualReplayResult.status !== "completed") {
        setMonteCarloSummary(undefined);
        setMonteCarloStatus("unavailable");
        setMonteCarloError("Run Replay Review first.");
        return;
      }
      if (!manualOutcomes.length) {
        setMonteCarloSummary(undefined);
        setMonteCarloStatus("unavailable");
        setMonteCarloError(
          scorecardOutcomes.length
            ? "Use Manual Replay Review for this Monte Carlo panel."
            : "Scorecard summary is compact; run Manual Replay Review for full Monte Carlo input."
        );
        return;
      }
      const summary = runMonteCarloBatch(manualOutcomes, {
        source: "manual_replay_review",
        randomSeed: 20260605,
        researchOnly: true
      });
      appendIctMonteCarloJournalEvent(buildIctMonteCarloJournalEvent(summary));
      setMonteCarloSummary(summary);
      setMonteCarloStatus("completed");
      setLatestResearchState(
        saveLatestResearchStatePatch({ latestMonteCarlo: buildLatestMonteCarloSnapshot(summary) }, "monte_carlo")
      );
    } catch (error) {
      setMonteCarloSummary(undefined);
      setMonteCarloStatus("failed");
      setMonteCarloError(error instanceof Error ? error.message : String(error));
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
  const submitAdvisorMessage = (content: string) => {
    const normalized = content.trim();
    if (!normalized) return;
    setChatMessages((messages) => [
      ...messages,
      createAdvisorMessage("user", normalized),
      createAdvisorMessage("assistant", buildLocalAdvisorReply(normalized, advisorPacket, currentRead, snapshot, manualReplayStatus, marketScorecardStatus, profileOptimizationStatus))
    ]);
    setChatInput("");
  };
  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitAdvisorMessage(chatInput);
  };
  const handleQuickAction = (action: string) => {
    if (action === "Run Replay Review") {
      void runManualReplayReview();
      submitAdvisorMessage("Run Replay Review");
      return;
    }
    if (action === "Run Market Scorecard") {
      void runMarketScorecard();
      submitAdvisorMessage("Run Market Scorecard");
      return;
    }
    if (action === "Optimize Profile") {
      void runProfileOptimization();
      submitAdvisorMessage("Optimize Profile");
      return;
    }
    submitAdvisorMessage(action);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <section data-testid="research-advisor-page-header" className="rounded-[24px] border border-white/10 bg-slate-950/75 p-5 shadow-[0_0_45px_rgba(8,145,178,0.07)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-300">GoTrader AI Workspace</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-50">Research Advisor</h1>
            <p className="mt-2 text-sm text-slate-400">ICT research assistant for read-only market analysis.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">MT5 Read Only</Badge>
            <Badge variant="warning">Research Only</Badge>
            <Badge variant="danger">Authority: None</Badge>
            <Button variant="secondary" size="sm">
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </section>

      <CurrentReadPanel currentRead={currentRead} packetError={advisorPacketError} />
      <LatestResearchStateStrip latestResearchState={latestResearchState} />

      <section data-testid="research-advisor-chat-workspace" className="grid items-start gap-4 xl:grid-cols-[minmax(220px,0.62fr)_minmax(420px,1.35fr)_minmax(240px,0.72fr)]">
        <ResearchAdvisorChatCard
          currentRead={currentRead}
          packet={advisorPacket}
          packetError={advisorPacketError}
          snapshot={snapshot}
          messages={chatMessages}
          inputValue={chatInput}
          onInputChange={setChatInput}
          onSubmit={handleChatSubmit}
          onQuickAction={handleQuickAction}
          manualReplayStatus={manualReplayStatus}
          marketScorecardStatus={marketScorecardStatus}
          profileOptimizationStatus={profileOptimizationStatus}
        />

        <div className="order-2 space-y-4 xl:order-1">
          <CompactContextCard
            title="Market Context"
            rows={[
              ["Requested", snapshot.marketData.symbol],
              ["Broker", brokerSymbol],
              ["Timeframe", snapshot.marketData.timeframe],
              ["HTF", htfSummary],
              ["Source", activeSource.provider.replace(/_/g, " ")]
            ]}
          />
          <CompactContextCard
            title="Current Bias"
            rows={[
              ["Bias", formatToken(currentRead.bias)],
              ["HTF aligned", currentRead.htfTimeframes.length ? "available" : "missing"],
              ["Regime", formatToken(snapshot.regime.label)],
              ["Readiness", snapshot.readiness.readinessState]
            ]}
          />
        </div>

        <div className="order-3 space-y-4">
          <AdvisorSidePanel
            packet={advisorPacket}
            manualReplayStatus={manualReplayStatus}
            manualReplayResult={manualReplayResult}
          />
        </div>
      </section>

      <section data-testid="advisor-deep-research-panels" className="space-y-4">
        <details className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-100">ICT Strategy Suite details</summary>
          <div className="mt-4">
            <IctAdvisorSummaryPanel snapshot={snapshot} packetOverride={advisorPacket} />
          </div>
        </details>

        <details data-testid="ict-current-read-data-flow" className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-100">Current Read Data Flow</summary>
          <div className="mt-4">
            <CurrentReadDataFlowPanel currentRead={currentRead} />
          </div>
        </details>

        <details data-testid="advisor-manual-replay-section" open className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-100">Manual Replay Review</summary>
          <div className="mt-4">
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
            <div className="mt-4">
              <MonteCarloRobustnessPanel
                error={monteCarloError}
                hasManualReplayResult={manualReplayResult?.status === "completed"}
                hasScorecard={marketScorecardStatus === "completed" && Boolean(marketScorecard)}
                onRun={runMonteCarloRobustness}
                status={monteCarloStatus}
                summary={monteCarloSummary}
              />
            </div>
          </div>
        </details>

        <details open className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-100">Optimize Profile</summary>
          <div className="mt-4">
            <ApprovedProfileOptimizerPanel
              error={profileOptimizationError}
              onRun={runProfileOptimization}
              request={manualReplayRequest}
              result={profileOptimization}
              status={profileOptimizationStatus}
            />
          </div>
        </details>

        <details data-testid="advisor-market-scorecard-section" open className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-100">Market Scorecard</summary>
          <div className="mt-4">
            <MarketScorecardPanel
              config={marketScorecardConfig}
              error={marketScorecardError}
              onRun={runMarketScorecard}
              onSave={saveMarketScorecardReport}
              scorecard={marketScorecard}
              saveResult={scorecardReportSaveResult}
              status={marketScorecardStatus}
            />
          </div>
        </details>

        <details open className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-100">Saved Research Reports</summary>
          <div className="mt-4">
            <SavedResearchReportsPanel reports={savedReports} />
          </div>
        </details>

        <details className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-100">External Advisory Bridge</summary>
          <div className="mt-4">
            <LLMAdvisoryReviewPanel snapshot={snapshot} />
          </div>
        </details>

        <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            <h3 className="text-base font-semibold text-slate-50">Packet Safety Contract</h3>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-3">
            <AdvisorReadout label="Excluded" value="candles / raw snapshots" detail="No candle arrays, raw source objects, logs, screenshots, or base64 payloads." />
            <AdvisorReadout label="Excluded" value="secrets / credentials" detail="No MT5 credentials, account data, orders, or positions." />
            <AdvisorReadout label="Authority" value="none" detail="OpenClaw and LLM advice cannot promote readiness or execute anything." />
          </div>
        </div>
      </section>
    </div>
  );
}

function LatestResearchStateStrip({ latestResearchState }: { latestResearchState?: IctLatestResearchState }) {
  const monteCarlo = latestResearchState?.latestMonteCarlo;
  const replay = latestResearchState?.latestReplay;
  const scorecard = latestResearchState?.latestScorecard;
  const pctWhole = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(value >= 10 ? 0 : 1)}%` : "n/a";

  return (
    <section data-testid="ict-latest-research-state" className="rounded-2xl border border-fuchsia-300/15 bg-[radial-gradient(circle_at_8%_0%,rgba(217,70,239,0.12),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.86),rgba(2,6,23,0.9))] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-300">Latest Research State</p>
          <h3 className="mt-1 text-base font-semibold text-slate-50">Manual replay, robustness, and scorecard snapshots</h3>
          <p className="mt-1 text-sm text-slate-400">
            Saved compact summaries only. These are latest manual research results, not live signal generation.
          </p>
        </div>
        <Badge variant={latestResearchState ? "success" : "secondary"}>
          {latestResearchState ? `updated ${formatDate(latestResearchState.updatedAt)}` : "no saved state"}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <AdvisorReadout
          label="Latest replay"
          value={replay ? `target-first ${pct(replay.approvedTargetFirstRate ?? replay.targetFirstRate)}` : "none saved"}
          detail={replay ? `${replay.requestedSymbol ?? "symbol"} ${replay.primaryTimeframe ?? ""} / ${replay.totalSignals ?? 0} signals` : "Run Manual Replay Review"}
        />
        <AdvisorReadout
          label="Latest Monte Carlo"
          value={formatToken(monteCarlo?.robustnessRating)}
          detail={monteCarlo ? `risk of ruin ${pctWhole(monteCarlo.riskOfRuinPct)} / max idea ${pctWhole(monteCarlo.recommendedMaxRiskPerTradePct)}` : "Run Monte Carlo Robustness"}
        />
        <AdvisorReadout
          label="Latest scorecard"
          value={scorecard?.bestApprovedTargetFirstSymbol ?? scorecard?.bestApprovedRrSymbol ?? scorecard?.researchPreferredSymbols[0] ?? "none saved"}
          detail={scorecard ? `${scorecard.completedSymbols} completed / preferred ${scorecard.researchPreferredSymbols.join(", ") || "none"}` : "Run Market Scorecard"}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="danger">authority none</Badge>
        <Badge variant="secondary">raw candles excluded</Badge>
        <Badge variant="secondary">manual results only</Badge>
      </div>
    </section>
  );
}

function CurrentReadPanel({ currentRead, packetError }: { currentRead: IctCurrentRead; packetError?: string }) {
  const dataVariant =
    currentRead.dataStatus === "ready"
      ? "success"
      : currentRead.dataStatus === "missing" || currentRead.dataStatus === "stale"
        ? "warning"
        : "danger";
  const statusText =
    currentRead.approvedStatus === "approved_research_candidate"
      ? "Approved research candidate"
      : currentRead.approvedStatus === "watchlist_candidate"
        ? "Watchlist"
        : currentRead.approvedStatus === "rejected_candidate"
          ? "Rejected"
          : "No Trade";

  return (
    <section data-testid="ict-current-read-panel" className="rounded-[24px] border border-cyan-300/15 bg-[radial-gradient(circle_at_16%_0%,rgba(34,211,238,0.13),transparent_36%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.94))] p-5 shadow-[0_0_55px_rgba(8,145,178,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Current Read</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">{statusText}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Live advisor summary from the active canonical source. Replay and scorecard results remain separate unless explicitly run.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={dataVariant}>{formatToken(currentRead.packetSource)}</Badge>
          <Badge variant={approvalVariant(currentRead.approvedStatus)}>{formatToken(currentRead.approvedStatus)}</Badge>
          <Badge variant="danger">authority none</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdvisorReadout label="Source" value={`${currentRead.brokerSymbol} -> ${currentRead.requestedSymbol}`} detail={`${currentRead.primaryTimeframe} / ${currentRead.candleCount?.toLocaleString() ?? 0} candles`} />
        <AdvisorReadout label="Phase 1" value={formatToken(currentRead.bestPhase1Setup)} detail={`${currentRead.debug.phase1SignalCount} signals evaluated`} />
        <AdvisorReadout label="Phase 2" value={formatToken(currentRead.bestPhase2Setup)} detail={`${currentRead.debug.phase2SignalCount} signals evaluated`} />
        <AdvisorReadout label="Best setup" value={formatToken(currentRead.bestSetup)} detail={`${formatToken(currentRead.side)} / ${pct(currentRead.confidence)}`} />
        <AdvisorReadout label="Bias" value={formatToken(currentRead.bias)} detail={`HTF ${currentRead.htfTimeframes.length ? currentRead.htfTimeframes.join(", ") : "missing"}`} />
        <AdvisorReadout label="SMT" value={formatToken(currentRead.smtStatus)} />
        <AdvisorReadout label="Risk" value={formatToken(currentRead.riskStatus)} />
        <AdvisorReadout label="RR / location" value={rr(currentRead.rrEstimate)} detail={formatToken(currentRead.dealingRangeLocation)} />
        <AdvisorReadout label="Latest replay" value={currentRead.latestReplayStatus ?? "none saved"} detail="manual result" />
        <AdvisorReadout
          label="Latest Monte Carlo"
          value={formatToken(currentRead.latestMonteCarloRobustness)}
          detail={
            typeof currentRead.latestMonteCarloRiskOfRuinPct === "number"
              ? `risk of ruin ${currentRead.latestMonteCarloRiskOfRuinPct.toFixed(1)}%`
              : "manual result"
          }
        />
        <AdvisorReadout
          label="Latest scorecard"
          value={currentRead.latestScorecardBestSymbol ?? "none saved"}
          detail={currentRead.latestScorecardResearchPreferredSymbols?.join(", ") || "manual result"}
        />
        <AdvisorReadout label="Latest state note" value={currentRead.latestResearchStateNote ?? "none saved"} detail="not live signal generation" />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
        <AdvisorList label="Why this state" values={packetError ? [packetError, ...currentRead.topReasons] : currentRead.topReasons} empty="No blockers reported." />
        <AdvisorReadout label="Next action" value={currentRead.nextAction} detail="Research-only; does not promote readiness." />
      </div>
    </section>
  );
}

function CurrentReadDataFlowPanel({ currentRead }: { currentRead: IctCurrentRead }) {
  const rows = [
    ["Packet source", currentRead.debug.packetSource],
    ["Data status", currentRead.dataStatus],
    ["Candle count", currentRead.debug.candleCount.toLocaleString()],
    ["Primary TF available", currentRead.debug.primaryTimeframeAvailable ? "yes" : "no"],
    ["HTF available", currentRead.debug.htfTimeframesAvailable.join(", ") || "none"],
    ["Phase 1 signal count", currentRead.debug.phase1SignalCount.toLocaleString()],
    ["Phase 2 signal count", currentRead.debug.phase2SignalCount.toLocaleString()],
    ["Approved status", currentRead.debug.approvedStatus],
    ["Rejection reasons", currentRead.debug.rejectionReasonsCount.toLocaleString()],
    ["No-trade reasons", currentRead.debug.noTradeReasonsCount.toLocaleString()],
    ["Journal", currentRead.debug.journalStatus ?? "pending"],
    ["Latest replay", currentRead.latestReplayStatus ?? "none"],
    ["Latest Monte Carlo", currentRead.latestMonteCarloRobustness ?? "none"],
    ["Latest scorecard best", currentRead.latestScorecardBestSymbol ?? "none"],
    ["Latest state updated", currentRead.latestResearchStateUpdatedAt ?? "none"],
    ["Last evaluation", formatDate(currentRead.debug.lastEvaluationAt)]
  ];

  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Debug</p>
          <h3 className="mt-1 text-base font-semibold text-slate-100">Current advisor data flow</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Compact fields only. Raw candles, snapshots, secrets, account data, orders, and positions are excluded.
          </p>
        </div>
        <Badge variant="danger">authority none</Badge>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {rows.map(([label, value]) => (
          <AdvisorReadout key={label} label={label} value={formatToken(value)} />
        ))}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <AdvisorReadout label="Raw candles" value={currentRead.safety.rawCandlesExcluded ? "excluded" : "included"} />
        <AdvisorReadout label="Raw snapshots" value={currentRead.safety.rawSnapshotsExcluded ? "excluded" : "included"} />
        <AdvisorReadout label="Authority" value={`${currentRead.authority.executionAuthority}/${currentRead.authority.brokerAuthority}/${currentRead.authority.readinessOverrideAuthority}`} />
      </div>
    </section>
  );
}

function ResearchAdvisorChatCard({
  currentRead,
  inputValue,
  manualReplayStatus,
  marketScorecardStatus,
  messages,
  onInputChange,
  onQuickAction,
  onSubmit,
  packet,
  packetError,
  profileOptimizationStatus,
  snapshot
}: {
  currentRead: IctCurrentRead;
  inputValue: string;
  manualReplayStatus: IctManualReplayReviewStatus;
  marketScorecardStatus: MarketScorecardRunStatus;
  messages: AdvisorChatMessage[];
  onInputChange: (value: string) => void;
  onQuickAction: (action: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  packet?: IctAdvisorPacket;
  packetError?: string;
  profileOptimizationStatus: ProfileOptimizationRunStatus;
  snapshot: ResearchRuntimeSnapshot;
}) {
  const quickActions = [
    "Explain Current Setup",
    "Why No Trade?",
    "Run Replay Review",
    "Run Market Scorecard",
    "Optimize Profile",
    "Show Risk",
    "Show SMT"
  ];
  const readSummary =
    packet?.recommendedSignal.summary ??
    packetError ??
    currentRead.topReasons[0] ??
    "Current setup summary is shown in the cards below. Advisor packet is still hydrating.";

  return (
    <section
      data-testid="research-advisor-chat-card"
      className="order-1 overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_86%_0%,rgba(168,85,247,0.13),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] shadow-[0_0_80px_rgba(8,145,178,0.12)] xl:order-2"
    >
      <div className="border-b border-white/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              GoTrader AI Research Assistant
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-50">Ask about this market read</h2>
          </div>
          <Badge variant="danger">Authority: None</Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="secondary">{snapshot.marketData.symbol}</Badge>
          <Badge variant="secondary">{snapshot.marketData.timeframe}</Badge>
          {(packet?.htfTimeframes.length ? packet.htfTimeframes : ["HTF missing"]).map((timeframe) => (
            <Badge key={timeframe} variant="secondary">{timeframe}</Badge>
          ))}
          <Badge variant={approvalVariant(currentRead.approvedStatus)}>{approvalLabel(currentRead.approvedStatus)}</Badge>
          <Badge variant={riskVariant(packet)}>{riskLabel(packet)}</Badge>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <AdvisorMessageBubble role="assistant">
          Welcome. I can explain the selected market, current ICT read, setup state, risk, replay status, SMT, and next research actions.
        </AdvisorMessageBubble>
        <AdvisorMessageBubble role="assistant">
          <span className="font-semibold text-slate-100">Current read:</span> {readSummary}
        </AdvisorMessageBubble>
        {messages.map((message) => (
          <AdvisorMessageBubble key={message.id} role={message.role}>{message.content}</AdvisorMessageBubble>
        ))}
      </div>

      <div className="border-t border-white/10 p-4">
        <AdvisorQuickActions actions={quickActions} onAction={onQuickAction} />
        <form className="mt-3 flex gap-2" onSubmit={onSubmit}>
          <input
            data-testid="research-advisor-chat-input"
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="Ask GoTrader about this setup, replay, risk, or market bias..."
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/15"
          />
          <Button type="submit" size="icon" aria-label="Send advisor message">
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Replay {formatToken(manualReplayStatus)} / scorecard {formatToken(marketScorecardStatus)} / optimizer {formatToken(profileOptimizationStatus)}. Chat replies are deterministic until OpenClaw advisory is explicitly configured.
        </p>
      </div>
    </section>
  );
}

function AdvisorMessageBubble({ children, role }: { children: ReactNode; role: AdvisorChatMessage["role"] }) {
  const user = role === "user";
  return (
    <div className={`flex ${user ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl border px-4 py-3 text-sm leading-6 ${
          user
            ? "border-cyan-300/25 bg-cyan-300/12 text-cyan-50"
            : "border-white/10 bg-white/[0.045] text-slate-300"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function AdvisorQuickActions({ actions, onAction }: { actions: string[]; onAction: (action: string) => void }) {
  return (
    <div data-testid="research-advisor-quick-actions" className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => onAction(action)}
          className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-cyan-300/35 hover:text-cyan-100"
        >
          {action}
        </button>
      ))}
    </div>
  );
}

function CompactContextCard({ rows, title }: { rows: Array<[string, string]>; title: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0">
            <span className="text-xs text-slate-500">{label}</span>
            <span className="text-right text-sm font-semibold text-slate-100">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdvisorSidePanel({
  manualReplayResult,
  manualReplayStatus,
  packet
}: {
  manualReplayResult?: IctManualReplayReviewResult;
  manualReplayStatus: IctManualReplayReviewStatus;
  packet?: IctAdvisorPacket;
}) {
  return (
    <>
      <AdvisorMetricCard
        title="Approved Setup"
        badge={approvalLabel(packet?.approvedProfileDecision.status)}
        badgeVariant={approvalVariant(packet?.approvedProfileDecision.status)}
        rows={[
          ["Side", formatToken(packet?.compactSummary.side)],
          ["Confidence", pct(packet?.compactSummary.confidence)],
          ["RR", typeof packet?.recommendedSignal.rrEstimate === "number" ? rr(packet.recommendedSignal.rrEstimate) : "n/a"],
          ["Entry", entryZoneLabel(packet?.recommendedSignal.entryZone)]
        ]}
      />
      <AdvisorMetricCard
        title="Risk State"
        badge={riskLabel(packet)}
        badgeVariant={riskVariant(packet)}
        rows={[
          ["News/session", formatToken(packet?.compactSummary.sessionRiskState)],
          ["SMT", smtLabel(packet)],
          ["Risk action", formatToken(packet?.compactSummary.riskGovernorAction)],
          ["No-trade reasons", String(packet?.compactSummary.noTradeReasonCount ?? 0)]
        ]}
      />
      <AdvisorMetricCard
        title="Replay Snapshot"
        badge={formatToken(manualReplayStatus)}
        badgeVariant={manualReplayStatus === "completed" ? "success" : manualReplayStatus === "failed" ? "danger" : "secondary"}
        rows={[
          ["Target-first", pct(manualReplayResult?.targetFirstRate)],
          ["Average RR", rr(manualReplayResult?.averageRrAchieved)],
          ["Signals", String(manualReplayResult?.totalSignals ?? 0)],
          ["Status", formatToken(manualReplayStatus)]
        ]}
      />
    </>
  );
}

function AdvisorMetricCard({
  badge,
  badgeVariant,
  rows,
  title
}: {
  badge: string;
  badgeVariant: "success" | "warning" | "danger" | "secondary";
  rows: Array<[string, string]>;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
        <Badge variant={badgeVariant}>{badge}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0">
            <span className="text-xs text-slate-500">{label}</span>
            <span className="text-right text-sm font-semibold text-slate-100">{value}</span>
          </div>
        ))}
      </div>
    </section>
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
          ? "Manual replay review completed. Latest Replay Saved as a compact research-only summary."
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

function MonteCarloRobustnessPanel({
  error,
  hasManualReplayResult,
  hasScorecard,
  onRun,
  status,
  summary
}: {
  error?: string;
  hasManualReplayResult: boolean;
  hasScorecard: boolean;
  onRun: () => Promise<void>;
  status: MonteCarloRunStatus;
  summary?: IctMonteCarloSummary;
}) {
  const statusVariant =
    status === "completed"
      ? summary?.recommendation.robustnessRating === "weak" || summary?.recommendation.robustnessRating === "insufficient_data"
        ? "warning"
        : "success"
      : status === "running" || status === "unavailable"
        ? "warning"
        : status === "failed"
          ? "danger"
          : "secondary";
  const statusMessage =
    status === "idle"
      ? hasManualReplayResult
        ? "Idle. Run Monte Carlo Robustness to resample compact approved replay outcomes."
        : "Run Replay Review first."
      : status === "running"
        ? "Running Monte Carlo robustness from compact replay outcomes..."
        : status === "completed"
          ? "Monte Carlo robustness completed. Latest Robustness Saved as a compact research-only summary."
          : status === "unavailable"
            ? error ?? (hasScorecard ? "Scorecard summary is compact; run Manual Replay Review for full Monte Carlo input." : "Run Replay Review first.")
            : `Monte Carlo failed: ${error ?? "unknown_error"}.`;
  const warnings = summary?.recommendation.warnings ?? [];

  return (
    <section data-testid="ict-monte-carlo-robustness" className="rounded-xl border border-fuchsia-300/15 bg-slate-950/85 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-300">Monte Carlo Robustness</p>
          <h3 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-50">
            <BarChart3 className="h-5 w-5 text-fuchsia-300" aria-hidden="true" />
            Replay outcome resampling
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Resamples approved ICT replay outcomes to estimate ending R, drawdown, losing streaks, risk of ruin, and max risk per idea. It does not create signals, promote readiness, or expose raw candles.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge data-testid="ict-monte-carlo-status" variant={statusVariant}>{formatToken(status)}</Badge>
          <Badge variant="danger">authority none</Badge>
          <Badge variant="secondary">researchOnly true</Badge>
          <Button type="button" size="sm" onClick={onRun} disabled={status === "running"}>
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {status === "running" ? "Running..." : "Run Monte Carlo Robustness"}
          </Button>
        </div>
      </div>
      <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-300">{statusMessage}</p>
      {hasScorecard && !summary ? (
        <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-5 text-amber-100">
          Scorecard summary is compact; run Manual Replay Review for full Monte Carlo input.
        </p>
      ) : null}
      {summary ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AdvisorReadout label="Robustness" value={formatToken(summary.recommendation.robustnessRating)} detail={summary.recommendation.reason} />
            <AdvisorReadout label="Usable outcomes" value={summary.input.usableOutcomes.toLocaleString()} detail={`${summary.input.totalOutcomes.toLocaleString()} total compact outcomes`} />
            <AdvisorReadout label="Median ending R" value={rr(summary.performance.medianEndingR)} detail={`5th ${rr(summary.performance.fifthPercentileEndingR)} / 95th ${rr(summary.performance.ninetyFifthPercentileEndingR)}`} />
            <AdvisorReadout label="Median max DD" value={`${summary.performance.medianMaxDrawdownPct.toFixed(2)}%`} detail={`worst ${summary.performance.worstMaxDrawdownPct.toFixed(2)}%`} />
            <AdvisorReadout label="Risk of ruin" value={`${summary.performance.riskOfRuinPct.toFixed(2)}%`} detail={`limit ${summary.performance.probabilityDrawdownOverLimitPct.toFixed(2)}%`} />
            <AdvisorReadout label="Worst losing streak" value={summary.performance.worstLongestLosingStreak.toLocaleString()} detail={`median ${summary.performance.medianLongestLosingStreak.toFixed(0)}`} />
            <AdvisorReadout label="Risk per idea" value={`${summary.recommendation.recommendedMaxRiskPerTradePct.toFixed(2)}%`} detail={`${summary.input.simulationCount.toLocaleString()} simulations`} />
            <AdvisorReadout label="Journal" value="compact MC summary" detail="ict_monte_carlo_summary / raw excluded" />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <AdvisorList label="Warnings" values={warnings} empty="none" />
            <AdvisorList
              label="Safety"
              values={[
                "No raw candles, snapshots, secrets, account data, orders, or positions.",
                `Authority ${summary.authority.executionAuthority}/${summary.authority.brokerAuthority}/${summary.authority.readinessOverrideAuthority}.`,
                "Monte Carlo is research-only and cannot approve Paper-Demo Candidate readiness."
              ]}
              empty="none"
            />
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
          ? "Market scorecard completed. Latest Scorecard Saved as a compact research-only summary."
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
