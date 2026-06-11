import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type FormEvent, type ReactNode, type SyntheticEvent } from "react";
import { Link } from "react-router-dom";
import { BarChart3, MessageSquareText, PlayCircle, Send, ShieldCheck, Sparkles } from "lucide-react";

import { ActivateMarketProgress } from "@/components/advisor/ActivateMarketProgress";
import { IctAdvisorSummaryPanel } from "@/components/advisor/IctAdvisorSummaryPanel";
import { LLMAdvisoryReviewPanel } from "@/components/dashboard/LLMAdvisoryReviewPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createActivateMarketInitialSteps,
  runIctActivateMarketPipeline
} from "@/lib/ict-strategy-suite/ictActivateMarketPipeline";
import { buildResearchAdvisorDecisionExplanation } from "@/lib/ict-strategy-suite/ictResearchAdvisorDecisionExplanation";
import type {
  IctResearchAdvisorDecisionExplanation,
  IctResearchAdvisorDecisionStatus
} from "@/lib/ict-strategy-suite/ictResearchAdvisorDecisionExplanationTypes";
import type {
  IctActivateMarketResult,
  IctActivateMarketStatus,
  IctActivateMarketStep
} from "@/lib/ict-strategy-suite/ictActivateMarketPipelineTypes";
import {
  appendIctMonteCarloJournalEvent,
  appendIctPaperSignalJournalEvent,
  appendIctResearchSignalJournalEvent,
  appendIctResearchHypothesisValidationJournalEvent,
  applyIctHypothesisValidationToQueue,
  buildIctPaperSignalJournalEvent,
  buildIctResearchHypothesisValidationJournalEvent,
  buildLatestMonteCarloSnapshot,
  buildLatestReplaySnapshot,
  buildLatestScorecardSnapshot,
  buildManualReplayResearchReport,
  buildIctAdvisorPacketFromRuntime,
  buildIctCurrentReadFromPacket,
  buildIctMonteCarloJournalEvent,
  buildIctResearchSignalFromCurrentRead,
  buildIctResearchSignalJournalEvent,
  validateIctResearchHypothesis,
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
  type IctHypothesisValidationResult,
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
import { ensureMt5CanonicalResearchSource } from "@/lib/ict-strategy-suite/ictActivateMarketSourceActivation";
import { loadCanonicalCandleSource } from "@/lib/candleSources";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  MARKET_DATA_IMPORT_UPDATED_EVENT
} from "@/lib/marketData";
import {
  MT5_HIGHER_TIMEFRAME_SOURCES_UPDATED_EVENT
} from "@/lib/integrations/mt5/mt5MultiTimeframe";
import {
  displayLabelForMt5Mapping,
  loadMt5ReadOnlySettings,
  mt5CfdProxyWarning,
  mt5ReadOnlyHigherTimeframeOptions,
  mt5ReadOnlySymbolOptions,
  mt5ReadOnlyTimeframeOptions,
  resolveDefaultMt5BrokerSymbol,
  saveMt5ReadOnlySettings,
  MT5_READ_ONLY_UPDATED_EVENT
} from "@/lib/integrations/mt5";
import { RESEARCH_CYCLE_UPDATED_EVENT } from "@/lib/researchCycle";
import { resolveResearchRuntimeSnapshot, type ResearchRuntimeSnapshot } from "@/lib/runtime";
import type { Timeframe } from "@/lib/types";
import { WALK_FORWARD_UPDATED_EVENT } from "@/lib/walkForward";

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : "n/a");
const formatToken = (value?: string) => (value?.trim() ? value : "unknown").replace(/_/g, " ");
const pct = (value?: number) => (typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a");
const rr = (value?: number) => (typeof value === "number" ? `${value.toFixed(2)}R` : "n/a");
const compactPrice = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "n/a";
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error ?? "unknown_error");
const isAbortError = (error: unknown) => (error as { name?: string })?.name === "AbortError";
const browserSafeReplayCandleLimit = Math.min(1000, DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxCandlesPerSymbol);
const browserSafeMonteCarloSimulationCount = 300;
const browserSafeMonteCarloTradeCount = 60;
const advisorCandleLimitOptions = [100, 240, 400, 1000, 5000].map((value) => ({
  label: `${value.toLocaleString()} candles`,
  value: String(value)
}));
const safeList = <T,>(values: T[] | undefined | null): T[] => Array.isArray(values) ? values : [];
const safeCount = (value?: number) => (typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "0");
const firstText = (...values: Array<string | undefined | null | false>) =>
  values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
const markActivateMarketUiFailure = (steps: IctActivateMarketStep[], message: string): IctActivateMarketStep[] => {
  const index = steps.findIndex((step) => step.status === "running" || step.status === "pending");
  if (index < 0) return steps;
  const completedAt = new Date().toISOString();
  return steps.map((step, stepIndex) => {
    if (stepIndex !== index) return step;
    return {
      ...step,
      status: "failed",
      error: message,
      completedAt,
      durationMs: step.startedAt ? Math.max(0, new Date(completedAt).getTime() - new Date(step.startedAt).getTime()) : undefined
    };
  });
};
type MarketScorecardRunStatus = "idle" | "running" | "partial" | "completed" | "unavailable" | "failed" | "timed_out";
type ProfileOptimizationRunStatus = "idle" | "running" | "partial" | "completed" | "unavailable" | "failed" | "timed_out";
type MonteCarloRunStatus = "idle" | "running" | "completed" | "unavailable" | "failed";
type HypothesisValidationRunStatus = "idle" | "running" | "completed" | "unavailable" | "failed";
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
const decisionStatusVariant = (status: IctResearchAdvisorDecisionStatus) =>
  status === "ready" || status === "eligible" || status === "saved" || status === "tracking"
    ? "success" as const
    : status === "warning" || status === "insufficient" || status === "weak" || status === "missing"
      ? "warning" as const
      : status === "disabled"
        ? "danger" as const
        : "secondary" as const;
const riskStatusFromPacket = (packet?: IctAdvisorPacket) => {
  const action = packet?.compactSummary.riskGovernorAction;
  if (!packet) return undefined;
  if (!action) return "unknown_no_calendar";
  if (action === "allow") return "clear";
  if (action === "downgrade_to_watchlist") return "caution";
  return "blocked";
};
const riskVariant = (statusOrPacket?: string | IctAdvisorPacket) => {
  const status = typeof statusOrPacket === "string" ? statusOrPacket : riskStatusFromPacket(statusOrPacket);
  return /blocked|reject|avoid|no_trade/i.test(status ?? "")
    ? "danger" as const
    : /caution|unknown|unavailable/i.test(status ?? "")
      ? "warning" as const
      : status
        ? "success" as const
        : "secondary" as const;
};
const riskLabel = (statusOrPacket?: string | IctAdvisorPacket) => {
  const status = typeof statusOrPacket === "string" ? statusOrPacket : riskStatusFromPacket(statusOrPacket);
  if (status === "clear") return "Risk clear";
  if (status === "caution") return "Risk caution";
  if (status === "blocked") return "Risk blocked";
  if (status === "unknown_no_calendar") return "Risk calendar unknown";
  if (status === "unavailable") return "Risk unavailable";
  return `Risk ${formatToken(status)}`;
};
const smtStatusFromPacket = (packet?: IctAdvisorPacket) => {
  if (!packet) return undefined;
  if (packet.compactSummary.smtRejectsCandidate) return "rejects_candidate";
  if (packet.compactSummary.smtConfirmsCandidate) return "confirms_candidate";
  return packet.compactSummary.smtDivergenceType ? "no_smt" : "comparison_sources_missing";
};
const smtLabel = (statusOrPacket?: string | IctAdvisorPacket) => {
  const status = typeof statusOrPacket === "string" ? statusOrPacket : smtStatusFromPacket(statusOrPacket);
  if (status === "comparison_sources_missing") return "SMT sources missing";
  if (status === "insufficient_data") return "SMT insufficient";
  if (status === "confirms_candidate") return "SMT confirms";
  if (status === "rejects_candidate") return "SMT rejects";
  if (status === "no_smt") return "No SMT";
  return `SMT ${formatToken(status)}`;
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
    const opportunity = currentRead.opportunityDetected
      ? `Opportunity detected: ${formatToken(currentRead.opportunityType)} / ${formatToken(currentRead.opportunityStage)} / ${formatToken(currentRead.opportunityQuality)}. It is not approval. ${currentRead.opportunityBlockers[0] ?? currentRead.opportunityMissingEvidence[0] ?? currentRead.opportunityNextAction}`
      : `No confirmed opportunity yet: ${currentRead.opportunityNextAction}`;
    const hypothesis = currentRead.selfImprovementHypothesisQueued
      ? "Research hypothesis queued - needs replay validation."
      : `No research hypothesis queued: ${currentRead.selfImprovementHypothesisReason ?? "not eligible"}.`;
    return `${opportunity} ${approvalLabel(currentRead.approvedStatus)} context: ${reasons} ${hypothesis} Next action: ${currentRead.nextAction} Authority remains none.`;
  }
  if (lower.includes("risk")) {
    const notes = packet.recommendedSignal.riskNotes.length ? packet.recommendedSignal.riskNotes.slice(0, 3).join("; ") : "No additional risk notes in the compact packet.";
    return `${riskLabel(currentRead.riskStatus)}. ${currentRead.riskReason ?? `News/session: ${formatToken(packet.compactSummary.sessionRiskState)}.`} ${notes}`;
  }
  if (lower.includes("smt")) {
    return `${smtLabel(currentRead.smtStatus)}. ${currentRead.smtReason ?? `Relative strength leader: ${packet.compactSummary.relativeStrengthLeader ?? "n/a"}. Relative weakness: ${packet.compactSummary.relativeWeaknessLeader ?? "n/a"}.`}`;
  }
  if (lower.includes("replay")) {
    return `Replay status: ${formatToken(manualReplayStatus)}. Replay does not auto-run from page load; use the quick action or lower replay panel when you want a real replay review.`;
  }
  if (lower.includes("scorecard")) {
    return `Market scorecard status: ${formatToken(marketScorecardStatus)}. It remains idle until explicitly run.`;
  }
  if (lower.includes("paper-demo") || lower.includes("paper demo") || lower.includes("checklist")) {
    const readiness = currentRead.readinessSummary;
    const blockers = readiness.reasons.length ? readiness.reasons.slice(0, 4).join("; ") : currentRead.topReasons.slice(0, 4).join("; ");
    return `Paper-Demo Candidate review remains separate from Research Ready. Research readiness ${formatToken(readiness.researchReadiness)}; paper-demo ${formatToken(readiness.paperReadiness)}. Blockers: ${blockers || "no compact checklist blockers are available yet"}. This advisor cannot promote readiness or override gates.`;
  }
  if (lower.includes("self-improvement") || lower.includes("self improvement")) {
    return currentRead.selfImprovementHypothesisQueued
      ? `Self-improvement has a research-only hypothesis queued: ${currentRead.selfImprovementHypothesisReason ?? "needs replay validation"}. It cannot auto-apply, change thresholds, promote readiness, or create execution authority.`
      : `No self-improvement hypothesis is queued: ${currentRead.selfImprovementHypothesisReason ?? "current opportunity is not eligible"}. Keep collecting compact evidence before creating a proposal.`;
  }
  if (lower.includes("calibration") || lower.includes("suggest")) {
    return `Calibration suggestion: keep the current model lane as ${formatToken(currentRead.modelQualityLane)} and test only compact research hypotheses with replay, evidence quality, maturity, and regime consistency checks. No threshold change or auto-apply is allowed from chat.`;
  }
  if (lower.includes("test next") || lower.includes("next")) {
    return `Next research action: ${currentRead.nextAction || "rerun Activate Market after the selected MT5 source updates"}. Use the selected primary timeframe for display/reference and the explicit HTF context for analysis. Execution remains disabled.`;
  }
  if (lower.includes("optimize") || lower.includes("profile")) {
    return `Profile optimizer status: ${formatToken(profileOptimizationStatus)}. Optimization is research-only and cannot auto-apply thresholds or promote readiness.`;
  }
  if (lower.includes("bias") || lower.includes("setup") || lower.includes("current")) {
    return `Current read: ${formatToken(currentRead.bias)} bias, ${formatToken(currentRead.bestSetup)} setup, ${formatToken(currentRead.side)} side, ${pct(currentRead.confidence)} confidence, opportunity ${formatToken(currentRead.opportunityType)} / ${formatToken(currentRead.opportunityStage)}, model lane ${formatToken(currentRead.modelQualityLane)}. Hypothesis ${currentRead.selfImprovementHypothesisQueued ? "queued - needs replay validation" : "not queued"}. ${currentRead.paperWatchlistReason ?? packet.recommendedSignal.summary}`;
  }
  return `Current GoTrader read: ${formatToken(currentRead.bias)} / opportunity ${formatToken(currentRead.opportunityType)} / ${approvalLabel(currentRead.approvedStatus)} / model lane ${formatToken(currentRead.modelQualityLane)} / ${formatToken(currentRead.riskStatus)}. Paper Sim ${currentRead.paperWatchlistEligible ? "eligible" : "not eligible"}; hypothesis ${currentRead.selfImprovementHypothesisQueued ? "queued" : "not queued"}; execution disabled. Source ${snapshot.marketData.activeResearchSource.provider.replace(/_/g, " ")} remains read-only with authority none.`;
}

export function ResearchAdvisorView() {
  const [snapshot, setSnapshot] = useState<ResearchRuntimeSnapshot>();
  const [activateMarketStatus, setActivateMarketStatus] = useState<IctActivateMarketStatus>("idle");
  const [activateMarketSteps, setActivateMarketSteps] = useState<IctActivateMarketStep[]>(() => createActivateMarketInitialSteps());
  const [activateMarketResult, setActivateMarketResult] = useState<IctActivateMarketResult>();
  const [manualReplayStatus, setManualReplayStatus] = useState<IctManualReplayReviewStatus>("idle");
  const [manualReplayResult, setManualReplayResult] = useState<IctManualReplayReviewResult>();
  const [manualReplayError, setManualReplayError] = useState<string>();
  const [marketScorecardStatus, setMarketScorecardStatus] = useState<MarketScorecardRunStatus>("idle");
  const [marketScorecard, setMarketScorecard] = useState<IctMarketScorecard>();
  const [marketScorecardError, setMarketScorecardError] = useState<string>();
  const [monteCarloStatus, setMonteCarloStatus] = useState<MonteCarloRunStatus>("idle");
  const [monteCarloSummary, setMonteCarloSummary] = useState<IctMonteCarloSummary>();
  const [monteCarloError, setMonteCarloError] = useState<string>();
  const [hypothesisValidationStatus, setHypothesisValidationStatus] = useState<HypothesisValidationRunStatus>("idle");
  const [hypothesisValidationResult, setHypothesisValidationResult] = useState<IctHypothesisValidationResult>();
  const [hypothesisValidationError, setHypothesisValidationError] = useState<string>();
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
  const [advisorRequestedSymbol, setAdvisorRequestedSymbol] = useState(() => loadMt5ReadOnlySettings().requestedSymbol ?? "MNQ");
  const [advisorBrokerSymbol, setAdvisorBrokerSymbol] = useState(() => loadMt5ReadOnlySettings().brokerSymbolOverride ?? "USTECH");
  const [advisorDisplayLabel, setAdvisorDisplayLabel] = useState(() => loadMt5ReadOnlySettings().displayLabel ?? "MNQ via USTECH");
  const [advisorPrimaryTimeframe, setAdvisorPrimaryTimeframe] = useState(() => loadMt5ReadOnlySettings().timeframe ?? "5m");
  const [advisorHigherTimeframes, setAdvisorHigherTimeframes] = useState<Timeframe[]>(() =>
    (loadMt5ReadOnlySettings().higherTimeframes as Timeframe[] | undefined) ?? ["15m", "1h"]
  );
  const [advisorCandleLimit, setAdvisorCandleLimit] = useState(() => String(Math.max(1000, loadMt5ReadOnlySettings().candleLimit ?? 1000)));
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
    setHypothesisValidationStatus("idle");
    setHypothesisValidationResult(undefined);
    setHypothesisValidationError(undefined);
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
  const activeAdvisorPacket = activateMarketResult?.advisorPacket ?? advisorPacket;
  const activeAdvisorPacketError = activateMarketResult?.advisorPacket ? undefined : advisorPacketError;
  const currentRead = useMemo(
    () => activateMarketResult?.currentRead ?? buildIctCurrentReadFromPacket(activeAdvisorPacket, latestResearchState),
    [activateMarketResult?.currentRead, activeAdvisorPacket, latestResearchState]
  );
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
  const updateAdvisorRequestedSymbol = (requestedSymbol: string) => {
    const brokerSymbol = resolveDefaultMt5BrokerSymbol(requestedSymbol);
    const displayLabel = displayLabelForMt5Mapping({ brokerSymbol, requestedSymbol });
    setAdvisorRequestedSymbol(requestedSymbol);
    setAdvisorBrokerSymbol(brokerSymbol);
    setAdvisorDisplayLabel(displayLabel);
    saveMt5ReadOnlySettings({
      requestedSymbol,
      brokerSymbolOverride: brokerSymbol,
      displayLabel
    });
  };
  const updateAdvisorHigherTimeframe = (timeframe: Timeframe, checked: boolean) => {
    const next = checked
      ? [...advisorHigherTimeframes, timeframe].filter((item, index, all) => all.indexOf(item) === index)
      : advisorHigherTimeframes.filter((item) => item !== timeframe);
    const normalized = next.filter((item) => item !== advisorPrimaryTimeframe);
    setAdvisorHigherTimeframes(normalized);
    saveMt5ReadOnlySettings({ higherTimeframes: normalized });
  };
  const runActivateMarket = async () => {
    if (activateMarketStatus === "running") return;
    setActivateMarketStatus("running");
    setActivateMarketSteps(createActivateMarketInitialSteps());
    setActivateMarketResult(undefined);
    try {
      const candleLimit = Math.max(1, Number(advisorCandleLimit) || 1000);
      const higherTimeframes = advisorHigherTimeframes.filter((item) => item !== advisorPrimaryTimeframe);
      const displayLabel = displayLabelForMt5Mapping({
        brokerSymbol: advisorBrokerSymbol,
        displayLabel: advisorDisplayLabel,
        requestedSymbol: advisorRequestedSymbol
      });
      const sourceActivation = await ensureMt5CanonicalResearchSource({
        brokerSymbol: advisorBrokerSymbol,
        candleLimit,
        displayLabel,
        higherTimeframes,
        requestedSymbol: advisorRequestedSymbol,
        timeframe: advisorPrimaryTimeframe
      });
      if (!sourceActivation.ok) {
        throw new Error(sourceActivation.message);
      }
      setAdvisorRequestedSymbol(sourceActivation.source.requestedSymbol);
      setAdvisorBrokerSymbol(sourceActivation.source.brokerSymbol);
      setAdvisorDisplayLabel(displayLabel);
      setAdvisorPrimaryTimeframe(sourceActivation.source.timeframe);
      setAdvisorHigherTimeframes(higherTimeframes as Timeframe[]);
      setAdvisorCandleLimit(String(sourceActivation.source.candleLimit));
      const nextSnapshot = sourceActivation.snapshot ?? await resolveResearchRuntimeSnapshot();
      setSnapshot(nextSnapshot);
      const result = await runIctActivateMarketPipeline(
        {
          snapshot: nextSnapshot,
          latestResearchState: readLatestResearchState(),
          saveLatestSummary: true
        },
        {
          onStepUpdate: (_step, allSteps) => setActivateMarketSteps(allSteps)
        }
      );
      setActivateMarketResult(result);
      setActivateMarketSteps(result.steps);
      setActivateMarketStatus(result.status);
      if (result.advisorPacket) {
        setAdvisorPacket(result.advisorPacket);
        setAdvisorPacketError(undefined);
      }
    } catch (error) {
      const failedSteps = markActivateMarketUiFailure(activateMarketSteps, errorMessage(error));
      setActivateMarketSteps(failedSteps);
      setActivateMarketResult(undefined);
      setActivateMarketStatus("failed");
    }
  };

  useEffect(() => {
    if (!activeAdvisorPacket || !researchSignal.signalId) return;
    const stableJournalKey = researchSignalJournalKey(researchSignal);
    if (lastResearchSignalJournalKeyRef.current === stableJournalKey) return;
    lastResearchSignalJournalKeyRef.current = stableJournalKey;
    appendIctResearchSignalJournalEvent(buildIctResearchSignalJournalEvent(researchSignal));
  }, [activeAdvisorPacket?.packetId, researchSignal]);

  if (!snapshot) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Research Advisor Workspace</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-50">Loading runtime snapshot</h2>
          <p className="mt-2 text-sm text-slate-400">Preparing compact advisory context. Deterministic research remains available.</p>
        </section>
        <ActivateMarketProgress
          onActivate={() => void runActivateMarket()}
          status={activateMarketStatus}
          steps={activateMarketSteps}
          result={activateMarketResult}
          disabled={activateMarketStatus === "running"}
        />
      </div>
    );
  }

  const activeSource = snapshot.marketData.activeResearchSource;
  const brokerSymbol = snapshot.mt5ReadOnly.brokerSymbol ?? activeSource.provenance.providerSymbol ?? "n/a";
  const deepResearchActionRunning =
    manualReplayStatus === "running" ||
    marketScorecardStatus === "running" ||
    monteCarloStatus === "running" ||
    hypothesisValidationStatus === "running" ||
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
  const runHypothesisValidation = async () => {
    if (deepResearchActionRunning) return;
    const hypothesis = currentRead.selfImprovementHypothesis;
    if (!hypothesis) {
      setHypothesisValidationResult(undefined);
      setHypothesisValidationStatus("unavailable");
      setHypothesisValidationError(currentRead.selfImprovementHypothesisReason ?? "No queued research hypothesis is available for validation.");
      return;
    }
    const { controller, runId } = beginDeepResearchAction();
    setHypothesisValidationStatus("running");
    setHypothesisValidationError(undefined);
    try {
      let replayReview = manualReplayResult?.status === "completed" ? manualReplayResult : undefined;
      if (!replayReview) {
        replayReview = await runManualIctReplayReview(manualReplayRequest, {
          appendJournal: false,
          includeDiagnostics: true,
          includeReplayResults: true,
          maxReplayWindows: DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxReplayWindows
        });
        if (!isCurrentDeepResearchRun(runId)) return;
        setManualReplayResult(replayReview);
        setManualReplayStatus(replayReview.status);
        if (replayReview.status !== "completed") {
          setManualReplayError(replayReview.unavailableReason ?? replayReview.errors[0] ?? "Replay did not produce a completed compact review.");
        }
      }
      const result = validateIctResearchHypothesis({
        hypothesis,
        source: "manual_review",
        replayOutcomes: replayReview.monteCarloOutcomes ?? [],
        testedWindows: replayReview.totalWindows,
        runMonteCarlo: true
      });
      const journalEvent = buildIctResearchHypothesisValidationJournalEvent(result);
      appendIctResearchHypothesisValidationJournalEvent(journalEvent);
      applyIctHypothesisValidationToQueue(result);
      setHypothesisValidationResult(result);
      setHypothesisValidationStatus("completed");
      setHypothesisValidationError(undefined);
    } catch (error) {
      if (isAbortError(error)) {
        if (isCurrentDeepResearchRun(runId)) {
          setHypothesisValidationStatus("failed");
          setHypothesisValidationError("Hypothesis validation cancelled before completion.");
        }
        return;
      }
      if (!isCurrentDeepResearchRun(runId)) return;
      setHypothesisValidationResult(undefined);
      setHypothesisValidationStatus("failed");
      setHypothesisValidationError(errorMessage(error));
    } finally {
      if (isCurrentDeepResearchRun(runId) && deepActionAbortRef.current === controller) {
        deepActionAbortRef.current = undefined;
      }
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
      createAdvisorMessage("assistant", buildLocalAdvisorReply(normalized, activeAdvisorPacket, currentRead, snapshot, manualReplayStatus, marketScorecardStatus, profileOptimizationStatus))
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

      <ActivateMarketProgress
        onActivate={() => void runActivateMarket()}
        status={activateMarketStatus}
        steps={activateMarketSteps}
        result={activateMarketResult}
        disabled={activateMarketStatus === "running" || deepResearchActionRunning}
      />

      <AdvisorSourceWorkspaceControls
        activeBrokerSymbol={brokerSymbol}
        activeCandleCount={activeSource.candleCount}
        activeProvider={activeSource.provider}
        activeRequestedSymbol={snapshot.marketData.symbol}
        activeTimeframe={snapshot.marketData.timeframe}
        brokerSymbol={advisorBrokerSymbol}
        candleLimit={advisorCandleLimit}
        displayLabel={advisorDisplayLabel}
        higherTimeframes={advisorHigherTimeframes}
        onBrokerSymbolChange={(value) => {
          const nextBrokerSymbol = value.trim();
          const nextDisplayLabel = displayLabelForMt5Mapping({
            brokerSymbol: nextBrokerSymbol,
            displayLabel: advisorDisplayLabel,
            requestedSymbol: advisorRequestedSymbol
          });
          setAdvisorBrokerSymbol(value);
          setAdvisorDisplayLabel(nextDisplayLabel);
          saveMt5ReadOnlySettings({
            brokerSymbolOverride: nextBrokerSymbol || undefined,
            displayLabel: nextDisplayLabel
          });
        }}
        onCandleLimitChange={(value) => {
          setAdvisorCandleLimit(value);
          saveMt5ReadOnlySettings({ candleLimit: Number(value) });
        }}
        onDisplayLabelChange={(value) => {
          setAdvisorDisplayLabel(value);
          saveMt5ReadOnlySettings({ displayLabel: value.trim() || undefined });
        }}
        onHigherTimeframeChange={updateAdvisorHigherTimeframe}
        onPrimaryTimeframeChange={(value) => {
          const nextTimeframe = value as Timeframe;
          const nextHigherTimeframes = advisorHigherTimeframes.filter((item) => item !== nextTimeframe);
          setAdvisorPrimaryTimeframe(nextTimeframe);
          setAdvisorHigherTimeframes(nextHigherTimeframes);
          saveMt5ReadOnlySettings({ timeframe: nextTimeframe, higherTimeframes: nextHigherTimeframes });
        }}
        onRequestedSymbolChange={updateAdvisorRequestedSymbol}
        primaryTimeframe={advisorPrimaryTimeframe}
        requestedSymbol={advisorRequestedSymbol}
      />

      <CurrentReadPanel
        cmdPaperTracking={cmdPaperTracking}
        currentRead={currentRead}
        latestResearchState={latestResearchState}
        packetError={activeAdvisorPacketError}
        researchSignal={researchSignal}
      />
      <RecognitionSummaryCard currentRead={currentRead} />
      <MarketOpportunityCard currentRead={currentRead} />
      <ResearchHypothesisValidationPanel
        currentRead={currentRead}
        disabled={deepResearchActionRunning && hypothesisValidationStatus !== "running"}
        error={hypothesisValidationError}
        onValidate={runHypothesisValidation}
        result={hypothesisValidationResult}
        status={hypothesisValidationStatus}
      />
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
          packet={activeAdvisorPacket}
          packetError={activeAdvisorPacketError}
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
              ["Chart timeframe", currentRead.displayTimeframe ?? snapshot.marketData.timeframe],
              ["Analysis TFs", currentRead.analysisTimeframesUsed?.join(" / ") || "Activate Market required"],
              ["Analysis depth", formatToken(currentRead.analysisDepthStatus)],
              ["Missing TFs", currentRead.missingTimeframes?.length ? currentRead.missingTimeframes.join(" / ") : "none"],
              ["HTF registered", htfSummary],
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
            currentRead={currentRead}
            packet={activeAdvisorPacket}
            manualReplayStatus={manualReplayStatus}
            manualReplayResult={manualReplayResult}
          />
        </div>
      </section>

      <section data-testid="advisor-deep-research-panels" className="space-y-4">
        <DeferredResearchDetails title="ICT Strategy Suite details" description="Compact suite details are ready. Expand to mount the full ICT panel.">
          <IctAdvisorSummaryPanel snapshot={snapshot} packetOverride={activeAdvisorPacket} />
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

function AdvisorSourceWorkspaceControls({
  activeBrokerSymbol,
  activeCandleCount,
  activeProvider,
  activeRequestedSymbol,
  activeTimeframe,
  brokerSymbol,
  candleLimit,
  displayLabel,
  higherTimeframes,
  onBrokerSymbolChange,
  onCandleLimitChange,
  onDisplayLabelChange,
  onHigherTimeframeChange,
  onPrimaryTimeframeChange,
  onRequestedSymbolChange,
  primaryTimeframe,
  requestedSymbol
}: {
  activeBrokerSymbol: string;
  activeCandleCount: number;
  activeProvider: string;
  activeRequestedSymbol: string;
  activeTimeframe: string;
  brokerSymbol: string;
  candleLimit: string;
  displayLabel: string;
  higherTimeframes: Timeframe[];
  onBrokerSymbolChange: (value: string) => void;
  onCandleLimitChange: (value: string) => void;
  onDisplayLabelChange: (value: string) => void;
  onHigherTimeframeChange: (timeframe: Timeframe, checked: boolean) => void;
  onPrimaryTimeframeChange: (value: string) => void;
  onRequestedSymbolChange: (value: string) => void;
  primaryTimeframe: string;
  requestedSymbol: string;
}) {
  const selectedHtf = higherTimeframes.filter((item) => item !== primaryTimeframe);
  const selectedSummary = `${brokerSymbol || "broker symbol"} -> ${requestedSymbol || "GoTrader symbol"} / ${primaryTimeframe}`;
  const activeMatches =
    activeProvider === "mt5_read_only" &&
    activeRequestedSymbol === requestedSymbol &&
    activeBrokerSymbol === brokerSymbol &&
    activeTimeframe === primaryTimeframe;

  return (
    <section data-testid="research-advisor-source-controls" className="rounded-[24px] border border-cyan-300/15 bg-slate-950/75 p-5 shadow-[0_0_45px_rgba(8,145,178,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MT5 Research Source</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">{selectedSummary}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Select the read-only MT5 symbol mapping and explicit analysis timeframes before running Activate Market. The selected chart timeframe is display/reference only; analysis uses the compact MTF context built by the workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={activeMatches ? "success" : "warning"}>{activeMatches ? "active selection" : "selection pending activation"}</Badge>
          <Badge variant="secondary">MT5 read-only</Badge>
          <Badge variant="warning">CFD/proxy labeled</Badge>
          <Badge variant="danger">authority none</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <label className="space-y-1 text-xs text-slate-300">
          Requested GoTrader symbol
          <Select value={requestedSymbol} options={mt5ReadOnlySymbolOptions} onChange={(event) => onRequestedSymbolChange(event.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-slate-300">
          MT5 broker symbol
          <Input value={brokerSymbol} onChange={(event) => onBrokerSymbolChange(event.target.value)} placeholder="USTECH" />
        </label>
        <label className="space-y-1 text-xs text-slate-300">
          Display label
          <Input value={displayLabel} onChange={(event) => onDisplayLabelChange(event.target.value)} placeholder="MNQ via USTECH" />
        </label>
        <label className="space-y-1 text-xs text-slate-300">
          Primary timeframe
          <Select value={primaryTimeframe} options={mt5ReadOnlyTimeframeOptions} onChange={(event) => onPrimaryTimeframeChange(event.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-slate-300">
          Candle limit
          <Select value={candleLimit} options={advisorCandleLimitOptions} onChange={(event) => onCandleLimitChange(event.target.value)} />
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Higher-timeframe context</p>
          <Badge variant={selectedHtf.length ? "secondary" : "warning"}>{selectedHtf.length ? selectedHtf.join(", ") : "missing"}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {mt5ReadOnlyHigherTimeframeOptions.map((option) => {
            const value = option.value as Timeframe;
            const disabled = value === primaryTimeframe;
            return (
              <label
                key={option.value}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                  disabled ? "border-white/5 bg-white/[0.02] text-slate-600" : "border-white/10 bg-white/[0.035] text-slate-300"
                }`}
                title={disabled ? "Primary timeframe is fetched as the main source." : `Fetch ${option.label} as separate read-only context.`}
              >
                <input
                  type="checkbox"
                  checked={selectedHtf.includes(value)}
                  disabled={disabled}
                  onChange={(event) => onHigherTimeframeChange(value, event.target.checked)}
                />
                {option.label}
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          Each timeframe is cached as a separate canonical MT5 read-only source key. Fetching 15m, 1h, 4h, or 1d never overwrites the selected {primaryTimeframe} source.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <AdvisorReadout label="Active source" value={activeProvider.replace(/_/g, " ")} detail={`${activeBrokerSymbol || "n/a"} -> ${activeRequestedSymbol} / ${activeTimeframe}`} />
        <AdvisorReadout label="Active candles" value={activeCandleCount.toLocaleString()} detail={activeMatches ? "matches selected MT5 mapping" : "run Activate Market to apply selection"} />
        <AdvisorReadout label="Proxy warning" value="read-only CFD/proxy" detail={mt5CfdProxyWarning(brokerSymbol, requestedSymbol)} />
      </div>
    </section>
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

function MarketOpportunityCard({ currentRead }: { currentRead: IctCurrentRead }) {
  const opportunity = currentRead.opportunity;
  const tradeIdea = currentRead.opportunityTradeIdea;
  const liquidity = opportunity?.liquidityObjective;
  const pdFocus = opportunity?.pdArrayContext?.[0];
  const approvedExplanation = currentRead.opportunityDetected && currentRead.modelQualityLane !== "approved"
    ? `Opportunity detected, but not approved because ${currentRead.opportunityBlockers[0] ?? currentRead.opportunityMissingEvidence[0] ?? "confirmation is incomplete"}.`
    : currentRead.opportunityDetected
      ? "Opportunity is mapped before approval; replay, evidence, maturity, and readiness gates remain authoritative."
      : "No structured opportunity is confirmed from the compact current read yet.";

  return (
    <section data-testid="ict-market-opportunity-card" className="rounded-[24px] border border-fuchsia-300/15 bg-[radial-gradient(circle_at_14%_0%,rgba(217,70,239,0.12),transparent_36%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.94))] p-5 shadow-[0_0_55px_rgba(217,70,239,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-300">Market Opportunity</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">
            {currentRead.opportunityDetected ? formatToken(currentRead.opportunityType) : "No confirmed opportunity"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Opportunity detection maps structure before approval. It can explain a setup, but it cannot approve readiness, paper tracking, or execution.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={currentRead.opportunityDetected ? "warning" : "secondary"}>{formatToken(currentRead.opportunityStage)}</Badge>
          <Badge variant={currentRead.opportunityQuality === "high" ? "success" : currentRead.opportunityQuality === "untradable" ? "danger" : "warning"}>{formatToken(currentRead.opportunityQuality)}</Badge>
          <Badge variant="danger">Execution Disabled</Badge>
          <Badge variant="secondary">Research Only</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdvisorReadout label="Opportunity type" value={formatToken(currentRead.opportunityType)} detail={`model ${currentRead.opportunityModelName ? formatToken(currentRead.opportunityModelName) : "pending"}`} />
        <AdvisorReadout label="Model family" value={formatToken(opportunity?.modelFamily)} detail={currentRead.opportunityDetected ? "compact market map" : "no active family"} />
        <AdvisorReadout label="Market cycle stage" value={formatToken(opportunity?.marketCycleStage)} detail={formatToken(currentRead.opportunityDirection)} />
        <AdvisorReadout label="Lane recommendation" value={formatToken(currentRead.opportunityLaneRecommendation)} detail="not an approval override" />
        <AdvisorReadout
          label="Liquidity objective"
          value={liquidity ? `${formatToken(liquidity.side)} ${compactPrice(liquidity.target)}` : "pending"}
          detail={liquidity?.reason}
        />
        <AdvisorReadout
          label="PD array focus"
          value={pdFocus ? `${formatToken(pdFocus.type)} / ${formatToken(pdFocus.role)}` : "pending"}
          detail={pdFocus?.reason}
        />
        <AdvisorReadout
          label="Trade idea"
          value={tradeIdea ? `${formatToken(tradeIdea.side)} / ${rr(tradeIdea.rrEstimate)}` : "pending"}
          detail={`Target ${compactPrice(tradeIdea?.target)} / invalidation ${compactPrice(tradeIdea?.invalidation)}`}
        />
        <AdvisorReadout
          label="Confirmation needed"
          value={currentRead.opportunityMissingEvidence.length || opportunity?.confirmationNeeded.length ? "yes" : "none"}
          detail={(opportunity?.confirmationNeeded ?? currentRead.opportunityMissingEvidence).slice(0, 2).join("; ")}
        />
        <AdvisorReadout
          label="Research hypothesis"
          value={currentRead.selfImprovementHypothesisQueued ? "queued" : "not queued"}
          detail={currentRead.selfImprovementHypothesisQueued ? "needs replay validation" : currentRead.selfImprovementHypothesisReason}
        />
        <AdvisorReadout
          label="Next validation"
          value={currentRead.selfImprovementHypothesisStatus ? formatToken(currentRead.selfImprovementHypothesisStatus) : "n/a"}
          detail={currentRead.selfImprovementNextValidation}
        />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <AdvisorList label="Missing evidence" values={currentRead.opportunityMissingEvidence} empty="No missing opportunity evidence reported." />
        <AdvisorList label="Blockers" values={currentRead.opportunityBlockers} empty="No opportunity blocker reported." />
        <AdvisorReadout label="Next action" value={currentRead.opportunityNextAction} detail="research-only; no readiness promotion" />
      </div>
      <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-300">
        {approvedExplanation} {currentRead.selfImprovementHypothesisQueued ? "Research hypothesis queued - needs replay validation." : `Research hypothesis not queued: ${currentRead.selfImprovementHypothesisReason ?? "not eligible"}.`}
      </p>
    </section>
  );
}

function RecognitionSummaryCard({ currentRead }: { currentRead: IctCurrentRead }) {
  const recognition = currentRead.universalRecognition;
  const scalp = recognition?.scalpOpportunity;
  const pdFocus = recognition?.pdArrays[0];
  const tierVariant =
    currentRead.recognitionTier === "full_model"
      ? "success"
      : currentRead.recognitionTier === "insufficient_data"
        ? "danger"
        : currentRead.recognitionTier === "market_map_only"
          ? "secondary"
          : "warning";

  return (
    <section data-testid="ict-universal-recognition-card" className="rounded-[24px] border border-violet-300/15 bg-[radial-gradient(circle_at_12%_0%,rgba(167,139,250,0.14),transparent_36%),linear-gradient(135deg,rgba(15,23,42,0.93),rgba(2,6,23,0.95))] p-5 shadow-[0_0_55px_rgba(124,58,237,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">Recognition Summary</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">{formatToken(currentRead.recognitionTier)}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Universal fallback maps full models first, then forming models, PD arrays, scalp structure, and finally market-map-only context. It cannot approve readiness or execution.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={tierVariant}>{formatToken(currentRead.recognitionTier)}</Badge>
          <Badge variant={currentRead.scalpStatus === "scalp_candidate" ? "warning" : "secondary"}>{formatToken(currentRead.scalpStatus)}</Badge>
          <Badge variant="danger">authority none</Badge>
          <Badge variant="secondary">compact only</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdvisorReadout label="Tier" value={formatToken(currentRead.recognitionTier)} detail={currentRead.recognitionOpportunitySummary} />
        <AdvisorReadout label="Known model" value={currentRead.knownModelName ? formatToken(currentRead.knownModelName) : "none confirmed"} detail={currentRead.knownModelState ? formatToken(currentRead.knownModelState) : "fallback recognition active"} />
        <AdvisorReadout label="PD array focus" value={pdFocus ? `${formatToken(pdFocus.type)} / ${formatToken(pdFocus.role)}` : "pending"} detail={pdFocus?.reason ?? "No compact PD array focus yet."} />
        <AdvisorReadout label="Scalp status" value={formatToken(currentRead.scalpStatus)} detail={`${formatToken(currentRead.scalpDirection)} / ${scalp?.sourceTimeframe ?? currentRead.primaryTimeframe}`} />
        <AdvisorReadout label="Scalp target" value={compactPrice(currentRead.scalpTarget)} detail={scalp?.liquidityDraw?.reason ?? "target requires compact structure"} />
        <AdvisorReadout label="Scalp invalidation" value={compactPrice(currentRead.scalpInvalidation)} detail="structural invalidation only; no execution" />
        <AdvisorReadout label="Scalp RR" value={typeof currentRead.scalpRR === "number" ? `${currentRead.scalpRR.toFixed(2)}R` : "n/a"} detail="computed only when target and invalidation exist" />
        <AdvisorReadout label="Lane" value={formatToken(recognition?.laneRecommendation)} detail="not an approval override" />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <AdvisorList label="Missing confirmation" values={recognition?.missingEvidence ?? []} empty="No missing recognition evidence reported." />
        <AdvisorList label="Blockers" values={recognition?.blockers ?? []} empty="No recognition blocker reported." />
        <AdvisorReadout label="Next action" value={recognition?.nextAction ?? currentRead.nextAction} detail="research-only; no readiness promotion" />
      </div>
    </section>
  );
}

function ResearchHypothesisValidationPanel({
  currentRead,
  disabled,
  error,
  onValidate,
  result,
  status
}: {
  currentRead: IctCurrentRead;
  disabled?: boolean;
  error?: string;
  onValidate: () => Promise<void>;
  result?: IctHypothesisValidationResult;
  status: HypothesisValidationRunStatus;
}) {
  const hypothesis = currentRead.selfImprovementHypothesis;
  const statusVariant =
    result?.status === "paper_watchlist_recommended" || result?.status === "promising"
      ? "success"
      : result?.status === "discarded" || status === "failed"
        ? "danger"
        : result?.status === "weak" || result?.status === "needs_more_data" || status === "running"
          ? "warning"
          : "secondary";
  const buttonLabel = status === "running" ? "Validating..." : "Validate Hypothesis";
  const statusLabel = result?.status ?? (status === "idle" ? "not_tested" : status);
  const noHypothesisReason = currentRead.selfImprovementHypothesisReason ?? "No structured queued hypothesis is available.";

  return (
    <section data-testid="ict-hypothesis-validation-panel" className="rounded-xl border border-violet-300/15 bg-slate-950/85 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">Research Hypothesis Validation</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">
            {hypothesis ? hypothesis.title : "No queued hypothesis"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Manual replay validation for queued opportunities. Results can recommend continued research or paper-watchlist review, but cannot approve a model or create execution authority.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusVariant}>{formatToken(statusLabel)}</Badge>
          <Badge variant="danger">authority none</Badge>
          <Badge variant="secondary">raw data excluded</Badge>
          <Button type="button" size="sm" onClick={() => void onValidate()} disabled={disabled || status === "running" || !hypothesis}>
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            {buttonLabel}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdvisorReadout
          label="Latest hypothesis"
          value={hypothesis ? formatToken(hypothesis.status) : "not queued"}
          detail={hypothesis?.hypothesisId ?? noHypothesisReason}
        />
        <AdvisorReadout
          label="Source opportunity"
          value={hypothesis ? formatToken(hypothesis.sourceOpportunity.type) : formatToken(currentRead.opportunityType)}
          detail={hypothesis?.sourceOpportunity.modelName ? formatToken(hypothesis.sourceOpportunity.modelName) : currentRead.opportunityNextAction}
        />
        <AdvisorReadout
          label="Occurrences"
          value={result ? result.totalOccurrences.toLocaleString() : "not tested"}
          detail={result ? `${result.usableOutcomes.toLocaleString()} usable outcomes` : "button starts browser-safe validation"}
        />
        <AdvisorReadout
          label="Target-first"
          value={result?.targetFirstRate !== undefined ? pct(result.targetFirstRate) : "n/a"}
          detail={result?.invalidationFirstRate !== undefined ? `Invalidation-first ${pct(result.invalidationFirstRate)}` : "needs replay outcomes"}
        />
        <AdvisorReadout
          label="Average RR"
          value={result?.averageRr !== undefined ? rr(result.averageRr) : "n/a"}
          detail={result?.medianRr !== undefined ? `median ${rr(result.medianRr)}` : "compact outcomes only"}
        />
        <AdvisorReadout
          label="Monte Carlo"
          value={result?.monteCarlo?.attempted ? formatToken(result.monteCarlo.robustnessRating) : "not run"}
          detail={result?.monteCarlo?.reason}
        />
        <AdvisorReadout
          label="Recommendation"
          value={result ? formatToken(result.status) : "pending"}
          detail={result?.recommendation ?? "No validation has run yet."}
        />
        <AdvisorReadout
          label="Next action"
          value={result?.nextResearchAction ?? currentRead.selfImprovementNextValidation ?? "Replay validate first."}
          detail="research-only; no auto-promotion"
        />
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm leading-5 text-amber-100">{error}</p>
      ) : null}
      {result ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <AdvisorList label="Validation evidence" values={result.evidence} empty="No validation evidence yet." />
          <AdvisorList label="Validation blockers" values={result.blockers} empty="No validation blocker reported." />
          <AdvisorReadout label="Classification reason" value={result.classificationReason} detail="does not mutate approved profile" />
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-5 text-slate-300">
          {hypothesis
            ? "Validation has not run. Click Validate Hypothesis to run a browser-safe replay-backed review."
            : `Research hypothesis not queued: ${noHypothesisReason}`}
        </p>
      )}
    </section>
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
        <AdvisorReadout
          label="Opportunity"
          value={signal.opportunityDetected ? formatToken(signal.opportunityType) : "none"}
          detail={`${formatToken(signal.opportunityStage)} / ${formatToken(signal.opportunityQuality)} / ${formatToken(signal.opportunityLaneRecommendation)}`}
        />
        <AdvisorReadout
          label="Opportunity next"
          value={signal.opportunityNextAction ?? "pending"}
          detail={signal.opportunityBlockers?.[0] ?? signal.opportunityMissingEvidence?.[0] ?? "opportunity is not approval"}
        />
        <AdvisorReadout label="Paper Sim" value={formatToken(signal.paperSimEligibilityStatus)} detail={signal.paperSimEligibilityReason ?? signal.paperWatchlistEvidenceSummary ?? "compact evidence only"} />
        <AdvisorReadout label="Research readiness" value={formatToken(signal.readinessSummary.researchReadiness)} detail={signal.readinessSummary.reasons[0] ?? "compact readiness summary"} />
        <AdvisorReadout label="Paper readiness" value={formatToken(signal.readinessSummary.paperReadiness)} detail="paper-only review; no readiness promotion" />
        <AdvisorReadout label="Execution readiness" value={formatToken(signal.readinessSummary.executionReadiness)} detail="always disabled" />
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

function CurrentReadPanel({
  cmdPaperTracking,
  currentRead,
  latestResearchState,
  packetError,
  researchSignal
}: {
  cmdPaperTracking?: IctCmdPaperTrackingRecord;
  currentRead: IctCurrentRead;
  latestResearchState?: IctLatestResearchState;
  packetError?: string;
  researchSignal: IctResearchSignal;
}) {
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
  const calibrationSees = currentRead.modelDetected
    ? `${formatToken(currentRead.modelName)} / ${formatToken(currentRead.modelState)}`
    : currentRead.opportunityDetected
      ? `${formatToken(currentRead.opportunityType)} / ${formatToken(currentRead.opportunityStage)}`
      : `${formatToken(currentRead.bias)} bias / ${formatToken(currentRead.sessionNarrativeStatus ?? currentRead.sessionNarrativeProfile)}`;
  const calibrationMissed = firstText(
    missingTradeFields.length ? `missing ${missingTradeFields.join(", ")}` : undefined,
    currentRead.modelMissingEvidence?.[0],
    currentRead.opportunityMissingEvidence?.[0],
    currentRead.opportunityBlockers?.[0],
    currentRead.fvgTargetStatus === "missing" ? currentRead.fvgTargetReason : undefined,
    currentRead.topReasons[0]
  ) ?? "no primary miss found";
  const strongestEvidence = firstText(
    currentRead.paperWatchlistEvidenceSummary,
    currentRead.modelReasons?.[0],
    currentRead.opportunityDetected ? `${formatToken(currentRead.opportunityQuality)} opportunity evidence` : undefined,
    currentRead.sessionTopReasons?.[0]
  ) ?? "no model evidence strong enough for a lane";
  const weakestBlocker = firstText(
    currentRead.paperSimAllowed ? undefined : currentRead.paperSimEligibilityReason,
    currentRead.paperWatchlistReason,
    currentRead.topReasons[0],
    researchSignal.rejectionReasons[0]
  ) ?? "no blocking reason supplied";
  const nextCalibrationRecommendation =
    missingTradeFields.length
      ? "Calibrate target, invalidation, and RR construction before changing model thresholds."
      : currentRead.selfImprovementHypothesisQueued
        ? "Replay-test the queued research hypothesis; keep it research-only until evidence improves."
        : currentRead.htfAlignment && currentRead.htfAlignment.alignmentStatus !== "aligned" && currentRead.htfAlignment.alignmentStatus !== "not_required_for_model"
          ? "Review model-aware HTF alignment and keep conflicts as watchlist or paper-only evidence unless replay supports the model."
          : "Run npm.cmd run test:ict-strategy-calibration-audit before changing strategy rules.";
  const decisionExplanation = buildResearchAdvisorDecisionExplanation({
    cmdPaperTracking,
    currentRead,
    latestResearchState,
    researchSignal
  });

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
          <Badge variant={currentRead.paperSimAllowed ? "warning" : "secondary"}>
            Paper Sim: {currentRead.paperSimAllowed ? "Eligible" : "Not Eligible"}
          </Badge>
          <Badge variant="danger">Execution Disabled</Badge>
          <Badge variant="danger">authority none</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdvisorReadout label="Source" value={`${currentRead.brokerSymbol} -> ${currentRead.requestedSymbol}`} detail={`${currentRead.primaryTimeframe} / ${currentRead.candleCount?.toLocaleString() ?? 0} candles`} />
        <AdvisorReadout
          label="Chart timeframe"
          value={currentRead.displayTimeframe ?? currentRead.primaryTimeframe}
          detail={currentRead.displayTimeframeRole === "chart_display_reference_only" ? "display/reference only" : "chart context"}
        />
        <AdvisorReadout
          label="Analysis timeframes"
          value={currentRead.analysisTimeframesUsed?.join(" / ") || "pending"}
          detail={`${formatToken(currentRead.analysisDepthStatus)} depth / ${formatToken(currentRead.multiTimeframeContextStatus)} context`}
        />
        <AdvisorReadout
          label="Missing timeframes"
          value={currentRead.missingTimeframes?.length ? currentRead.missingTimeframes.join(" / ") : "none"}
          detail="Activate Market builds W1/D1/H4/H1/M15/M5 explicitly"
        />
        <AdvisorReadout
          label="HTF / session source"
          value={currentRead.htfBiasSource?.length ? currentRead.htfBiasSource.join(" / ") : "pending"}
          detail={`Session ${currentRead.sessionModelSourceTimeframe ?? "pending"} / confirm ${currentRead.confirmationSourceTimeframe ?? "pending"}`}
        />
        <AdvisorReadout
          label="HTF alignment"
          value={formatToken(currentRead.htfAlignment?.alignmentStatus)}
          detail={currentRead.htfAlignment?.conflictReason ?? "W1/D1/H4/H1/M15/M5 direction context pending"}
        />
        <AdvisorReadout label="Weekly bias" value={`${formatToken(currentRead.weeklyBiasDirection)} / ${formatToken(currentRead.weeklyBiasStatus)}`} detail={currentRead.weeklyBiasReason} />
        <AdvisorReadout label="Model lane" value={modelLaneLabel} detail={currentRead.paperWatchlistReason ?? "research-only lane"} />
        <AdvisorReadout label="Paper-watchlist eligibility" value={currentRead.paperWatchlistEligible ? "eligible" : "not eligible"} detail={currentRead.paperWatchlistEvidenceSummary ?? "compact evidence only"} />
        <AdvisorReadout label="Paper Sim" value={formatToken(currentRead.paperSimEligibilityStatus)} detail={currentRead.paperSimEligibilityReason} />
        <AdvisorReadout
          label="Research hypothesis"
          value={currentRead.selfImprovementHypothesisQueued ? "queued" : "not queued"}
          detail={currentRead.selfImprovementHypothesisQueued ? currentRead.selfImprovementNextValidation : currentRead.selfImprovementHypothesisReason}
        />
        <AdvisorReadout label="Research readiness" value={formatToken(currentRead.readinessSummary.researchReadiness)} detail={currentRead.readinessSummary.reasons[0]} />
        <AdvisorReadout label="Paper readiness" value={formatToken(currentRead.readinessSummary.paperReadiness)} detail="paper/demo candidate remains gated" />
        <AdvisorReadout label="Execution readiness" value={formatToken(currentRead.readinessSummary.executionReadiness)} detail="authority none / no broker mutation" />
        <AdvisorReadout label="Execution" value="Disabled" detail="authority none / no broker mutation" />
        <AdvisorReadout label="Phase 1" value={formatToken(currentRead.bestPhase1Setup)} detail={`${currentRead.debug.phase1SignalCount} signals evaluated`} />
        <AdvisorReadout label="Phase 2" value={formatToken(currentRead.bestPhase2Setup)} detail={`${currentRead.debug.phase2SignalCount} signals evaluated`} />
        <AdvisorReadout label="Best setup" value={formatToken(currentRead.bestSetup)} detail={`${formatToken(currentRead.side)} / ${pct(currentRead.confidence)}`} />
        <AdvisorReadout label="Bias" value={formatToken(currentRead.bias)} detail={`HTF ${currentRead.htfTimeframes.length ? currentRead.htfTimeframes.join(", ") : "missing"}`} />
        <AdvisorReadout
          label="Session narrative"
          value={formatToken(currentRead.sessionNarrativeStatus ?? currentRead.sessionNarrativeProfile)}
          detail={`${currentRead.debug.selectedSessionDate ?? "no session date"} / ${formatToken(currentRead.sessionDirectionalRead)} / ${pct(currentRead.sessionNarrativeConfidence)}`}
        />
        <AdvisorReadout
          label="NY mitigation / depth"
          value={currentRead.sessionMitigationDetected ? "mitigation detected" : "mitigation missing"}
          detail={`${formatToken(currentRead.dataDepthStatus)} / ${currentRead.availableLookbackDays ?? 0} of ${currentRead.requestedLookbackDays ?? 90} days`}
        />
        <AdvisorReadout
          label="FVG target"
          value={currentRead.fvgTargetDetected ? formatToken(currentRead.fvgTargetDirection) : "missing"}
          detail={currentRead.fvgTargetReason}
        />
        <AdvisorReadout label="SMT" value={formatToken(currentRead.smtStatus)} detail={currentRead.smtReason} />
        <AdvisorReadout label="Risk" value={formatToken(currentRead.riskStatus)} detail={currentRead.riskReason} />
        <AdvisorReadout label="Target" value={compactPrice(currentRead.target)} detail={currentRead.targetConstructionReason} />
        <AdvisorReadout label="Invalidation" value={compactPrice(currentRead.invalidation)} detail={currentRead.invalidationConstructionReason} />
        <AdvisorReadout label="RR / location" value={rr(currentRead.rrEstimate)} detail={`${formatToken(currentRead.rrConstructionStatus)} / ${formatToken(currentRead.dealingRangeLocation)}`} />
        <AdvisorReadout label="Trade field status" value={missingTradeFields.length ? missingTradeFields.join(", ") : "complete"} detail={`T ${formatToken(currentRead.targetConstructionStatus)} / I ${formatToken(currentRead.invalidationConstructionStatus)} / RR ${formatToken(currentRead.rrConstructionStatus)}`} />
        <AdvisorReadout label="Paper watchlist" value={currentRead.paperWatchlistEligible ? "eligible" : "not eligible"} detail="paper simulation only; no readiness promotion" />
        <AdvisorReadout label="Latest replay" value={currentRead.latestReplayStatus ?? "none saved"} detail="manual result" />
        <AdvisorReadout
          label="Latest Monte Carlo"
          value={currentRead.latestMonteCarloStatus === "saved" ? formatToken(currentRead.latestMonteCarloRobustness) : "none saved"}
          detail={
            typeof currentRead.latestMonteCarloRiskOfRuinPct === "number"
              ? `risk of ruin ${currentRead.latestMonteCarloRiskOfRuinPct.toFixed(1)}%`
              : currentRead.latestMonteCarloReason
          }
        />
        <AdvisorReadout
          label="Recommended max risk"
          value={typeof currentRead.latestMonteCarloRecommendedRiskPct === "number" ? `${currentRead.latestMonteCarloRecommendedRiskPct.toFixed(2)}%` : "unavailable"}
          detail={currentRead.recommendedMaxRiskReason}
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
      <div data-testid="research-advisor-strategy-calibration-summary" className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Strategy Calibration</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Compact recognition readout only. The 90-day calibration audit is manual CLI work and does not run on page load.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">manual CLI audit</Badge>
            <Badge variant="danger">authority none</Badge>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AdvisorReadout label="What GoTrader sees" value={calibrationSees} detail={`${formatToken(currentRead.packetSource)} / ${currentRead.candleCount?.toLocaleString() ?? 0} candles`} />
          <AdvisorReadout label="What it missed" value={calibrationMissed} detail={`${formatToken(currentRead.modelQualityLane)} / ${formatToken(currentRead.approvedStatus)}`} />
          <AdvisorReadout label="Strongest evidence" value={strongestEvidence} detail={`${formatToken(currentRead.weeklyBiasDirection)} weekly bias / HTF ${formatToken(currentRead.htfAlignment?.alignmentStatus)}`} />
          <AdvisorReadout label="Weakest blocker" value={weakestBlocker} detail={`Signal ${formatToken(researchSignal.status)} / authority none`} />
        </div>
        <p className="mt-3 rounded-xl border border-emerald-300/15 bg-black/20 p-3 text-xs leading-5 text-emerald-50">
          Next calibration recommendation: {nextCalibrationRecommendation}
        </p>
      </div>
      <ResearchAdvisorDecisionExplanationPanel explanation={decisionExplanation} />
      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Session story</p>
        <p className="mt-1 text-sm leading-6 text-slate-300">
          {(currentRead.sessionTopReasons ?? [])[0] ?? "Session narrative is waiting for enough Asia/London/New York evidence."}
        </p>
      </div>
    </section>
  );
}

function ResearchAdvisorDecisionExplanationPanel({
  explanation
}: {
  explanation: IctResearchAdvisorDecisionExplanation;
}) {
  return (
    <div
      data-testid="research-advisor-decision-explanation"
      className="mt-4 rounded-2xl border border-cyan-300/15 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(135deg,rgba(2,6,23,0.78),rgba(15,23,42,0.62))] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Decision Explanation</p>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-400">
            Deterministic audit for {explanation.brokerSymbol} -&gt; {explanation.requestedSymbol}. Source {formatToken(explanation.packetSource)}, analysis {explanation.analysisTimeframesUsed.join(" / ") || "pending"}, depth {formatToken(explanation.analysisDepthStatus)}, weekly bias {formatToken(explanation.weeklyBiasDirection)} / {formatToken(explanation.weeklyBiasStatus)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">hydration {formatToken(explanation.candleHydrationStatus)}</Badge>
          <Badge variant="danger">authority none</Badge>
          <Badge variant="secondary">compact only</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {explanation.sections.map((section) => (
          <article key={section.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{section.label}</p>
              <Badge variant={decisionStatusVariant(section.status)}>{formatToken(section.status)}</Badge>
            </div>
            <p className="mt-2 text-sm leading-5 text-slate-100">{section.reason}</p>
            <p className="mt-2 text-xs leading-5 text-cyan-100">Next: {section.nextAction}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {section.facts.slice(0, 5).map((fact) => (
                <span key={fact} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-slate-400">
                  {fact}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function CurrentReadDataFlowPanel({ currentRead }: { currentRead: IctCurrentRead }) {
  const rows = [
    ["Packet source", currentRead.debug.packetSource],
    ["Data status", currentRead.dataStatus],
    ["Candle count", currentRead.debug.candleCount.toLocaleString()],
    ["Chart/display timeframe", currentRead.displayTimeframe ?? currentRead.primaryTimeframe],
    ["Display role", currentRead.displayTimeframeRole ?? "unknown"],
    ["Analysis requested", currentRead.analysisTimeframesRequested?.join(", ") || "none"],
    ["Analysis loaded", currentRead.analysisTimeframesLoaded?.join(", ") || "none"],
    ["Required M5/M15 loaded", currentRead.requiredTimeframesLoaded ? "yes" : "no"],
    ["Analysis timeframes", currentRead.analysisTimeframesUsed?.join(", ") || "none"],
    ["Analysis depth", currentRead.analysisDepthStatus ?? "unknown"],
    ["MTF context status", currentRead.multiTimeframeContextStatus ?? "unknown"],
    ["Missing analysis timeframes", currentRead.missingTimeframes?.join(", ") || "none"],
    ["HTF bias source", currentRead.htfBiasSource?.join(", ") || "none"],
    ["Session model source", currentRead.sessionModelSourceTimeframe ?? "none"],
    ["Confirmation source", currentRead.confirmationSourceTimeframe ?? "none"],
    ["Weekly bias", `${currentRead.weeklyBiasDirection ?? "unknown"} / ${currentRead.weeklyBiasStatus ?? "unknown"} / ${currentRead.weeklyBiasReason ?? "none"}`],
    ["Primary TF available", currentRead.debug.primaryTimeframeAvailable ? "yes" : "no"],
    ["HTF available", currentRead.debug.htfTimeframesAvailable.join(", ") || "none"],
    ["Selected session date", currentRead.debug.selectedSessionDate ?? "none"],
    ["Selected session mode", currentRead.debug.selectedSessionMode ?? "none"],
    ["Session candles counted", String(currentRead.debug.sessionCandlesCount ?? 0)],
    ["Session narrative", currentRead.sessionNarrativeStatus ?? currentRead.sessionNarrativeProfile ?? "none"],
    ["Session read", currentRead.sessionDirectionalRead ?? "none"],
    ["Model detector", currentRead.debug.modelDetectorUsed ?? "none"],
    ["Session mitigation", currentRead.sessionMitigationDetected ? "detected" : "missing"],
    ["FVG target", currentRead.fvgTargetDetected ? currentRead.fvgTargetDirection ?? "detected" : currentRead.fvgTargetReason ?? "missing"],
    ["Target construction", `${currentRead.targetConstructionStatus ?? "unknown"} / ${currentRead.targetConstructionReason ?? "none"}`],
    ["Invalidation construction", `${currentRead.invalidationConstructionStatus ?? "unknown"} / ${currentRead.invalidationConstructionReason ?? "none"}`],
    ["RR construction", `${currentRead.rrConstructionStatus ?? "unknown"} / ${currentRead.rrConstructionReason ?? "none"}`],
    ["SMT status", `${currentRead.smtStatus ?? "unknown"} / ${currentRead.smtReason ?? "none"}`],
    ["Risk status", `${currentRead.riskStatus ?? "unknown"} / ${currentRead.riskReason ?? "none"}`],
    ["Data depth", currentRead.dataDepthStatus ?? "unknown"],
    ["Hydration source", currentRead.debug.hydrationSource ?? "unknown"],
    ["Hydration warning", currentRead.debug.hydrationWarning ?? "none"],
    ["Phase 1 signal count", currentRead.debug.phase1SignalCount.toLocaleString()],
    ["Phase 2 signal count", currentRead.debug.phase2SignalCount.toLocaleString()],
    ["Approved status", currentRead.debug.approvedStatus],
    ["Model quality lane", currentRead.modelQualityLane],
    ["Opportunity detected", currentRead.opportunityDetected ? "yes" : "no"],
    ["Opportunity type", currentRead.opportunityType],
    ["Opportunity stage", currentRead.opportunityStage],
    ["Opportunity quality", currentRead.opportunityQuality],
    ["Opportunity lane", currentRead.opportunityLaneRecommendation],
    ["Opportunity next", currentRead.opportunityNextAction],
    ["Paper-watchlist eligible", currentRead.paperWatchlistEligible ? "yes" : "no"],
    ["Paper Sim eligibility", `${currentRead.paperSimEligibilityStatus ?? "unknown"} / ${currentRead.paperSimEligibilityReason ?? "none"}`],
    ["Paper allowed", currentRead.paperSimAllowed ? "yes" : "no"],
    ["Research readiness", `${currentRead.readinessSummary.researchReadiness} / ${currentRead.readinessSummary.reasons[0] ?? "no reason"}`],
    ["Paper readiness", currentRead.readinessSummary.paperReadiness],
    ["Execution readiness", currentRead.readinessSummary.executionReadiness],
    ["Execution allowed", currentRead.executionAllowed ? "true" : "false"],
    ["Rejection reasons", currentRead.debug.rejectionReasonsCount.toLocaleString()],
    ["No-trade reasons", currentRead.debug.noTradeReasonsCount.toLocaleString()],
    ["Journal", currentRead.debug.journalStatus ?? "pending"],
    ["Latest replay", currentRead.latestReplayStatus ?? "none"],
    ["Latest Monte Carlo", `${currentRead.latestMonteCarloStatus} / ${currentRead.latestMonteCarloRobustness ?? currentRead.latestMonteCarloReason}`],
    ["Recommended max risk", typeof currentRead.latestMonteCarloRecommendedRiskPct === "number" ? `${currentRead.latestMonteCarloRecommendedRiskPct.toFixed(2)}%` : currentRead.recommendedMaxRiskReason],
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
    "Explain this cycle",
    "Why is this blocked?",
    "What should I test next?",
    "Suggest calibration",
    "Review self-improvement",
    "Review Paper-Demo checklist"
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
          <Badge variant={riskVariant(currentRead.riskStatus)}>{riskLabel(currentRead.riskStatus)}</Badge>
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
  currentRead,
  manualReplayResult,
  manualReplayStatus,
  packet
}: {
  currentRead: IctCurrentRead;
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
        badge={riskLabel(currentRead.riskStatus)}
        badgeVariant={riskVariant(currentRead.riskStatus)}
        rows={[
          ["News/session", formatToken(packet?.compactSummary.sessionRiskState)],
          ["SMT", smtLabel(currentRead.smtStatus)],
          ["Risk action", formatToken(packet?.compactSummary.riskGovernorAction)],
          ["Risk reason", currentRead.riskReason ?? "No risk reason available."],
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
