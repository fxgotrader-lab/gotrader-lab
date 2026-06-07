import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type FormEvent, type ReactNode, type SyntheticEvent } from "react";
import { Link } from "react-router-dom";
import { BarChart3, MessageSquareText, PlayCircle, Send, ShieldCheck, Sparkles } from "lucide-react";

import { IctAdvisorSummaryPanel } from "@/components/advisor/IctAdvisorSummaryPanel";
import { LLMAdvisoryReviewPanel } from "@/components/dashboard/LLMAdvisoryReviewPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  appendIctMonteCarloJournalEvent,
  appendIctPaperSignalJournalEvent,
  appendIctResearchSignalJournalEvent,
  buildIctPaperSignalJournalEvent,
  buildLatestMonteCarloSnapshot,
  buildLatestReplaySnapshot,
  buildLatestScorecardSnapshot,
  buildManualReplayResearchReport,
  buildIctAdvisorPacketFromRuntime,
  buildIctCurrentReadFromPacket,
  buildIctMonteCarloJournalEvent,
  buildIctResearchSignalFromCurrentRead,
  buildIctResearchSignalJournalEvent,
  appendIctCmdPaperTrackingJournalEvent,
  createCmdPaperTrackingFromResearchSignal,
  buildMarketScorecardResearchReport,
  buildIctMarketScorecardBrowserSafe,
  createPaperSignalFromResearchSignal,
  DEFAULT_ICT_BROWSER_RESEARCH_LIMITS,
  appendIctApprovedProfileOptimizationJournalEvent,
  buildIctApprovedProfileOptimizationJournalEvent,
  DEFAULT_ICT_MARKET_SCORECARD_SYMBOLS,
  extractMonteCarloOutcomesFromManualReplay,
  extractMonteCarloOutcomesFromMarketScorecard,
  ictBrowserSafeNotice,
  evaluateCmdPaperTrackingEligibility,
  readActiveCmdPaperTracking,
  saveActiveCmdPaperTracking,
  updateCmdPaperTrackingWithCandles,
  ICT_CMD_PAPER_TRACKING_UPDATED_EVENT,
  isResearchSignalEligibleForPaperSim,
  listIctResearchReports,
  optimizeApprovedProfileFromReplayResultsBrowserSafe,
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
  type IctCmdPaperTrackingEligibility,
  type IctCmdPaperTrackingRecord,
  type IctManualReplayReviewRequest,
  type IctManualReplayReviewResult,
  type IctManualReplayReviewStatus,
  type IctMonteCarloSummary,
  type IctPaperSignal,
  type IctPaperSignalEligibility,
  type IctResearchSignal,
  type IctResearchReport,
  type IctResearchReportSaveResult
} from "@/lib/ict-strategy-suite";
import { loadCanonicalCandleSource } from "@/lib/candleSources";
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
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error ?? "unknown_error");
const isAbortError = (error: unknown) => (error as { name?: string })?.name === "AbortError";
const browserSafeReplayCandleLimit = Math.min(1000, DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxCandlesPerSymbol);
const browserSafeMonteCarloSimulationCount = 300;
const browserSafeMonteCarloTradeCount = 60;
const safeList = <T,>(values: T[] | undefined | null): T[] => Array.isArray(values) ? values : [];
const safeCount = (value?: number) => (typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "0");
type MarketScorecardRunStatus = "idle" | "running" | "partial" | "completed" | "unavailable" | "failed" | "timed_out";
type ProfileOptimizationRunStatus = "idle" | "running" | "partial" | "completed" | "unavailable" | "failed" | "timed_out";
type MonteCarloRunStatus = "idle" | "running" | "completed" | "unavailable" | "failed";
type AdvisorChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: string;
};

class ResearchPanelErrorBoundary extends Component<
  { children: ReactNode; panelName: string; resetKey?: string },
  { error?: string }
> {
  state: { error?: string } = {};

  static getDerivedStateFromError(error: unknown) {
    return { error: errorMessage(error) };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.warn("Research Advisor panel unavailable", {
      panelName: this.props.panelName,
      message: errorMessage(error),
      componentStack: errorInfo.componentStack
    });
  }

  componentDidUpdate(previousProps: { resetKey?: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: undefined });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
          <p className="font-semibold">{this.props.panelName} unavailable.</p>
          <p>Panel unavailable. See console/logs. Research safety preserved.</p>
          <p className="mt-2 text-xs text-amber-200/80">Authority remains none/none/none. No broker execution was attempted.</p>
        </section>
      );
    }
    return this.props.children;
  }
}

const createAdvisorMessage = (role: AdvisorChatMessage["role"], content: string): AdvisorChatMessage => ({
  id: `advisor_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  timestamp: new Date().toISOString()
});

const approvalVariant = (status?: IctAdvisorPacket["approvedProfileDecision"]["status"]) =>
  status === "approved_research_candidate"
    ? "success" as const
    : status === "paper_watchlist_candidate"
      ? "warning" as const
    : status === "watchlist_candidate"
      ? "warning" as const
      : status === "rejected_candidate" || status === "no_trade"
        ? "danger" as const
        : "secondary" as const;
const approvalLabel = (status?: IctAdvisorPacket["approvedProfileDecision"]["status"]) => {
  if (status === "approved_research_candidate") return "Approved";
  if (status === "paper_watchlist_candidate") return "Paper Watchlist";
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
const researchSignalJournalKey = (signal: IctResearchSignal) =>
  [
    signal.requestedSymbol,
    signal.brokerSymbol,
    signal.primaryTimeframe,
    signal.status,
    signal.side,
    signal.setup,
    signal.approvedProfileStatus,
    signal.entryZone?.low,
    signal.entryZone?.high,
    signal.invalidation,
    signal.target,
    signal.rrEstimate
  ].map((value) => String(value ?? "none")).join("|");

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
    return `Current read: ${formatToken(currentRead.bias)} bias, ${formatToken(currentRead.bestSetup)} setup, ${formatToken(currentRead.side)} side, ${pct(currentRead.confidence)} confidence, model lane ${formatToken(currentRead.modelQualityLane)}. ${currentRead.paperWatchlistReason ?? packet.recommendedSignal.summary}`;
  }
  return `Current GoTrader read: ${formatToken(currentRead.bias)} / ${approvalLabel(currentRead.approvedStatus)} / model lane ${formatToken(currentRead.modelQualityLane)} / ${formatToken(currentRead.riskStatus)}. Paper Sim ${currentRead.paperWatchlistEligible ? "eligible" : "not eligible"}; execution disabled. Source ${snapshot.marketData.activeResearchSource.provider.replace(/_/g, " ")} remains read-only with authority none.`;
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
  const [savedReportsOpen, setSavedReportsOpen] = useState(false);
  const [latestResearchState, setLatestResearchState] = useState<IctLatestResearchState>();
  const [manualReportSaveResult, setManualReportSaveResult] = useState<IctResearchReportSaveResult>();
  const [scorecardReportSaveResult, setScorecardReportSaveResult] = useState<IctResearchReportSaveResult>();
  const [advisorPacket, setAdvisorPacket] = useState<IctAdvisorPacket>();
  const [advisorPacketError, setAdvisorPacketError] = useState<string>();
  const [paperSignal, setPaperSignal] = useState<IctPaperSignal>();
  const [cmdPaperTracking, setCmdPaperTracking] = useState<IctCmdPaperTrackingRecord>();
  const [cmdPaperTrackingMessage, setCmdPaperTrackingMessage] = useState<string>();
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<AdvisorChatMessage[]>([
    createAdvisorMessage(
      "assistant",
      "Advisor chat is UI-ready. I can summarize the current deterministic GoTrader read, setup blockers, replay status, risk, and SMT context. OpenClaw advisory can be connected separately when configured."
    )
  ]);
  const deepActionRunIdRef = useRef(0);
  const deepActionAbortRef = useRef<AbortController | undefined>(undefined);
  const lastResearchSignalJournalKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const refresh = () => setCmdPaperTracking(readActiveCmdPaperTracking());
    refresh();
    window.addEventListener(ICT_CMD_PAPER_TRACKING_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ICT_CMD_PAPER_TRACKING_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

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

  useEffect(() => () => {
    deepActionRunIdRef.current += 1;
    deepActionAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!savedReportsOpen) {
      return undefined;
    }
    const refreshReports = () => setSavedReports(listIctResearchReports());
    refreshReports();
    window.addEventListener("gotrader:ict-research-report-saved", refreshReports);
    window.addEventListener("storage", refreshReports);
    return () => {
      window.removeEventListener("gotrader:ict-research-report-saved", refreshReports);
      window.removeEventListener("storage", refreshReports);
    };
  }, [savedReportsOpen]);

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
    setPaperSignal(undefined);
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
      candleLimit: browserSafeReplayCandleLimit,
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
  const researchSignal = useMemo(
    () => buildIctResearchSignalFromCurrentRead(currentRead, latestResearchState),
    [currentRead, latestResearchState]
  );
  const paperSimEligibility = useMemo(
    () => isResearchSignalEligibleForPaperSim(researchSignal),
    [researchSignal]
  );
  const cmdPaperTrackingEligibility = useMemo(
    () => evaluateCmdPaperTrackingEligibility(researchSignal),
    [researchSignal]
  );

  useEffect(() => {
    if (!advisorPacket || !researchSignal.signalId) return;
    const stableJournalKey = researchSignalJournalKey(researchSignal);
    if (lastResearchSignalJournalKeyRef.current === stableJournalKey) return;
    lastResearchSignalJournalKeyRef.current = stableJournalKey;
    appendIctResearchSignalJournalEvent(buildIctResearchSignalJournalEvent(researchSignal));
  }, [advisorPacket?.packetId, researchSignal]);

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
  const deepResearchActionRunning =
    manualReplayStatus === "running" ||
    marketScorecardStatus === "running" ||
    monteCarloStatus === "running" ||
    profileOptimizationStatus === "running";
  const beginDeepResearchAction = () => {
    deepActionAbortRef.current?.abort();
    const controller = new AbortController();
    deepActionAbortRef.current = controller;
    const runId = deepActionRunIdRef.current + 1;
    deepActionRunIdRef.current = runId;
    return { controller, runId };
  };
  const isCurrentDeepResearchRun = (runId: number) => deepActionRunIdRef.current === runId;
  const runManualReplayReview = async () => {
    if (deepResearchActionRunning) return;
    const { controller, runId } = beginDeepResearchAction();
    setManualReplayStatus("running");
    setManualReplayError(undefined);
    setMonteCarloStatus("idle");
    setMonteCarloSummary(undefined);
    setMonteCarloError(undefined);
    try {
      const result = await runManualIctReplayReview(manualReplayRequest, {
        appendJournal: false,
        includeDiagnostics: true,
        includeReplayResults: true,
        maxReplayWindows: DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxReplayWindows
      });
      if (!isCurrentDeepResearchRun(runId)) return;
      setManualReplayResult(result);
      setManualReplayStatus(result.status);
      if (result.status === "completed") {
        try {
          setLatestResearchState(
            saveLatestResearchStatePatch({ latestReplay: buildLatestReplaySnapshot(result) }, "manual_replay_review")
          );
        } catch (persistError) {
          setManualReplayError(`Replay completed, but latest-state persistence failed: ${errorMessage(persistError)}`);
        }
      }
      if (result.status !== "completed") {
        setManualReplayError(result.unavailableReason ?? result.errors[0] ?? undefined);
      }
    } catch (error) {
      if (!isCurrentDeepResearchRun(runId)) return;
      setManualReplayResult(undefined);
      setManualReplayStatus("failed");
      setManualReplayError(errorMessage(error));
    } finally {
      if (isCurrentDeepResearchRun(runId) && deepActionAbortRef.current === controller) {
        deepActionAbortRef.current = undefined;
      }
    }
  };
  const runMarketScorecard = async () => {
    if (deepResearchActionRunning) return;
    const { controller, runId } = beginDeepResearchAction();
    setMarketScorecardStatus("running");
    setMarketScorecardError(undefined);
    try {
      const result = await buildIctMarketScorecardBrowserSafe(
        marketScorecardConfig,
        {
          limits: DEFAULT_ICT_BROWSER_RESEARCH_LIMITS,
          signal: controller.signal,
          onProgress: (progress) => {
            if (isCurrentDeepResearchRun(runId)) {
              setMarketScorecard((current) => current ? { ...current, progress } : current);
            }
          }
        }
      );
      if (!isCurrentDeepResearchRun(runId)) return;
      setMarketScorecard(result);
      const completedSymbols = result.summary?.completedSymbols ?? 0;
      setMarketScorecardStatus(
        result.status === "partial" || result.status === "timed_out"
          ? result.status
          : completedSymbols > 0
            ? "completed"
            : "unavailable"
      );
      if (completedSymbols > 0) {
        try {
          setLatestResearchState(
            saveLatestResearchStatePatch({ latestScorecard: buildLatestScorecardSnapshot(result) }, "market_scorecard")
          );
        } catch (persistError) {
          setMarketScorecardError(`Scorecard completed, but latest-state persistence failed: ${errorMessage(persistError)}`);
        }
      } else {
        setMarketScorecardError("No configured market completed replay.");
      }
    } catch (error) {
      if (isAbortError(error)) {
        if (isCurrentDeepResearchRun(runId)) {
          setMarketScorecardStatus("failed");
          setMarketScorecardError("Market scorecard cancelled before completion.");
        }
        return;
      }
      if (!isCurrentDeepResearchRun(runId)) return;
      setMarketScorecard(undefined);
      setMarketScorecardStatus("failed");
      setMarketScorecardError(errorMessage(error));
    } finally {
      if (isCurrentDeepResearchRun(runId) && deepActionAbortRef.current === controller) {
        deepActionAbortRef.current = undefined;
      }
    }
  };
  const runMonteCarloRobustness = async () => {
    if (deepResearchActionRunning) return;
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
        simulationCount: browserSafeMonteCarloSimulationCount,
        tradesPerSimulation: Math.min(browserSafeMonteCarloTradeCount, Math.max(manualOutcomes.length, 1)),
        researchOnly: true
      });
      appendIctMonteCarloJournalEvent(buildIctMonteCarloJournalEvent(summary));
      setMonteCarloSummary(summary);
      setMonteCarloStatus("completed");
      try {
        setLatestResearchState(
          saveLatestResearchStatePatch({ latestMonteCarlo: buildLatestMonteCarloSnapshot(summary) }, "monte_carlo")
        );
      } catch (persistError) {
        setMonteCarloError(`Monte Carlo completed, but latest-state persistence failed: ${errorMessage(persistError)}`);
      }
    } catch (error) {
      setMonteCarloSummary(undefined);
      setMonteCarloStatus("failed");
      setMonteCarloError(errorMessage(error));
    }
  };
  const runProfileOptimization = async () => {
    if (deepResearchActionRunning) return;
    const { controller, runId } = beginDeepResearchAction();
    setProfileOptimizationStatus("running");
    setProfileOptimizationError(undefined);
    try {
      const replayRun = await runIctRealReplay(
        {
          requestedSymbols: [manualReplayRequest.requestedSymbol],
          primaryTimeframes: [manualReplayRequest.primaryTimeframe],
          htfTimeframes: manualReplayRequest.htfTimeframes,
          candleLimit: Math.min(manualReplayRequest.candleLimit, DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxCandlesPerSymbol),
          replayWindowSize: manualReplayRequest.replayWindowSize,
          lookaheadCandles: manualReplayRequest.lookaheadCandles,
          researchOnly: true
        },
        {
          appendJournal: false,
          includeDiagnostics: false,
          includeReplayResults: true,
          maxReplayWindows: DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxReplayWindows
        }
      );
      if (!isCurrentDeepResearchRun(runId)) return;
      const result = await optimizeApprovedProfileFromReplayResultsBrowserSafe(
        replayRun.replayResults ?? [],
        "balanced_quality",
        {
          limits: DEFAULT_ICT_BROWSER_RESEARCH_LIMITS,
          signal: controller.signal
        }
      );
      if (!isCurrentDeepResearchRun(runId)) return;
      appendIctApprovedProfileOptimizationJournalEvent(buildIctApprovedProfileOptimizationJournalEvent(result));
      setProfileOptimization(result);
      setProfileOptimizationStatus(
        result.status === "partial" || result.status === "timed_out"
          ? result.status
          : result.baseline.totalSignals > 0
            ? "completed"
            : "unavailable"
      );
    } catch (error) {
      if (isAbortError(error)) {
        if (isCurrentDeepResearchRun(runId)) {
          setProfileOptimizationStatus("failed");
          setProfileOptimizationError("Profile optimization cancelled before completion.");
        }
        return;
      }
      if (!isCurrentDeepResearchRun(runId)) return;
      setProfileOptimization(undefined);
      setProfileOptimizationStatus("failed");
      setProfileOptimizationError(errorMessage(error));
    } finally {
      if (isCurrentDeepResearchRun(runId) && deepActionAbortRef.current === controller) {
        deepActionAbortRef.current = undefined;
      }
    }
  };
  const saveManualReplayReport = () => {
    if (!manualReplayResult || manualReplayResult.status !== "completed") return;
    try {
      const saveResult = saveIctResearchReport(buildManualReplayResearchReport(manualReplayResult));
      setManualReportSaveResult(saveResult);
      setSavedReports(listIctResearchReports());
    } catch (error) {
      setManualReportSaveResult({
        status: "failed",
        message: `Replay report save failed: ${errorMessage(error)}`,
        researchOnly: true
      });
    }
  };
  const saveMarketScorecardReport = () => {
    if (!marketScorecard || marketScorecardStatus !== "completed") return;
    try {
      const saveResult = saveIctResearchReport(buildMarketScorecardResearchReport(marketScorecard));
      setScorecardReportSaveResult(saveResult);
      setSavedReports(listIctResearchReports());
    } catch (error) {
      setScorecardReportSaveResult({
        status: "failed",
        message: `Scorecard report save failed: ${errorMessage(error)}`,
        researchOnly: true
      });
    }
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
      if (!deepResearchActionRunning) void runManualReplayReview();
      submitAdvisorMessage("Run Replay Review");
      return;
    }
    if (action === "Run Market Scorecard") {
      if (!deepResearchActionRunning) void runMarketScorecard();
      submitAdvisorMessage("Run Market Scorecard");
      return;
    }
    if (action === "Optimize Profile") {
      if (!deepResearchActionRunning) void runProfileOptimization();
      submitAdvisorMessage("Optimize Profile");
      return;
    }
    submitAdvisorMessage(action);
  };

  const createPaperSimulation = () => {
    if (!paperSimEligibility.eligible) return;
    const nextPaperSignal = createPaperSignalFromResearchSignal(researchSignal);
    setPaperSignal(nextPaperSignal);
    appendIctPaperSignalJournalEvent(
      buildIctPaperSignalJournalEvent(nextPaperSignal, "ict_paper_signal_created")
    );
  };

  const createCmdPaperTracking = () => {
    const result = createCmdPaperTrackingFromResearchSignal(researchSignal);
    if (!result.ok) {
      setCmdPaperTrackingMessage(result.reason);
      return;
    }
    saveActiveCmdPaperTracking(result.record);
    appendIctCmdPaperTrackingJournalEvent(result.journalEvent);
    setCmdPaperTracking(result.record);
    setCmdPaperTrackingMessage("CMD paper tracking created. Paper-only evidence collection is active; execution remains disabled.");
  };

  const checkCmdPaperTrackingOutcome = async () => {
    if (!cmdPaperTracking) {
      setCmdPaperTrackingMessage("No active CMD paper tracking record is available.");
      return;
    }
    try {
      const source = await loadCanonicalCandleSource(activeSource.sourceId);
      const compactCandles = (source?.candles ?? []).map((candle) => ({
        timestamp: candle.timestamp,
        high: candle.high,
        low: candle.low,
        close: candle.close
      }));
      const result = updateCmdPaperTrackingWithCandles(cmdPaperTracking, compactCandles);
      saveActiveCmdPaperTracking(result.record);
      if (result.journalEvent) {
        appendIctCmdPaperTrackingJournalEvent(result.journalEvent);
      }
      setCmdPaperTracking(result.record);
      setCmdPaperTrackingMessage(
        `CMD paper tracking checked ${result.checkedCandleCount.toLocaleString()} compact candles: ${formatToken(result.reason)}.`
      );
    } catch (error) {
      setCmdPaperTrackingMessage(`CMD paper tracking check failed: ${errorMessage(error)}`);
    }
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
      <ResearchSignalCard signal={researchSignal} />
      <PaperSimulationCard
        eligibility={paperSimEligibility}
        onCreate={createPaperSimulation}
        paperSignal={paperSignal}
        signal={researchSignal}
      />
      <CmdPaperTrackingCard
        eligibility={cmdPaperTrackingEligibility}
        message={cmdPaperTrackingMessage}
        onCheck={checkCmdPaperTrackingOutcome}
        onCreate={createCmdPaperTracking}
        tracking={cmdPaperTracking}
      />
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
        <DeferredResearchDetails title="ICT Strategy Suite details" description="Compact suite details are ready. Expand to mount the full ICT panel.">
          <IctAdvisorSummaryPanel snapshot={snapshot} packetOverride={advisorPacket} />
        </DeferredResearchDetails>

        <DeferredResearchDetails
          testId="ict-current-read-data-flow"
          title="Current Read Data Flow"
          description="Current-read data flow is deferred until expanded. No replay, scorecard, Monte Carlo, or raw candles are loaded by opening Advisor."
        >
          <CurrentReadDataFlowPanel currentRead={currentRead} />
        </DeferredResearchDetails>

        <DeferredResearchDetails
          testId="advisor-manual-replay-section"
          title="Manual Replay Review"
          description="Ready. Expand to mount manual replay and Monte Carlo controls. Nothing runs until an operator clicks Run."
        >
          <ResearchPanelErrorBoundary panelName="Manual Replay Review" resetKey={`${activeSource.fingerprint}:${manualReplayStatus}`}>
            <ManualReplayReviewPanel
              brokerSymbol={brokerSymbol}
              disabled={deepResearchActionRunning && manualReplayStatus !== "running"}
              onRun={runManualReplayReview}
              onSave={saveManualReplayReport}
              request={manualReplayRequest}
              result={manualReplayResult}
              saveResult={manualReportSaveResult}
              status={manualReplayStatus}
              error={manualReplayError}
            />
            </ResearchPanelErrorBoundary>
            <div className="mt-4">
              <ResearchPanelErrorBoundary panelName="Monte Carlo Robustness" resetKey={`${activeSource.fingerprint}:${monteCarloStatus}`}>
                <MonteCarloRobustnessPanel
                  disabled={deepResearchActionRunning && monteCarloStatus !== "running"}
                  error={monteCarloError}
                  hasManualReplayResult={manualReplayResult?.status === "completed"}
                  hasScorecard={marketScorecardStatus === "completed" && Boolean(marketScorecard)}
                  onRun={runMonteCarloRobustness}
                  status={monteCarloStatus}
                  summary={monteCarloSummary}
                />
              </ResearchPanelErrorBoundary>
            </div>
        </DeferredResearchDetails>

        <DeferredResearchDetails
          testId="advisor-profile-optimizer-section"
          title="Optimize Profile"
          description="Ready. Expand to mount the profile optimizer. It recommends draft settings only after a manual run."
        >
          <ResearchPanelErrorBoundary panelName="Optimize Profile" resetKey={`${activeSource.fingerprint}:${profileOptimizationStatus}`}>
            <ApprovedProfileOptimizerPanel
              disabled={deepResearchActionRunning && profileOptimizationStatus !== "running"}
              error={profileOptimizationError}
              onRun={runProfileOptimization}
              request={manualReplayRequest}
              result={profileOptimization}
              status={profileOptimizationStatus}
            />
          </ResearchPanelErrorBoundary>
        </DeferredResearchDetails>

        <DeferredResearchDetails
          testId="advisor-market-scorecard-section"
          title="Market Scorecard"
          description="Ready. Expand to mount the market scorecard. No symbols are replayed until Run Market Scorecard is clicked."
        >
          <ResearchPanelErrorBoundary panelName="Market Scorecard" resetKey={`${activeSource.fingerprint}:${marketScorecardStatus}`}>
            <MarketScorecardPanel
              config={marketScorecardConfig}
              disabled={deepResearchActionRunning && marketScorecardStatus !== "running"}
              error={marketScorecardError}
              onRun={runMarketScorecard}
              onSave={saveMarketScorecardReport}
              scorecard={marketScorecard}
              saveResult={scorecardReportSaveResult}
              status={marketScorecardStatus}
            />
          </ResearchPanelErrorBoundary>
        </DeferredResearchDetails>

        <DeferredResearchDetails
          testId="advisor-saved-reports-section"
          title="Saved Research Reports"
          description="Saved report history is not parsed on page load. Expand to read the compact saved-report list."
          onOpenChange={setSavedReportsOpen}
        >
          <ResearchPanelErrorBoundary panelName="Saved Research Reports" resetKey={`${savedReports.length}`}>
            <SavedResearchReportsPanel reports={savedReports} />
          </ResearchPanelErrorBoundary>
        </DeferredResearchDetails>

        <DeferredResearchDetails
          title="External Advisory Bridge"
          description="External LLM/OpenClaw bridge diagnostics are deferred. Expand to check provider status or run an advisory request."
        >
          <ResearchPanelErrorBoundary panelName="External Advisory Bridge" resetKey={snapshot.snapshotId}>
            <LLMAdvisoryReviewPanel snapshot={snapshot} />
          </ResearchPanelErrorBoundary>
        </DeferredResearchDetails>

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

function DeferredResearchDetails({
  children,
  defaultOpen = false,
  description,
  onOpenChange,
  testId,
  title
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  description: string;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
  title: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <details
      data-testid={testId}
      open={open}
      onToggle={handleToggle}
      className="rounded-2xl border border-white/10 bg-slate-950/65 p-4"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-sm font-semibold text-slate-100">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Badge variant={open ? "success" : "secondary"}>{open ? "loaded" : "deferred"}</Badge>
          <span className="text-xs font-normal text-slate-500">{open ? "Collapse" : "Expand"}</span>
        </span>
      </summary>
      {open ? (
        <div className="mt-4">{children}</div>
      ) : (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-400">
          {description} Status: ready / not run / run manually. Authority remains none/none/none.
        </div>
      )}
    </details>
  );
}

function ResearchSignalCard({ signal }: { signal: IctResearchSignal }) {
  const statusVariant =
    signal.status === "approved_research_signal"
      ? "success"
      : signal.status === "watchlist_signal"
        ? "warning"
        : signal.status === "rejected_signal"
          ? "danger"
          : "secondary";
  const entryZone = signal.entryZone
    ? `${compactPrice(signal.entryZone.low)}-${compactPrice(signal.entryZone.high)}`
    : "n/a";
  const confidence = typeof signal.confidence === "number" ? pct(signal.confidence) : "n/a";
  const rrValue = typeof signal.rrEstimate === "number" ? rr(signal.rrEstimate) : "n/a";
  const monteCarloRobustness = signal.monteCarlo?.robustnessRating ? formatToken(signal.monteCarlo.robustnessRating) : "none saved";
  const riskOfRuin =
    typeof signal.monteCarlo?.riskOfRuinPct === "number" ? `${signal.monteCarlo.riskOfRuinPct.toFixed(2)}%` : "n/a";
  const maxRisk =
    typeof signal.monteCarlo?.recommendedMaxRiskPerTradePct === "number"
      ? `${signal.monteCarlo.recommendedMaxRiskPerTradePct.toFixed(2)}%`
      : "n/a";

  return (
    <section data-testid="ict-research-signal-card" className="rounded-[24px] border border-emerald-300/15 bg-[radial-gradient(circle_at_12%_0%,rgba(16,185,129,0.12),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.9),rgba(2,6,23,0.94))] p-5 shadow-[0_0_50px_rgba(16,185,129,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Research Signal Contract</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-50">Approved research signal bridge</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Formal compact contract for future signal architecture. It is research-only and cannot place, route, or approve orders.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge data-testid="ict-research-signal-status" variant={statusVariant}>{formatToken(signal.status)}</Badge>
          <Badge variant={signal.modelQualityLane === "approved" ? "success" : signal.modelQualityLane === "rejected" ? "danger" : "warning"}>
            Model lane: {formatToken(signal.modelQualityLane)}
          </Badge>
          <Badge variant="danger">Execution Disabled</Badge>
          <Badge variant="secondary">Research Only</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdvisorReadout label="Symbol" value={`${signal.brokerSymbol} -> ${signal.requestedSymbol}`} detail={signal.primaryTimeframe} />
        <AdvisorReadout label="Side" value={formatToken(signal.side)} detail={formatToken(signal.phase)} />
        <AdvisorReadout label="Setup" value={formatToken(signal.setup)} detail={formatToken(signal.approvedProfileStatus)} />
        <AdvisorReadout label="Model lane" value={formatToken(signal.modelQualityLane)} detail={signal.paperWatchlistReason ?? "research-only lane"} />
        <AdvisorReadout label="Paper Sim" value={signal.paperWatchlistEligible ? "eligible" : "not eligible"} detail={signal.paperWatchlistEvidenceSummary ?? "compact evidence only"} />
        <AdvisorReadout label="Approval score" value={typeof signal.approvalScore === "number" ? `${signal.approvalScore}/100` : "n/a"} />
        <AdvisorReadout label="Entry zone" value={entryZone} detail={signal.entryZone?.type} />
        <AdvisorReadout label="Target" value={compactPrice(signal.target)} />
        <AdvisorReadout label="Invalidation" value={compactPrice(signal.invalidation)} />
        <AdvisorReadout label="RR / confidence" value={`${rrValue} / ${confidence}`} />
        <AdvisorReadout label="Monte Carlo" value={monteCarloRobustness} detail={`${signal.monteCarlo?.usableOutcomes ?? 0} usable outcomes`} />
        <AdvisorReadout label="Risk of ruin" value={riskOfRuin} />
        <AdvisorReadout label="Recommended max risk" value={maxRisk} detail="research sizing note only" />
        <AdvisorReadout label="Execution allowed" value={signal.executionAllowed ? "true" : "false"} detail="authority none/none/none" />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <AdvisorList label="Reasons" values={signal.reasons} empty="No positive reasons yet." />
        <AdvisorList label="Rejection reasons" values={signal.rejectionReasons} empty="No hard rejection reason." />
        <AdvisorList label="Warnings" values={signal.warnings} empty="No warnings." />
      </div>
      <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-300">
        Next action: {signal.nextAction}
      </p>
    </section>
  );
}

function PaperSimulationCard({
  eligibility,
  onCreate,
  paperSignal,
  signal
}: {
  eligibility: IctPaperSignalEligibility;
  onCreate: () => void;
  paperSignal?: IctPaperSignal;
  signal: IctResearchSignal;
}) {
  const previewSignal = useMemo(() => createPaperSignalFromResearchSignal(signal), [signal]);
  const displaySignal = paperSignal ?? previewSignal;
  const status =
    paperSignal?.status ??
    (eligibility.eligible ? "eligible_for_paper_sim" : "not_eligible");
  const statusVariant =
    status === "paper_target_hit" || status === "eligible_for_paper_sim"
      ? "success"
      : status === "paper_open" || status === "paper_expired"
        ? "warning"
        : status === "paper_invalidation_hit" || status === "not_eligible"
          ? "danger"
          : "secondary";
  const lifecycleLabel =
    status === "paper_target_hit" || status === "paper_invalidation_hit" || status === "paper_expired" || status === "paper_cancelled"
      ? "Complete"
      : status === "paper_open"
        ? "Open"
        : eligibility.eligible
          ? "Eligible"
          : "Not Eligible";
  const reasons = eligibility.eligible ? displaySignal.notes : eligibility.reasons;

  return (
    <section data-testid="ict-paper-signal-simulator" className="rounded-[24px] border border-sky-300/15 bg-[radial-gradient(circle_at_12%_0%,rgba(56,189,248,0.12),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.9),rgba(2,6,23,0.94))] p-5 shadow-[0_0_50px_rgba(56,189,248,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">Paper Signal Simulator</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-50">Simulated research lifecycle</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Uses the compact research signal contract to simulate acceptance, entry, target, invalidation, and journal events. Paper only - no broker mutation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge data-testid="ict-paper-signal-status" variant={statusVariant}>{formatToken(status)}</Badge>
          <Badge variant="secondary">{lifecycleLabel}</Badge>
          <Badge variant="danger">authority none</Badge>
          <Button type="button" size="sm" onClick={onCreate} disabled={!eligibility.eligible || paperSignal?.status === "paper_open"}>
            {paperSignal?.status === "paper_open" ? "Paper Simulation Open" : "Create Paper Simulation"}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdvisorReadout label="Source signal" value={formatToken(signal.status)} detail={signal.signalId} />
        <AdvisorReadout label="Side" value={formatToken(displaySignal.side)} detail={displaySignal.primaryTimeframe} />
        <AdvisorReadout label="Simulated entry" value={compactPrice(displaySignal.simulatedEntry.price)} detail={formatToken(displaySignal.simulatedEntry.type)} />
        <AdvisorReadout label="Target" value={compactPrice(displaySignal.target)} />
        <AdvisorReadout label="Invalidation" value={compactPrice(displaySignal.invalidation)} />
        <AdvisorReadout label="RR estimate" value={rr(displaySignal.rrEstimate)} />
        <AdvisorReadout label="Paper risk" value={`${displaySignal.simulatedRisk.riskPerIdeaPct.toFixed(2)}%`} detail="research sizing note only" />
        <AdvisorReadout label="Outcome" value={formatToken(displaySignal.outcome)} detail={displaySignal.paperOnly ? "paperOnly true" : "invalid"} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <AdvisorList
          label={eligibility.eligible ? "Simulation notes" : "Blocked reasons"}
          values={reasons}
          empty={eligibility.eligible ? "No additional notes." : "No blocker recorded."}
        />
        <AdvisorList
          label="Lifecycle"
          values={displaySignal.lifecycle.map((event) => `${formatToken(event.event)}${typeof event.price === "number" ? ` @ ${compactPrice(event.price)}` : ""}: ${event.note}`)}
          empty="No paper lifecycle event yet."
        />
      </div>
      <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-300">
        Safety: realOrderPlaced false, brokerMutation false, raw candles/snapshots/secrets/account/order/position data excluded.
      </p>
    </section>
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

function CmdPaperTrackingCard({
  eligibility,
  message,
  onCheck,
  onCreate,
  tracking
}: {
  eligibility: IctCmdPaperTrackingEligibility;
  message?: string;
  onCheck: () => void;
  onCreate: () => void;
  tracking?: IctCmdPaperTrackingRecord;
}) {
  const state = tracking?.state ?? "inactive";
  const stateVariant =
    state === "target_hit"
      ? "success"
      : state === "invalidation_hit" || state === "cancelled" || state === "expired"
        ? "danger"
        : state === "active" || state === "pending"
          ? "warning"
          : "secondary";
  const canCreate = eligibility.eligible && (!tracking || tracking.state === "cancelled" || tracking.state === "expired");
  const canCheck = Boolean(tracking && (tracking.state === "active" || tracking.state === "pending"));

  return (
    <section data-testid="ict-cmd-paper-tracking-card" className="rounded-[24px] border border-violet-300/15 bg-[radial-gradient(circle_at_12%_0%,rgba(168,85,247,0.12),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.9),rgba(2,6,23,0.94))] p-5 shadow-[0_0_50px_rgba(168,85,247,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">CMD Paper Tracking</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-50">Paper-only current-market tracker</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Tracks strict CMD paper-watchlist candidates against read-only candle high/low updates. This cannot execute, mutate broker state, or promote readiness.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge data-testid="ict-cmd-paper-tracking-status" variant={stateVariant}>CMD Paper: {formatToken(state)}</Badge>
          <Badge variant={eligibility.eligible ? "warning" : "secondary"}>
            {eligibility.eligible ? "CMD paper-watchlist eligible" : "Not CMD paper eligible"}
          </Badge>
          <Badge variant="danger">Execution Disabled</Badge>
          <Badge variant="secondary">paperOnly true</Badge>
          <Button type="button" size="sm" onClick={onCreate} disabled={!canCreate}>
            Track CMD Paper Candidate
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onCheck} disabled={!canCheck}>
            Check CMD Paper Outcome
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdvisorReadout label="Source model" value={tracking ? formatToken(tracking.sourceModel) : "CMD only"} detail="consolidation manipulation distribution" />
        <AdvisorReadout label="State" value={formatToken(state)} detail={tracking?.outcome ? formatToken(tracking.outcome) : "inactive"} />
        <AdvisorReadout label="Symbol" value={tracking ? `${tracking.brokerSymbol} -> ${tracking.requestedSymbol}` : "waiting"} detail={tracking?.primaryTimeframe ?? "5m"} />
        <AdvisorReadout label="Side" value={formatToken(tracking?.side)} detail={tracking?.setup ? formatToken(tracking.setup) : "strict CMD required"} />
        <AdvisorReadout label="Target" value={compactPrice(tracking?.target)} />
        <AdvisorReadout label="Invalidation" value={compactPrice(tracking?.invalidation)} />
        <AdvisorReadout label="RR" value={rr(tracking?.rrEstimate)} />
        <AdvisorReadout label="Last checked" value={formatDate(tracking?.lastCheckedAt)} detail={tracking?.lastPriceChecked ? `H ${compactPrice(tracking.lastPriceChecked.high)} / L ${compactPrice(tracking.lastPriceChecked.low)}` : "no read-only candle check yet"} />
        <AdvisorReadout label="Paper only" value={tracking?.paperOnly ? "true" : "true"} detail="no readiness promotion" />
        <AdvisorReadout label="Execution allowed" value="false" detail="authority none/none/none" />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <AdvisorList label={eligibility.eligible ? "Eligibility" : "Blocked reasons"} values={eligibility.reasons} empty="No eligibility state recorded." />
        <AdvisorList label="Tracking notes" values={tracking?.notes ?? ["No active CMD paper tracking record."]} empty="No notes." />
      </div>
      {message ? (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-300">{message}</p>
      ) : null}
      <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-300">
        Safety: paperOnly true, realOrderPlaced false, brokerMutation false, raw candles/snapshots/secrets/account/order/position data excluded.
      </p>
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
    currentRead.modelQualityLane === "approved"
      ? "Approved research candidate"
      : currentRead.modelQualityLane === "paper_watchlist"
        ? "Paper Watchlist - paper-test only"
        : currentRead.modelQualityLane === "watchlist"
          ? "Watchlist"
          : currentRead.modelQualityLane === "rejected"
            ? "Rejected"
            : "No Trade";
  const modelLaneLabel =
    currentRead.modelQualityLane === "approved"
      ? "Approved"
      : currentRead.modelQualityLane === "paper_watchlist"
        ? "Paper Watchlist"
        : currentRead.modelQualityLane === "watchlist"
          ? "Watchlist"
          : currentRead.modelQualityLane === "rejected"
            ? "Rejected"
            : "No Trade";
  const missingTradeFields = [
    typeof currentRead.target === "number" ? undefined : "target",
    typeof currentRead.invalidation === "number" ? undefined : "invalidation",
    typeof currentRead.rrEstimate === "number" ? undefined : "RR"
  ].filter((field): field is string => Boolean(field));

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
          <Badge variant={currentRead.modelQualityLane === "approved" ? "success" : currentRead.modelQualityLane === "rejected" ? "danger" : "warning"}>Model lane: {modelLaneLabel}</Badge>
          <Badge variant={currentRead.paperWatchlistEligible ? "warning" : "secondary"}>
            Paper Sim: {currentRead.paperWatchlistEligible ? "Eligible" : "Not Eligible"}
          </Badge>
          <Badge variant="danger">Execution Disabled</Badge>
          <Badge variant="danger">authority none</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdvisorReadout label="Source" value={`${currentRead.brokerSymbol} -> ${currentRead.requestedSymbol}`} detail={`${currentRead.primaryTimeframe} / ${currentRead.candleCount?.toLocaleString() ?? 0} candles`} />
        <AdvisorReadout label="Model lane" value={modelLaneLabel} detail={currentRead.paperWatchlistReason ?? "research-only lane"} />
        <AdvisorReadout label="Paper-watchlist eligibility" value={currentRead.paperWatchlistEligible ? "eligible" : "not eligible"} detail={currentRead.paperWatchlistEvidenceSummary ?? "compact evidence only"} />
        <AdvisorReadout label="Execution" value="Disabled" detail="authority none / no broker mutation" />
        <AdvisorReadout label="Phase 1" value={formatToken(currentRead.bestPhase1Setup)} detail={`${currentRead.debug.phase1SignalCount} signals evaluated`} />
        <AdvisorReadout label="Phase 2" value={formatToken(currentRead.bestPhase2Setup)} detail={`${currentRead.debug.phase2SignalCount} signals evaluated`} />
        <AdvisorReadout label="Best setup" value={formatToken(currentRead.bestSetup)} detail={`${formatToken(currentRead.side)} / ${pct(currentRead.confidence)}`} />
        <AdvisorReadout label="Bias" value={formatToken(currentRead.bias)} detail={`HTF ${currentRead.htfTimeframes.length ? currentRead.htfTimeframes.join(", ") : "missing"}`} />
        <AdvisorReadout
          label="Session narrative"
          value={formatToken(currentRead.sessionNarrativeProfile)}
          detail={`${formatToken(currentRead.sessionDirectionalRead)} / ${pct(currentRead.sessionNarrativeConfidence)}`}
        />
        <AdvisorReadout
          label="NY mitigation / depth"
          value={currentRead.sessionMitigationDetected ? "mitigation detected" : "mitigation missing"}
          detail={`${formatToken(currentRead.dataDepthStatus)} / ${currentRead.availableLookbackDays ?? 0} of ${currentRead.requestedLookbackDays ?? 90} days`}
        />
        <AdvisorReadout
          label="FVG target"
          value={currentRead.fvgTargetDetected ? formatToken(currentRead.fvgTargetDirection) : "missing"}
          detail="draw target only"
        />
        <AdvisorReadout label="SMT" value={formatToken(currentRead.smtStatus)} />
        <AdvisorReadout label="Risk" value={formatToken(currentRead.riskStatus)} />
        <AdvisorReadout label="RR / location" value={rr(currentRead.rrEstimate)} detail={formatToken(currentRead.dealingRangeLocation)} />
        <AdvisorReadout label="Missing trade fields" value={missingTradeFields.length ? missingTradeFields.join(", ") : "none"} detail="target / invalidation / RR" />
        <AdvisorReadout label="Paper watchlist" value={currentRead.paperWatchlistEligible ? "eligible" : "not eligible"} detail="paper simulation only; no readiness promotion" />
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
      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Session story</p>
        <p className="mt-1 text-sm leading-6 text-slate-300">
          {(currentRead.sessionTopReasons ?? [])[0] ?? "Session narrative is waiting for enough Asia/London/New York evidence."}
        </p>
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
    ["Session narrative", currentRead.sessionNarrativeProfile ?? "none"],
    ["Session read", currentRead.sessionDirectionalRead ?? "none"],
    ["Session mitigation", currentRead.sessionMitigationDetected ? "detected" : "missing"],
    ["FVG target", currentRead.fvgTargetDetected ? currentRead.fvgTargetDirection ?? "detected" : "missing"],
    ["Data depth", currentRead.dataDepthStatus ?? "unknown"],
    ["Phase 1 signal count", currentRead.debug.phase1SignalCount.toLocaleString()],
    ["Phase 2 signal count", currentRead.debug.phase2SignalCount.toLocaleString()],
    ["Approved status", currentRead.debug.approvedStatus],
    ["Model quality lane", currentRead.modelQualityLane],
    ["Paper-watchlist eligible", currentRead.paperWatchlistEligible ? "yes" : "no"],
    ["Execution allowed", currentRead.executionAllowed ? "true" : "false"],
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
  disabled,
  error,
  onRun,
  onSave,
  request,
  result,
  saveResult,
  status
}: {
  brokerSymbol: string;
  disabled?: boolean;
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
            : `Replay failed: ${error ?? result?.errors?.[0] ?? "unknown_error"}.`;
  const rowLabel = (row: { key: string; totalSignals: number; targetFirstRate: number; averageRrAchieved: number }) =>
    `${formatToken(row.key)}: ${row.totalSignals} signals / ${pct(row.targetFirstRate)} / ${rr(row.averageRrAchieved)}`;
  const approvedCounts = result?.approvedProfileCounts ?? {
    totalApproved: 0,
    totalWatchlist: 0,
    totalRejected: 0,
    totalNoTrade: 0
  };
  const smtSummary = result?.smtSummary ?? {
    confirmation: [],
    rejection: [],
    divergenceTypes: []
  };
  const newsSessionRiskSummary = result?.newsSessionRiskSummary ?? {
    newsRiskLevels: [],
    sessionRiskStates: [],
    riskGovernorActions: []
  };

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
          <Button type="button" size="sm" onClick={onRun} disabled={status === "running" || disabled}>
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {status === "running" ? "Running..." : "Run Real Replay Review"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onSave} disabled={result?.status !== "completed" || disabled}>
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
            <AdvisorReadout label="Total windows" value={safeCount(result.totalWindows)} />
            <AdvisorReadout label="Total signals" value={safeCount(result.totalSignals)} />
            <AdvisorReadout label="Total no-trades" value={safeCount(result.totalNoTrades)} />
            <AdvisorReadout label="Target-first rate" value={pct(result.targetFirstRate)} />
            <AdvisorReadout label="Invalidation-first rate" value={pct(result.invalidationFirstRate)} />
            <AdvisorReadout label="Average RR achieved" value={rr(result.averageRrAchieved)} />
            <AdvisorReadout label="Approved target-first" value={pct(result.approvedTargetFirstRate)} detail={rr(result.approvedAverageRr)} />
            <AdvisorReadout label="Approved" value={safeCount(approvedCounts.totalApproved)} detail="approved profile count" />
            <AdvisorReadout label="Watchlist" value={safeCount(approvedCounts.totalWatchlist)} />
            <AdvisorReadout label="Rejected" value={safeCount(approvedCounts.totalRejected)} />
            <AdvisorReadout label="No-trade profile" value={safeCount(approvedCounts.totalNoTrade)} />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <AdvisorList
              label="Most common no-trade reasons"
              values={safeList(result.mostCommonNoTradeReasons).map((item) => `${item.reason} (${item.count})`)}
              empty="none"
            />
            <AdvisorList
              label="Top calibration filter improvements"
              values={safeList(result.topCalibrationFilterImprovements).map((item) => `${item.label}: ${pct(item.targetFirstRateChange)} / ${rr(item.averageRrChange)}`)}
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
              values={safeList(result.approvedProfileComparison).map(
                (profile) =>
                  `${profile.label}: ${profile.totalApproved} approved / ${profile.totalWatchlist} watchlist / ${profile.totalRejected} rejected`
              )}
              empty="none"
            />
            <AdvisorList
              label="SMT confirmation / rejection"
              values={[
                ...safeList(smtSummary.confirmation).map(rowLabel),
                ...safeList(smtSummary.rejection).map(rowLabel),
                ...safeList(smtSummary.divergenceTypes).map(rowLabel)
              ]}
              empty="none"
            />
            <AdvisorList
              label="News / session risk"
              values={[
                ...safeList(newsSessionRiskSummary.newsRiskLevels).map(rowLabel),
                ...safeList(newsSessionRiskSummary.sessionRiskStates).map(rowLabel),
                ...safeList(newsSessionRiskSummary.riskGovernorActions).map(rowLabel)
              ]}
              empty="none"
            />
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-3">
            <AdvisorReadout label="Safety" value="raw candles excluded" detail="No raw candles, snapshots, secrets, account/order/position data." />
            <AdvisorReadout
              label="Authority"
              value={`${result.authority?.executionAuthority ?? "none"}/${result.authority?.brokerAuthority ?? "none"}/${result.authority?.readinessOverrideAuthority ?? "none"}`}
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
  disabled,
  error,
  hasManualReplayResult,
  hasScorecard,
  onRun,
  status,
  summary
}: {
  disabled?: boolean;
  error?: string;
  hasManualReplayResult: boolean;
  hasScorecard: boolean;
  onRun: () => Promise<void>;
  status: MonteCarloRunStatus;
  summary?: IctMonteCarloSummary;
}) {
  const recommendation = summary?.recommendation;
  const performance = summary?.performance;
  const input = summary?.input;
  const statusVariant =
    status === "completed"
      ? recommendation?.robustnessRating === "weak" || recommendation?.robustnessRating === "insufficient_data"
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
  const warnings = safeList(recommendation?.warnings);

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
          <Button type="button" size="sm" onClick={onRun} disabled={status === "running" || disabled}>
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
            <AdvisorReadout label="Robustness" value={formatToken(recommendation?.robustnessRating)} detail={recommendation?.reason ?? "n/a"} />
            <AdvisorReadout label="Usable outcomes" value={safeCount(input?.usableOutcomes)} detail={`${safeCount(input?.totalOutcomes)} total compact outcomes`} />
            <AdvisorReadout label="Median ending R" value={rr(performance?.medianEndingR)} detail={`5th ${rr(performance?.fifthPercentileEndingR)} / 95th ${rr(performance?.ninetyFifthPercentileEndingR)}`} />
            <AdvisorReadout label="Median max DD" value={typeof performance?.medianMaxDrawdownPct === "number" ? `${performance.medianMaxDrawdownPct.toFixed(2)}%` : "n/a"} detail={typeof performance?.worstMaxDrawdownPct === "number" ? `worst ${performance.worstMaxDrawdownPct.toFixed(2)}%` : "worst n/a"} />
            <AdvisorReadout label="Risk of ruin" value={typeof performance?.riskOfRuinPct === "number" ? `${performance.riskOfRuinPct.toFixed(2)}%` : "n/a"} detail={typeof performance?.probabilityDrawdownOverLimitPct === "number" ? `limit ${performance.probabilityDrawdownOverLimitPct.toFixed(2)}%` : "limit n/a"} />
            <AdvisorReadout label="Worst losing streak" value={safeCount(performance?.worstLongestLosingStreak)} detail={typeof performance?.medianLongestLosingStreak === "number" ? `median ${performance.medianLongestLosingStreak.toFixed(0)}` : "median n/a"} />
            <AdvisorReadout label="Risk per idea" value={typeof recommendation?.recommendedMaxRiskPerTradePct === "number" ? `${recommendation.recommendedMaxRiskPerTradePct.toFixed(2)}%` : "n/a"} detail={`${safeCount(input?.simulationCount)} simulations`} />
            <AdvisorReadout label="Journal" value="compact MC summary" detail="ict_monte_carlo_summary / raw excluded" />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <AdvisorList label="Warnings" values={warnings} empty="none" />
            <AdvisorList
              label="Safety"
              values={[
                "No raw candles, snapshots, secrets, account data, orders, or positions.",
                `Authority ${summary.authority?.executionAuthority ?? "none"}/${summary.authority?.brokerAuthority ?? "none"}/${summary.authority?.readinessOverrideAuthority ?? "none"}.`,
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
  disabled,
  error,
  onRun,
  request,
  result,
  status
}: {
  disabled?: boolean;
  error?: string;
  onRun: () => Promise<void>;
  request: IctManualReplayReviewRequest;
  result?: IctApprovedProfileOptimizationResult;
  status: ProfileOptimizationRunStatus;
}) {
  const statusVariant =
    status === "completed" ? "success" : status === "unavailable" || status === "running" || status === "partial" || status === "timed_out" ? "warning" : status === "failed" ? "danger" : "secondary";
  const statusMessage =
    status === "idle"
      ? "Idle. Profile optimization runs only after explicit user action and does not change production settings."
      : status === "running"
        ? "Running browser-safe replay optimization..."
        : status === "completed"
          ? "Approved-profile optimization completed in browser-safe mode."
          : status === "partial"
            ? "Profile optimization returned a partial browser-safe result. Use CLI/full replay for exhaustive calibration."
            : status === "timed_out"
              ? "Profile optimization timed out gracefully. Partial data was kept when available; production thresholds were not changed."
          : status === "unavailable"
            ? "Optimization unavailable: replay produced no research signals."
            : `Optimization failed: ${error ?? "unknown_error"}.`;
  const recommended = result?.recommendedProfile;
  const baseline = result?.baseline;
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
          <Button type="button" size="sm" onClick={onRun} disabled={status === "running" || disabled}>
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
      <p className="mt-2 rounded-lg border border-cyan-300/15 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100">
        {ictBrowserSafeNotice} Limits: {DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxCandlesPerSymbol} candles, {DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxReplayWindows} replay windows, {DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxOptimizerCandidates} candidates, {Math.round(DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxRuntimeMs / 1000)}s runtime cap.
      </p>
      {result && recommended ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AdvisorReadout label="Baseline target-first" value={pct(baseline?.targetFirstRate)} detail={`${safeCount(baseline?.totalSignals)} replay signals`} />
            <AdvisorReadout label="Baseline average RR" value={rr(baseline?.averageRrAchieved)} />
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
            <AdvisorReadout label="Candidates evaluated" value={safeCount(result.evaluatedCandidateCount)} detail={`${safeCount(result.totalCandidateCount)} available / ${safeCount(result.omittedCandidateCount)} omitted`} />
            <AdvisorReadout label="Payload size" value={safeCount(result.serializedBytes)} detail="compact browser state bytes" />
          </div>
          {tooFewSignals ? (
            <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm leading-5 text-amber-100">
              Warning: this profile leaves a small approved sample. Keep it draft-only until additional replay windows confirm the edge.
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <AdvisorList label="Strengths" values={safeList(recommended.strengths)} empty="none" />
            <AdvisorList label="Weaknesses" values={safeList(recommended.weaknesses)} empty="none" />
            <AdvisorList label="Browser-safe warnings" values={safeList(result.warnings)} empty="none" />
            <AdvisorList label="Recommendation" values={safeList([result.recommendationSummary, result.nextTestSuggestion].filter(Boolean))} empty="none" />
            <AdvisorList
              label="Safety"
              values={[
                "Draft recommendation only; no production profile mutation.",
                `Authority ${result.authority?.executionAuthority ?? "none"}/${result.authority?.brokerAuthority ?? "none"}/${result.authority?.readinessOverrideAuthority ?? "none"}.`,
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
  disabled,
  error,
  onRun,
  onSave,
  scorecard,
  saveResult,
  status
}: {
  config: IctMarketScorecardConfig;
  disabled?: boolean;
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
        ? "Running browser-safe replay scorecard with compact output only..."
        : status === "completed"
          ? "Market scorecard completed in browser-safe mode. Latest Scorecard Saved as a compact research-only summary."
          : status === "partial"
            ? "Market scorecard returned a partial browser-safe result. Use CLI/full replay for deeper side-by-side coverage."
            : status === "timed_out"
              ? "Market scorecard timed out gracefully. Partial symbol summaries were kept when available."
          : status === "unavailable"
            ? "No configured market completed replay. Check MT5 read-only availability and symbol mappings."
            : `Market scorecard failed: ${error ?? "unknown_error"}.`;
  const configuredSymbols = safeList(config.requestedSymbols).join(", ");
  const scorecardSummary = scorecard?.summary;
  const scorecardSymbols = safeList(scorecard?.symbols);

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
          <Button type="button" size="sm" onClick={onRun} disabled={status === "running" || disabled}>
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {status === "running" ? "Running..." : "Run Market Scorecard"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onSave} disabled={status !== "completed" || !scorecard || disabled}>
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
      <p className="mt-2 rounded-lg border border-cyan-300/15 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100">
        {ictBrowserSafeNotice} Limits: {DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxSymbolsPerScorecard} symbols, {DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxCandlesPerSymbol} candles each, {DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxReplayWindows} replay windows, {Math.round(DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxRuntimeMs / 1000)}s runtime cap.
      </p>
      {saveResult ? <SaveResultNotice result={saveResult} /> : null}
      {scorecard ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AdvisorReadout label="Completed" value={safeCount(scorecardSummary?.completedSymbols)} detail={`${safeCount(scorecardSummary?.unavailableSymbols)} unavailable`} />
            <AdvisorReadout label="Research-preferred" value={safeList(scorecardSummary?.researchPreferredSymbols).join(", ") || "none"} />
            <AdvisorReadout label="Watchlist-only" value={safeList(scorecardSummary?.watchlistOnlySymbols).join(", ") || "none"} />
            <AdvisorReadout label="Noisy" value={safeList(scorecardSummary?.noisySymbols).join(", ") || "none"} />
            <AdvisorReadout label="Best target-first" value={scorecardSummary?.bestApprovedTargetFirstSymbol ?? "n/a"} detail="approved-profile basis" />
            <AdvisorReadout label="Best average RR" value={scorecardSummary?.bestApprovedRrSymbol ?? "n/a"} detail="approved-profile basis" />
            <AdvisorReadout label="Best approved/rejected" value={scorecardSummary?.bestApprovedRejectedRatioSymbol ?? "n/a"} detail="approved-profile ratio" />
            <AdvisorReadout label="Cleanest symbol" value={scorecardSummary?.cleanestSymbol ?? "n/a"} detail="research scorecard only" />
            <AdvisorReadout label="Generated" value={formatDate(scorecard.generatedAt)} detail={scorecard.runId} />
            <AdvisorReadout label="Browser progress" value={`${safeCount(scorecard.progress?.completedSymbols)} / ${safeCount(scorecard.progress?.totalSymbols)}`} detail={scorecard.progress?.currentSymbol ? `current ${scorecard.progress.currentSymbol}` : "compact run"} />
            <AdvisorReadout label="Payload size" value={safeCount(scorecard.serializedBytes)} detail="compact browser state bytes" />
          </div>
          {safeList(scorecard.warnings).length ? (
            <div className="mt-4">
              <AdvisorList label="Browser-safe warnings" values={safeList(scorecard.warnings)} empty="none" />
            </div>
          ) : null}
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
                {scorecardSymbols.map((symbol) => {
                  const noTradeReason = safeList(symbol.mostCommonNoTradeReasons)[0];
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
              value={`${scorecard.authority?.executionAuthority ?? "none"}/${scorecard.authority?.brokerAuthority ?? "none"}/${scorecard.authority?.readinessOverrideAuthority ?? "none"}`}
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
  if (status === "running" || status === "partial" || status === "timed_out" || status === "watchlist_only" || status === "insufficient_data") return "warning";
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
  const compactReports = safeList(reports);
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
          <Badge variant="secondary">{compactReports.length} saved</Badge>
          <Badge variant="danger">authority none</Badge>
        </div>
      </div>
      {compactReports.length ? (
        <div className="mt-4 grid gap-3">
          {compactReports.slice(0, 6).map((report) => (
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
