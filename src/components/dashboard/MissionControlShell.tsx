import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ExternalLink, Lock, RadioTower, ShieldCheck, Zap } from "lucide-react";

import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { TradingChart } from "@/components/charts/TradingChart";
import { WhyNotReadyCard } from "@/components/common/WhyNotReadyCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  AUTONOMOUS_RESEARCH_UPDATED_EVENT,
  latestAutonomousResearchRun,
  loadAutonomousResearchState,
  runAutonomousResearchLoop,
  type AutonomousResearchSettings,
  type AutonomousResearchRun,
  type AutonomousResearchState
} from "@/lib/autonomousResearch";
import { COMMUNICATION_AUDIT_UPDATED_EVENT, loadCommunicationMessages } from "@/lib/communications/communicationSpec";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  MARKET_DATA_IMPORT_UPDATED_EVENT,
  resolveChartDisplayCandleSource
} from "@/lib/marketData";
import { createPlannedHermesNotificationState } from "@/lib/integrations/hermesNotificationHooks";
import { createPlannedOpenClawMemoryHookState } from "@/lib/integrations/openclawMemoryHooks";
import { paperclipAgentOperationsPolicy } from "@/lib/integrations/paperclipAuthorityPolicy";
import {
  checkAndStoreTradingViewMcpStatus,
  createActiveTradingViewMcpChartFeed,
  fetchTradingViewMcpCandles,
  fetchTradingViewMcpQuote,
  hydrateActiveTradingViewMcpChartFeed,
  loadTradingViewMcpAutoRefreshState,
  loadActiveTradingViewMcpChartFeed,
  loadTradingViewMcpSettings,
  refreshTradingViewMcpChartDataNow,
  saveTradingViewMcpSettings,
  saveTradingViewMcpAutoRefreshSettings,
  startTradingViewMcpAutoRefresh,
  stopTradingViewMcpAutoRefresh,
  storeActiveTradingViewMcpChartFeed,
  tradingViewMcpAutoRefreshCandleLimitOptions,
  tradingViewMcpAutoRefreshIntervalOptions,
  TRADINGVIEW_MCP_AUTO_REFRESH_UPDATED_EVENT,
  TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT,
  TRADINGVIEW_MCP_EVIDENCE_UPDATED_EVENT,
  TRADINGVIEW_MCP_SETTINGS_UPDATED_EVENT,
  tradingViewMcpAdapterPlan,
  type ActiveTradingViewMcpChartFeed,
  type TradingViewMcpAutoRefreshState
} from "@/lib/integrations/tradingview";
import { mt5ExecutionAdapterPlan } from "@/lib/brokers/mt5";
import { tradovateExecutionAdapterPlan } from "@/lib/brokers/tradovate";
import { buildVwapOverlay, createTradingChartData } from "@/lib/charting";
import { RESEARCH_CYCLE_UPDATED_EVENT } from "@/lib/researchCycle";
import {
  ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT,
  SELF_IMPROVEMENT_UPDATED_EVENT
} from "@/lib/selfImprovement";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeProvenanceRows,
  selectRuntimeWarnings,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";
import type { LabState } from "@/lib/types";
import { safeArray, safeTopN, uid } from "@/lib/utils";
import { WALK_FORWARD_UPDATED_EVENT } from "@/lib/walkForward";

import { formatDateTime } from "./dashboardFormatters";
import type { MissionActionItem } from "./MissionControlActionPanel";
import { MissionControlDataFeed, type MissionFeedItem } from "./MissionControlDataFeed";
import { MissionControlPipeline, type MissionPipelineStage } from "./MissionControlPipeline";
import { ResearchCycleControl } from "./ResearchCycleControl";

const pct = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : "n/a";

const formatToken = (value?: string) => (value ?? "idle").replace(/_/g, " ");
const formatBool = (value?: boolean) => (typeof value === "boolean" ? (value ? "yes" : "no") : "unknown");
const tradingViewAutoRefreshIntervalOptions = tradingViewMcpAutoRefreshIntervalOptions.map((value) => ({
  label: `${value}s`,
  value: String(value)
}));
const tradingViewAutoRefreshCandleOptions = tradingViewMcpAutoRefreshCandleLimitOptions.map((value) => ({
  label: `${value.toLocaleString()} candles`,
  value: String(value)
}));
const TRADINGVIEW_FEED_INACTIVE_MESSAGE = "TradingView MCP chart feed not active.";

const formatCountdown = (timestamp?: string, nowMs = Date.now()) => {
  if (!timestamp) {
    return "n/a";
  }
  const seconds = Math.max(0, Math.ceil((new Date(timestamp).getTime() - nowMs) / 1000));
  return `${seconds}s`;
};

type CommandCenterDataEvent = {
  detail: string;
  id: string;
  severity: MissionFeedItem["severity"];
  sourceFingerprint?: string;
  timestamp: string;
  title: string;
};

const buildCommandCenterChartData = (snapshot?: ResearchRuntimeSnapshot) => {
  const tradingViewFeed = loadActiveTradingViewMcpChartFeed();
  const displaySource = snapshot ? resolveChartDisplayCandleSource(snapshot.marketData.preparedSource, tradingViewFeed) : undefined;
  const candles = displaySource?.activeChartDisplayCandleSource.slice(-160) ?? [];
  if (!snapshot || !displaySource || !candles.length) {
    return undefined;
  }
  const vwap = buildVwapOverlay(candles);
  return {
    ...createTradingChartData({
      candles,
      sourceLabel: displaySource.activeChartDisplaySourceLabel,
      sourceType: displaySource.activeChartDisplaySourceMode,
      symbol: displaySource.chartDisplayUsesTradingViewMcp ? tradingViewFeed?.providerSymbol ?? snapshot.marketData.symbol : snapshot.marketData.symbol,
      timeframe: displaySource.chartDisplayUsesTradingViewMcp ? tradingViewFeed?.timeframe ?? snapshot.marketData.timeframe : snapshot.marketData.timeframe
    }),
    lineOverlays: vwap ? [vwap] : [],
    stateLabel: `${formatToken(snapshot.latestResearchCycle.latestCycleStatus)} / broker disabled`
  };
};

export function MissionControlShell({ state }: { state: LabState }) {
  const [autonomyState, setAutonomyState] = useState<AutonomousResearchState>(() => loadAutonomousResearchState());
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();
  const [liveRun, setLiveRun] = useState<AutonomousResearchRun>();
  const [busy, setBusy] = useState(false);
  const [abortController, setAbortController] = useState<AbortController>();
  const [maxIterations, setMaxIterations] = useState("3");
  const [noImprovementStop, setNoImprovementStop] = useState("2");
  const [autoApplyPolicyEnabled, setAutoApplyPolicyEnabled] = useState(false);
  const [advancedFullResearchMode, setAdvancedFullResearchMode] = useState(false);
  const [tradingViewBusy, setTradingViewBusy] = useState(false);
  const [tradingViewOperationMessage, setTradingViewOperationMessage] = useState(TRADINGVIEW_FEED_INACTIVE_MESSAGE);
  const [tradingViewAutoRefresh, setTradingViewAutoRefresh] = useState<TradingViewMcpAutoRefreshState>(() =>
    loadTradingViewMcpAutoRefreshState()
  );
  const [autoRefreshBusy, setAutoRefreshBusy] = useState(false);
  const [autoRefreshIntervalSeconds, setAutoRefreshIntervalSeconds] = useState(() =>
    String(loadTradingViewMcpAutoRefreshState().refreshIntervalSeconds)
  );
  const [autoRefreshCandleLimit, setAutoRefreshCandleLimit] = useState(() =>
    String(loadTradingViewMcpAutoRefreshState().candleLimit)
  );
  const [autoRefreshClock, setAutoRefreshClock] = useState(() => Date.now());
  const [dataConnectionEvents, setDataConnectionEvents] = useState<CommandCenterDataEvent[]>([]);
  const latestRun = liveRun ?? latestAutonomousResearchRun(autonomyState);
  const currentIteration = latestRun?.iterations.find((iteration) => iteration.iteration === latestRun.currentIteration);
  const recoveryRun = !busy && autonomyState.activeRun?.status === "running" ? autonomyState.activeRun : undefined;

  const refresh = () => {
    setAutonomyState(loadAutonomousResearchState());
    void resolveResearchRuntimeSnapshot({ labState: state }).then(setRuntimeSnapshot).catch(() => undefined);
  };

  const resolveAndStoreRuntime = async () => {
    const snapshot = await resolveResearchRuntimeSnapshot({ labState: state });
    setRuntimeSnapshot(snapshot);
    return snapshot;
  };

  const addDataConnectionEvent = (
    title: string,
    detail: string,
    severity: MissionFeedItem["severity"],
    sourceFingerprint?: string
  ) => {
    const nextEvent = {
      detail,
      id: uid("command_data_event"),
      severity,
      sourceFingerprint,
      timestamp: new Date().toISOString(),
      title
    };
    setDataConnectionEvents((events) =>
      safeTopN(
        events[0]?.title === nextEvent.title &&
        (nextEvent.title.includes("auto-refresh") ||
          nextEvent.title.includes("TradingView quote") ||
          nextEvent.title.includes("TradingView candles") ||
          nextEvent.title.includes("TradingView chart source refreshed"))
          ? [{ ...nextEvent, id: events[0].id }, ...events.slice(1)]
          : [nextEvent, ...events],
        16
      )
    );
  };

  const commandCenterSymbol = runtimeSnapshot?.marketData.symbol ?? "MNQ";
  const commandCenterTimeframe = runtimeSnapshot?.marketData.timeframe ?? "5m";

  const connectTradingViewChart = async ({ usageMode = "chart_only" }: { usageMode?: "chart_only" | "research_source" } = {}) => {
    setTradingViewBusy(true);
    setTradingViewOperationMessage(`Checking TradingView MCP bridge for ${commandCenterSymbol} ${commandCenterTimeframe}...`);
    addDataConnectionEvent(
      "TradingView MCP status check",
      `Checking local read-only bridge for ${commandCenterSymbol} ${commandCenterTimeframe}.`,
      "running"
    );
    try {
      const settings = saveTradingViewMcpSettings({ ...loadTradingViewMcpSettings(), enabled: true });
      const status = await checkAndStoreTradingViewMcpStatus(settings);
      await resolveAndStoreRuntime().catch(() => undefined);

      if (status.connectionStatus !== "connected_analysis_only") {
        const message = "Wrapper not running. Start npm.cmd run tradingview:mcp-bridge, then try again.";
        setTradingViewOperationMessage(message);
        addDataConnectionEvent("TradingView MCP failed", message, "failed", status.message);
        return;
      }

      addDataConnectionEvent(
        "TradingView MCP connected",
        `Desktop CDP ${formatBool(status.tradingViewDesktopCdpConnected)}; chart ${status.chartSymbol ?? "unknown"} ${status.chartResolution ?? "unknown"}.`,
        "success",
        status.chartSymbol
      );

      setTradingViewOperationMessage(`Fetching TradingView MCP quote for ${commandCenterSymbol} ${commandCenterTimeframe}...`);
      addDataConnectionEvent("Quote fetch started", "Requesting read-only TradingView quote.", "running");
      const quote = await fetchTradingViewMcpQuote({ symbol: commandCenterSymbol, timeframe: commandCenterTimeframe }, settings);
      addDataConnectionEvent(
        quote.latestPrice ? "Quote fetched" : "Quote unavailable",
        quote.latestPrice ? `Latest TradingView MCP price ${quote.latestPrice}.` : quote.missingEvidence.join(" ") || "No quote returned.",
        quote.latestPrice ? "success" : "warning",
        quote.timestamp
      );

      setTradingViewOperationMessage(`Fetching TradingView MCP candles for ${commandCenterSymbol} ${commandCenterTimeframe}...`);
      addDataConnectionEvent("Candle fetch started", "Requesting 240 read-only candles for chart display.", "running");
      const candles = await fetchTradingViewMcpCandles({ symbol: commandCenterSymbol, timeframe: commandCenterTimeframe, limit: 240 }, settings);
      if (!candles.candleCount) {
        const message =
          candles.missingEvidence.join(" ") ||
          "TradingView MCP wrapper connected, but no candle series was returned. Check the TradingView Desktop chart.";
        setTradingViewOperationMessage(message);
        addDataConnectionEvent("Candles unavailable", message, "failed");
        await resolveAndStoreRuntime().catch(() => undefined);
        return;
      }

      const feed = await storeActiveTradingViewMcpChartFeed(
        createActiveTradingViewMcpChartFeed({
          candlesResponse: candles,
          gotraderSymbol: commandCenterSymbol,
          gotraderTimeframe: commandCenterTimeframe,
          usageMode
        })
      );
      await resolveAndStoreRuntime().catch(() => undefined);
      setTradingViewOperationMessage(
        [
          `TradingView MCP chart source active with ${feed.candleCount.toLocaleString()} read-only candles.`,
          `Storage: ${feed.candlesPersisted ? "IndexedDB" : "session-only"}.`,
          feed.activeForResearch
            ? "Ready for guarded research source use."
            : `Research remains guarded: ${feed.researchEligibility.reasons.join(" ")}`
        ].join(" ")
      );
      addDataConnectionEvent(
        "Candles fetched",
        `${feed.candleCount.toLocaleString()} candles from ${feed.firstTimestamp ?? "n/a"} to ${feed.lastTimestamp ?? "n/a"}. Storage ${feed.candlesPersisted ? "IndexedDB" : "session-only"}.`,
        "success",
        feed.providerSymbol
      );
      addDataConnectionEvent(
        usageMode === "research_source" && feed.activeForResearch ? "Research source switched" : "Chart source switched",
        usageMode === "research_source" && feed.activeForResearch
          ? "TradingView MCP is now the guarded research source. Execution remains disabled."
          : "TradingView MCP is active for visual chart display. Research source remains guarded unless eligibility passes.",
        usageMode === "research_source" && !feed.activeForResearch ? "warning" : "success",
        feed.matchState
      );
      if (!feed.activeForResearch) {
        addDataConnectionEvent(
          "Research eligibility blocked",
          feed.researchEligibility.reasons.join(" "),
          "warning",
          feed.researchEligibility.state
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "TradingView MCP connection failed.";
      setTradingViewOperationMessage(message);
      addDataConnectionEvent("TradingView MCP failed", message, "failed");
    } finally {
      setTradingViewBusy(false);
    }
  };

  const useExistingTradingViewForResearch = async () => {
    const feed = await hydrateActiveTradingViewMcpChartFeed().catch(() => loadActiveTradingViewMcpChartFeed());
    if (!feed?.candleCount) {
      await connectTradingViewChart({ usageMode: "research_source" });
      return;
    }
    const researchFeed: ActiveTradingViewMcpChartFeed = await storeActiveTradingViewMcpChartFeed(
      createActiveTradingViewMcpChartFeed({
        candlesResponse: {
          provider: "tradingview_mcp",
          symbol: feed.providerSymbol,
          requestedSymbol: feed.requestedSymbol,
          chartSymbol: feed.chartSymbol,
          chartResolution: feed.chartResolution,
          timeframe: feed.timeframe,
          requestedTimeframe: feed.requestedTimeframe,
          candles: feed.candles,
          candleCount: feed.candleCount,
          firstTimestamp: feed.firstTimestamp,
          lastTimestamp: feed.lastTimestamp,
          sourceCommand: feed.sourceCommand,
          connectionStatus: feed.connectionStatus,
          warnings: feed.warnings,
          missingEvidence: feed.missingEvidence,
          mode: "read_only_chart_data",
          executionAuthority: "none",
          brokerAuthority: "none",
          readinessOverrideAuthority: "none"
        },
        gotraderSymbol: commandCenterSymbol,
        gotraderTimeframe: commandCenterTimeframe,
        usageMode: "research_source"
      })
    );
    await resolveAndStoreRuntime().catch(() => undefined);
    if (researchFeed.activeForResearch) {
      setTradingViewOperationMessage("TradingView MCP is now the guarded research source. Execution remains disabled.");
      addDataConnectionEvent(
        "Research source switched",
        "TradingView MCP candles passed the research-source gate. Broker execution remains disabled.",
        "success",
        researchFeed.matchState
      );
      return;
    }
    setTradingViewOperationMessage(
      `TradingView MCP remains visual-only: ${researchFeed.researchEligibility.reasons.join(" ")}`
    );
    addDataConnectionEvent(
      "Research eligibility failed",
      researchFeed.researchEligibility.reasons.join(" "),
      "warning",
      researchFeed.researchEligibility.state
    );
  };

  const persistAutoRefreshSettings = (intervalSeconds = autoRefreshIntervalSeconds, candleLimit = autoRefreshCandleLimit) => {
    const saved = saveTradingViewMcpAutoRefreshSettings({
      refreshIntervalSeconds: Number(intervalSeconds),
      candleLimit: Number(candleLimit)
    });
    setTradingViewAutoRefresh(saved);
    return saved;
  };

  const startTradingViewAutoRefresh = async () => {
    setAutoRefreshBusy(true);
    setTradingViewOperationMessage(`Starting TradingView MCP auto-refresh for ${commandCenterSymbol} ${commandCenterTimeframe}...`);
    addDataConnectionEvent(
      "TradingView auto-refresh starting",
      `Interval ${autoRefreshIntervalSeconds}s, limit ${Number(autoRefreshCandleLimit).toLocaleString()} candles.`,
      "running",
      `${commandCenterSymbol} ${commandCenterTimeframe}`
    );
    try {
      const state = await startTradingViewMcpAutoRefresh({
        symbol: commandCenterSymbol,
        timeframe: commandCenterTimeframe,
        refreshIntervalSeconds: Number(autoRefreshIntervalSeconds),
        candleLimit: Number(autoRefreshCandleLimit),
        usageMode: runtimeSnapshot?.tradingViewMcp.usageMode === "research_source" ? "research_source" : "chart_only"
      });
      setTradingViewAutoRefresh(state);
      await resolveAndStoreRuntime().catch(() => undefined);
      setTradingViewOperationMessage(
        state.status === "running"
          ? `TradingView MCP auto-refresh running every ${state.refreshIntervalSeconds}s. Latest candle ${state.lastCandleTimestamp ?? "pending"}.`
          : state.lastError ?? "TradingView MCP auto-refresh did not start."
      );
    } finally {
      setAutoRefreshBusy(false);
    }
  };

  const stopTradingViewAutoRefresh = () => {
    const state = stopTradingViewMcpAutoRefresh();
    setTradingViewAutoRefresh(state);
    setTradingViewOperationMessage("TradingView MCP auto-refresh stopped. Existing chart candles remain visible.");
    addDataConnectionEvent("TradingView auto-refresh stopped", "Manual stop. Existing read-only chart candles remain visible.", "info");
  };

  const refreshTradingViewNow = async () => {
    setAutoRefreshBusy(true);
    setTradingViewOperationMessage(`Refreshing TradingView MCP candles now for ${commandCenterSymbol} ${commandCenterTimeframe}...`);
    try {
      const state = await refreshTradingViewMcpChartDataNow({
        symbol: commandCenterSymbol,
        timeframe: commandCenterTimeframe,
        refreshIntervalSeconds: Number(autoRefreshIntervalSeconds),
        candleLimit: Number(autoRefreshCandleLimit),
        usageMode: runtimeSnapshot?.tradingViewMcp.usageMode === "research_source" ? "research_source" : "chart_only",
        activateLoop: tradingViewAutoRefresh.enabled
      });
      setTradingViewAutoRefresh(state);
      await resolveAndStoreRuntime().catch(() => undefined);
      setTradingViewOperationMessage(
        state.lastError
          ? `TradingView MCP refresh warning: ${state.lastError}`
          : `TradingView MCP refreshed ${state.lastCandleCount.toLocaleString()} candles. Latest price ${state.lastPrice ?? "n/a"}.`
      );
    } finally {
      setAutoRefreshBusy(false);
    }
  };

  useEffect(() => {
    refresh();
    window.addEventListener(AUTONOMOUS_RESEARCH_UPDATED_EVENT, refresh);
    window.addEventListener(COMMUNICATION_AUDIT_UPDATED_EVENT, refresh);
    window.addEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
    window.addEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
    window.addEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
    window.addEventListener(WALK_FORWARD_UPDATED_EVENT, refresh);
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener(TRADINGVIEW_MCP_AUTO_REFRESH_UPDATED_EVENT, refresh);
    window.addEventListener(TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT, refresh);
    window.addEventListener(TRADINGVIEW_MCP_EVIDENCE_UPDATED_EVENT, refresh);
    window.addEventListener(TRADINGVIEW_MCP_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(AUTONOMOUS_RESEARCH_UPDATED_EVENT, refresh);
      window.removeEventListener(COMMUNICATION_AUDIT_UPDATED_EVENT, refresh);
      window.removeEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
      window.removeEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
      window.removeEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
      window.removeEventListener(WALK_FORWARD_UPDATED_EVENT, refresh);
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener(TRADINGVIEW_MCP_AUTO_REFRESH_UPDATED_EVENT, refresh);
      window.removeEventListener(TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT, refresh);
      window.removeEventListener(TRADINGVIEW_MCP_EVIDENCE_UPDATED_EVENT, refresh);
      window.removeEventListener(TRADINGVIEW_MCP_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [state]);

  useEffect(() => {
    const handleAutoRefreshUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: TradingViewMcpAutoRefreshState; event?: TradingViewMcpAutoRefreshState["lastEvent"] }>).detail;
      const nextState = detail?.state ?? loadTradingViewMcpAutoRefreshState();
      setTradingViewAutoRefresh(nextState);
      setAutoRefreshIntervalSeconds(String(nextState.refreshIntervalSeconds));
      setAutoRefreshCandleLimit(String(nextState.candleLimit));
      if (detail?.event) {
        addDataConnectionEvent(
          detail.event.title,
          detail.event.detail,
          detail.event.severity === "failed" ? "failed" : detail.event.severity,
          detail.event.sourceFingerprint
        );
      }
    };
    window.addEventListener(TRADINGVIEW_MCP_AUTO_REFRESH_UPDATED_EVENT, handleAutoRefreshUpdate);
    return () => window.removeEventListener(TRADINGVIEW_MCP_AUTO_REFRESH_UPDATED_EVENT, handleAutoRefreshUpdate);
  }, []);

  useEffect(() => {
    if (!runtimeSnapshot) {
      return;
    }
    setTradingViewOperationMessage((currentMessage) => {
      if (
        currentMessage !== TRADINGVIEW_FEED_INACTIVE_MESSAGE &&
        currentMessage !== "TradingView MCP chart feed is not active."
      ) {
        return currentMessage;
      }
      if (runtimeSnapshot.tradingViewMcp.chartFeedAvailable) {
        return [
          `TradingView MCP chart source active with ${runtimeSnapshot.tradingViewMcp.chartFeedCandleCount.toLocaleString()} read-only candles.`,
          runtimeSnapshot.marketData.researchUsesTradingViewMcp
            ? "Research source is TradingView MCP; execution remains disabled."
            : `Research remains guarded: ${
                runtimeSnapshot.tradingViewMcp.eligibilityReasons[0] ?? "TradingView MCP is visual-only."
              }`
        ].join(" ");
      }
      if (runtimeSnapshot.tradingViewMcp.bridgeStatus === "connected_analysis_only") {
        return "TradingView MCP bridge connected; fetch candles to activate the chart feed.";
      }
      return TRADINGVIEW_FEED_INACTIVE_MESSAGE;
    });
  }, [
    runtimeSnapshot?.marketData.researchUsesTradingViewMcp,
    runtimeSnapshot?.tradingViewMcp.bridgeStatus,
    runtimeSnapshot?.tradingViewMcp.chartFeedAvailable,
    runtimeSnapshot?.tradingViewMcp.chartFeedCandleCount,
    runtimeSnapshot?.tradingViewMcp.eligibilityReasons
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => setAutoRefreshClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const startLoop = async () => {
    const controller = new AbortController();
    const settings: AutonomousResearchSettings = {
      maxIterations: Number(maxIterations),
      noImprovementStop: Number(noImprovementStop),
      safeImportedDataMode: true,
      advancedFullResearchMode,
      autoApplyPolicyEnabled
    };
    setAbortController(controller);
    setBusy(true);
    setLiveRun(createStartingAutonomyRun(settings));
    try {
      const run = await runAutonomousResearchLoop({
        state,
        settings,
        signal: controller.signal,
        onUpdate: setLiveRun
      });
      setLiveRun(run);
      setAutonomyState(loadAutonomousResearchState());
      await resolveResearchRuntimeSnapshot({ labState: state }).then(setRuntimeSnapshot).catch(() => undefined);
    } finally {
      setBusy(false);
      setAbortController(undefined);
    }
  };

  const stopLoop = () => {
    abortController?.abort();
  };

  const pipelineStages = useMemo(
    () => buildPipelineStages(runtimeSnapshot, latestRun, busy, currentIteration?.startedAt),
    [busy, currentIteration?.startedAt, latestRun, runtimeSnapshot]
  );
  const actionItems = useMemo(() => buildActionItems(runtimeSnapshot, latestRun), [runtimeSnapshot, latestRun]);
  const feedItems = useMemo(() => buildFeedItems(runtimeSnapshot, latestRun, dataConnectionEvents), [dataConnectionEvents, latestRun, runtimeSnapshot]);
  const commandCenterChart = useMemo(() => buildCommandCenterChartData(runtimeSnapshot), [runtimeSnapshot]);
  const warnings = selectRuntimeWarnings(runtimeSnapshot);
  const autoRefreshRunning = tradingViewAutoRefresh.status === "running" && tradingViewAutoRefresh.enabled;
  const autoRefreshPaused = tradingViewAutoRefresh.status === "paused" || tradingViewAutoRefresh.status === "failed";
  const autoRefreshCountdown = formatCountdown(tradingViewAutoRefresh.nextRefreshAt, autoRefreshClock);
  const latestBacktest = runtimeSnapshot?.latestResearchCycle.latestBacktestSummary;
  const grinch = runtimeSnapshot?.latestResearchCycle.activeGrinchProfileSummary;
  const primaryBlocker =
    actionItems[0]?.title ??
    runtimeSnapshot?.readiness.actualBlockers[0] ??
    runtimeSnapshot?.walkForward.recommendedNextAction ??
    "No action required";
  const primaryBlockerDetail =
    actionItems[0]?.detail ??
    runtimeSnapshot?.readiness.nextAction ??
    "Keep the system supervised; execution remains disabled.";
  const chartSourceShortLabel = getChartSourceShortLabel(runtimeSnapshot);
  const chartSourceBadgeTone = runtimeSnapshot?.marketData.chartDisplayUsesTradingViewMcp
    ? "success"
    : runtimeSnapshot?.marketData.fallbackToMock
      ? "warning"
      : "secondary";
  const statusChips = [
    {
      label: "TradingView MCP",
      value: runtimeSnapshot?.tradingViewMcp.bridgeStatus.replace(/_/g, " ") ?? "checking",
      tone: runtimeSnapshot?.tradingViewMcp.bridgeStatus === "connected_analysis_only" ? "success" : "warning"
    },
    {
      label: "Chart",
      value: chartSourceShortLabel,
      tone: chartSourceBadgeTone
    },
    {
      label: "Research",
      value: getResearchSourceShortLabel(runtimeSnapshot),
      tone: runtimeSnapshot?.marketData.researchUsesTradingViewMcp ? "success" : "secondary"
    },
    {
      label: "Regime",
      value: runtimeSnapshot
        ? `${runtimeSnapshot.regime.label.replace(/_/g, " ")} ${Math.round(runtimeSnapshot.regime.confidence * 100)}%`
        : "loading",
      tone:
        runtimeSnapshot?.regime.dataQuality === "insufficient" || runtimeSnapshot?.regime.transitionPending
          ? "warning"
          : runtimeSnapshot?.regime.label === "risk_off_crisis" || runtimeSnapshot?.regime.label === "event_high_vol"
            ? "warning"
            : "success"
    },
    {
      label: "Readiness",
      value: runtimeSnapshot?.readiness.readinessState ?? "loading",
      tone:
        runtimeSnapshot?.readiness.readinessState === "Paper-Demo Candidate"
          ? "success"
          : runtimeSnapshot?.readiness.readinessState === "Research Ready"
            ? "warning"
            : "danger"
    },
    {
      label: "Execution",
      value: "disabled",
      tone: "danger"
    }
  ] as const;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-cyan-300/15 bg-slate-950 p-4 shadow-[0_0_60px_rgba(8,145,178,0.10)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Command Center</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-50">GoTrader Research Dashboard</h2>
            <p className="mt-1 text-sm text-slate-400">
              Command Center can start research loops only. Broker, go-trader, and readiness override gates stay locked.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="danger">Broker execution disabled</Badge>
            <Badge variant="warning">Go-Trader gate locked</Badge>
            <Badge variant="warning">Tradovate gate locked</Badge>
            {statusChips.map((chip) => (
              <StatusChip key={chip.label} label={chip.label} value={chip.value} tone={chip.tone} />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.9fr]">
        <div className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-4 shadow-[0_0_45px_rgba(8,145,178,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Chart</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-50">
                {runtimeSnapshot?.marketData.symbol ?? commandCenterSymbol} / {runtimeSnapshot?.marketData.timeframe ?? commandCenterTimeframe}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {runtimeSnapshot?.marketData.chartDisplayCandleCount.toLocaleString() ?? "0"} candles
                {runtimeSnapshot?.marketData.chartDisplayLastTimestamp ? ` / last ${formatDateTime(runtimeSnapshot.marketData.chartDisplayLastTimestamp)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={chartSourceBadgeTone} className="text-sm">
                {chartSourceShortLabel}
              </Badge>
              {runtimeSnapshot?.marketData.chartDisplayUsesTradingViewMcp ? (
                <>
                  <Badge variant="secondary">Read-only</Badge>
                  <Badge variant="warning">Not broker truth</Badge>
                </>
              ) : null}
              <Badge variant="danger">Execution disabled</Badge>
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/25">
            {commandCenterChart ? (
              <TradingChart key={commandCenterChart.source.sourceKey} {...commandCenterChart} heightClassName="h-[360px]" />
            ) : (
              <div className="flex h-[360px] items-center justify-center text-sm text-slate-500">
                Chart data is loading. Connect TradingView MCP or activate imported candles.
              </div>
            )}
          </div>
          {runtimeSnapshot?.marketData.chartDisplayWarning ? (
            <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
              {runtimeSnapshot.marketData.chartDisplayWarning}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Operate</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-50">Primary Actions</h3>
              </div>
              <Badge variant="danger">Authority none</Badge>
            </div>
            <div className="mt-4 grid gap-2">
              <Button onClick={() => void connectTradingViewChart()} disabled={tradingViewBusy} className="h-11 justify-start">
                <Zap className="h-4 w-4" aria-hidden="true" />
                {tradingViewBusy ? "Connecting..." : "Connect + Activate TradingView Chart"}
              </Button>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" onClick={() => void refreshTradingViewNow()} disabled={autoRefreshBusy}>
                  {autoRefreshBusy ? "Refreshing..." : "Refresh Candles"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void useExistingTradingViewForResearch()}
                  disabled={tradingViewBusy || runtimeSnapshot?.tradingViewMcp.researchEligibility !== "eligible_for_research_cycle"}
                  title={
                    runtimeSnapshot?.tradingViewMcp.researchEligibility === "eligible_for_research_cycle"
                      ? "TradingView MCP candles passed the research-source gate."
                      : runtimeSnapshot?.tradingViewMcp.eligibilityReasons[0] ?? "TradingView MCP is not eligible for research yet."
                  }
                >
                  Use TV for Research
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" onClick={() => void startTradingViewAutoRefresh()} disabled={autoRefreshBusy || autoRefreshRunning}>
                  {autoRefreshRunning ? "Auto-refresh Active" : "Start Auto-refresh"}
                </Button>
                <Button variant="outline" onClick={() => void stopTradingViewAutoRefresh()} disabled={!autoRefreshRunning && tradingViewAutoRefresh.status !== "failed" && tradingViewAutoRefresh.status !== "paused"}>
                  Stop Auto-refresh
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" onClick={() => void startLoop()} disabled={busy}>
                  <Activity className="h-4 w-4" aria-hidden="true" />
                  {busy ? "Research Running" : "Start Autonomous Research"}
                </Button>
                <Button variant="outline" onClick={stopLoop} disabled={!busy}>
                  Stop Research
                </Button>
              </div>
            </div>
            <div
              className={`mt-4 rounded-lg border p-3 text-sm ${
                tradingViewOperationMessage.toLowerCase().includes("failed") ||
                tradingViewOperationMessage.toLowerCase().includes("not running") ||
                tradingViewOperationMessage.toLowerCase().includes("unavailable")
                  ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
                  : runtimeSnapshot?.tradingViewMcp.chartFeedAvailable
                    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                    : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
              }`}
            >
              <p className="font-semibold">{tradingViewBusy || autoRefreshBusy ? "Working..." : "Feedback"}</p>
              <p className="mt-1">{tradingViewOperationMessage}</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-300">
                Refresh interval
                <Select
                  value={autoRefreshIntervalSeconds}
                  options={tradingViewAutoRefreshIntervalOptions}
                  onChange={(event) => {
                    setAutoRefreshIntervalSeconds(event.target.value);
                    persistAutoRefreshSettings(event.target.value, autoRefreshCandleLimit);
                  }}
                />
              </label>
              <label className="space-y-1 text-xs text-slate-300">
                Candle limit
                <Select
                  value={autoRefreshCandleLimit}
                  options={tradingViewAutoRefreshCandleOptions}
                  onChange={(event) => {
                    setAutoRefreshCandleLimit(event.target.value);
                    persistAutoRefreshSettings(autoRefreshIntervalSeconds, event.target.value);
                  }}
                />
              </label>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <MiniReadout label="Auto-refresh" value={formatToken(tradingViewAutoRefresh.status)} detail={autoRefreshRunning ? `next ${autoRefreshCountdown}` : "stopped"} />
              <MiniReadout label="Latest price" value={tradingViewAutoRefresh.lastPrice !== undefined ? String(tradingViewAutoRefresh.lastPrice) : "n/a"} detail={tradingViewAutoRefresh.lastCandleTimestamp ? formatDateTime(tradingViewAutoRefresh.lastCandleTimestamp) : "no candle yet"} />
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-slate-950/85 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Action Required</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-50">{primaryBlocker}</h3>
            <p className="mt-2 text-sm text-slate-400">{primaryBlockerDetail}</p>
            <div className="mt-4 space-y-2">
              {actionItems.length ? (
                actionItems.slice(0, 4).map((item) => (
                  <Link
                    key={item.id}
                    to={item.href ?? "/dashboard"}
                    className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 transition hover:border-amber-300/30"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                    </div>
                    <Badge variant={item.severity === "critical" ? "danger" : item.severity === "action_required" || item.severity === "warning" ? "warning" : "secondary"}>
                      {item.severity.replace(/_/g, " ")}
                    </Badge>
                  </Link>
                ))
              ) : (
                <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">
                  No action required. Keep supervising; execution remains disabled.
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-slate-950/85 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Market State</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-50">
                {runtimeSnapshot?.regime.label.replace(/_/g, " ") ?? "Classifying"}
              </h3>
            </div>
            <Badge variant={runtimeSnapshot?.regime.dataQuality === "sufficient" ? "success" : "warning"}>
              {runtimeSnapshot ? `${Math.round(runtimeSnapshot.regime.confidence * 100)}%` : "loading"}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MiniReadout
              label="Grinch / ICT"
              value={grinch ? `${grinch.profile.replace(/_/g, " ")} / ${grinch.state}` : "pending"}
              detail={grinch?.hardGateReason ? `blocked: ${grinch.hardGateReason.replace(/_/g, " ")}` : grinch?.detail ?? "Profile summary pending"}
            />
            <MiniReadout
              label="Volatility / chop"
              value={
                runtimeSnapshot
                  ? `${Math.round(runtimeSnapshot.regime.current.scores.volatility * 100)} vol / ${Math.round(runtimeSnapshot.regime.current.scores.chop * 100)} chop`
                  : "loading"
              }
              detail={runtimeSnapshot?.regime.supportingFactors[0] ?? "Regime factors pending"}
            />
            <MiniReadout
              label="Trend strength"
              value={runtimeSnapshot ? `${Math.round(runtimeSnapshot.regime.current.scores.trend_strength * 100)}%` : "loading"}
              detail={runtimeSnapshot?.regime.supportingFactors[1] ?? "Trend evidence pending"}
            />
            <MiniReadout
              label="Top blocker"
              value={runtimeSnapshot?.readiness.actualBlockers[0] ? "blocked" : "clear"}
              detail={runtimeSnapshot?.readiness.actualBlockers[0] ?? "No readiness blocker in current snapshot"}
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/85 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Research Status</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-50">
                {formatToken(runtimeSnapshot?.latestResearchCycle.latestCycleStatus)}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Loop progress: {latestRun?.progress?.activeStageLabel ?? formatToken(latestRun?.status)}
              </p>
            </div>
            <Badge variant={runtimeSnapshot?.walkForward.verdict === "robust_research" || runtimeSnapshot?.walkForward.verdict === "paper_demo_review_candidate" ? "success" : runtimeSnapshot?.walkForward.verdict ? "warning" : "secondary"}>
              WF {formatToken(runtimeSnapshot?.walkForward.verdict)}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniReadout label="Trades" value={String(latestBacktest?.totalTrades ?? 0)} detail={`Win ${pct(latestBacktest?.winRate)}`} />
            <MiniReadout label="Average R" value={latestBacktest ? latestBacktest.averageR.toFixed(2) : "n/a"} detail={`DD ${latestBacktest ? `${latestBacktest.maxDrawdown.toFixed(2)}R` : "n/a"}`} />
            <MiniReadout label="Profit factor" value={latestBacktest?.profitFactor !== null && latestBacktest?.profitFactor !== undefined ? latestBacktest.profitFactor.toFixed(2) : "n/a"} detail={runtimeSnapshot?.latestResearchCycle.latestCycleId ?? "No cycle"} />
            <MiniReadout label="Maturity" value={`${runtimeSnapshot?.maturity.maturityScore ?? 0}/100`} detail={runtimeSnapshot?.maturity.maturityGrade.replace(/_/g, " ") ?? "untested"} />
            <MiniReadout label="Evidence" value={`${runtimeSnapshot?.evidence.evidenceQualityScore ?? 0}/100`} detail={runtimeSnapshot?.evidence.weakestEvidenceCategories[0]?.replace(/_/g, " ") ?? "ledger pending"} />
            <MiniReadout label="Walk-forward" value={`${runtimeSnapshot?.walkForward.outOfSampleWindowsPassed ?? 0}/${runtimeSnapshot?.walkForward.windowsTested ?? 0}`} detail={runtimeSnapshot?.walkForward.recommendedNextAction ?? "pending"} />
          </div>
          {runtimeSnapshot?.readiness.actualBlockers.length ? (
            <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
              Insufficient evidence. More valid profile windows needed.
            </div>
          ) : null}
        </div>
      </section>

      <MissionControlDataFeed items={safeTopN(feedItems, 10)} />

      <TechnicalDetails
        title="Advanced details and drill-down controls"
        description="Open for the one-cycle research control, runtime diagnostics, source trace, and direct links to detail pages."
      >
        <div className="space-y-4">
          <WhyNotReadyCard context="command_center" snapshot={runtimeSnapshot} />
          <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Secondary controls</p>
                <h3 className="mt-1 text-base font-semibold text-slate-50">Loop Settings</h3>
                <p className="mt-1 text-sm text-slate-400">
                  These controls stay out of the default dashboard so the operating surface remains focused.
                </p>
              </div>
              <Badge variant={autoApplyPolicyEnabled ? "warning" : "secondary"}>
                {autoApplyPolicyEnabled ? "policy-gated auto-apply" : "proposal-only"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1 text-xs text-slate-300">
                Max iterations
                <Select
                  value={maxIterations}
                  options={[1, 2, 3, 4, 5].map((value) => ({ label: String(value), value: String(value) }))}
                  onChange={(event) => setMaxIterations(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs text-slate-300">
                No improvement stop
                <Select
                  value={noImprovementStop}
                  options={[1, 2, 3].map((value) => ({ label: `${value} cycle${value === 1 ? "" : "s"}`, value: String(value) }))}
                  onChange={(event) => setNoImprovementStop(event.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={autoApplyPolicyEnabled}
                  onChange={(event) => setAutoApplyPolicyEnabled(event.target.checked)}
                />
                Policy-gated auto-apply
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={advancedFullResearchMode}
                  onChange={(event) => setAdvancedFullResearchMode(event.target.checked)}
                />
                Advanced full research
              </label>
            </div>
          </section>
          <MissionControlPipeline stages={pipelineStages} />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Data source", runtimeSnapshot?.marketData.sourceLabel ?? "loading"],
            ["Active config", runtimeSnapshot?.activeConfig.configMergeStatusLabel ?? "loading"],
            ["Latest cycle", runtimeSnapshot?.latestResearchCycle.latestCycleId ?? "none"],
            [
              "TradingView evidence",
              runtimeSnapshot?.tradingViewMcp
                ? `${runtimeSnapshot.tradingViewMcp.bridgeStatus.replace(/_/g, " ")} / evidence ${runtimeSnapshot.tradingViewMcp.evidenceAvailable ? "yes" : "no"} / bias ${runtimeSnapshot.tradingViewMcp.chartBias} / confidence ${runtimeSnapshot.tradingViewMcp.confidence.toFixed(2)}`
                : "not checked"
            ],
            [
              "TradingView chart feed",
              runtimeSnapshot?.tradingViewMcp
                ? `${runtimeSnapshot.tradingViewMcp.chartFeedAvailable ? "active" : "not active"} / ${runtimeSnapshot.tradingViewMcp.chartFeedCandleCount} candles / ${runtimeSnapshot.tradingViewMcp.chartFeedMatchState.replace(/_/g, " ")} / ${runtimeSnapshot.tradingViewMcp.researchEligibility.replace(/_/g, " ")}`
                : "not checked"
            ],
            [
              "Proposal context",
              runtimeSnapshot?.proposal.latestProposalIsCurrent
                ? `current: ${runtimeSnapshot.proposal.latestProposalId}`
                : runtimeSnapshot?.proposal.latestProposalIsHistorical
                  ? `historical: ${runtimeSnapshot.proposal.latestProposalId}`
                  : "no current proposal"
            ],
            [
              "Active Grinch profile",
              runtimeSnapshot?.latestResearchCycle.activeGrinchProfileSummary
                ? `${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.profile.replace(/_/g, " ")} / ${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.state} / ${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.setupQuality ?? "research"} / fallback ${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.fallbackProfileUsed ?? "none"} / score ${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.grinchModelScore ?? "n/a"} / risk ${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.falsePositiveRisk ?? "n/a"}${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.primaryRuleBlock ? ` / ${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.primaryRuleBlock}` : ""}`
                : "not available"
            ],
            [
              "Grinch fallback counts",
              runtimeSnapshot?.latestResearchCycle.activeGrinchProfileSummary
                ? `expired ${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.expiredTimingBlocks ?? 0} / weak Model 1 ${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.weakProfileBlocks ?? 0} / reversal ${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.reversalCandidates ?? 0} / consolidation ${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.consolidationCandidates ?? 0} / no valid ${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.noValidProfileCount ?? 0} / trade profile ${runtimeSnapshot.latestResearchCycle.activeGrinchProfileSummary.tradeProducingProfile ?? "none"}`
                : "not available"
            ],
            [
              "SMT confirmation",
              runtimeSnapshot?.latestResearchCycle.smtSummary
                ? `${runtimeSnapshot.latestResearchCycle.smtSummary.smtState.replace(/_/g, " ")} / ${runtimeSnapshot.latestResearchCycle.smtSummary.primaryPair} / supports profile ${String(runtimeSnapshot.latestResearchCycle.smtSummary.supportsActiveProfile)}`
                : "not available"
            ]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
              <p className="mt-1 break-words font-mono text-xs text-slate-100">{value}</p>
            </div>
          ))}
        </div>
        {runtimeSnapshot?.proposal.latestProposalIsHistorical && runtimeSnapshot.proposal.latestProposal ? (
          <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold">Historical proposal</p>
                <p className="mt-1 text-amber-100/80">
                  This proposal is from a previous cycle, so it is not shown as primary action required.
                </p>
                <p className="mt-1 break-words font-mono text-xs text-amber-100/70">
                  {runtimeSnapshot.proposal.proposalSourceMismatchReason ?? runtimeSnapshot.proposal.latestProposal.proposalId}
                </p>
              </div>
              <Link to={`/self-improvement?proposalId=${encodeURIComponent(runtimeSnapshot.proposal.latestProposal.proposalId)}`}>
                <Button variant="secondary" className="w-full sm:w-auto">
                  Open historical proposal
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Button>
              </Link>
            </div>
          </div>
        ) : null}
        {warnings.length ? (
          <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            <p className="font-semibold">Runtime warnings</p>
            <ul className="mt-2 space-y-1">
              {safeTopN(warnings, 6).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-semibold">Paperclip Agent Operations</p>
              <p className="mt-1 text-cyan-100/80">
                Planned external control plane for research tasks, agent governance, work products, heartbeats, and budgets.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="warning">{paperclipAgentOperationsPolicy.statusLabel}</Badge>
              <Badge variant="secondary">{paperclipAgentOperationsPolicy.authorityLabel}</Badge>
              <Badge variant="danger">execution {paperclipAgentOperationsPolicy.authorityBlock.executionAuthority}</Badge>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-cyan-100/15 bg-cyan-100/5 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/70">Allowed later</p>
              <ul className="mt-2 space-y-1 text-xs">
                {safeTopN(paperclipAgentOperationsPolicy.allowedFutureUses, 4).map((use) => (
                  <li key={use.id}>{use.label}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-red-200/20 bg-red-200/10 p-3 text-red-100">
              <p className="text-xs uppercase tracking-[0.16em] text-red-100/70">Never allowed</p>
              <ul className="mt-2 space-y-1 text-xs">
                {safeTopN(paperclipAgentOperationsPolicy.forbiddenUses, 4).map((use) => (
                  <li key={use.id}>{use.label}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/55 p-3 text-sm text-slate-200">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-semibold">Future multi-broker gates</p>
              <p className="mt-1 text-slate-400">
                TradingView MCP is read-only chart evidence when connected. Tradovate and MT5 remain locked execution adapters.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={runtimeSnapshot?.tradingViewMcp.bridgeStatus === "connected_analysis_only" ? "success" : "secondary"}>
                TradingView {runtimeSnapshot?.tradingViewMcp.bridgeStatus.replace(/_/g, " ") ?? tradingViewMcpAdapterPlan.status.replace(/_/g, " ")}
              </Badge>
              <Badge variant={runtimeSnapshot?.tradingViewMcp.chartFeedAvailable ? "success" : "secondary"}>
                TV chart feed {runtimeSnapshot?.tradingViewMcp.chartFeedAvailable ? "active" : "not active"}
              </Badge>
              <Badge variant="warning">Tradovate {tradovateExecutionAdapterPlan.status.replace(/_/g, " ")}</Badge>
              <Badge variant="warning">MT5 {mt5ExecutionAdapterPlan.status.replace(/_/g, " ")}</Badge>
              <Badge variant="danger">execution disabled</Badge>
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Market Data", "/market-data"],
            ["Agent Debate", "/agent-debate"],
            ["Walk-Forward", "/walk-forward"],
            ["Self-Improvement", "/self-improvement"],
            ["Readiness Gate", "/readiness-gate"],
            ["Autonomous Loop", "/autonomous-research"],
            ["Performance", "/performance"],
            ["Simulation Runbook", "/simulation-runbook"]
          ].map(([label, href]) => (
            <Link key={href} to={href}>
              <Button variant="secondary" className="w-full justify-between">
                {label}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          ))}
        </div>
        <div className="mt-4">
          <ResearchCycleControl state={state} />
        </div>
        {runtimeSnapshot ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/55 p-3 text-xs text-slate-400">
            <div className="mb-2 flex items-center gap-2 text-slate-200">
              <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              Runtime provenance
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {selectRuntimeProvenanceRows(runtimeSnapshot).map((row) => (
                <div key={row.label} className="flex justify-between gap-3 border-b border-white/5 py-1">
                  <span>{row.label}</span>
                  <span className="text-right font-mono text-slate-200">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3">Source trace: {runtimeSnapshot.diagnostics.sourceTrace.join(" + ")}</div>
          </div>
        ) : null}
      </TechnicalDetails>
    </div>
  );
}

function createStartingAutonomyRun(settings: AutonomousResearchSettings): AutonomousResearchRun {
  const startedAt = new Date().toISOString();
  return {
    runId: uid("autonomous_research_starting"),
    startedAt,
    status: "running",
    settings,
    currentIteration: 0,
    progress: {
      status: "running",
      activeStage: "resolving_runtime",
      activeStageLabel: "Resolving runtime",
      currentIteration: 0,
      maxIterations: settings.maxIterations,
      progressPercent: 10,
      startedAt,
      updatedAt: startedAt,
      currentTask: "Starting autonomous research loop...",
      events: [
        {
          eventId: uid("autonomy_event"),
          timestamp: startedAt,
          stage: "resolving_runtime",
          title: "Loop start requested",
          detail: "Starting autonomous research loop from Mission Control."
        }
      ]
    },
    iterations: [],
    readinessTrend: "unknown",
    maturityTrend: "unknown",
    goTraderHandoffGate: {
      eligibleForReview: false,
      reasons: ["Loop is starting. Go-trader review remains locked."],
      brokerExecutionDisabled: true
    },
    calibrationDriftHistory: [],
    openClawHooks: createPlannedOpenClawMemoryHookState(),
    hermesNotifications: createPlannedHermesNotificationState(),
    safetyNotice: "Autonomous research is simulation-only. It cannot execute trades, approve Paper-Demo Candidate, send go-trader handoffs, or override readiness."
  };
}

function buildPipelineStages(
  snapshot?: ResearchRuntimeSnapshot,
  run?: AutonomousResearchRun,
  busy?: boolean,
  iterationStartedAt?: string
): MissionPipelineStage[] {
  const latestCycle = snapshot?.latestResearchCycle.latestRun;
  const running = busy || run?.status === "running";
  const currentIteration = run?.iterations.find((iteration) => iteration.iteration === run.currentIteration);
  const activeStage = run?.progress?.activeStage;
  const activeMarketData = running && activeStage === "resolving_runtime";
  const activeAiResearch = running && (activeStage === "thesis_generation" || activeStage === "auto_research");
  const activeDebate = running && activeStage === "llm_advisory";
  const activeValidation = running && activeStage === "backtest";
  const activeWalkForward = running && activeStage === "walk_forward";
  const activeSelfImprovement = running && activeStage === "self_improvement";
  const activeReadiness = running && (activeStage === "readiness_maturity" || activeStage === "audit_communications");
  const walkForwardVerdict = snapshot?.walkForward.verdict;
  const latestProposal = snapshot?.proposal.latestProposal;
  const currentProposal = snapshot?.proposal.latestProposalIsCurrent ? latestProposal : undefined;
  const historicalProposal = snapshot?.proposal.latestProposalIsHistorical ? latestProposal : undefined;

  return [
    {
      id: "market-data",
      label: "Lab / Market Data",
      href: "/market-data",
      status: activeMarketData ? "active" : snapshot?.marketData.processedCandleCount ? "complete" : "warning",
      task: snapshot
        ? `${snapshot.marketData.sourceLabel}; ${snapshot.marketData.processedCandleCount.toLocaleString()} processed candles.`
        : "Preparing runtime data source.",
      countLabel: snapshot?.marketData.dataPreset,
      lastEvent: snapshot?.generatedAt ? formatDateTime(snapshot.generatedAt) : undefined
    },
    {
      id: "ai-research",
      label: "AI Research",
      href: "/research",
      status: activeAiResearch ? "active" : latestCycle ? "complete" : "waiting",
      task: activeAiResearch
        ? run?.progress?.currentTask ?? "Diagnosing blockers and running scenario search."
        : latestCycle?.resultSummary ?? "Waiting for the first research cycle.",
      countLabel: run ? `${run.currentIteration}/${run.settings.maxIterations}` : undefined,
      lastEvent: latestCycle?.completedAt ?? latestCycle?.startedAt ?? iterationStartedAt
    },
    {
      id: "agent-debate",
      label: "Agent Debate / CIO",
      href: "/agent-debate",
      status: activeDebate ? "active" : latestCycle?.agentDebateConsensus ? "complete" : latestCycle ? "warning" : "waiting",
      task: activeDebate
        ? run?.progress?.currentTask ?? "Running LLM advisory and CIO interpretation."
        : latestCycle?.agentDebateConsensus
        ? `CIO consensus ${latestCycle.agentDebateConsensus.position}; facts remain immutable.`
        : "Debate summary appears after a cycle produces agent context.",
      lastEvent: latestCycle?.completedAt
    },
    {
      id: "validation",
      label: "Backtest / Validation",
      href: "/validation",
      status: activeValidation
        ? "active"
        : snapshot?.latestResearchCycle.latestValidationSummary
        ? "complete"
        : latestCycle?.backtestSummary
          ? "warning"
          : "waiting",
      task: activeValidation
        ? run?.progress?.currentTask ?? "Running backtest and validation."
        : snapshot?.latestResearchCycle.latestValidationSummary
        ? `Trades ${snapshot.latestResearchCycle.latestBacktestSummary?.totalTrades ?? 0}; validation ready.`
        : "Backtest and validation evidence not complete yet.",
      countLabel: latestCycle?.backtestSummary ? `${latestCycle.backtestSummary.totalTrades} trades` : undefined,
      lastEvent: latestCycle?.completedAt
    },
    {
      id: "walk-forward",
      label: "Walk-Forward",
      href: "/walk-forward",
      status: activeWalkForward
        ? "active"
        : walkForwardVerdict === "fail"
          ? "blocked"
          : walkForwardVerdict === "insufficient_evidence"
            ? "warning"
            : walkForwardVerdict
              ? "complete"
              : "waiting",
      task: snapshot?.walkForward.recommendedNextAction ?? "Run imported-data walk-forward before trusting a calibration.",
      countLabel: snapshot?.walkForward.windowsTested ? `${snapshot.walkForward.windowsTested} windows` : undefined,
      lastEvent: snapshot?.walkForward.latestTimestamp
    },
    {
      id: "self-improvement",
      label: "Self-Improvement",
      href: "/self-improvement",
      status: activeSelfImprovement
        ? "active"
        : currentProposal?.status === "proposed" || currentProposal?.status === "testing"
          ? "blocked"
          : currentProposal
            ? "complete"
            : historicalProposal
              ? "warning"
            : "waiting",
      task: currentProposal
        ? `Current proposal ${currentProposal.status}; approval or policy decision required.`
        : historicalProposal
          ? "Historical proposal available in Self-Improvement. No new proposal from latest cycle."
          : latestCycle?.createdProposalId
            ? "Latest cycle proposal is being indexed."
            : "No new proposal from latest cycle.",
      countLabel: (currentProposal ?? historicalProposal)?.proposalIntent?.replace(/_/g, " "),
      lastEvent: (currentProposal ?? historicalProposal)?.timestamp
    },
    {
      id: "go-trader",
      label: "Go-Trader Review Gate",
      href: "/simulation-runbook",
      status: "locked",
      task: run?.goTraderHandoffGate.eligibleForReview
        ? "Review eligibility only. Handoff remains locked until human process."
        : activeReadiness
          ? run?.progress?.currentTask ?? "Updating readiness, maturity, and audit state."
        : "Locked. Simulation runbook and readiness must pass first.",
      countLabel: "review only",
      lastEvent: run?.completedAt
    },
    {
      id: "tradovate",
      label: "Tradovate Future Gate",
      status: "locked",
      task: "Future integration placeholder. No broker connection or API authority exists.",
      countLabel: "future"
    }
  ];
}

function buildActionItems(snapshot?: ResearchRuntimeSnapshot, run?: AutonomousResearchRun): MissionActionItem[] {
  const items: MissionActionItem[] = [];

  if (!snapshot) {
    return [
      {
        id: "snapshot-loading",
        title: "Runtime snapshot loading",
        detail: "The command center is resolving the current data source and state.",
        severity: "info"
      }
    ];
  }
  if (!snapshot.marketData.isImportedDataActive) {
    items.push({
      id: "imported-data",
      title: "Imported data unavailable",
      detail: `Not valid for imported MNQ comparison. ${snapshot.marketData.importedDataMessage}`,
      href: "/market-data",
      severity: "warning"
    });
  }
  if (snapshot.tradingViewMcp.bridgeStatus !== "connected_analysis_only") {
    items.push({
      id: "tradingview-disconnected",
      title: "TradingView MCP disconnected",
      detail: "Start the local wrapper, then use Connect + Activate TradingView Chart from Command Center.",
      severity: "action_required"
    });
  } else if (!snapshot.tradingViewMcp.chartFeedAvailable) {
    items.push({
      id: "tradingview-no-candles",
      title: "Chart feed inactive",
      detail: "Fetch TradingView MCP candles before using the chart feed.",
      severity: "action_required"
    });
  }
  if (
    snapshot.tradingViewMcp.chartFeedAvailable &&
    snapshot.tradingViewMcp.researchEligibility !== "eligible_for_research_cycle"
  ) {
    items.push({
      id: "tradingview-research-guarded",
      title: "Research source not eligible",
      detail: snapshot.tradingViewMcp.eligibilityReasons[0] ?? "TradingView MCP is visual-only until source gates pass.",
      href: "/market-data",
      severity: "warning"
    });
  }
  if (snapshot.walkForward.verdict === "insufficient_evidence") {
    items.push({
      id: "walk-forward-insufficient",
      title: "Walk-forward insufficient",
      detail: snapshot.walkForward.recommendedNextAction ?? "Run or extend walk-forward validation before trusting a calibration.",
      href: "/walk-forward",
      severity: "warning"
    });
  }
  if (snapshot.evidence.evidenceQualityScore < 50) {
    items.push({
      id: "evidence-quality-weak",
      title: "Evidence quality weak",
      detail: snapshot.evidence.weakestEvidenceCategories[0]?.replace(/_/g, " ") ?? "Open Evidence Quality for the current blocker.",
      href: "/evidence-quality",
      severity: "warning"
    });
  }
  if (!snapshot.llm.advisoryPassed) {
    items.push({
      id: "llm-advisory-missing",
      title: "LLM advisory missing",
      detail: snapshot.llm.readinessImpact,
      href: "/llm-agents",
      severity: "info"
    });
  }
  items.push(...snapshot.proposal.currentActionItems);
  if (run?.status === "paused" && run.stopReason === "regime_mismatch_detected") {
    items.unshift({
      id: "regime-mismatch",
      title: "Regime mismatch paused loop",
      detail: run.stopReasonDetail ?? "Human review required before additional calibration search.",
      href: "/autonomous-research",
      severity: "critical"
    });
  }

  return safeTopN(items, 6);
}

function buildFeedItems(
  snapshot?: ResearchRuntimeSnapshot,
  run?: AutonomousResearchRun,
  dataConnectionEvents: CommandCenterDataEvent[] = []
): MissionFeedItem[] {
  const now = snapshot?.generatedAt ?? new Date().toISOString();
  const runtimeItems: MissionFeedItem[] = snapshot
    ? [
        {
          id: "runtime-tv-status",
          title: `TradingView MCP ${snapshot.tradingViewMcp.bridgeStatus.replace(/_/g, " ")}`,
          detail: snapshot.tradingViewMcp.chartFeedAvailable
            ? `${snapshot.tradingViewMcp.chartFeedCandleCount.toLocaleString()} read-only candles available for chart display.`
            : "TradingView MCP chart feed is not active.",
          timestamp: snapshot.generatedAt,
          severity: snapshot.tradingViewMcp.bridgeStatus === "connected_analysis_only" ? "success" : "warning",
          sourceFingerprint: snapshot.tradingViewMcp.chartFeedSymbol ?? snapshot.tradingViewMcp.bridgeUrl
        },
        {
          id: "runtime-chart-source",
          title: "Chart source status",
          detail: `${snapshot.marketData.activeChartDisplaySourceLabel}. Research source: ${snapshot.marketData.activeResearchSourceLabel}.`,
          timestamp: snapshot.generatedAt,
          severity: snapshot.marketData.chartDisplayUsesTradingViewMcp ? "success" : "info",
          sourceFingerprint: snapshot.marketData.chartDisplayDataFingerprint.slice(0, 96)
        },
        {
          id: "runtime-research-eligibility",
          title:
            snapshot.tradingViewMcp.researchEligibility === "eligible_for_research_cycle"
              ? "Research eligibility passed"
              : "Research eligibility guarded",
          detail: snapshot.tradingViewMcp.eligibilityReasons[0] ?? "TradingView MCP source gate is pending.",
          timestamp: snapshot.generatedAt,
          severity: snapshot.tradingViewMcp.researchEligibility === "eligible_for_research_cycle" ? "success" : "warning",
          sourceFingerprint: snapshot.tradingViewMcp.researchEligibility
        },
        {
          id: "runtime-cycle-status",
          title: "AI research cycle status",
          detail: snapshot.latestResearchCycle.latestCycleId
            ? `${formatToken(snapshot.latestResearchCycle.latestCycleStatus)}: ${snapshot.latestResearchCycle.latestCycleId}`
            : "No AI research cycle has completed in the current runtime.",
          timestamp: snapshot.latestResearchCycle.latestRun?.completedAt ?? snapshot.latestResearchCycle.latestRun?.startedAt ?? snapshot.generatedAt,
          severity: snapshot.latestResearchCycle.latestCycleId ? "success" : "info",
          sourceFingerprint: snapshot.latestResearchCycle.activeGrinchProfileSummary
            ? `Grinch ${snapshot.latestResearchCycle.activeGrinchProfileSummary.profile} / ${snapshot.latestResearchCycle.activeGrinchProfileSummary.setupQuality ?? "research"}`
            : undefined
        },
        {
          id: "runtime-backtest",
          title: "Backtest status",
          detail: snapshot.latestResearchCycle.latestBacktestSummary
            ? `${snapshot.latestResearchCycle.latestBacktestSummary.totalTrades} trades; win rate ${pct(snapshot.latestResearchCycle.latestBacktestSummary.winRate)}.`
            : "Backtest output pending.",
          timestamp: snapshot.latestResearchCycle.latestRun?.completedAt ?? snapshot.generatedAt,
          severity: snapshot.latestResearchCycle.latestBacktestSummary ? "success" : "info"
        },
        {
          id: "runtime-walk-forward",
          title: `Walk-forward ${formatToken(snapshot.walkForward.verdict)}`,
          detail: snapshot.walkForward.recommendedNextAction ?? "Walk-forward validation pending.",
          timestamp: snapshot.walkForward.latestTimestamp ?? snapshot.generatedAt,
          severity:
            snapshot.walkForward.verdict === "fail"
              ? "failed"
              : snapshot.walkForward.verdict === "insufficient_evidence"
                ? "warning"
                : snapshot.walkForward.verdict
                  ? "success"
                  : "info",
          sourceFingerprint: `${snapshot.walkForward.outOfSampleWindowsPassed}/${snapshot.walkForward.windowsTested} OOS windows`
        },
        {
          id: "runtime-readiness",
          title: `Readiness ${snapshot.readiness.readinessState.replace(/_/g, " ")}`,
          detail: snapshot.readiness.actualBlockers[0] ?? "No readiness blocker in the current snapshot.",
          timestamp: snapshot.generatedAt,
          severity: snapshot.readiness.readinessState === "Research Ready" || snapshot.readiness.readinessState === "Paper-Demo Candidate" ? "success" : "warning"
        },
        {
          id: "runtime-proposal",
          title: snapshot.proposal.latestProposalIsCurrent ? "Proposal created" : "Proposal blocked or historical",
          detail: snapshot.proposal.latestProposalIsCurrent
            ? `Current proposal ${snapshot.proposal.latestProposalId}.`
            : snapshot.proposal.latestProposalIsHistorical
              ? "Historical proposal is available but not a primary action."
              : "No current proposal from latest cycle.",
          timestamp: snapshot.proposal.latestProposal?.timestamp ?? snapshot.generatedAt,
          severity: snapshot.proposal.latestProposalIsCurrent ? "action_required" : "info",
          href: snapshot.proposal.latestProposal?.proposalId ? `/self-improvement?proposalId=${snapshot.proposal.latestProposal.proposalId}` : undefined
        },
        {
          id: "runtime-broker-lock",
          title: "Broker execution locked",
          detail: "Tradovate, MT5, go-trader handoff, live trading, and readiness overrides remain disabled.",
          timestamp: now,
          severity: "locked",
          sourceFingerprint: "executionAuthority=none"
        }
      ]
    : [];
  const communicationItems: MissionFeedItem[] = safeTopN(
    loadCommunicationMessages().filter((message) => {
      if (message.category !== "self_improvement_proposal_alert") {
        return true;
      }
      return Boolean(run?.iterations.some((iteration) => iteration.proposalId && iteration.proposalId === message.relatedProposalId));
    }),
    8
  ).map((message) => ({
    id: message.messageId,
    title: message.title,
    detail: message.summary,
    timestamp: message.timestamp,
    severity: message.severity,
    href: "/communications"
  }));
  const progressItems: MissionFeedItem[] = safeTopN(run?.progress?.events, 10).map((event) => ({
    id: event.eventId,
    title: event.title,
    detail: event.detail,
    timestamp: event.timestamp,
      severity:
      event.stage === "failed"
        ? "critical"
        : event.stage === "canceled" || event.stage === "paused"
          ? "warning"
          : event.stage === "completed"
            ? "success"
            : "running",
    href: "/autonomous-research"
  }));
  const loopItems: MissionFeedItem[] = safeArray(run?.iterations).flatMap((iteration) => [
    {
      id: `iteration-${iteration.iteration}-scenario`,
      title: `Iteration ${iteration.iteration}: ${formatToken(iteration.selectedScenarioFamily)}`,
      detail: iteration.scenarioReason ?? "Scenario family selected by blocker diagnosis.",
      timestamp: iteration.startedAt,
      severity: "info" as const,
      href: "/autonomous-research"
    },
    {
      id: `iteration-${iteration.iteration}-result`,
      title: iteration.autoApplyEligibility?.applied ? "Calibration auto-applied" : "Calibration blocked or pending",
      detail: iteration.autoApplyEligibility?.reasons[0] ?? iteration.notes[0] ?? "Iteration result pending.",
      timestamp: iteration.completedAt ?? iteration.startedAt,
      severity: iteration.autoApplyEligibility?.applied ? "info" as const : "warning" as const,
      href: iteration.proposalId ? `/self-improvement?proposalId=${iteration.proposalId}` : "/autonomous-research"
    }
  ]);

  const dataItems: MissionFeedItem[] = dataConnectionEvents.map((event) => ({
    ...event
  }));

  return safeTopN([...dataItems, ...progressItems, ...loopItems, ...communicationItems, ...runtimeItems].sort((a, b) => {
    const left = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const right = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return right - left;
  }), 18);
}

function getChartSourceShortLabel(snapshot?: ResearchRuntimeSnapshot) {
  if (!snapshot) return "loading";
  if (snapshot.marketData.chartDisplayUsesTradingViewMcp) return "TradingView MCP";
  if (snapshot.marketData.activeChartDisplaySourceLabel.toLowerCase().includes("import")) return "Imported";
  if (snapshot.marketData.activeChartDisplaySourceLabel.toLowerCase().includes("mock")) return "Mock";
  return snapshot.marketData.activeChartDisplaySourceLabel;
}

function getResearchSourceShortLabel(snapshot?: ResearchRuntimeSnapshot) {
  if (!snapshot) return "loading";
  if (snapshot.marketData.researchUsesTradingViewMcp) return "TradingView MCP";
  if (snapshot.marketData.activeResearchSourceLabel.toLowerCase().includes("import")) return "Imported";
  if (snapshot.marketData.activeResearchSourceLabel.toLowerCase().includes("mock")) return "Mock";
  return snapshot.marketData.activeResearchSourceLabel;
}

function StatusChip({
  label,
  tone,
  value
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "secondary";
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2">
      <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <Badge variant={tone} className="capitalize">
        {value}
      </Badge>
    </div>
  );
}

function MiniReadout({
  detail,
  label,
  value
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 truncate font-mono text-sm text-slate-100">{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}
