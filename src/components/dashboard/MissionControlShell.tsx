import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity, ExternalLink, Lock, RadioTower, ShieldCheck, Zap } from "lucide-react";

import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import {
  TradingChart,
  TRADING_CHART_PERFORMANCE_EVENT,
  type TradingChartPerformanceEvent
} from "@/components/charts/TradingChart";
import { WhyNotReadyCard } from "@/components/common/WhyNotReadyCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  latestAutoResearchCycle,
  loadAutoResearchState
} from "@/lib/autoResearch";
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
import {
  checkMt5ReadOnlyStatus,
  clearMt5ReadOnlyCandleFeedCache,
  fetchAndStoreMt5ReadOnlyCandleFeed,
  fetchMt5ReadOnlyQuote,
  fetchMt5ReadOnlySymbols,
  hydrateActiveMt5ReadOnlyCandleFeed,
  loadActiveMt5ReadOnlyCandleFeed,
  loadMt5ReadOnlyAutoRefreshState,
  loadMt5ReadOnlySettings,
  mt5ReadOnlyAutoRefreshCandleLimitOptions,
  mt5ReadOnlyAutoRefreshIntervalOptions,
  MT5_READ_ONLY_AUTO_REFRESH_UPDATED_EVENT,
  MT5_READ_ONLY_UPDATED_EVENT,
  refreshMt5ReadOnlyNow,
  saveMt5ReadOnlySettings,
  saveMt5ReadOnlyAutoRefreshSettings,
  startMt5ReadOnlyAutoRefresh,
  stopMt5ReadOnlyAutoRefresh,
  updateActiveMt5ReadOnlyCandleFeedMetadata,
  type Mt5ReadOnlyAutoRefreshState
} from "@/lib/integrations/mt5";
import { mt5ExecutionAdapterPlan } from "@/lib/brokers/mt5";
import { tradovateExecutionAdapterPlan } from "@/lib/brokers/tradovate";
import {
  buildVwapOverlay,
  createTradingChartData,
  horizontalOverlay,
  toChartTime,
  type TradingChartLineOverlay,
  type TradingChartMarker
} from "@/lib/charting";
import {
  buildBenchmarkDisplayRows,
  buildExpandedResearchMetricRows,
  buildLayerContributionRows,
  buildProposalImpactRows,
  buildRiskReportRows,
  buildSourceContextRows,
  formatNullableNumber,
  formatPercentMetric,
  formatR
} from "@/lib/researchMetrics";
import { buildResearchCommitteeReport } from "@/lib/researchCommittee";
import { buildGrinchProfileEvidenceDiagnostics } from "@/lib/strategyLibrary";
import { RESEARCH_CYCLE_UPDATED_EVENT } from "@/lib/researchCycle";
import {
  buildGrinchCalibrationProposalIntentDetails,
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
import { LLMAdvisoryReviewPanel } from "./LLMAdvisoryReviewPanel";
import type { MissionActionItem } from "./MissionControlActionPanel";
import { MissionControlDataFeed, type MissionFeedItem } from "./MissionControlDataFeed";
import { MissionControlPipeline, type MissionPipelineStage } from "./MissionControlPipeline";
import { ResearchCycleControl } from "./ResearchCycleControl";

const pct = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : "n/a";

const formatToken = (value?: string) => (value ?? "idle").replace(/_/g, " ");
const executableStatusVariant = (status?: string) =>
  status === "executable" ? "success" : status === "diagnostic_only" ? "secondary" : "warning";
const replayReviewVariant = (status?: string) =>
  status === "supportive"
    ? "success"
    : status === "rejected_for_current_window"
      ? "danger"
      : status === "evidence_not_supportive"
        ? "warning"
        : "secondary";
const formatBool = (value?: boolean) => (typeof value === "boolean" ? (value ? "yes" : "no") : "unknown");
const tradingViewAutoRefreshIntervalOptions = tradingViewMcpAutoRefreshIntervalOptions.map((value) => ({
  label: `${value}s`,
  value: String(value)
}));
const tradingViewAutoRefreshCandleOptions = tradingViewMcpAutoRefreshCandleLimitOptions.map((value) => ({
  label: `${value.toLocaleString()} candles`,
  value: String(value)
}));
const mt5AutoRefreshIntervalOptions = mt5ReadOnlyAutoRefreshIntervalOptions.map((value) => ({
  label: value === "manual" ? "Manual" : `${value}s`,
  value: String(value)
}));
const mt5AutoRefreshCandleOptions = mt5ReadOnlyAutoRefreshCandleLimitOptions.map((value) => ({
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

const canonicalMt5SourceFrom = (snapshot?: ResearchRuntimeSnapshot) =>
  snapshot?.marketData.allAvailableSources.find((source) => source.provider === "mt5_read_only" && source.candleCount > 0);
const isTradingChartLineOverlay = (overlay: TradingChartLineOverlay | undefined): overlay is TradingChartLineOverlay => Boolean(overlay);

const mt5ResearchEligibleFrom = (snapshot?: ResearchRuntimeSnapshot) => {
  const canonicalMt5Source = canonicalMt5SourceFrom(snapshot);
  return (
    snapshot?.mt5ReadOnly.researchEligibility === "eligible_for_research_cycle" ||
    Boolean(canonicalMt5Source?.eligibility.researchCycle)
  );
};

const mt5ResearchEligibilityReasonFrom = (snapshot?: ResearchRuntimeSnapshot) => {
  const canonicalMt5Source = canonicalMt5SourceFrom(snapshot);
  return (
    snapshot?.mt5ReadOnly.eligibilityReasons[0] ??
    canonicalMt5Source?.eligibilityReasons[0] ??
    "MT5 read-only is not eligible for research yet."
  );
};

type CommandCenterDataEvent = {
  detail: string;
  id: string;
  severity: MissionFeedItem["severity"];
  sourceFingerprint?: string;
  timestamp: string;
  title: string;
};

type Mt5DashboardActivationMode = "chart_only" | "research_source" | "research_mode";
type Mt5ActivationStepStatus = "pending" | "running" | "success" | "warning" | "failed";
type Mt5ActivationStep = {
  detail: string;
  id: string;
  sourceFingerprint?: string;
  status: Mt5ActivationStepStatus;
  step: string;
  timestamp: string;
};

type DashboardPerformanceMark = {
  detail?: string;
  durationMs: number;
  phase: string;
  timestamp: string;
};

class DashboardChartErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { error?: string }
> {
  state: { error?: string } = {};

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error.message : "Unknown chart render error."
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Dashboard chart render failed", error, info.componentStack);
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: undefined });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-[360px] items-center justify-center px-4 text-center text-sm text-amber-100">
          Chart render failed. Source remains available. {this.state.error}
        </div>
      );
    }

    return this.props.children;
  }
}

const buildCommandCenterChartData = (
  snapshot?: ResearchRuntimeSnapshot,
  { includeGrinchReplay = false }: { includeGrinchReplay?: boolean } = {}
) => {
  const tradingViewFeed = loadActiveTradingViewMcpChartFeed();
  const mt5Feed = loadActiveMt5ReadOnlyCandleFeed();
  const displaySource = snapshot ? resolveChartDisplayCandleSource(snapshot.marketData.preparedSource, tradingViewFeed, mt5Feed) : undefined;
  const candles = displaySource?.activeChartDisplayCandleSource.slice(-160) ?? [];
  if (!snapshot || !displaySource || !candles.length) {
    return undefined;
  }
  const vwap = buildVwapOverlay(candles);
  let openingOverlays: TradingChartLineOverlay[] = [];
  let replayMarkers: TradingChartMarker[] = [];
  if (includeGrinchReplay) {
    const researchCandles = displaySource.activeResearchCandleSource.length ? displaySource.activeResearchCandleSource : candles;
    const grinchProfileDiagnostics = buildGrinchProfileEvidenceDiagnostics({
      candles: researchCandles,
      phase1: snapshot.latestResearchCycle.grinchPhase1Summary,
      reversal: snapshot.latestResearchCycle.grinchPhase2ReversalSummary,
      consolidation: snapshot.latestResearchCycle.grinchPhase3ConsolidationSummary,
      score: snapshot.latestResearchCycle.grinchStrategyScore ?? snapshot.latestResearchCycle.latestBacktestSummary?.grinchSummary?.latestScore,
      profileCandidateCounts: snapshot.latestResearchCycle.latestBacktestSummary?.grinchSummary?.profileCandidateCounts,
      noValidProfileCount: snapshot.latestResearchCycle.latestBacktestSummary?.grinchSummary?.noValidProfileSignals,
      regimeLabel: snapshot.regime.label,
      regimeDataQuality: snapshot.regime.dataQuality,
      sessionTimeMapping: snapshot.latestResearchCycle.grinchPhase1Summary?.sessionTimeMapping
    });
    const replayDiagnostics = grinchProfileDiagnostics.expansionReplayDiagnostics;
    openingOverlays = [
      horizontalOverlay(candles, replayDiagnostics.twelveAmOpen.price, "dashboard-grinch-12am-open", "12AM Open", "#38bdf8", "liquidity_level", {
        lineWidth: 2
      }),
      horizontalOverlay(candles, replayDiagnostics.sundayOpen.price, "dashboard-grinch-sunday-open", "Sunday Open", "#a78bfa", "liquidity_level", {
        lineWidth: 2
      })
    ].filter(isTradingChartLineOverlay);
    replayMarkers = replayDiagnostics.overlayMarkers.map((marker) => ({
      direction: marker.direction,
      id: marker.id,
      label: marker.label,
      price: marker.price,
      time: toChartTime(marker.rawTimestamp),
      type: marker.markerType
    }));
  }
  return {
    ...createTradingChartData({
      candles,
      sourceLabel: displaySource.activeChartDisplaySourceLabel,
      sourceType: displaySource.activeChartDisplaySourceMode,
      symbol: displaySource.chartDisplayUsesMt5ReadOnly
        ? mt5Feed?.brokerSymbol ?? snapshot.marketData.symbol
        : displaySource.chartDisplayUsesTradingViewMcp
          ? tradingViewFeed?.providerSymbol ?? snapshot.marketData.symbol
          : snapshot.marketData.symbol,
      timeframe: displaySource.chartDisplayUsesMt5ReadOnly
        ? mt5Feed?.timeframe ?? snapshot.marketData.timeframe
        : displaySource.chartDisplayUsesTradingViewMcp
          ? tradingViewFeed?.timeframe ?? snapshot.marketData.timeframe
          : snapshot.marketData.timeframe
    }),
    lineOverlays: [vwap, ...openingOverlays].filter(isTradingChartLineOverlay),
    markers: replayMarkers,
    stateLabel: `${formatToken(snapshot.latestResearchCycle.latestCycleStatus)} / broker disabled`
  };
};

export function MissionControlShell({ state }: { state: LabState }) {
  const dashboardRenderCount = useRef(0);
  dashboardRenderCount.current += 1;
  const [autonomyState, setAutonomyState] = useState<AutonomousResearchState>(() => loadAutonomousResearchState());
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();
  const [liveRun, setLiveRun] = useState<AutonomousResearchRun>();
  const [busy, setBusy] = useState(false);
  const [stoppingAutonomy, setStoppingAutonomy] = useState(false);
  const [abortController, setAbortController] = useState<AbortController>();
  const [maxIterations, setMaxIterations] = useState("1");
  const [noImprovementStop, setNoImprovementStop] = useState("1");
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
  const [mt5Busy, setMt5Busy] = useState(false);
  const [mt5OperationMessage, setMt5OperationMessage] = useState("MT5 read-only bridge not checked.");
  const [mt5ActivationSteps, setMt5ActivationSteps] = useState<Mt5ActivationStep[]>([]);
  const [mt5BrokerSymbol, setMt5BrokerSymbol] = useState(() => loadMt5ReadOnlySettings().brokerSymbolOverride ?? "USTECH");
  const [mt5CandleLimit, setMt5CandleLimit] = useState(() => String(Math.max(1000, loadMt5ReadOnlySettings().candleLimit ?? 1000)));
  const [mt5AutoRefresh, setMt5AutoRefresh] = useState<Mt5ReadOnlyAutoRefreshState>(() =>
    loadMt5ReadOnlyAutoRefreshState()
  );
  const [mt5AutoRefreshBusy, setMt5AutoRefreshBusy] = useState(false);
  const [mt5AutoRefreshInterval, setMt5AutoRefreshInterval] = useState(() =>
    String(loadMt5ReadOnlyAutoRefreshState().interval)
  );
  const [dashboardAdvancedOpen, setDashboardAdvancedOpen] = useState(false);
  const [dashboardPerformanceMarks, setDashboardPerformanceMarks] = useState<DashboardPerformanceMark[]>([]);
  const [chartPerformanceMarks, setChartPerformanceMarks] = useState<TradingChartPerformanceEvent[]>([]);
  const [mt5SourceUpdateSerial, setMt5SourceUpdateSerial] = useState(0);
  const [autoRefreshClock, setAutoRefreshClock] = useState(() => Date.now());
  const [dataConnectionEvents, setDataConnectionEvents] = useState<CommandCenterDataEvent[]>([]);
  const latestRun = liveRun ?? latestAutonomousResearchRun(autonomyState);
  const currentIteration = latestRun?.iterations.find((iteration) => iteration.iteration === latestRun.currentIteration);
  const recoveryRun = !busy && autonomyState.activeRun?.status === "running" ? autonomyState.activeRun : undefined;

  const recordDashboardPerformance = (phase: string, startedAt: number, detail?: string) => {
    const mark = {
      detail,
      durationMs: Math.max(0, Date.now() - startedAt),
      phase,
      timestamp: new Date().toISOString()
    };
    setDashboardPerformanceMarks((marks) => safeTopN([mark, ...marks], 12));
  };

  const refresh = () => {
    const startedAt = Date.now();
    setAutonomyState(loadAutonomousResearchState());
    void resolveResearchRuntimeSnapshot({ labState: state })
      .then((snapshot) => {
        setRuntimeSnapshot(snapshot);
        recordDashboardPerformance("runtime_snapshot_resolve", startedAt, "event refresh");
      })
      .catch(() => undefined);
  };

  const resolveAndStoreRuntime = async () => {
    const startedAt = Date.now();
    const snapshot = await resolveResearchRuntimeSnapshot({ labState: state });
    setRuntimeSnapshot(snapshot);
    recordDashboardPerformance("runtime_snapshot_resolve", startedAt, "direct action");
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
          nextEvent.title.includes("TradingView chart source refreshed") ||
          nextEvent.title.includes("MT5 refresh") ||
          nextEvent.title.includes("LLM advisory"))
          ? [{ ...nextEvent, id: events[0].id }, ...events.slice(1)]
          : [nextEvent, ...events],
        16
      )
    );
  };

  const resetMt5ActivationSteps = (steps: string[]) => {
    const timestamp = new Date().toISOString();
    setMt5ActivationSteps(
      steps.map((step) => ({
        detail: "Waiting for activation.",
        id: uid("mt5_activation_step"),
        status: "pending",
        step,
        timestamp
      }))
    );
  };

  const updateMt5ActivationStep = (
    step: string,
    status: Mt5ActivationStepStatus,
    detail: string,
    sourceFingerprint?: string
  ) => {
    const timestamp = new Date().toISOString();
    setMt5ActivationSteps((steps) => {
      const found = steps.some((item) => item.step === step);
      const next = found
        ? steps.map((item) =>
            item.step === step
              ? {
                  ...item,
                  detail,
                  sourceFingerprint,
                  status,
                  timestamp
                }
              : item
          )
        : [
            ...steps,
            {
              detail,
              id: uid("mt5_activation_step"),
              sourceFingerprint,
              status,
              step,
              timestamp
            }
          ];
      return next;
    });
  };

  const mt5CommandSettings = loadMt5ReadOnlySettings();
  const commandCenterSymbol = mt5CommandSettings.requestedSymbol ?? runtimeSnapshot?.marketData.symbol ?? "MNQ";
  const commandCenterTimeframe = mt5CommandSettings.timeframe ?? runtimeSnapshot?.marketData.timeframe ?? "5m";

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
        const message =
          "TradingView MCP port is disconnected or occupied but not responding. Run npm.cmd run tradingview:mcp-diagnose-port. If stale, run npm.cmd run tradingview:mcp-stop, then restart npm.cmd run tradingview:mcp-bridge.";
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

      const selectedCandleLimit = Number(autoRefreshCandleLimit);
      setTradingViewOperationMessage(`Fetching TradingView MCP candles for ${commandCenterSymbol} ${commandCenterTimeframe}...`);
      addDataConnectionEvent(
        "Candle fetch started",
        `Requesting ${selectedCandleLimit.toLocaleString()} read-only candles for chart display.`,
        "running"
      );
      const candles = await fetchTradingViewMcpCandles(
        { symbol: commandCenterSymbol, timeframe: commandCenterTimeframe, limit: selectedCandleLimit },
        settings
      );
      if (!candles.candleCount) {
        const message =
          candles.depthWarning ||
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
          feed.requestedLimit
            ? `Depth: ${feed.candleCount.toLocaleString()} of ${feed.requestedLimit.toLocaleString()} requested (${formatToken(feed.depthStatus)}).`
            : undefined,
          feed.depthWarning,
          `Storage: ${feed.candlesPersisted ? "IndexedDB" : "session-only"}.`,
          feed.activeForResearch
            ? "Ready for guarded research source use."
            : `Research remains guarded: ${feed.researchEligibility.reasons.join(" ")}`
        ].filter(Boolean).join(" ")
      );
      addDataConnectionEvent(
        "Candles fetched",
        [
          `${feed.candleCount.toLocaleString()} candles from ${feed.firstTimestamp ?? "n/a"} to ${feed.lastTimestamp ?? "n/a"}.`,
          feed.requestedLimit ? `Requested ${feed.requestedLimit.toLocaleString()}; depth ${formatToken(feed.depthStatus)}.` : undefined,
          feed.depthWarning
        ].filter(Boolean).join(" "),
        feed.candleCount >= (feed.researchMinimumCandles ?? 400) ? "success" : "warning",
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
          requestedLimit: feed.requestedLimit,
          effectiveLimit: feed.effectiveLimit,
          returnedCount: feed.returnedCount,
          upstreamMaxBars: feed.upstreamMaxBars,
          upstreamTotalAvailable: feed.upstreamTotalAvailable,
          researchMinimumCandles: feed.researchMinimumCandles,
          depthStatus: feed.depthStatus,
          depthWarning: feed.depthWarning,
          nextRecommendedAction: feed.nextRecommendedAction,
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

  const connectMt5ReadOnly = async ({ activationMode = "chart_only" }: { activationMode?: Mt5DashboardActivationMode } = {}) => {
    setMt5Busy(true);
    const primaryActivation = activationMode === "research_mode";
    const usageMode = activationMode === "chart_only" ? "chart_only" : "research_source";
    const actionLabel = primaryActivation
      ? "Activate MT5 Research Mode"
      : usageMode === "research_source"
        ? "Use MT5 for Research"
        : "Connect MT5 Read-Only";
    const loadedSettings = loadMt5ReadOnlySettings();
    const requestedSymbol = (loadedSettings.requestedSymbol || commandCenterSymbol || "MNQ").trim();
    const timeframe = (loadedSettings.timeframe || commandCenterTimeframe || "5m").trim();
    const brokerSymbol = (mt5BrokerSymbol.trim() || loadedSettings.brokerSymbolOverride || "USTECH").trim();
    const limit = Math.max(1, Number(mt5CandleLimit) || loadedSettings.candleLimit || 1000);
    resetMt5ActivationSteps([
      "wrapper status",
      "upstream status",
      "symbol check",
      "quote",
      "candles",
      "canonical registration",
      "chart activation",
      "research activation",
      "authority"
    ]);
    setMt5BrokerSymbol(brokerSymbol);
    setMt5CandleLimit(String(limit));
    setMt5OperationMessage(`${actionLabel} started. Checking wrapper for GoTrader ${requestedSymbol} via MT5 ${brokerSymbol} ${timeframe}...`);
    addDataConnectionEvent(
      primaryActivation ? "MT5 research mode activation started" : usageMode === "research_source" ? "MT5 research click received" : "MT5 connect clicked",
      `Dashboard action received. Requested ${requestedSymbol}; broker symbol ${brokerSymbol}; timeframe ${timeframe}; limit ${limit.toLocaleString()}.`,
      "running",
      brokerSymbol
    );
    addDataConnectionEvent("MT5 status checked", `Checking GoTrader ${requestedSymbol} via MT5 broker symbol ${brokerSymbol}.`, "running");
    try {
      updateMt5ActivationStep("wrapper status", "running", `Checking safe wrapper ${loadedSettings.bridgeUrl}.`);
      const settings = saveMt5ReadOnlySettings({
        enabled: true,
        requestedSymbol,
        brokerSymbolOverride: brokerSymbol,
        timeframe,
        candleLimit: limit
      });
      const status = await checkMt5ReadOnlyStatus(settings);
      if (status.connectionStatus !== "connected" && status.connectionStatus !== "degraded") {
        const message = `Activation failed at wrapper status: MT5 read-only bridge disconnected. ${status.message}`;
        setMt5OperationMessage(message);
        updateMt5ActivationStep("wrapper status", "failed", message);
        addDataConnectionEvent("MT5 disconnected", message, "warning");
        await resolveAndStoreRuntime().catch(() => undefined);
        return;
      }
      updateMt5ActivationStep("wrapper status", "success", `GoTrader safe wrapper responded at ${settings.bridgeUrl}.`);
      if (status.connectionStatus !== "connected") {
        const message = `Activation failed at upstream status: wrapper responded, but upstream MT5 market data is ${formatToken(status.connectionStatus)}. ${status.message}`;
        setMt5OperationMessage(message);
        updateMt5ActivationStep("upstream status", "failed", message);
        addDataConnectionEvent("MT5 upstream unavailable", message, "failed", status.endpoint);
        await resolveAndStoreRuntime().catch(() => undefined);
        return;
      }
      updateMt5ActivationStep(
        "upstream status",
        "success",
        `Upstream MT5 market-data service reached through ${settings.bridgeUrl}.`
      );

      setMt5OperationMessage(`Checking MT5 symbols and confirming ${brokerSymbol} exists...`);
      updateMt5ActivationStep("symbol check", "running", `Fetching symbol list and confirming ${brokerSymbol}.`);
      const symbols = await fetchMt5ReadOnlySymbols(settings);
      const brokerSymbolExists = symbols.symbols.some((symbol) => symbol.toUpperCase() === brokerSymbol.toUpperCase());
      if (symbols.symbols.length && !brokerSymbolExists) {
        const message = `Activation failed at symbol check: MT5 broker symbol ${brokerSymbol} was not found in the upstream symbol list. Try USTECH, US500, US30, XAUUSD, or EURUSD.pro.`;
        setMt5OperationMessage(message);
        updateMt5ActivationStep("symbol check", "failed", message);
        addDataConnectionEvent("MT5 broker symbol missing", message, "failed", brokerSymbol);
        await resolveAndStoreRuntime().catch(() => undefined);
        return;
      }
      updateMt5ActivationStep(
        "symbol check",
        symbols.symbols.length ? "success" : "warning",
        symbols.symbols.length ? `${symbols.symbols.length.toLocaleString()} symbols available; ${brokerSymbol} confirmed.` : "Symbol list unavailable; continuing with explicit broker symbol."
      );
      addDataConnectionEvent(
        "MT5 symbols checked",
        symbols.symbols.length ? `${symbols.symbols.length.toLocaleString()} symbols available; ${brokerSymbol} confirmed.` : "Symbol list unavailable; continuing with explicit broker symbol.",
        symbols.symbols.length ? "success" : "warning",
        brokerSymbol
      );

      setMt5OperationMessage(`Fetching MT5 quote for GoTrader ${requestedSymbol} via ${brokerSymbol}...`);
      updateMt5ActivationStep("quote", "running", `Fetching read-only quote for ${brokerSymbol}.`);
      const quote = await fetchMt5ReadOnlyQuote({ symbol: requestedSymbol, brokerSymbol }, settings);
      if (!(quote.mid || quote.bid || quote.ask)) {
        const message = `Activation failed at quote: ${quote.missingEvidence.join(" ") || "No MT5 quote returned."}`;
        setMt5OperationMessage(message);
        updateMt5ActivationStep("quote", "failed", message);
        addDataConnectionEvent("MT5 quote failed", message, "failed", quote.brokerSymbol ?? brokerSymbol);
        await resolveAndStoreRuntime().catch(() => undefined);
        return;
      }
      updateMt5ActivationStep("quote", "success", `Quote ${quote.mid ?? quote.bid ?? quote.ask}; spread ${quote.spread ?? "n/a"}.`);
      addDataConnectionEvent(
        "MT5 quote fetched",
        `Quote ${quote.mid ?? quote.bid ?? quote.ask}; spread ${quote.spread ?? "n/a"}.`,
        "success",
        quote.brokerSymbol ?? brokerSymbol
      );

      setMt5OperationMessage(`Fetching ${limit.toLocaleString()} MT5 candles for GoTrader ${requestedSymbol} via ${brokerSymbol} ${timeframe}...`);
      updateMt5ActivationStep("candles", "running", `Fetching ${limit.toLocaleString()} ${timeframe} candles from safe wrapper.`);
      addDataConnectionEvent(
        "MT5 candles requested",
        `Fetching ${limit.toLocaleString()} ${timeframe} candles from safe wrapper ${settings.bridgeUrl}.`,
        "running",
        brokerSymbol
      );
      const feed = await fetchAndStoreMt5ReadOnlyCandleFeed({
        symbol: requestedSymbol,
        brokerSymbol,
        timeframe,
        gotraderSymbol: requestedSymbol,
        gotraderTimeframe: timeframe,
        limit,
        settings,
        usageMode
      });
      addDataConnectionEvent(
        "MT5 canonical registration checked",
        feed.candles.length
          ? `Stored ${feed.candles.length.toLocaleString()} candles as canonical MT5 read-only source.`
          : feed.missingEvidence.join(" ") || "No MT5 candle array was returned, so canonical registration is blocked.",
        feed.candles.length ? "success" : "warning",
        feed.feedId
      );
      if (!feed.candles.length) {
        const message = `Activation failed at candles: ${feed.missingEvidence.join(" ") || "MT5 bridge connected but returned no candles."}`;
        setMt5OperationMessage(message);
        updateMt5ActivationStep("candles", "failed", message);
        updateMt5ActivationStep("canonical registration", "failed", "No candle array was returned, so canonical registration is blocked.");
        await resolveAndStoreRuntime().catch(() => undefined);
        return;
      }
      updateMt5ActivationStep("candles", "success", `${feed.candleCount.toLocaleString()} candles returned; depth ${formatToken(feed.depthStatus)}.`, feed.candleFingerprint);
      updateMt5ActivationStep(
        "canonical registration",
        feed.feedId ? "success" : "warning",
        feed.feedId ? `Registered canonical MT5 source ${feed.feedId}.` : "Candles loaded, but feed id is missing.",
        feed.candleFingerprint
      );
      updateMt5ActivationStep(
        "chart activation",
        feed.activeForChart ? "success" : "failed",
        feed.activeForChart ? "MT5 read-only is active for chart display." : "MT5 candles loaded, but chart eligibility failed.",
        feed.candleFingerprint
      );
      updateMt5ActivationStep(
        "research activation",
        feed.activeForResearch ? "success" : primaryActivation ? "failed" : "warning",
        feed.activeForResearch ? "MT5 read-only is active for guarded research." : feed.researchEligibility.reasons.join(" ") || "Research eligibility failed.",
        feed.candleFingerprint
      );
      const authorityOk =
        feed.executionAuthority === "none" &&
        feed.brokerAuthority === "none" &&
        feed.readinessOverrideAuthority === "none";
      updateMt5ActivationStep(
        "authority",
        authorityOk ? "success" : "failed",
        authorityOk
          ? "executionAuthority none; brokerAuthority none; readinessOverrideAuthority none."
          : "Activation blocked because source authority was not none.",
        feed.candleFingerprint
      );
      await resolveAndStoreRuntime().catch(() => undefined);
      if (primaryActivation && (!feed.activeForChart || !feed.activeForResearch || !authorityOk)) {
        const failedStep = !feed.activeForChart
          ? "chart activation"
          : !feed.activeForResearch
            ? "research eligibility"
            : "authority";
        const message =
          failedStep === "research eligibility"
            ? `Activation failed at research eligibility: ${feed.researchEligibility.reasons.join(" ") || "MT5 source did not pass research gate."}`
            : `Activation failed at ${failedStep}: MT5 source did not satisfy the full research-mode gate.`;
        setMt5OperationMessage(message);
        addDataConnectionEvent("MT5 research mode blocked", message, "failed", feed.candleFingerprint);
        return;
      }
      setMt5OperationMessage(
        primaryActivation
          ? `MT5 Research Mode active: ${feed.brokerSymbol ?? brokerSymbol} -> ${feed.requestedSymbol}, ${feed.candleCount.toLocaleString()} ${feed.timeframe} candles, chart/research source active, authority none.`
          : [
              `${actionLabel} completed. MT5 read-only ${usageMode === "research_source" && feed.activeForResearch ? "research" : "chart"} source loaded with ${feed.candleCount.toLocaleString()} candles.`,
              `GoTrader ${feed.requestedSymbol}; MT5 broker symbol ${feed.brokerSymbol ?? brokerSymbol}; depth ${formatToken(feed.depthStatus)}.`,
              feed.activeForResearch ? "Research source gate passed." : `Research guarded: ${feed.researchEligibility.reasons.join(" ")}`
            ].join(" ")
      );
      addDataConnectionEvent(
        primaryActivation ? "MT5 research mode active" : feed.activeForResearch ? "MT5 research source activated" : "MT5 chart source activated",
        `${feed.candleCount.toLocaleString()} candles; eligibility ${formatToken(feed.researchEligibility.state)}.`,
        feed.activeForResearch || feed.activeForChart ? "success" : "warning",
        feed.candleFingerprint
      );
    } catch (error) {
      const message = `Activation failed: ${error instanceof Error ? error.message : "MT5 read-only connection failed."}`;
      setMt5OperationMessage(message);
      updateMt5ActivationStep("wrapper status", "failed", message);
      addDataConnectionEvent("MT5 failed", message, "failed");
    } finally {
      setMt5Busy(false);
    }
  };

  const useExistingMt5ForResearch = async () => {
    setMt5OperationMessage("Use MT5 for Research clicked. Checking cached MT5 candle source and research gate...");
    addDataConnectionEvent("MT5 research click received", "Checking cached MT5 read-only source before setting research source.", "running");
    const feed = await hydrateActiveMt5ReadOnlyCandleFeed().catch(() => loadActiveMt5ReadOnlyCandleFeed());
    if (!feed?.candles.length) {
      const message = feed?.candleCount
        ? "MT5 metadata exists, but the candle array was not hydrated from IndexedDB/session. Reconnect MT5 Read-Only to refresh the canonical source."
        : "No MT5 candles are loaded. Running the full MT5 connect flow in research-source mode.";
      setMt5OperationMessage(message);
      addDataConnectionEvent("MT5 research source needs candles", message, "warning", feed?.feedId);
      await connectMt5ReadOnly({ activationMode: "research_source" });
      return;
    }
    setMt5Busy(true);
    try {
      const researchFeed = updateActiveMt5ReadOnlyCandleFeedMetadata(feed, { usageMode: "research_source" });
      await resolveAndStoreRuntime().catch(() => undefined);
      if (researchFeed.activeForResearch) {
        setMt5OperationMessage("MT5 read-only is now the guarded research source. Execution remains disabled.");
        addDataConnectionEvent("MT5 research source activated", "MT5 read-only candles passed the research-source gate.", "success", researchFeed.candleFingerprint);
        return;
      }
      setMt5OperationMessage(`MT5 remains chart-only: ${researchFeed.researchEligibility.reasons.join(" ")}`);
      addDataConnectionEvent("MT5 research source blocked", researchFeed.researchEligibility.reasons.join(" "), "warning", researchFeed.researchEligibility.state);
    } finally {
      setMt5Busy(false);
    }
  };

  const clearMt5ReadOnlySource = async () => {
    const stopped = stopMt5ReadOnlyAutoRefresh("MT5 cached candles were cleared; auto-refresh stopped to avoid immediately recreating the source.");
    setMt5AutoRefresh(stopped);
    await clearMt5ReadOnlyCandleFeedCache();
    await resolveAndStoreRuntime().catch(() => undefined);
    setMt5OperationMessage("MT5 read-only cached candles cleared. Falling back to imported/mock sources until MT5 is connected again.");
    addDataConnectionEvent("MT5 cache cleared", "Removed MT5 read-only candle cache only.", "warning");
  };

  const refreshMt5CandlesManually = async () => {
    if (mt5Busy || mt5AutoRefresh.refreshInProgress || mt5RefreshRunning) {
      setMt5OperationMessage("MT5 refresh is already running. Duplicate manual refresh was ignored.");
      return;
    }
    setMt5Busy(true);
    const loadedSettings = loadMt5ReadOnlySettings();
    const requestedSymbol = (loadedSettings.requestedSymbol || commandCenterSymbol || "MNQ").trim();
    const timeframe = (loadedSettings.timeframe || commandCenterTimeframe || "5m").trim();
    const brokerSymbol = (mt5BrokerSymbol.trim() || loadedSettings.brokerSymbolOverride || "USTECH").trim();
    const limit = Math.min(1000, Math.max(1, Number(mt5CandleLimit) || loadedSettings.candleLimit || 1000));
    const startedAt = Date.now();

    setMt5BrokerSymbol(brokerSymbol);
    setMt5CandleLimit(String(limit));
    setMt5OperationMessage(`Refreshing MT5 read-only candles for ${brokerSymbol} (${limit.toLocaleString()} ${timeframe} bars)...`);
    addDataConnectionEvent(
      "MT5 manual refresh requested",
      `One-shot guarded refresh for ${brokerSymbol}; no AI Research Cycle or walk-forward run will start.`,
      "running",
      brokerSymbol
    );

    try {
      const refreshState = await refreshMt5ReadOnlyNow({
        activateLoop: false,
        brokerSymbol,
        candleLimit: limit,
        emitStartEvent: false,
        requestedSymbol,
        timeframe,
        trigger: "manual",
        usageMode: runtimeSnapshot?.mt5ReadOnly.activeForResearch ? "research_source" : "chart_only"
      });
      setMt5AutoRefresh(refreshState);

      const changed =
        refreshState.lastStorageWriteStatus === "written" ||
        refreshState.lastStorageWriteStatus === "session_only" ||
        refreshState.lastManualRefreshResult === "updated";

      const durationMs = refreshState.lastManualRefreshDurationMs ?? Date.now() - startedAt;
      const count = refreshState.lastManualRefreshCandleCount ?? refreshState.lastCandleCount;
      const result = refreshState.lastManualRefreshResult ?? (changed ? "updated" : "unchanged");
      const resultDetail =
        result === "unchanged"
          ? `unchanged; candle write ${formatToken(refreshState.lastStorageWriteStatus)}`
          : result === "updated"
            ? `updated; source registered ${refreshState.lastManualRefreshSourceRegistered ? "yes" : "no"}`
            : result === "skipped_overlap"
              ? "skipped because another MT5 refresh is running"
              : "failed";
      const message = refreshState.lastError
        ? `MT5 manual refresh failed after ${durationMs}ms: ${refreshState.lastError}`
        : `MT5 manual refresh ${resultDetail} after ${durationMs}ms. ${count.toLocaleString()} candles; last candle ${refreshState.lastCandleTimestamp ? formatDateTime(refreshState.lastCandleTimestamp) : "n/a"}.`;

      setMt5OperationMessage(message);
      addDataConnectionEvent(
        result === "updated" ? "MT5 candles updated" : result === "unchanged" ? "MT5 refresh unchanged" : "MT5 manual refresh checked",
        message,
        refreshState.lastError ? "failed" : result === "updated" ? "success" : "info",
        refreshState.lastCandleFingerprint ?? brokerSymbol
      );
    } finally {
      setMt5Busy(false);
    }
  };

  const persistMt5AutoRefreshSettings = (
    interval = mt5AutoRefreshInterval,
    candleLimit = mt5CandleLimit
  ) => {
    const saved = saveMt5ReadOnlyAutoRefreshSettings({
      interval,
      candleLimit: Number(candleLimit)
    });
    setMt5AutoRefresh(saved);
    return saved;
  };

  const startMt5AutoRefreshLoop = async () => {
    setMt5AutoRefreshBusy(true);
    const brokerSymbol = (mt5BrokerSymbol.trim() || loadMt5ReadOnlySettings().brokerSymbolOverride || "USTECH").trim();
    const intervalLabel = mt5AutoRefreshInterval === "manual" ? "manual" : `${mt5AutoRefreshInterval}s`;
    setMt5OperationMessage(`Starting MT5 read-only refresh for ${brokerSymbol} ${commandCenterTimeframe} (${intervalLabel})...`);
    addDataConnectionEvent(
      "MT5 refresh starting",
      `Interval ${intervalLabel}, limit ${Number(mt5CandleLimit).toLocaleString()} candles. Data refresh only; no research cycle will run.`,
      "running",
      brokerSymbol
    );
    try {
      const refreshState = await startMt5ReadOnlyAutoRefresh({
        brokerSymbol,
        candleLimit: Number(mt5CandleLimit),
        interval: mt5AutoRefreshInterval,
        requestedSymbol: commandCenterSymbol,
        timeframe: commandCenterTimeframe,
        usageMode: runtimeSnapshot?.mt5ReadOnly.activeForResearch ? "research_source" : "chart_only"
      });
      setMt5AutoRefresh(refreshState);
      await resolveAndStoreRuntime().catch(() => undefined);
      setMt5OperationMessage(
        refreshState.lastError
          ? `MT5 refresh warning: ${refreshState.lastError}`
          : `MT5 refresh checked ${refreshState.lastCandleCount.toLocaleString()} candles. Last candle ${refreshState.lastCandleTimestamp ? formatDateTime(refreshState.lastCandleTimestamp) : "n/a"}.`
      );
    } finally {
      setMt5AutoRefreshBusy(false);
    }
  };

  const stopMt5AutoRefreshLoop = () => {
    const stopped = stopMt5ReadOnlyAutoRefresh("MT5 read-only auto-refresh stopped by user.");
    setMt5AutoRefresh(stopped);
    setMt5OperationMessage("MT5 read-only auto-refresh stopped. The current MT5 chart/research source remains loaded.");
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
    const handleChartPerformance = (event: Event) => {
      const detail = (event as CustomEvent<TradingChartPerformanceEvent>).detail;
      if (!detail?.phase) {
        return;
      }
      setChartPerformanceMarks((marks) => safeTopN([detail, ...marks], 12));
    };
    window.addEventListener(TRADING_CHART_PERFORMANCE_EVENT, handleChartPerformance);
    return () => window.removeEventListener(TRADING_CHART_PERFORMANCE_EVENT, handleChartPerformance);
  }, []);

  useEffect(() => {
    const handleMt5SourceUpdate = () => {
      const startedAt = Date.now();
      setMt5SourceUpdateSerial((serial) => serial + 1);
      recordDashboardPerformance("mt5_source_compact_update", startedAt, "chart/source metadata only");
    };
    window.addEventListener(MT5_READ_ONLY_UPDATED_EVENT, handleMt5SourceUpdate);
    return () => window.removeEventListener(MT5_READ_ONLY_UPDATED_EVENT, handleMt5SourceUpdate);
  }, []);

  useEffect(() => {
    const handleMt5AutoRefreshUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: Mt5ReadOnlyAutoRefreshState; event?: Mt5ReadOnlyAutoRefreshState["lastEvent"] }>).detail;
      const nextState = detail?.state ?? loadMt5ReadOnlyAutoRefreshState();
      setMt5AutoRefresh(nextState);
      setMt5AutoRefreshInterval(String(nextState.interval));
      setMt5CandleLimit(String(nextState.candleLimit));
      if (detail?.event) {
        addDataConnectionEvent(
          detail.event.title,
          detail.event.detail,
          detail.event.severity === "failed" ? "failed" : detail.event.severity,
          detail.event.sourceFingerprint
        );
      }
    };
    window.addEventListener(MT5_READ_ONLY_AUTO_REFRESH_UPDATED_EVENT, handleMt5AutoRefreshUpdate);
    return () => window.removeEventListener(MT5_READ_ONLY_AUTO_REFRESH_UPDATED_EVENT, handleMt5AutoRefreshUpdate);
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
          runtimeSnapshot.tradingViewMcp.chartFeedRequestedLimit
            ? `Depth: ${runtimeSnapshot.tradingViewMcp.chartFeedCandleCount.toLocaleString()} of ${runtimeSnapshot.tradingViewMcp.chartFeedRequestedLimit.toLocaleString()} requested (${formatToken(runtimeSnapshot.tradingViewMcp.chartFeedDepthStatus)}).`
            : undefined,
          runtimeSnapshot.tradingViewMcp.chartFeedDepthWarning,
          runtimeSnapshot.marketData.researchUsesTradingViewMcp
            ? "Research source is TradingView MCP; execution remains disabled."
            : `Research remains guarded: ${
                runtimeSnapshot.tradingViewMcp.eligibilityReasons[0] ?? "TradingView MCP is visual-only."
              }`
        ].filter(Boolean).join(" ");
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
    runtimeSnapshot?.tradingViewMcp.chartFeedDepthStatus,
    runtimeSnapshot?.tradingViewMcp.chartFeedDepthWarning,
    runtimeSnapshot?.tradingViewMcp.chartFeedRequestedLimit,
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
    setStoppingAutonomy(false);
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
      setStoppingAutonomy(false);
      setAbortController(undefined);
    }
  };

  const stopLoop = () => {
    setStoppingAutonomy(true);
    abortController?.abort();
  };

  const useExistingMt5ForChart = async () => {
    setMt5OperationMessage("Use MT5 for Chart clicked. Checking cached MT5 candle source...");
    addDataConnectionEvent("MT5 chart click received", "Checking cached MT5 read-only source before setting chart source.", "running");
    setMt5Busy(true);
    try {
      const feed = await hydrateActiveMt5ReadOnlyCandleFeed().catch(() => loadActiveMt5ReadOnlyCandleFeed());
      if (!feed?.candles.length) {
        const message = feed?.candleCount
          ? "MT5 metadata exists, but the candle array was not hydrated from IndexedDB/session. Reconnect MT5 Read-Only to refresh the canonical source."
          : "No MT5 candles are loaded. Connect MT5 Read-Only first.";
        setMt5OperationMessage(message);
        addDataConnectionEvent("MT5 chart source blocked", message, "warning", feed?.feedId);
        return;
      }
      const usageMode = feed.usageMode === "research_source" ? "research_source" : "chart_only";
      const chartFeed = updateActiveMt5ReadOnlyCandleFeedMetadata(feed, { usageMode });
      await resolveAndStoreRuntime().catch(() => undefined);
      if (chartFeed.activeForChart) {
        const message = `MT5 read-only chart source active with ${chartFeed.candleCount.toLocaleString()} ${chartFeed.timeframe} candles from ${chartFeed.brokerSymbol ?? chartFeed.symbol}.`;
        setMt5OperationMessage(message);
        addDataConnectionEvent("MT5 chart source active", message, "success", chartFeed.feedId);
      } else {
        const message = "MT5 candles are loaded, but chart eligibility did not pass.";
        setMt5OperationMessage(message);
        addDataConnectionEvent("MT5 chart source blocked", message, "warning", chartFeed.feedId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "MT5 chart activation failed.";
      setMt5OperationMessage(message);
      addDataConnectionEvent("MT5 chart source failed", message, "failed");
    } finally {
      setMt5Busy(false);
    }
  };

  const pipelineStages = useMemo(
    () => buildPipelineStages(runtimeSnapshot, latestRun, busy, currentIteration?.startedAt),
    [busy, currentIteration?.startedAt, latestRun, runtimeSnapshot]
  );
  const actionItems = useMemo(() => buildActionItems(runtimeSnapshot, latestRun), [runtimeSnapshot, latestRun]);
  const feedItems = useMemo(() => buildFeedItems(runtimeSnapshot, latestRun, dataConnectionEvents), [dataConnectionEvents, latestRun, runtimeSnapshot]);
  const commandCenterChart = useMemo(
    () => buildCommandCenterChartData(runtimeSnapshot, { includeGrinchReplay: dashboardAdvancedOpen }),
    [dashboardAdvancedOpen, mt5SourceUpdateSerial, runtimeSnapshot]
  );
  const commandCenterChartFingerprint =
    commandCenterChart?.source.dataFingerprint ?? commandCenterChart?.source.sourceKey ?? "no-chart-source";
  const commandCenterChartIdentity = commandCenterChart
    ? `${commandCenterChart.source.sourceType}|${commandCenterChart.source.symbol}|${commandCenterChart.source.timeframe}`
    : "no-chart-source";
  const shortCommandCenterChartFingerprint =
    commandCenterChartFingerprint.length > 46
      ? `${commandCenterChartFingerprint.slice(0, 24)}...${commandCenterChartFingerprint.slice(-14)}`
      : commandCenterChartFingerprint;
  const grinchDiagnosticCandles = useMemo(() => {
    if (!dashboardAdvancedOpen) {
      return [];
    }
    const tradingViewFeed = loadActiveTradingViewMcpChartFeed();
    const mt5Feed = loadActiveMt5ReadOnlyCandleFeed();
    const displaySource = runtimeSnapshot
      ? resolveChartDisplayCandleSource(runtimeSnapshot.marketData.preparedSource, tradingViewFeed, mt5Feed)
      : undefined;
    return displaySource?.activeResearchCandleSource ?? [];
  }, [dashboardAdvancedOpen, runtimeSnapshot]);
  const warnings = selectRuntimeWarnings(runtimeSnapshot);
  const latestAutoResearch = useMemo(
    () => runtimeSnapshot?.latestResearchCycle.latestRun?.autoResearchCycle ?? latestAutoResearchCycle(loadAutoResearchState()),
    [runtimeSnapshot?.latestResearchCycle.latestCycleId]
  );
  const autoRefreshRunning = tradingViewAutoRefresh.status === "running" && tradingViewAutoRefresh.enabled;
  const autoRefreshCountdown = formatCountdown(tradingViewAutoRefresh.nextRefreshAt, autoRefreshClock);
  const mt5RefreshRunning = mt5AutoRefresh.status === "running" && mt5AutoRefresh.enabled;
  const mt5RefreshCountdown = formatCountdown(mt5AutoRefresh.nextRefreshAt, autoRefreshClock);
  const mt5LatestQuote =
    mt5AutoRefresh.lastQuote?.mid ??
    mt5AutoRefresh.lastQuote?.bid ??
    mt5AutoRefresh.lastQuote?.ask ??
    runtimeSnapshot?.mt5ReadOnly.latestPrice;
  const latestBacktest = runtimeSnapshot?.latestResearchCycle.latestBacktestSummary;
  const activeResearchSource = runtimeSnapshot?.marketData.activeResearchSource;
  const activeResearchSourceLabel = activeResearchSource
    ? `${formatToken(activeResearchSource.provider)} / ${activeResearchSource.symbol}${
        activeResearchSource.provenance.providerSymbol ? ` via ${activeResearchSource.provenance.providerSymbol}` : ""
      } / ${activeResearchSource.candleCount.toLocaleString()} candles`
    : "loading";
  const activeResearchSourceFingerprint = activeResearchSource?.fingerprint
    ? activeResearchSource.fingerprint.length > 48
      ? `${activeResearchSource.fingerprint.slice(0, 24)}...${activeResearchSource.fingerprint.slice(-12)}`
      : activeResearchSource.fingerprint
    : "no fingerprint";
  const grinch = runtimeSnapshot?.latestResearchCycle.activeGrinchProfileSummary;
  const latestGrinchScore =
    runtimeSnapshot?.latestResearchCycle.grinchStrategyScore ?? latestBacktest?.grinchSummary?.latestScore;
  const grinchProfileDiagnostics = useMemo(
    () =>
      buildGrinchProfileEvidenceDiagnostics({
        candles: grinchDiagnosticCandles,
        phase1: runtimeSnapshot?.latestResearchCycle.grinchPhase1Summary,
        reversal: runtimeSnapshot?.latestResearchCycle.grinchPhase2ReversalSummary,
        consolidation: runtimeSnapshot?.latestResearchCycle.grinchPhase3ConsolidationSummary,
        score: latestGrinchScore,
        profileCandidateCounts: latestBacktest?.grinchSummary?.profileCandidateCounts,
        noValidProfileCount: latestBacktest?.grinchSummary?.noValidProfileSignals,
        regimeLabel: runtimeSnapshot?.regime.label,
        regimeDataQuality: runtimeSnapshot?.regime.dataQuality,
        sessionTimeMapping: runtimeSnapshot?.latestResearchCycle.grinchPhase1Summary?.sessionTimeMapping
      }),
    [grinchDiagnosticCandles, latestBacktest, latestGrinchScore, runtimeSnapshot]
  );
  const expansionReplay = grinchProfileDiagnostics.expansionReplayDiagnostics;
  const grinchCalibrationProposalIntent = useMemo(
    () =>
      latestGrinchScore?.noValidProfile
        ? buildGrinchCalibrationProposalIntentDetails({
            expansionReplayDiagnostics: expansionReplay,
            report: grinchProfileDiagnostics.calibrationReport,
            sourceContext: {
              provider: runtimeSnapshot?.marketData.activeResearchSource.provider,
              dataSourceLabel: runtimeSnapshot?.marketData.activeResearchSource.provenance.sourceLabel,
              requestedSymbol: runtimeSnapshot?.marketData.symbol,
              brokerSymbol:
                runtimeSnapshot?.marketData.activeResearchSource.provenance.providerSymbol ??
                runtimeSnapshot?.marketData.activeResearchSource.symbol,
              timeframe: runtimeSnapshot?.marketData.activeResearchSource.timeframe,
              candleCount: runtimeSnapshot?.marketData.activeResearchSource.candleCount,
              sourceFingerprint: runtimeSnapshot?.marketData.activeResearchSource.fingerprint,
              regimeLabel: runtimeSnapshot?.regime.label,
              regimeDataQuality: runtimeSnapshot?.regime.dataQuality
            }
          })
        : undefined,
    [expansionReplay, grinchProfileDiagnostics.calibrationReport, latestGrinchScore?.noValidProfile, runtimeSnapshot]
  );
  const canonicalMetrics = runtimeSnapshot?.performance.canonicalPerformanceMetrics;
  const latestGrinchComparison = runtimeSnapshot?.latestResearchCycle.latestRun?.autoResearchCycle?.grinchComparison ?? latestAutoResearch?.grinchComparison;
  const layerMetrics = latestGrinchComparison?.layerMetrics;
  const benchmarkMatrix = useMemo(() => safeArray(latestGrinchComparison?.benchmarkMatrix), [latestGrinchComparison?.benchmarkMatrix]);
  const layerContributionRows = useMemo(() => buildLayerContributionRows(layerMetrics), [layerMetrics]);
  const benchmarkRows = useMemo(() => buildBenchmarkDisplayRows(benchmarkMatrix, latestAutoResearch), [benchmarkMatrix, latestAutoResearch]);
  const falsePositiveRate =
    canonicalMetrics && canonicalMetrics.totalTrades + canonicalMetrics.falsePositiveCount > 0
      ? canonicalMetrics.falsePositiveCount / (canonicalMetrics.totalTrades + canonicalMetrics.falsePositiveCount)
      : undefined;
  const sourceContextRows = useMemo(() => buildSourceContextRows(runtimeSnapshot), [runtimeSnapshot]);
  const expandedResearchMetricRows = useMemo(() => buildExpandedResearchMetricRows(runtimeSnapshot), [runtimeSnapshot]);
  const riskReportRows = useMemo(() => buildRiskReportRows(runtimeSnapshot), [runtimeSnapshot]);
  const proposalImpactRows = useMemo(() => buildProposalImpactRows(runtimeSnapshot), [runtimeSnapshot]);
  const researchCommitteeReport = useMemo(
    () => (runtimeSnapshot ? buildResearchCommitteeReport(runtimeSnapshot) : undefined),
    [runtimeSnapshot]
  );
  const readinessDistinction = researchCommitteeReport?.readinessDistinction;
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
    : runtimeSnapshot?.marketData.chartDisplayUsesMt5ReadOnly
      ? "success"
      : runtimeSnapshot?.marketData.fallbackToMock
        ? "warning"
        : "secondary";
  const canonicalChartSourceLabel = runtimeSnapshot
    ? runtimeSnapshot.marketData.activeChartSource.provider.replace(/_/g, " ")
    : "loading";
  const canonicalChartSourceDetail = runtimeSnapshot
    ? `${runtimeSnapshot.marketData.activeChartSource.candleCount.toLocaleString()} candles`
    : "Resolving canonical chart source";
  const canonicalResearchSourceLabel = runtimeSnapshot
    ? runtimeSnapshot.marketData.activeResearchSource.provider.replace(/_/g, " ")
    : "loading";
  const canonicalResearchSourceDetail = runtimeSnapshot
    ? `${runtimeSnapshot.marketData.activeResearchSource.candleCount.toLocaleString()} candles`
    : "Resolving guarded research source";
  const canonicalMt5Source = canonicalMt5SourceFrom(runtimeSnapshot);
  const mt5ReadOnlyRegistered = Boolean(canonicalMt5Source || runtimeSnapshot?.mt5ReadOnly.candleFeedAvailable);
  const mt5ReadOnlyStatusLabel = mt5ReadOnlyRegistered
    ? "connected"
    : runtimeSnapshot?.mt5ReadOnly.connectionStatus ?? "disconnected";
  const mt5ReadOnlyCandleCount = runtimeSnapshot?.mt5ReadOnly.candleCount || canonicalMt5Source?.candleCount || 0;
  const mt5ReadOnlyBrokerSymbol =
    mt5BrokerSymbol.trim() ||
    runtimeSnapshot?.mt5ReadOnly.brokerSymbol ||
    canonicalMt5Source?.provenance.providerSymbol ||
    "USTECH";
  const mt5ResearchEligible = mt5ResearchEligibleFrom(runtimeSnapshot);
  const mt5ResearchEligibilityReason = mt5ResearchEligibilityReasonFrom(runtimeSnapshot);
  const autonomousSource = latestRun?.sourceDiagnostics;
  const autonomousSourceLabel = autonomousSource
    ? autonomousSource.provider.replace(/_/g, " ")
    : runtimeSnapshot?.marketData.activeResearchSource.provider.replace(/_/g, " ") ?? "loading";
  const autonomousSourceDetail = autonomousSource
    ? `${autonomousSource.candleCount.toLocaleString()} candles; ${autonomousSource.brokerSymbol ?? autonomousSource.requestedSymbol ?? "no broker symbol"}`
    : runtimeSnapshot
      ? `${runtimeSnapshot.marketData.activeResearchSource.candleCount.toLocaleString()} candles; ${
          runtimeSnapshot.marketData.activeResearchSource.provenance.providerSymbol ??
          runtimeSnapshot.marketData.activeResearchSource.symbol
        }`
      : "Resolving source guard";
  const autonomousSourceBlocker =
    autonomousSource?.blocker ??
    (!runtimeSnapshot?.marketData.activeResearchSource.eligibility.researchCycle
      ? runtimeSnapshot?.marketData.activeResearchSource.eligibilityReasons[0]
      : undefined);
  const mt5ChartActionReason = mt5ReadOnlyRegistered
    ? `MT5 chart source can use ${mt5ReadOnlyCandleCount.toLocaleString()} cached candles.`
    : runtimeSnapshot?.mt5ReadOnly.connectionStatus === "degraded" || runtimeSnapshot?.mt5ReadOnly.connectionStatus === "connected"
      ? "MT5 wrapper responded, but no canonical candle source is registered yet. Click Connect MT5 Read-Only to fetch candles."
      : "No MT5 candles are loaded. Start MT5 upstream on 8000 and GoTrader wrapper on 7341, then click Connect MT5 Read-Only.";
  const mt5ResearchActionReason = mt5ResearchEligible
    ? "MT5 read-only candles passed the research-source gate."
    : mt5ResearchEligibilityReason || "MT5 research-source gate has not passed yet.";
  const statusChips = [
    {
      label: "MT5 Read-Only",
      value: mt5ReadOnlyStatusLabel.replace(/_/g, " "),
      tone: mt5ReadOnlyRegistered ? "success" : "warning"
    },
    {
      label: "Chart",
      value: chartSourceShortLabel,
      tone: chartSourceBadgeTone
    },
    {
      label: "Research",
      value: getResearchSourceShortLabel(runtimeSnapshot),
      tone: runtimeSnapshot?.marketData.researchUsesTradingViewMcp || runtimeSnapshot?.marketData.researchUsesMt5ReadOnly ? "success" : "secondary"
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
      <section className="rounded-2xl border border-cyan-300/15 bg-slate-950 p-4 shadow-[0_0_60px_rgba(8,145,178,0.10)] lg:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Command Center</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-50">GoTrader Research Dashboard</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Command Center can start research loops only. Chart data and safety gates stay supervised from this surface.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
            <Badge variant="danger">Broker execution disabled</Badge>
            <Badge variant="warning">Go-Trader gate locked</Badge>
            <Badge variant="warning">Tradovate gate locked</Badge>
            <Badge variant="secondary">Readiness override none</Badge>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {statusChips.map((chip) => (
            <StatusChip key={chip.label} label={chip.label} value={chip.value} tone={chip.tone} />
          ))}
        </div>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)]">
        <div className="space-y-4">
        <div className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-4 shadow-[0_0_45px_rgba(8,145,178,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
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
              {runtimeSnapshot?.marketData.chartDisplayUsesTradingViewMcp || runtimeSnapshot?.marketData.chartDisplayUsesMt5ReadOnly ? (
                <>
                  <Badge variant="secondary">Read-only</Badge>
                  <Badge variant="warning">Not broker truth</Badge>
                </>
              ) : null}
              {runtimeSnapshot?.marketData.chartDisplayUsesMt5ReadOnly ? <Badge variant="warning">CFD proxy</Badge> : null}
              <Badge variant="danger">Execution disabled</Badge>
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/25">
            {commandCenterChart ? (
              <DashboardChartErrorBoundary resetKey={commandCenterChartIdentity}>
                <TradingChart {...commandCenterChart} heightClassName="h-[360px]" />
              </DashboardChartErrorBoundary>
            ) : (
              <div className="flex h-[360px] items-center justify-center text-sm text-slate-500">
                No chart data loaded. Connect MT5 Read-Only or activate imported candles.
              </div>
            )}
          </div>
          {runtimeSnapshot?.marketData.chartDisplayWarning ? (
            <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
              {runtimeSnapshot.marketData.chartDisplayWarning}
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <MiniReadout label="Canonical chart" value={canonicalChartSourceLabel} detail={canonicalChartSourceDetail} />
            <MiniReadout label="Canonical research" value={canonicalResearchSourceLabel} detail={canonicalResearchSourceDetail} />
            <MiniReadout
              label="MT5 read-only"
              value={mt5ReadOnlyRegistered ? mt5ReadOnlyStatusLabel : mt5ReadOnlyCandleCount ? "refreshing source state" : "not loaded"}
              detail={`${mt5ReadOnlyCandleCount.toLocaleString()} candles; execution none`}
            />
          </div>
        </div>
        <LLMAdvisoryReviewPanel snapshot={runtimeSnapshot} onAdvisoryEvent={addDataConnectionEvent} />
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Operate</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-50">Primary Actions</h3>
              </div>
              <Badge variant="danger">Authority none</Badge>
            </div>
            <div className="mt-4 grid gap-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Primary data path</p>
                    <h4 className="mt-1 text-sm font-semibold text-slate-100">MT5 read-only market data</h4>
                  </div>
                  <Badge variant={mt5ResearchEligible ? "success" : "warning"}>
                    {mt5ResearchEligible ? "research eligible" : "guarded"}
                  </Badge>
                  <Badge variant={mt5RefreshRunning ? "success" : mt5AutoRefresh.status === "error" ? "danger" : "secondary"}>
                    refresh {formatToken(mt5AutoRefresh.status)}
                  </Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <label className="space-y-1 text-xs text-slate-300">
                    MT5 broker symbol
                    <Input
                      value={mt5BrokerSymbol}
                      onChange={(event) => {
                        setMt5BrokerSymbol(event.target.value);
                        saveMt5ReadOnlySettings({ brokerSymbolOverride: event.target.value.trim() || undefined });
                      }}
                      placeholder="USTECH"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-slate-300">
                    MT5 refresh
                    <Select
                      value={mt5AutoRefreshInterval}
                      options={mt5AutoRefreshIntervalOptions}
                      onChange={(event) => {
                        setMt5AutoRefreshInterval(event.target.value);
                        persistMt5AutoRefreshSettings(event.target.value, mt5CandleLimit);
                      }}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-slate-300">
                    MT5 candles
                    <Select
                      value={mt5CandleLimit}
                      options={mt5AutoRefreshCandleOptions}
                      onChange={(event) => {
                        setMt5CandleLimit(event.target.value);
                        saveMt5ReadOnlySettings({ candleLimit: Number(event.target.value) });
                        persistMt5AutoRefreshSettings(mt5AutoRefreshInterval, event.target.value);
                      }}
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-slate-400">
                  GoTrader requested symbol: <span className="font-mono text-slate-200">{commandCenterSymbol}</span>. MT5 broker symbol:{" "}
                  <span className="font-mono text-slate-200">{mt5ReadOnlyBrokerSymbol}</span>.
                  {" "}Broker CFD/proxy data is read-only and not CME futures broker truth.
                </p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  USTECH is MT5 CFD/proxy data for MNQ/NQ-style research, not CME MNQ futures truth. MT5 read-only has no execution authority.
                  Broker authority: none.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <MiniReadout
                    label="Autonomous source"
                    value={autonomousSourceLabel}
                    detail={autonomousSourceDetail}
                  />
                  <MiniReadout
                    label="Autonomous guard"
                    value={autonomousSourceBlocker ? "blocked" : "eligible"}
                    detail={autonomousSourceBlocker ?? "Canonical research source will be used; mock fallback refused."}
                  />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button
                    onClick={() => void connectMt5ReadOnly({ activationMode: "research_mode" })}
                    disabled={mt5Busy}
                    className="justify-start sm:col-span-2"
                  >
                    <RadioTower className="h-4 w-4" aria-hidden="true" />
                    {mt5Busy ? "Activating MT5..." : "Activate MT5 Research Mode"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void refreshMt5CandlesManually()}
                    disabled={mt5Busy || mt5AutoRefresh.refreshInProgress || mt5RefreshRunning}
                  >
                    {mt5Busy || mt5AutoRefresh.refreshInProgress ? "Refreshing..." : "Refresh MT5 Candles"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void startMt5AutoRefreshLoop()}
                    disabled={mt5AutoRefreshBusy || mt5RefreshRunning}
                    title="Refreshes MT5 quote and candles only; it does not run AI Research."
                  >
                    {mt5RefreshRunning ? "MT5 Refresh Running" : "Start MT5 Refresh"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={stopMt5AutoRefreshLoop}
                    disabled={!mt5RefreshRunning && mt5AutoRefresh.status !== "error" && mt5AutoRefresh.status !== "paused"}
                  >
                    Stop MT5 Refresh
                  </Button>
                </div>
                <div className="mt-2 space-y-1 rounded-md border border-white/10 bg-black/20 p-2 text-[11px] leading-4 text-slate-400">
                  <p>
                    Activation target: <span className="text-slate-200">chart source and research source both set to MT5 read-only when eligible.</span>
                  </p>
                  <p>
                    Research gate: <span className="text-slate-200">{mt5ResearchActionReason}</span>
                  </p>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniReadout
                    label="MT5 refresh"
                    value={formatToken(mt5AutoRefresh.status)}
                    detail={mt5RefreshRunning ? `next ${mt5RefreshCountdown}` : mt5AutoRefresh.interval === "manual" ? "manual" : "stopped"}
                  />
                  <MiniReadout
                    label="Latest quote"
                    value={mt5LatestQuote !== undefined ? String(mt5LatestQuote) : "n/a"}
                    detail={mt5AutoRefresh.lastQuote?.timestamp ? formatDateTime(mt5AutoRefresh.lastQuote.timestamp) : "no quote yet"}
                  />
                  <MiniReadout
                    label="Last candle"
                    value={mt5AutoRefresh.lastCandleTimestamp ? formatDateTime(mt5AutoRefresh.lastCandleTimestamp) : "n/a"}
                    detail={`${mt5AutoRefresh.lastCandleCount.toLocaleString()} candles`}
                  />
                  <MiniReadout
                    label="Refresh guard"
                    value={`${mt5AutoRefresh.skippedUnchangedCount.toLocaleString()} unchanged`}
                    detail={`${mt5AutoRefresh.skippedOverlapCount.toLocaleString()} overlap skips; ${mt5AutoRefresh.failureCount.toLocaleString()} failures`}
                  />
                </div>
                <div className="mt-2 rounded-md border border-white/10 bg-black/20 p-2 text-xs text-slate-300">
                  {mt5OperationMessage}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" onClick={() => void startLoop()} disabled={busy}>
                  <Activity className="h-4 w-4" aria-hidden="true" />
                  {stoppingAutonomy ? "Stopping..." : busy ? "Research Running" : "Start Autonomous Research"}
                </Button>
                <Button variant="outline" onClick={stopLoop} disabled={!busy}>
                  {stoppingAutonomy ? "Stopping..." : "Stop Research"}
                </Button>
              </div>
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
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 transition hover:border-amber-300/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p>
                    </div>
                    <Badge
                      variant={item.severity === "critical" ? "danger" : item.severity === "action_required" || item.severity === "warning" ? "warning" : "secondary"}
                      className="shrink-0"
                    >
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
            <div className="min-w-0">
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
            <div className="min-w-0">
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
            <MiniReadout
              label="Research Ready"
              value={readinessDistinction?.researchReadyLabel ?? "no"}
              detail={runtimeSnapshot?.readiness.readinessState ?? "loading"}
            />
            <MiniReadout
              label="Paper-Demo Candidate"
              value={readinessDistinction?.paperDemoCandidateLabel ?? "no"}
              detail={readinessDistinction?.paperDemoBlocker ?? "Waiting for readiness evidence."}
            />
            <MiniReadout
              label="WF status"
              value={readinessDistinction?.walkForwardStatus ?? "unavailable"}
              detail={`${readinessDistinction?.evidenceScore ?? runtimeSnapshot?.evidence.evidenceQualityScore ?? 0}/100 evidence, ${readinessDistinction?.maturityScore ?? runtimeSnapshot?.maturity.maturityScore ?? 0}/100 maturity`}
            />
          </div>
          {readinessDistinction && !readinessDistinction.paperDemoCandidate ? (
            <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
              Paper-Demo Candidate blocked: {readinessDistinction.paperDemoBlocker}
            </div>
          ) : null}
          {readinessDistinction ? (
            <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100">
              {readinessDistinction.confidenceAdjustmentNote} {readinessDistinction.advisoryNotice} {readinessDistinction.confidenceNotice}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-slate-950/85 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Research Quality</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-50">Metrics Report</h3>
              <p className="mt-1 text-xs text-slate-500">{canonicalMetrics?.metricSourceLabel ?? "Not enough completed research data."}</p>
            </div>
            <Badge variant={canonicalMetrics ? "success" : "secondary"}>
              {canonicalMetrics ? "real latest-cycle metrics" : "awaiting data"}
            </Badge>
          </div>
          {canonicalMetrics ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MiniReadout label="Expectancy" value={formatR(canonicalMetrics.averageR)} detail="Average simulated R per trade" />
              <MiniReadout label="Profit factor" value={formatNullableNumber(canonicalMetrics.profitFactor)} detail={`Sample ${canonicalMetrics.totalTrades} trades`} />
              <MiniReadout label="Max drawdown" value={formatR(canonicalMetrics.maxDrawdownR)} detail={`Net ${formatR(canonicalMetrics.realizedR)}`} />
              <MiniReadout label="False-positive rate" value={formatPercentMetric(falsePositiveRate)} detail={`${canonicalMetrics.falsePositiveCount} estimated false positives`} />
              <MiniReadout label="Evidence" value={`${runtimeSnapshot?.evidence.evidenceQualityScore ?? 0}/100`} detail={runtimeSnapshot?.evidence.weakestEvidenceCategories[0]?.replace(/_/g, " ") ?? "ledger ready"} />
              <MiniReadout label="Maturity" value={`${runtimeSnapshot?.maturity.maturityScore ?? 0}/100`} detail={runtimeSnapshot?.maturity.maturityGrade.replace(/_/g, " ") ?? "untested"} />
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-slate-400">
              Not enough completed research data. Run an AI Research Cycle to populate expectancy, false-positive rate, evidence, maturity, and walk-forward status.
            </div>
          )}
          <div className="mt-3 rounded-lg border border-cyan-300/15 bg-cyan-300/5 p-3 text-xs text-cyan-100/80">
            Source context: {sourceContextRows.map((row) => `${row.label} ${row.value}`).join(" / ")}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/85 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Layer Contribution</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-50">ICT Foundation + Grinch Refinement</h3>
              <p className="mt-1 text-xs text-slate-500">Progressive layer contribution, not Grinch versus ICT.</p>
            </div>
            <Badge variant={layerMetrics ? "success" : "secondary"}>
              {layerMetrics ? "computed" : "awaiting runs"}
            </Badge>
          </div>
          {layerMetrics ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniReadout label="ICT foundation" value={String(layerMetrics.ictFoundationCandidates)} detail="candidate setups" />
                <MiniReadout label="Grinch-qualified" value={String(layerMetrics.grinchQualifiedCandidates)} detail="ICT setups passed refinement" />
                <MiniReadout label="Grinch-blocked" value={String(layerMetrics.grinchBlockedCandidates)} detail="invalid or low-quality setups blocked" />
                <MiniReadout label="Timing expired" value={String(layerMetrics.timingExpiredBlocks)} detail="blocked timing gate" />
                <MiniReadout label="Full-stack setups" value={String(layerMetrics.fullStackSetups)} detail={`Win ${formatPercentMetric(layerMetrics.fullStackWinRate)}`} />
                <MiniReadout label="Full-stack avg R" value={formatR(layerMetrics.fullStackAverageR)} detail="ICT + full Grinch stack" />
              </div>
              <p className="mt-3 rounded-lg border border-emerald-300/15 bg-emerald-300/5 p-3 text-xs leading-5 text-emerald-100/80">
                {safeArray(layerMetrics.layerContributionSummary).join(" ") || "Layer contribution summary pending."}
              </p>
            </>
          ) : (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-slate-400">
              Layer contribution metrics appear after Auto Research computes ICT foundation, PD/liquidity, Grinch profile, timing, entry confirmation, and full-stack setup layers.
            </div>
          )}
        </div>
      </section>

      <MissionControlDataFeed items={safeTopN(feedItems, 10)} />

      <TechnicalDetails
        title="Advanced details and drill-down controls"
        description="Open for the one-cycle research control, runtime diagnostics, source trace, and direct links to detail pages."
        onOpenChange={setDashboardAdvancedOpen}
      >
        {dashboardAdvancedOpen ? (
          <>
        <div className="space-y-4">
          <WhyNotReadyCard context="command_center" snapshot={runtimeSnapshot} />
          {researchCommitteeReport ? (
            <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Research Committee</p>
                  <h3 className="mt-1 text-base font-semibold text-slate-50">Decision Log and Reflection Memory</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    TradingAgents-inspired committee report built from deterministic GoTrader outputs only.
                  </p>
                </div>
                <Badge variant="warning">{formatToken(researchCommitteeReport.finalResearchChairSynthesis.verdict)}</Badge>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MiniReadout
                  label="Research Chair"
                  value={formatToken(researchCommitteeReport.finalResearchChairSynthesis.verdict)}
                  detail={researchCommitteeReport.finalResearchChairSynthesis.summary}
                />
                <MiniReadout
                  label="Decision ID"
                  value={researchCommitteeReport.decisionLogEntry.decisionId}
                  detail={researchCommitteeReport.decisionLogEntry.cycleId ?? "no cycle attached"}
                />
                <MiniReadout
                  label="Source"
                  value={formatToken(String(researchCommitteeReport.decisionLogEntry.source.provider))}
                  detail={`${researchCommitteeReport.decisionLogEntry.source.brokerSymbol ?? researchCommitteeReport.decisionLogEntry.source.requestedSymbol} / ${researchCommitteeReport.decisionLogEntry.source.candleCount.toLocaleString()} candles`}
                />
                <MiniReadout
                  label="Research Ready"
                  value={researchCommitteeReport.readinessDistinction.researchReadyLabel}
                  detail={researchCommitteeReport.decisionLogEntry.readiness.state}
                />
                <MiniReadout
                  label="Paper-Demo Candidate"
                  value={researchCommitteeReport.readinessDistinction.paperDemoCandidateLabel}
                  detail={researchCommitteeReport.readinessDistinction.paperDemoBlocker}
                />
                <MiniReadout
                  label="Evidence / maturity"
                  value={`${researchCommitteeReport.readinessDistinction.evidenceScore ?? 0}/100 / ${researchCommitteeReport.readinessDistinction.maturityScore ?? 0}/100`}
                  detail={`WF ${researchCommitteeReport.readinessDistinction.walkForwardStatus}`}
                />
                <MiniReadout
                  label="Risk chair"
                  value={researchCommitteeReport.riskCommittee.finalRiskChairVerdict}
                  detail={researchCommitteeReport.safetyNotice}
                />
              </div>
              <div className="mt-3 rounded-lg border border-violet-300/15 bg-violet-300/5 p-3 text-xs leading-5 text-violet-100/80">
                {researchCommitteeReport.readinessDistinction.confidenceAdjustmentNote}{" "}
                {researchCommitteeReport.readinessDistinction.advisoryNotice}{" "}
                {researchCommitteeReport.readinessDistinction.confidenceNotice}
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Bull Case</p>
                  <p className="mt-2 text-sm text-emerald-50">{researchCommitteeReport.bullCase.evidence[0]}</p>
                </div>
                <div className="rounded-lg border border-amber-300/15 bg-amber-300/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Bear Case</p>
                  <p className="mt-2 text-sm text-amber-50">{researchCommitteeReport.bearCase.evidence[0]}</p>
                </div>
                <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Reflection Memory</p>
                  <p className="mt-2 text-sm text-cyan-50">{researchCommitteeReport.reflectionMemory.whatToTestNext}</p>
                  <p className="mt-2 text-xs text-cyan-100/75">
                    Proposal support: {formatToken(researchCommitteeReport.reflectionMemory.calibrationProposalSupport.status)}.
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-400">
                Latest decision excludes candles, raw runtime snapshots, account/order/position data, secrets, raw logs, and screenshots/base64.
                Authority remains execution none, broker none, readiness override none.
              </div>
            </section>
          ) : null}
          <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">MT5 Developer Controls</p>
                <h3 className="mt-1 text-base font-semibold text-slate-50">Step-Level Source Activation</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Direct controls kept for diagnostics. The default Dashboard action should be Activate MT5 Research Mode.
                </p>
              </div>
              <Badge variant={mt5ReadOnlyRegistered ? "success" : "warning"}>{mt5ReadOnlyRegistered ? "source registered" : "not registered"}</Badge>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Button
                variant="secondary"
                onClick={() => void connectMt5ReadOnly({ activationMode: "chart_only" })}
                disabled={mt5Busy}
                className="justify-start"
              >
                <RadioTower className="h-4 w-4" aria-hidden="true" />
                Connect MT5 Read-Only only
              </Button>
              <Button
                variant="secondary"
                onClick={() => void useExistingMt5ForChart()}
                disabled={mt5Busy}
                title={mt5ChartActionReason}
              >
                Use MT5 for Chart only
              </Button>
              <Button
                variant="secondary"
                onClick={() => void useExistingMt5ForResearch()}
                disabled={mt5Busy}
                title={mt5ResearchActionReason}
              >
                Use MT5 for Research only
              </Button>
              <Button variant="outline" onClick={() => void clearMt5ReadOnlySource()} disabled={mt5Busy}>
                Clear MT5 cached candles
              </Button>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <MiniReadout label="Wrapper status" value={mt5ReadOnlyStatusLabel} detail={runtimeSnapshot?.mt5ReadOnly.bridgeUrl ?? loadMt5ReadOnlySettings().bridgeUrl} />
              <MiniReadout label="Broker symbol" value={mt5ReadOnlyBrokerSymbol} detail={`requested ${commandCenterSymbol}`} />
              <MiniReadout label="Candle status" value={`${mt5ReadOnlyCandleCount.toLocaleString()} candles`} detail={runtimeSnapshot?.mt5ReadOnly.lastTimestamp ? formatDateTime(runtimeSnapshot.mt5ReadOnly.lastTimestamp) : "no last candle"} />
              <MiniReadout label="Chart activation" value={runtimeSnapshot?.marketData.chartDisplayUsesMt5ReadOnly ? "active" : "inactive"} detail={mt5ChartActionReason} />
              <MiniReadout label="Research activation" value={runtimeSnapshot?.marketData.researchUsesMt5ReadOnly ? "active" : "inactive"} detail={mt5ResearchActionReason} />
              <MiniReadout label="Source fingerprint" value={runtimeSnapshot?.mt5ReadOnly.feedId ?? "n/a"} detail={runtimeSnapshot?.marketData.activeResearchSource.sourceId ?? "no active research source"} />
            </div>
            {mt5ActivationSteps.length ? (
              <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
                <table className="min-w-full divide-y divide-white/10 text-left text-xs">
                  <thead className="bg-white/[0.03] text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Step</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                      <th className="px-3 py-2 font-medium">Fingerprint</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-slate-300">
                    {mt5ActivationSteps.map((step) => (
                      <tr key={step.id}>
                        <td className="px-3 py-2 font-medium text-slate-100">{formatToken(step.step)}</td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={
                              step.status === "success"
                                ? "success"
                                : step.status === "failed"
                                  ? "danger"
                                  : step.status === "warning"
                                    ? "warning"
                                    : "secondary"
                            }
                          >
                            {formatToken(step.status)}
                          </Badge>
                        </td>
                        <td className="max-w-[28rem] px-3 py-2 text-slate-400">{step.detail}</td>
                        <td className="max-w-[16rem] truncate px-3 py-2 font-mono text-slate-500" title={step.sourceFingerprint}>
                          {step.sourceFingerprint ?? "n/a"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-slate-400">
                No MT5 activation run has been recorded in this page session.
              </div>
            )}
          </section>
          <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Legacy Evidence Source</p>
                <h3 className="mt-1 text-base font-semibold text-slate-50">TradingView MCP Controls</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Optional read-only chart evidence. This is not part of the default MT5-first workflow.
                </p>
              </div>
              <Badge variant={runtimeSnapshot?.tradingViewMcp.chartFeedAvailable ? "success" : "secondary"}>
                {runtimeSnapshot?.tradingViewMcp.chartFeedAvailable ? "chart evidence active" : "legacy optional"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Button onClick={() => void connectTradingViewChart()} disabled={tradingViewBusy} className="justify-start">
                <Zap className="h-4 w-4" aria-hidden="true" />
                {tradingViewBusy ? "Connecting..." : "Connect + Activate TradingView Chart"}
              </Button>
              <Button variant="secondary" onClick={() => void refreshTradingViewNow()} disabled={autoRefreshBusy}>
                {autoRefreshBusy ? "Refreshing..." : "Refresh TradingView Candles"}
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
              <Button variant="secondary" onClick={() => void startTradingViewAutoRefresh()} disabled={autoRefreshBusy || autoRefreshRunning}>
                {autoRefreshRunning ? "TV auto-refresh active" : "Start TV auto-refresh"}
              </Button>
              <Button variant="outline" onClick={() => void stopTradingViewAutoRefresh()} disabled={!autoRefreshRunning && tradingViewAutoRefresh.status !== "failed" && tradingViewAutoRefresh.status !== "paused"}>
                Stop TV auto-refresh
              </Button>
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
              <p className="font-semibold">{tradingViewBusy || autoRefreshBusy ? "TradingView working..." : "TradingView feedback"}</p>
              <p className="mt-1 leading-5">{tradingViewOperationMessage}</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-300">
                TV refresh interval
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
                TV candle limit
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
              <MiniReadout label="TV auto-refresh" value={formatToken(tradingViewAutoRefresh.status)} detail={autoRefreshRunning ? `next ${autoRefreshCountdown}` : "stopped"} />
              <MiniReadout label="TV latest price" value={tradingViewAutoRefresh.lastPrice !== undefined ? String(tradingViewAutoRefresh.lastPrice) : "n/a"} detail={tradingViewAutoRefresh.lastCandleTimestamp ? formatDateTime(tradingViewAutoRefresh.lastCandleTimestamp) : "no candle yet"} />
            </div>
          </section>
          <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">MT5 Auto-Refresh Diagnostics</p>
                <h3 className="mt-1 text-base font-semibold text-slate-50">Read-Only Current Candle Refresh</h3>
                <p className="mt-1 text-sm text-slate-400">Data refresh only. No AI Research Cycle, broker call, readiness override, or strategy threshold change is triggered.</p>
              </div>
              <Badge variant={mt5RefreshRunning ? "success" : mt5AutoRefresh.status === "error" ? "danger" : "secondary"}>
                {formatToken(mt5AutoRefresh.status)}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MiniReadout label="Interval" value={String(mt5AutoRefresh.interval)} detail={mt5RefreshRunning ? `next ${mt5RefreshCountdown}` : "not scheduled"} />
              <MiniReadout label="Refresh count" value={mt5AutoRefresh.refreshCount.toLocaleString()} detail={`failures ${mt5AutoRefresh.failureCount.toLocaleString()}`} />
              <MiniReadout label="Storage write" value={formatToken(mt5AutoRefresh.lastStorageWriteStatus)} detail={`${mt5AutoRefresh.skippedUnchangedCount.toLocaleString()} unchanged skips`} />
              <MiniReadout label="Last checked" value={mt5AutoRefresh.lastCheckedAt ? formatDateTime(mt5AutoRefresh.lastCheckedAt) : "n/a"} detail={mt5AutoRefresh.lastError ?? "no active error"} />
              <MiniReadout
                label="Manual refresh"
                value={mt5AutoRefresh.lastManualRefreshResult ? formatToken(mt5AutoRefresh.lastManualRefreshResult) : "n/a"}
                detail={mt5AutoRefresh.lastManualRefreshDurationMs !== undefined ? `${mt5AutoRefresh.lastManualRefreshDurationMs}ms` : "not run"}
              />
              <MiniReadout
                label="Manual candles"
                value={(mt5AutoRefresh.lastManualRefreshCandleCount ?? 0).toLocaleString()}
                detail={`source registered ${mt5AutoRefresh.lastManualRefreshSourceRegistered ? "yes" : "no"}`}
              />
              <MiniReadout
                label="Manual storage"
                value={mt5AutoRefresh.lastManualRefreshStorageWriteStatus ? formatToken(mt5AutoRefresh.lastManualRefreshStorageWriteStatus) : "n/a"}
                detail={mt5AutoRefresh.lastManualRefreshError ?? "no manual error"}
              />
              <MiniReadout
                label="Refresh duration"
                value={mt5AutoRefresh.lastRefreshDurationMs !== undefined ? `${mt5AutoRefresh.lastRefreshDurationMs}ms` : "n/a"}
                detail="quote/candle/normalize/store total"
              />
            </div>
            {mt5AutoRefresh.lastRefreshPhaseTimings.length ? (
              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Measured refresh phases</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {mt5AutoRefresh.lastRefreshPhaseTimings.map((timing) => (
                    <MiniReadout
                      key={`${timing.phase}-${timing.durationMs}-${timing.detail ?? ""}`}
                      label={formatToken(timing.phase)}
                      value={`${timing.durationMs}ms`}
                      detail={timing.detail ?? "measured phase"}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <p className="text-slate-500">Last fingerprint</p>
                <p className="mt-1 truncate font-mono text-slate-300" title={mt5AutoRefresh.lastCandleFingerprint}>
                  {mt5AutoRefresh.lastCandleFingerprint ?? "none"}
                </p>
              </div>
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <p className="text-slate-500">Last feed</p>
                <p className="mt-1 truncate font-mono text-slate-300" title={mt5AutoRefresh.lastFeedId}>
                  {mt5AutoRefresh.lastFeedId ?? "none"}
                </p>
              </div>
            </div>
          </section>
          {latestRun?.performanceDiagnostics ? (
            <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Autonomous Performance</p>
                  <h3 className="mt-1 text-base font-semibold text-slate-50">Loop Responsiveness Diagnostics</h3>
                  <p className="mt-1 text-sm text-slate-400">Measured loop phases, cancellation state, yielded steps, and throttled UI updates.</p>
                </div>
                <Badge variant={latestRun.performanceDiagnostics.cancellationStatus === "running" ? "warning" : "secondary"}>
                  {formatToken(latestRun.performanceDiagnostics.cancellationStatus)}
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MiniReadout label="Loop duration" value={`${latestRun.performanceDiagnostics.lastLoopDurationMs}ms`} detail="current or completed run" />
                <MiniReadout label="Current phase" value={formatToken(latestRun.performanceDiagnostics.currentPhase)} detail="latest cooperative checkpoint" />
                <MiniReadout
                  label="Slowest phase"
                  value={latestRun.performanceDiagnostics.slowestPhase ? `${latestRun.performanceDiagnostics.slowestPhase.durationMs}ms` : "n/a"}
                  detail={latestRun.performanceDiagnostics.slowestPhase ? formatToken(latestRun.performanceDiagnostics.slowestPhase.phase) : "no phase timing yet"}
                />
                <MiniReadout label="Yielded steps" value={latestRun.performanceDiagnostics.yieldedStepsCount.toLocaleString()} detail={`${latestRun.performanceDiagnostics.throttledUpdateCount.toLocaleString()} throttled UI updates`} />
                <MiniReadout label="Storage writes" value={latestRun.performanceDiagnostics.storageWriteCount.toLocaleString()} detail="autonomous checkpoints only" />
                <MiniReadout label="Source provider" value={formatToken(latestRun.performanceDiagnostics.sourceProvider)} detail={latestRun.performanceDiagnostics.sourceFingerprint ?? "no fingerprint"} />
              </div>
              {latestRun.performanceDiagnostics.skippedHeavyDiagnostics.length ? (
                <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100">
                  {latestRun.performanceDiagnostics.skippedHeavyDiagnostics.join(" ")}
                </div>
              ) : null}
              {latestRun.performanceDiagnostics.phaseTimings.length ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {latestRun.performanceDiagnostics.phaseTimings.map((timing) => (
                    <MiniReadout
                      key={`${timing.phase}-${timing.startedAt}`}
                      label={formatToken(timing.phase)}
                      value={`${timing.durationMs}ms`}
                      detail={timing.skipped ? `Skipped: ${timing.detail ?? "deferred"}` : timing.detail ?? "measured phase"}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Research Metrics Report</p>
                <h3 className="mt-1 text-base font-semibold text-slate-50">Canonical Latest-Cycle Metrics</h3>
                <p className="mt-1 text-sm text-slate-400">Jesse-inspired reporting surface using GoTrader simulation data only.</p>
              </div>
              <Badge variant={canonicalMetrics ? "success" : "secondary"}>{canonicalMetrics ? "available" : "not enough data"}</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {expandedResearchMetricRows.map((row) => (
                <MiniReadout key={row.label} label={row.label} value={row.value} detail={row.detail} />
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Layer Contribution</p>
                <h3 className="mt-1 text-base font-semibold text-slate-50">ICT Foundation to Full-Stack ICT/Grinch Setup</h3>
                <p className="mt-1 text-sm text-slate-400">Progressive qualification layers. This is not a Grinch-vs-ICT benchmark.</p>
              </div>
              <Badge variant={layerMetrics ? "success" : "secondary"}>{layerMetrics ? "computed" : "awaiting Auto Research"}</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {layerContributionRows.map((row) => (
                <MiniReadout key={row.label} label={row.label} value={row.value} detail={row.detail} />
              ))}
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
              <div className="grid grid-cols-[1.4fr_repeat(6,minmax(80px,1fr))] gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                <span>Layer</span>
                <span>Candidates</span>
                <span>Trades</span>
                <span>Win rate</span>
                <span>Avg R</span>
                <span>Max DD</span>
                <span>Readiness impact</span>
              </div>
              {benchmarkRows.length ? (
                benchmarkRows.map((layer) => (
                  <div key={layer.layerId} className="grid grid-cols-[1.4fr_repeat(6,minmax(80px,1fr))] gap-2 border-b border-white/5 px-3 py-2 text-xs text-slate-300 last:border-b-0">
                    <span className="font-medium text-slate-100">{layer.label}</span>
                    <span className="font-mono">{layer.candidates}</span>
                    <span className="font-mono">{layer.trades}</span>
                    <span className="font-mono">{layer.winRate}</span>
                    <span className="font-mono">{layer.averageR}</span>
                    <span className="font-mono">{layer.maxDrawdown}</span>
                    <span>{layer.readinessImpact}</span>
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-slate-400">
                  Benchmark matrix planned / awaiting enough research runs. Rows will remain progressive: ICT foundation only, ICT + PD/liquidity alignment, ICT + Grinch profile, ICT + Grinch timing, ICT + Grinch entry confirmation, ICT + full Grinch stack.
                </div>
              )}
            </div>
          </section>
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Monte Carlo Robustness</p>
              <h3 className="mt-1 text-base font-semibold text-slate-50">Robustness Report</h3>
              <p className="mt-1 text-sm text-slate-400">
                Planned: trade-order shuffle, drawdown distribution, losing-streak probability, and edge survival score.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniReadout label="Edge survival score" value="planned" detail="No Monte Carlo engine wired yet" />
                <MiniReadout label="5th percentile drawdown" value="planned" detail="Awaiting shuffle simulation" />
                <MiniReadout label="Losing streak probability" value="planned" detail={canonicalMetrics ? `Sample ${canonicalMetrics.totalTrades} trades` : "No sample yet"} />
                <MiniReadout label="Sample warning" value={canonicalMetrics && canonicalMetrics.totalTrades >= 30 ? "sample usable" : "sample small"} detail="Do not fabricate robustness values" />
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Risk Report</p>
              <h3 className="mt-1 text-base font-semibold text-slate-50">Research Risk Simulation Only</h3>
              <p className="mt-1 text-sm text-slate-400">No execution authority. Future paper/live risk readiness remains locked.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {riskReportRows.map((row) => (
                  <MiniReadout key={row.label} label={row.label} value={row.value} detail={row.detail} />
                ))}
              </div>
            </div>
          </section>
          <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-300">Proposal Impact Report</p>
                <h3 className="mt-1 text-base font-semibold text-slate-50">Before / After / Regression Warnings</h3>
                <p className="mt-1 text-sm text-slate-400">Proposal metrics are approval-gated simulation evidence only.</p>
              </div>
              <Badge variant={runtimeSnapshot?.proposal.latestProposal ? "warning" : "secondary"}>
                {runtimeSnapshot?.proposal.latestProposal ? formatToken(runtimeSnapshot.proposal.latestProposal.status) : "no current proposal"}
              </Badge>
            </div>
            {runtimeSnapshot?.proposal.latestProposal ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {proposalImpactRows.map((row) => (
                  <MiniReadout key={row.label} label={row.label} value={row.value} detail={row.detail} />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-slate-400">
                No current proposal available.
              </div>
            )}
          </section>
          <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Metric Source Context</p>
            <h3 className="mt-1 text-base font-semibold text-slate-50">Data Source Awareness</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {sourceContextRows.map((row) => (
                <MiniReadout key={row.label} label={row.label} value={row.value} detail={row.detail} />
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Grinch Profile Diagnostics</p>
                <h3 className="mt-1 text-base font-semibold text-slate-50">Grinch Profile Calibration Report</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Profile-specific evidence gaps and research-only candidate families. Thresholds and gates are unchanged.
                </p>
              </div>
              <Badge variant={latestGrinchScore?.noValidProfile ? "warning" : latestGrinchScore ? "success" : "secondary"}>
                {latestGrinchScore?.noValidProfile ? "no valid profile" : latestGrinchScore ? "profile scored" : "not available"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MiniReadout label="Primary finding" value={grinchProfileDiagnostics.calibrationReport.primaryFinding} detail={grinchProfileDiagnostics.calibrationReport.doNotAutoApplyNotice} />
              <MiniReadout label="Recommended first family" value={grinchProfileDiagnostics.calibrationReport.recommendedFirstFamily.replace(/_/g, " ")} detail="Research-only calibration candidate" />
              <MiniReadout label="Regime guidance" value={runtimeSnapshot?.regime.label.replace(/_/g, " ") ?? "unknown"} detail={grinchProfileDiagnostics.calibrationReport.regimeGuidance} />
              <MiniReadout label="Session-local timing" value="required" detail={grinchProfileDiagnostics.calibrationReport.sessionLocalTimeGuidance} />
            </div>
            {grinchCalibrationProposalIntent ? (
              <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Draft Proposal Intent</p>
                    <h4 className="mt-1 text-sm font-semibold text-amber-50">{grinchCalibrationProposalIntent.title}</h4>
                    <p className="mt-1 max-w-3xl text-xs text-amber-100/80">{grinchCalibrationProposalIntent.reason}</p>
                    <p className="mt-2 text-xs text-amber-100/70">
                      Current strongest near-miss: {grinchCalibrationProposalIntent.sourceProfile ?? "unknown"} /{" "}
                      {grinchCalibrationProposalIntent.nearMissScore ?? "n/a"}/100.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="warning">draft proposal only</Badge>
                    <Badge variant="muted">auto-apply blocked</Badge>
                    <Badge variant={executableStatusVariant(grinchCalibrationProposalIntent.executableStatus)}>
                      {grinchCalibrationProposalIntent.executableStatusLabel}
                    </Badge>
                    {grinchCalibrationProposalIntent.replayReview ? (
                      <Badge variant={replayReviewVariant(grinchCalibrationProposalIntent.replayReview.status)}>
                        replay {grinchCalibrationProposalIntent.replayReview.status.replace(/_/g, " ")}
                      </Badge>
                    ) : null}
                    <Link
                      to="/self-improvement"
                      className="inline-flex h-8 items-center justify-center rounded-md border border-amber-300/30 bg-amber-300/10 px-3 text-xs font-medium text-amber-50 transition-colors hover:bg-amber-300/15"
                    >
                      Open Self-Improvement
                    </Link>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs md:grid-cols-5">
                  {grinchCalibrationProposalIntent.requiredValidationSteps.map((step) => (
                    <div key={step.requirementId} className="rounded-md border border-amber-300/15 bg-slate-950/35 p-2">
                      <p className="font-medium text-amber-100">{step.label}</p>
                      <p className="mt-1 text-slate-400">{step.status}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                  <div className="rounded-md border border-amber-300/15 bg-slate-950/35 p-2">
                    <p className="font-medium text-amber-100">Executable awareness</p>
                    <p className="mt-1 text-slate-300">{grinchCalibrationProposalIntent.executableStatusReason}</p>
                    <p className="mt-1 text-slate-400">
                      {grinchCalibrationProposalIntent.executableStatus === "executable"
                        ? `Mapped Auto Research families: ${grinchCalibrationProposalIntent.executableAutoResearchFamilies.map(formatToken).join(", ")}.`
                        : "Draft only: candidate family is not executable by Auto Research yet."}
                    </p>
                    <p className="mt-1 text-amber-100/80">{grinchCalibrationProposalIntent.nextImplementationStep}</p>
                  </div>
                  {grinchCalibrationProposalIntent.replayReview ? (
                    <div className="rounded-md border border-amber-300/15 bg-slate-950/35 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-amber-100">Expansion replay review</p>
                        <Badge variant={replayReviewVariant(grinchCalibrationProposalIntent.replayReview.status)}>
                          {grinchCalibrationProposalIntent.replayReview.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-slate-300">
                        Replay evidence reviewed: {grinchCalibrationProposalIntent.replayReview.reviewed ? "yes" : "no"}.
                        Failed rule: {grinchCalibrationProposalIntent.replayReview.failedRule?.replace(/_/g, " ") ?? "none"}.
                        Near miss: {grinchCalibrationProposalIntent.replayReview.nearMissScore ?? "n/a"}/100.
                      </p>
                      <p className="mt-1 text-slate-400">{grinchCalibrationProposalIntent.replayReview.failureReason}</p>
                      <p className="mt-1 text-amber-100/80">{grinchCalibrationProposalIntent.replayReview.recommendation}</p>
                    </div>
                  ) : null}
                  <div className="rounded-md border border-amber-300/15 bg-slate-950/35 p-2">
                    <p className="font-medium text-amber-100">Report/source fingerprint</p>
                    <p className="mt-1 truncate font-mono text-slate-300" title={grinchCalibrationProposalIntent.reportFingerprint}>
                      {grinchCalibrationProposalIntent.reportFingerprint}
                    </p>
                    <p className="mt-1 truncate font-mono text-slate-400" title={grinchCalibrationProposalIntent.sourceFingerprint}>
                      {grinchCalibrationProposalIntent.sourceFingerprint ?? "unknown source"}
                    </p>
                    <p className="mt-1 text-slate-400">Generated {formatDateTime(grinchCalibrationProposalIntent.generatedAt)}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-amber-100/75">
                  Target subsystem: {grinchCalibrationProposalIntent.targetSubsystem}. Candidate family:{" "}
                  {grinchCalibrationProposalIntent.candidateFamily.replace(/_/g, " ")}. Authority remains none.
                </p>
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MiniReadout label="Hard gate" value={grinchProfileDiagnostics.hardGateReason} detail={grinchProfileDiagnostics.noValidProfileReason} />
              <MiniReadout label="Timing status" value={latestGrinchScore?.timingGrade?.replace(/_/g, " ") ?? "unknown"} detail={grinchProfileDiagnostics.timingWindowStatus} />
              <MiniReadout label="Candidate counts" value={grinchProfileDiagnostics.candidateSummary} detail={`No-valid-profile signals ${grinchProfileDiagnostics.noValidProfileCount.toLocaleString()}`} />
              <MiniReadout
                label="Session timing"
                value={runtimeSnapshot?.latestResearchCycle.grinchPhase1Summary?.sessionTimeMapping?.timingZone ?? "literal timestamp"}
                detail={grinchProfileDiagnostics.sessionTimezoneAssumption}
              />
              {grinchProfileDiagnostics.openingReferences.map((reference) => (
                <MiniReadout
                  key={reference.label}
                  label={`${reference.label} timestamp`}
                  value={reference.timestamp}
                  detail={`Local ${reference.localTimestamp}; price ${reference.price}; relation ${reference.relation}; fallback ${reference.fallbackMethod}; source zone ${reference.sourceTimestampZone}; ${reference.missingEvidence[0] ?? "reference available"}`}
                />
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-amber-300/15 bg-slate-950/45 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Timing / Expansion Replay</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Diagnostic-only replay of the Reversal expansion gate. Opening-price lines and replay markers appear on the Dashboard chart when candle timestamps are available.
                  </p>
                </div>
                <Badge variant={expansionReplay.expansionTest.failedRule === "passed_diagnostic_check" ? "success" : "warning"}>
                  {expansionReplay.expansionTest.failedRule.replace(/_/g, " ")}
                </Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MiniReadout
                  label="12AM Open"
                  value={expansionReplay.twelveAmOpen.rawTimestamp}
                  detail={`Local ${expansionReplay.twelveAmOpen.localTimestamp}; price ${
                    typeof expansionReplay.twelveAmOpen.price === "number" ? expansionReplay.twelveAmOpen.price.toFixed(2) : "not found"
                  }; fallback ${expansionReplay.twelveAmOpen.fallbackMethod}.`}
                />
                <MiniReadout
                  label="Sunday Open"
                  value={expansionReplay.sundayOpen.rawTimestamp}
                  detail={`Local ${expansionReplay.sundayOpen.localTimestamp}; price ${
                    typeof expansionReplay.sundayOpen.price === "number" ? expansionReplay.sundayOpen.price.toFixed(2) : "not found"
                  }; fallback ${expansionReplay.sundayOpen.fallbackMethod}.`}
                />
                <MiniReadout
                  label="London interaction"
                  value={`${expansionReplay.londonInteraction.candleCount.toLocaleString()} candles / ${expansionReplay.londonInteraction.relationTo12am}`}
                  detail={`${expansionReplay.londonInteraction.windowStartLocal}-${expansionReplay.londonInteraction.windowEndLocal}; interacted ${
                    expansionReplay.londonInteraction.interacted ? "yes" : "no"
                  }; ${expansionReplay.londonInteraction.interactionTimestamps.join(" / ") || "no exact interaction candle"}.`}
                />
                <MiniReadout
                  label="Expansion window"
                  value={`${expansionReplay.expansionWindow.evaluatedCandleCount.toLocaleString()} candles`}
                  detail={`Timing date ${expansionReplay.timingDate}; ${expansionReplay.expansionWindow.windowStartLocal}-${expansionReplay.expansionWindow.windowEndLocal}; first ${
                    expansionReplay.expansionWindow.firstLocalTimestamp ?? "n/a"
                  }; last ${expansionReplay.expansionWindow.lastLocalTimestamp ?? "n/a"}.`}
                />
                <MiniReadout
                  label="Expected direction"
                  value={expansionReplay.expansionTest.expectedDirection.replace(/_/g, " ")}
                  detail={`Distance ${expansionReplay.expansionTest.expansionDistance.toFixed(2)} vs required ${expansionReplay.expansionTest.requiredExpansionDistance.toFixed(
                    2
                  )}; pass ${formatBool(expansionReplay.expansionTest.distancePass)}.`}
                />
                <MiniReadout
                  label="Displacement / chop"
                  value={`${expansionReplay.expansionTest.displacementScore}/100 / ${expansionReplay.expansionTest.chopScore}/100`}
                  detail={`Clean side ${formatBool(expansionReplay.expansionTest.cleanSideMaintained)}; near miss ${expansionReplay.nearMissScore}/100.`}
                />
                <MiniReadout
                  label="Failure reason"
                  value={expansionReplay.expansionTest.failureReason}
                  detail={expansionReplay.recommendation}
                />
                <MiniReadout
                  label="Overlay support"
                  value={expansionReplay.overlaySummary.candidateMarkers ? "markers available" : "no markers"}
                  detail={expansionReplay.overlaySummary.note}
                />
              </div>
              <div className="mt-3 overflow-x-auto rounded-lg border border-amber-300/10">
                <table className="min-w-full divide-y divide-amber-300/10 text-left text-xs">
                  <thead className="bg-amber-300/10 text-amber-100">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Role</th>
                      <th className="px-3 py-2 font-semibold">Local time</th>
                      <th className="px-3 py-2 font-semibold">Raw timestamp</th>
                      <th className="px-3 py-2 font-semibold">O/H/L/C</th>
                      <th className="px-3 py-2 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-300/10 bg-slate-950/35 text-slate-300">
                    {expansionReplay.candidateCandles.length ? (
                      expansionReplay.candidateCandles.map((candle) => (
                        <tr key={`${candle.role}-${candle.rawTimestamp}`}>
                          <td className="px-3 py-2 font-semibold text-slate-100">{candle.role.replace(/_/g, " ")}</td>
                          <td className="px-3 py-2">{candle.localTimestamp}</td>
                          <td className="px-3 py-2 font-mono">{candle.rawTimestamp}</td>
                          <td className="px-3 py-2 font-mono">
                            {candle.open.toFixed(2)} / {candle.high.toFixed(2)} / {candle.low.toFixed(2)} / {candle.close.toFixed(2)}
                          </td>
                          <td className="px-3 py-2">{candle.reason}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-4 text-slate-400" colSpan={5}>
                          No replay candidate candles were available in this window.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-amber-100/75">{expansionReplay.safetyNotice}</p>
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border border-amber-300/15">
              <table className="min-w-full divide-y divide-amber-300/10 text-left text-xs">
                <thead className="bg-amber-300/10 text-amber-100">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Profile</th>
                    <th className="px-3 py-2 font-semibold">Profile evidence</th>
                    <th className="px-3 py-2 font-semibold">Timing status</th>
                    <th className="px-3 py-2 font-semibold">Missing conditions</th>
                    <th className="px-3 py-2 font-semibold">Near miss</th>
                    <th className="px-3 py-2 font-semibold">First failed gate</th>
                    <th className="px-3 py-2 font-semibold">Candidates</th>
                    <th className="px-3 py-2 font-semibold">Calibration family</th>
                    <th className="px-3 py-2 font-semibold">Do-not-change notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-300/10 bg-slate-950/35 text-slate-300">
                  {grinchProfileDiagnostics.calibrationReport.rows.map((row) => {
                    return (
                      <tr key={row.profile}>
                        <td className="px-3 py-2 font-semibold text-slate-100">{row.label}</td>
                        <td className="px-3 py-2">{row.profileEvidence}</td>
                        <td className="px-3 py-2">{row.timingStatus}</td>
                        <td className="px-3 py-2">{row.missingConditions.join(" / ") || "No missing conditions listed."}</td>
                        <td className="px-3 py-2 font-mono">{row.nearMissScore}/100</td>
                        <td className="px-3 py-2">{row.firstFailedGate.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2 font-mono">{row.candidateCount.toLocaleString()}</td>
                        <td className="px-3 py-2">{row.recommendedCalibrationFamily.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2">{row.doNotChangeNotes.join(" / ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/10 p-3 text-xs text-amber-100">
              {grinchProfileDiagnostics.calibrationReport.timingWindowAssessment}
            </div>
          </section>
          <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Dashboard Performance</p>
                <h3 className="mt-1 text-base font-semibold text-slate-50">Chart Stability Diagnostics</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Chart remounts are avoided unless the source identity changes; candle data updates follow the data fingerprint.
                </p>
              </div>
              <Badge variant={commandCenterChart ? "success" : "secondary"}>{commandCenterChart ? "chart source resolved" : "no chart source"}</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MiniReadout label="Dashboard renders" value={dashboardRenderCount.current.toLocaleString()} detail="Diagnostic render counter" />
              <MiniReadout label="Chart source identity" value={commandCenterChartIdentity} detail="Provider / symbol / timeframe" />
              <MiniReadout label="Candle fingerprint" value={shortCommandCenterChartFingerprint} detail={commandCenterChart?.source.lastTimestamp ? `Last candle ${formatDateTime(commandCenterChart.source.lastTimestamp)}` : "No candle timestamp"} />
              <MiniReadout label="Chart candles" value={(commandCenterChart?.source.candleCount ?? 0).toLocaleString()} detail={commandCenterChart?.source.sourceLabel ?? "No active chart"} />
              <MiniReadout label="TV auto-refresh" value={formatToken(tradingViewAutoRefresh.status)} detail={`Interval ${tradingViewAutoRefresh.refreshIntervalSeconds}s; limit ${tradingViewAutoRefresh.candleLimit}`} />
              <MiniReadout label="Refresh in progress" value={tradingViewAutoRefresh.refreshInProgress ? "yes" : "no"} detail={`Skipped overlaps ${tradingViewAutoRefresh.skippedRefreshCount.toLocaleString()}`} />
              <MiniReadout label="Last checked" value={tradingViewAutoRefresh.lastCheckedAt ? formatDateTime(tradingViewAutoRefresh.lastCheckedAt) : "none"} detail={tradingViewAutoRefresh.lastRefreshAt ? `Last refresh ${formatDateTime(tradingViewAutoRefresh.lastRefreshAt)}` : "No successful refresh"} />
              <MiniReadout label="Storage write" value={tradingViewAutoRefresh.lastStorageWriteSkipped ? "skipped unchanged" : "write allowed"} detail={tradingViewAutoRefresh.lastStorageWriteSkippedAt ? formatDateTime(tradingViewAutoRefresh.lastStorageWriteSkippedAt) : "No skip recorded"} />
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Runtime snapshot timings</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {dashboardPerformanceMarks.length ? (
                    dashboardPerformanceMarks.slice(0, 6).map((mark) => (
                      <MiniReadout
                        key={`${mark.phase}-${mark.timestamp}`}
                        label={formatToken(mark.phase)}
                        value={`${mark.durationMs}ms`}
                        detail={mark.detail ?? mark.timestamp}
                      />
                    ))
                  ) : (
                    <MiniReadout label="Runtime snapshot" value="n/a" detail="No measured runtime refresh yet" />
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Chart update timings</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {chartPerformanceMarks.length ? (
                    chartPerformanceMarks.slice(0, 6).map((mark) => (
                      <MiniReadout
                        key={`${mark.phase}-${mark.timestamp}`}
                        label={formatToken(mark.phase)}
                        value={`${mark.durationMs}ms`}
                        detail={mark.detail ?? `${mark.candleCount ?? 0} candles`}
                      />
                    ))
                  ) : (
                    <MiniReadout label="Chart update" value="n/a" detail="No chart timing event yet" />
                  )}
                </div>
              </div>
            </div>
          </section>
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
              "TradingView depth",
              runtimeSnapshot?.tradingViewMcp.chartFeedRequestedLimit
                ? `${runtimeSnapshot.tradingViewMcp.chartFeedCandleCount.toLocaleString()} of ${runtimeSnapshot.tradingViewMcp.chartFeedRequestedLimit.toLocaleString()} requested / ${formatToken(runtimeSnapshot.tradingViewMcp.chartFeedDepthStatus)} / minimum ${runtimeSnapshot.tradingViewMcp.chartFeedResearchMinimumCandles ?? 400}`
                : "not requested"
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
              "Backtest source default",
              `${activeResearchSourceLabel}; Backtest Lab uses this active canonical source by default and labels imported/mock overrides explicitly.`
            ],
            [
              "Replay source default",
              `${activeResearchSourceLabel}; Replay Lab creates a frozen snapshot from active source. Fingerprint ${activeResearchSourceFingerprint}.`
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
              <Badge variant="warning">MT5 read-only {mt5ReadOnlyStatusLabel}</Badge>
              <Badge variant="warning">MT5 execution {mt5ExecutionAdapterPlan.status.replace(/_/g, " ")}</Badge>
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
          </>
        ) : (
          <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4 text-sm text-slate-400">
            Advanced diagnostics are deferred until opened so MT5 refresh can keep the Dashboard responsive. Compact MT5 refresh status,
            chart source, research source, and safety locks remain visible above.
          </div>
        )}
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
  const canonicalMt5Source = canonicalMt5SourceFrom(snapshot);
  const mt5ResearchEligible = mt5ResearchEligibleFrom(snapshot);
  const mt5IsActive =
    snapshot.marketData.chartDisplayUsesMt5ReadOnly ||
    snapshot.marketData.researchUsesMt5ReadOnly ||
    Boolean(canonicalMt5Source);
  const tradingViewIsSelected =
    snapshot.marketData.chartDisplayUsesTradingViewMcp || snapshot.marketData.researchUsesTradingViewMcp;
  if (!snapshot.marketData.isImportedDataActive) {
    items.push({
      id: "imported-data",
      title: "Imported source inactive",
      detail: mt5IsActive
        ? "Imported historical source inactive; not required for MT5 read-only research unless you are running imported MNQ comparison or deep historical walk-forward."
        : `Not valid for imported MNQ comparison. ${snapshot.marketData.importedDataMessage}`,
      href: "/market-data",
      severity: mt5IsActive ? "info" : "warning"
    });
  }
  if (!canonicalMt5Source && snapshot.marketData.activeDataSource === "mock") {
    items.push({
      id: "mt5-readonly-inactive",
      title: "MT5 read-only inactive",
      detail: "Connect MT5 Read-Only from Command Center to load broker CFD/proxy candles for chart and guarded research use.",
      severity: "action_required"
    });
  }
  if (snapshot.marketData.researchUsesMt5ReadOnly && !mt5ResearchEligible) {
    items.push({
      id: "mt5-research-guarded",
      title: "MT5 research source guarded",
      detail: mt5ResearchEligibilityReasonFrom(snapshot),
      href: "/market-data",
      severity: "warning"
    });
  }
  if (tradingViewIsSelected && snapshot.tradingViewMcp.bridgeStatus !== "connected_analysis_only") {
    items.push({
      id: "tradingview-disconnected",
      title: "TradingView MCP disconnected",
      detail: "Start the local wrapper, then use Connect + Activate TradingView Chart from Command Center.",
      severity: "action_required"
    });
  } else if (tradingViewIsSelected && !snapshot.tradingViewMcp.chartFeedAvailable) {
    items.push({
      id: "tradingview-no-candles",
      title: "Chart feed inactive",
      detail: "Fetch TradingView MCP candles before using the chart feed.",
      severity: "action_required"
    });
  }
  if (
    tradingViewIsSelected &&
    snapshot.tradingViewMcp.chartFeedAvailable &&
    snapshot.tradingViewMcp.researchEligibility !== "eligible_for_research_cycle"
  ) {
    items.push({
      id: "tradingview-research-guarded",
      title: "Research source not eligible",
      detail:
        snapshot.tradingViewMcp.chartFeedDepthWarning ??
        snapshot.tradingViewMcp.eligibilityReasons[0] ??
        "TradingView MCP is visual-only until source gates pass.",
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
    const sourceSummary = snapshot.marketData.researchUsesMt5ReadOnly
      ? `Research source is MT5 read-only with ${snapshot.mt5ReadOnly.candleCount.toLocaleString()} candles. ${
          snapshot.regime.dataQuality === "limited" || snapshot.regime.dataQuality === "insufficient"
            ? "Regime evidence limited: MT5 candles available, macro/intermarket confirmation missing."
            : `Current regime ${snapshot.regime.label.replace(/_/g, " ")} at ${Math.round(snapshot.regime.confidence * 100)}%.`
        }`
      : undefined;
    items.unshift({
      id: "regime-mismatch",
      title: "Regime mismatch paused loop",
      detail: [run.stopReasonDetail ?? "Human review required before additional calibration search.", sourceSummary]
        .filter(Boolean)
        .join(" "),
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
  const showTradingViewRuntimeItem = Boolean(
    snapshot?.marketData.chartDisplayUsesTradingViewMcp ||
      snapshot?.marketData.researchUsesTradingViewMcp ||
      snapshot?.tradingViewMcp.chartFeedAvailable
  );
  const runtimeItems: MissionFeedItem[] = snapshot
    ? [
        {
          id: "runtime-mt5-status",
          title: `MT5 read-only ${snapshot.mt5ReadOnly.connectionStatus.replace(/_/g, " ")}`,
          detail: snapshot.mt5ReadOnly.candleFeedAvailable
            ? `${snapshot.mt5ReadOnly.candleCount.toLocaleString()} ${snapshot.mt5ReadOnly.timeframe ?? ""} candles from ${snapshot.mt5ReadOnly.brokerSymbol ?? snapshot.mt5ReadOnly.feedSymbol ?? "broker symbol"} for requested ${snapshot.marketData.symbol}.`
            : "MT5 read-only candle feed is not active.",
          timestamp: snapshot.generatedAt,
          severity: snapshot.mt5ReadOnly.candleFeedAvailable ? "success" : "warning",
          sourceFingerprint: snapshot.mt5ReadOnly.feedId ?? snapshot.mt5ReadOnly.brokerSymbol ?? snapshot.mt5ReadOnly.bridgeUrl
        },
        ...(showTradingViewRuntimeItem
          ? [
              {
                id: "runtime-tv-status",
                title: `TradingView MCP ${snapshot.tradingViewMcp.bridgeStatus.replace(/_/g, " ")}`,
                detail: snapshot.tradingViewMcp.chartFeedAvailable
                  ? `${snapshot.tradingViewMcp.chartFeedCandleCount.toLocaleString()} read-only candles available for chart display.${
                      snapshot.tradingViewMcp.chartFeedRequestedLimit
                        ? ` Requested ${snapshot.tradingViewMcp.chartFeedRequestedLimit.toLocaleString()}; depth ${formatToken(snapshot.tradingViewMcp.chartFeedDepthStatus)}.`
                        : ""
                    }`
                  : "TradingView MCP chart feed is not active.",
                timestamp: snapshot.generatedAt,
                severity: snapshot.tradingViewMcp.bridgeStatus === "connected_analysis_only" ? "success" : "warning",
                sourceFingerprint: snapshot.tradingViewMcp.chartFeedSymbol ?? snapshot.tradingViewMcp.bridgeUrl
              } satisfies MissionFeedItem
            ]
          : []),
        {
          id: "runtime-chart-source",
          title: "Chart source status",
          detail: `${snapshot.marketData.activeChartDisplaySourceLabel}. Research source: ${snapshot.marketData.activeResearchSourceLabel}.`,
          timestamp: snapshot.generatedAt,
          severity: snapshot.marketData.chartDisplayUsesTradingViewMcp || snapshot.marketData.chartDisplayUsesMt5ReadOnly ? "success" : "info",
          sourceFingerprint: snapshot.marketData.chartDisplayDataFingerprint.slice(0, 96)
        },
        {
          id: "runtime-research-eligibility",
          title:
            snapshot.marketData.researchUsesMt5ReadOnly || snapshot.mt5ReadOnly.researchEligibility === "eligible_for_research_cycle"
              ? snapshot.mt5ReadOnly.researchEligibility === "eligible_for_research_cycle"
                ? "MT5 research eligibility passed"
                : "MT5 research eligibility guarded"
              : showTradingViewRuntimeItem && snapshot.tradingViewMcp.researchEligibility === "eligible_for_research_cycle"
                ? "TradingView research eligibility passed"
                : "MT5 research eligibility guarded",
          detail:
            snapshot.marketData.researchUsesMt5ReadOnly || snapshot.mt5ReadOnly.researchEligibility === "eligible_for_research_cycle"
              ? snapshot.mt5ReadOnly.eligibilityReasons[0] ?? "MT5 read-only source gate is pending."
              : showTradingViewRuntimeItem
                ? snapshot.tradingViewMcp.eligibilityReasons[0] ?? "TradingView MCP source gate is pending."
                : snapshot.mt5ReadOnly.eligibilityReasons[0] ?? "Connect MT5 Read-Only to evaluate the primary research source gate.",
          timestamp: snapshot.generatedAt,
          severity:
            snapshot.mt5ReadOnly.researchEligibility === "eligible_for_research_cycle" ||
            (showTradingViewRuntimeItem && snapshot.tradingViewMcp.researchEligibility === "eligible_for_research_cycle")
              ? "success"
              : "warning",
          sourceFingerprint:
            snapshot.marketData.researchUsesMt5ReadOnly || snapshot.mt5ReadOnly.researchEligibility === "eligible_for_research_cycle"
              ? snapshot.mt5ReadOnly.researchEligibility
              : showTradingViewRuntimeItem
                ? snapshot.tradingViewMcp.researchEligibility
                : snapshot.mt5ReadOnly.researchEligibility
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
  if (snapshot.marketData.chartDisplayUsesMt5ReadOnly || snapshot.marketData.activeChartSource.provider === "mt5_read_only") return "MT5 Read-Only";
  if (snapshot.marketData.chartDisplayUsesTradingViewMcp) return "TradingView MCP";
  if (snapshot.marketData.activeChartDisplaySourceLabel.toLowerCase().includes("import")) return "Imported";
  if (snapshot.marketData.activeChartDisplaySourceLabel.toLowerCase().includes("mock")) return "Mock";
  return snapshot.marketData.activeChartDisplaySourceLabel;
}

function getResearchSourceShortLabel(snapshot?: ResearchRuntimeSnapshot) {
  if (!snapshot) return "loading";
  if (snapshot.marketData.researchUsesMt5ReadOnly || snapshot.marketData.activeResearchSource.provider === "mt5_read_only") return "MT5 Read-Only";
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
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2">
      <span className="truncate text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <Badge variant={tone} className="min-w-0 shrink-0 capitalize">
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
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 truncate font-mono text-sm text-slate-100">{value}</div>
      {detail ? <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div> : null}
    </div>
  );
}
