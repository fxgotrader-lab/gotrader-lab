import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { BarChart3, DatabaseZap, FileSpreadsheet, RadioTower, ShieldCheck, Upload } from "lucide-react";

import { TradingChart } from "@/components/charts/TradingChart";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  buildMarketContext,
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  getActiveImportedCandleSetId,
  importedDataPresetSettings,
  importHistoricalCandleFile,
  importNormalizedHistoricalCandleArtifact,
  listImportedCandleMetadata,
  loadCandleWindowSettings,
  loadPreparedCandleSource,
  MARKET_DATA_IMPORT_UPDATED_EVENT,
  createCandleSourceIdentity,
  resolveChartDisplayCandleSource,
  resolveLiveMarketDataStatus,
  saveImportedCandleSet,
  setActiveImportedCandleSet,
  safeWindowSizeOptions,
  saveCandleWindowSettings,
  type CandleWindowSettings,
  type CandleSourceIdentity,
  type ImportedCandleMetadata,
  type NormalizedHistoricalCandleArtifact,
  type PreparedCandleSource
} from "@/lib/marketData";
import { buildVwapOverlay, createTradingChartData } from "@/lib/charting";
import {
  checkAndStoreTradingViewMcpStatus,
  clearTradingViewMcpChartFeedCache,
  createActiveTradingViewMcpChartFeed,
  fetchAndStoreTradingViewMcpChartFeed,
  fetchTradingViewMcpCandles,
  fetchTradingViewMcpQuote,
  hydrateActiveTradingViewMcpChartFeed,
  loadActiveTradingViewMcpChartFeed,
  loadTradingViewMcpAutoRefreshState,
  loadTradingViewMcpSettings,
  resolveTradingViewMcpRuntimeState,
  saveTradingViewMcpSettings,
  storeActiveTradingViewMcpChartFeed,
  TRADINGVIEW_MCP_AUTO_REFRESH_UPDATED_EVENT,
  TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT,
  TRADINGVIEW_MCP_EVIDENCE_UPDATED_EVENT,
  TRADINGVIEW_MCP_SETTINGS_UPDATED_EVENT,
  type ActiveTradingViewMcpChartFeed,
  type TradingViewMcpCandlesResponse,
  type TradingViewMcpQuoteResponse
} from "@/lib/integrations/tradingview";
import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";

const symbolOptions = ["ES", "NQ", "MES", "MNQ"].map((value) => ({ label: value, value }));
const timeframeOptions = ["1m", "5m", "15m", "1h"].map((value) => ({ label: value, value }));
const tradingViewCandleLimitOptions = [100, 240, 400, 1000].map((value) => ({
  label: `${value.toLocaleString()} candles`,
  value: String(value)
}));
const researchTimeframeOptions = ["1m", "5m", "15m"].map((value) => ({ label: value, value }));
const windowSizeOptions = [
  ...safeWindowSizeOptions.map((value) => ({ label: `${value.toLocaleString()} candles`, value: String(value) })),
  { label: "Custom", value: "custom" }
];

const statusVariant = (status: string) =>
  status === "available_mock" || status === "mock_only"
    ? "success"
    : status === "later_advanced"
      ? "warning"
      : status === "missing"
        ? "danger"
        : "secondary";

const fallbackSource: PreparedCandleSource = {
  mode: "mock",
  label: "Mock candles",
  candles: [],
  rawCandleCount: 0,
  researchWindowCandles: 0,
  processedCandleCount: 0,
  estimatedProcessedCandles: 0,
  appliedSettings: loadCandleWindowSettings(),
  aggregationApplied: false,
  performanceMode: "safe",
  warnings: []
};

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : "n/a");
const formatToken = (value?: string) => (value ?? "not loaded").replace(/_/g, " ");
const localNormalizedMnqArtifactUrl = "/local-imports/MNQ_06-26_OHLCV.normalized.json";
const localDevImportAvailable =
  typeof window !== "undefined" && ["127.0.0.1", "localhost"].includes(window.location.hostname);

interface ChartSourceVerification {
  actualChartInput: CandleSourceIdentity;
  equalsImportedSource: boolean;
  equalsTradingViewMcpSource: boolean;
  expectedChartDisplay: CandleSourceIdentity;
  importedSource: CandleSourceIdentity;
  tradingViewMcpSource: CandleSourceIdentity;
  verifiedAt: string;
}

const sameCandleSeries = (left: CandleSourceIdentity, right: CandleSourceIdentity) =>
  left.candleCount > 0 &&
  left.candleCount === right.candleCount &&
  left.firstTimestamp === right.firstTimestamp &&
  left.lastTimestamp === right.lastTimestamp &&
  left.firstClose === right.firstClose &&
  left.lastClose === right.lastClose;

export function MarketDataView() {
  const [symbol, setSymbol] = useState<FuturesSymbol>("NQ");
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [imports, setImports] = useState<ImportedCandleMetadata[]>([]);
  const [activeImportId, setActiveImportId] = useState<string>();
  const [activeSource, setActiveSource] = useState<PreparedCandleSource>(fallbackSource);
  const [windowSettings, setWindowSettings] = useState<CandleWindowSettings>(() => loadCandleWindowSettings());
  const [importMessage, setImportMessage] = useState<string>();
  const [importError, setImportError] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [tradingViewFeed, setTradingViewFeed] = useState<ActiveTradingViewMcpChartFeed | undefined>(() =>
    loadActiveTradingViewMcpChartFeed()
  );
  const [tradingViewQuote, setTradingViewQuote] = useState<TradingViewMcpQuoteResponse | undefined>();
  const [tradingViewCandles, setTradingViewCandles] = useState<TradingViewMcpCandlesResponse | undefined>();
  const [tradingViewRuntime, setTradingViewRuntime] = useState(() => resolveTradingViewMcpRuntimeState());
  const [tradingViewAutoRefresh, setTradingViewAutoRefresh] = useState(() => loadTradingViewMcpAutoRefreshState());
  const [tradingViewFeedMessage, setTradingViewFeedMessage] = useState<string>();
  const [tradingViewConnecting, setTradingViewConnecting] = useState(false);
  const [tradingViewCandleLimit, setTradingViewCandleLimit] = useState("240");
  const [chartVerification, setChartVerification] = useState<ChartSourceVerification>();
  const contextSymbol = activeSource.metadata?.symbol ?? symbol;
  const contextTimeframe = activeSource.mode === "imported" ? activeSource.appliedSettings.targetTimeframe : timeframe;
  const context = useMemo(
    () =>
      buildMarketContext({
        symbol: contextSymbol,
        timeframe: contextTimeframe,
        mode: activeSource.mode === "imported" ? "imported" : "mock",
        candles: activeSource.candles
      }),
    [activeSource, contextSymbol, contextTimeframe]
  );
  const displaySource = useMemo(() => resolveChartDisplayCandleSource(activeSource, tradingViewFeed), [activeSource, tradingViewFeed]);
  const chartDisplayCandles = displaySource.activeChartDisplayCandleSource.slice(-240);
  const previewChartData = useMemo(() => {
    const usingTradingView = displaySource.chartDisplayUsesTradingViewMcp;
    const candles = chartDisplayCandles;
    const vwap = buildVwapOverlay(candles);
    return {
      ...createTradingChartData({
        candles,
        sourceLabel: displaySource.activeChartDisplaySourceLabel,
        sourceType: displaySource.activeChartDisplaySourceMode,
        symbol: usingTradingView ? tradingViewFeed?.providerSymbol ?? contextSymbol : contextSymbol,
        timeframe: usingTradingView ? tradingViewFeed?.timeframe ?? contextTimeframe : contextTimeframe
      }),
      lineOverlays: vwap ? [vwap] : [],
      stateLabel: "Data preview"
    };
  }, [chartDisplayCandles, contextSymbol, contextTimeframe, displaySource, tradingViewFeed]);
  const importOptions = [
    { label: "Mock candles", value: "mock" },
    ...imports.map((item) => ({
      label: `${item.sourceLabel} - ${item.candleCount.toLocaleString()} candles`,
      value: item.importId
    }))
  ];
  const latestImport = imports[0];
  const activeImportIsStale = Boolean(activeImportId && !imports.some((item) => item.importId === activeImportId));
  const importedDatasetsNeedActivation = imports.length > 0 && activeSource.mode !== "imported";
  const liveMarketDataStatus = useMemo(() => resolveLiveMarketDataStatus(activeSource, tradingViewFeed), [activeSource, tradingViewFeed]);
  const tradingViewCandidateFeed = useMemo(
    () =>
      tradingViewCandles
        ? createActiveTradingViewMcpChartFeed({
            candlesResponse: tradingViewCandles,
            gotraderSymbol: symbol,
            gotraderTimeframe: timeframe,
            usageMode: "research_source"
          })
        : undefined,
    [symbol, timeframe, tradingViewCandles]
  );
  const tradingViewEligibility = tradingViewCandidateFeed?.researchEligibility ?? tradingViewFeed?.researchEligibility;
  const tradingViewEligibilityReasons = tradingViewEligibility?.reasons ?? ["Fetch candles to evaluate research eligibility."];
  const tradingViewResearchSourceEligible = tradingViewEligibility?.state === "eligible_for_research_cycle";
  const selectedTradingViewCandleLimit = Number(tradingViewCandleLimit);
  const tradingViewDisplayLimit = Number.isFinite(selectedTradingViewCandleLimit) ? selectedTradingViewCandleLimit : 240;
  const tradingViewCandlesLoaded = Boolean((tradingViewCandles?.candleCount ?? 0) > 0 || tradingViewRuntime.chartFeedCandleCount > 0);
  const tradingViewLoadedButChartImported = tradingViewCandlesLoaded && !displaySource.chartDisplayUsesTradingViewMcp;

  const refreshImports = async () => {
    const settings = loadCandleWindowSettings();
    const [metadata, source] = await Promise.all([listImportedCandleMetadata(), loadPreparedCandleSource(settings)]);
    setImports(metadata);
    setActiveImportId(getActiveImportedCandleSetId());
    setWindowSettings(settings);
    setActiveSource(source);
    if (source.metadata) {
      setSymbol(source.metadata.symbol);
      if (source.metadata.timeframe) {
        setTimeframe(source.metadata.timeframe);
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      refreshImports().catch((error) => {
        if (mounted) {
          setImportError(error instanceof Error ? error.message : "Unable to refresh imported candle metadata.");
        }
      });
    };
    refresh();
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      mounted = false;
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const refreshTradingViewFeed = () => {
      setTradingViewFeed(loadActiveTradingViewMcpChartFeed());
      setTradingViewRuntime(resolveTradingViewMcpRuntimeState());
      setTradingViewAutoRefresh(loadTradingViewMcpAutoRefreshState());
      void hydrateActiveTradingViewMcpChartFeed()
        .then((feed) => {
          setTradingViewFeed(feed);
          setTradingViewRuntime(resolveTradingViewMcpRuntimeState(feed));
        })
        .catch(() => undefined);
    };
    refreshTradingViewFeed();
    window.addEventListener(TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT, refreshTradingViewFeed);
    window.addEventListener(TRADINGVIEW_MCP_AUTO_REFRESH_UPDATED_EVENT, refreshTradingViewFeed);
    window.addEventListener(TRADINGVIEW_MCP_EVIDENCE_UPDATED_EVENT, refreshTradingViewFeed);
    window.addEventListener(TRADINGVIEW_MCP_SETTINGS_UPDATED_EVENT, refreshTradingViewFeed);
    window.addEventListener("storage", refreshTradingViewFeed);
    return () => {
      window.removeEventListener(TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT, refreshTradingViewFeed);
      window.removeEventListener(TRADINGVIEW_MCP_AUTO_REFRESH_UPDATED_EVENT, refreshTradingViewFeed);
      window.removeEventListener(TRADINGVIEW_MCP_EVIDENCE_UPDATED_EVENT, refreshTradingViewFeed);
      window.removeEventListener(TRADINGVIEW_MCP_SETTINGS_UPDATED_EVENT, refreshTradingViewFeed);
      window.removeEventListener("storage", refreshTradingViewFeed);
    };
  }, []);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setImporting(true);
    setImportError(undefined);
    setImportMessage(undefined);
    try {
      const result = await importHistoricalCandleFile(file, "MNQ");
      await saveImportedCandleSet(result);
      setActiveImportedCandleSet(result.metadata.importId);
      await refreshImports();
      setImportMessage(
        `Imported ${result.metadata.candleCount.toLocaleString()} ${result.metadata.timeframe ?? "detected"} candle(s) from ${result.metadata.sheetName ?? file.name}.`
      );
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Historical candle import failed.");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const handleLocalNormalizedJsonImport = async () => {
    setImporting(true);
    setImportError(undefined);
    setImportMessage(undefined);
    try {
      const response = await fetch(`${localNormalizedMnqArtifactUrl}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Normalized local MNQ artifact was not found. Run `npm run import:local-mnq-history` first.");
      }
      const artifact = (await response.json()) as NormalizedHistoricalCandleArtifact;
      const result = importNormalizedHistoricalCandleArtifact(artifact);
      await saveImportedCandleSet(result);
      setActiveImportedCandleSet(result.metadata.importId);
      await refreshImports();
      setImportMessage(
        `Imported ${result.metadata.candleCount.toLocaleString()} ${result.metadata.timeframe ?? "detected"} candle(s) from normalized local JSON.`
      );
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Normalized local JSON import failed.");
    } finally {
      setImporting(false);
    }
  };

  const handleSourceChange = async (value: string) => {
    setImportError(undefined);
    setImportMessage(undefined);
    setActiveImportedCandleSet(value === "mock" ? undefined : value);
    await refreshImports();
  };

  const reactivateImport = async (importId: string) => {
    setImportError(undefined);
    setImportMessage(undefined);
    setActiveImportedCandleSet(importId);
    await refreshImports();
    const metadata = imports.find((item) => item.importId === importId);
    setImportMessage(`Reactivated ${metadata?.sourceLabel ?? "imported dataset"} for research.`);
  };

  const patchWindowSettings = async (patch: Partial<CandleWindowSettings>) => {
    const saved = saveCandleWindowSettings({ ...windowSettings, ...patch });
    setWindowSettings(saved);
    await refreshImports();
  };

  const applyImportedPreset = async (preset: "safe" | "standard" | "advanced") => {
    const saved = saveCandleWindowSettings({
      ...windowSettings,
      ...importedDataPresetSettings[preset]
    });
    setWindowSettings(saved);
    await refreshImports();
  };

  const fetchTradingViewQuoteForChart = async () => {
    setTradingViewFeedMessage(`Fetching TradingView MCP quote for ${symbol} ${timeframe}...`);
    setChartVerification(undefined);
    const settings = loadTradingViewMcpSettings();
    const quote = await fetchTradingViewMcpQuote({ symbol, timeframe }, { ...settings, enabled: true });
    setTradingViewQuote(quote);
    setTradingViewRuntime(resolveTradingViewMcpRuntimeState());
    setTradingViewFeedMessage(
      quote.latestPrice
        ? `TradingView MCP quote loaded. Latest price ${quote.latestPrice}.`
        : quote.missingEvidence.join(" ") || "TradingView MCP quote unavailable."
    );
  };

  const connectTradingViewMcp = async () => {
    setTradingViewConnecting(true);
    setTradingViewFeedMessage(`Connecting TradingView MCP for ${symbol} ${timeframe}...`);
    setChartVerification(undefined);
    try {
      const settings = saveTradingViewMcpSettings({ ...loadTradingViewMcpSettings(), enabled: true });
      const status = await checkAndStoreTradingViewMcpStatus(settings);
      setTradingViewRuntime(resolveTradingViewMcpRuntimeState());
      if (status.connectionStatus !== "connected_analysis_only") {
        setTradingViewFeedMessage(
          "TradingView MCP port is disconnected or occupied but not responding. Run npm.cmd run tradingview:mcp-diagnose-port. If stale, run npm.cmd run tradingview:mcp-stop, then restart npm.cmd run tradingview:mcp-bridge."
        );
        return;
      }

      const [quote, candles] = await Promise.all([
        fetchTradingViewMcpQuote({ symbol, timeframe }, settings),
        fetchTradingViewMcpCandles({ symbol, timeframe, limit: tradingViewDisplayLimit }, settings)
      ]);
      setTradingViewQuote(quote);
      setTradingViewCandles(candles);

      if (!candles.candleCount) {
        setTradingViewRuntime(resolveTradingViewMcpRuntimeState());
        setTradingViewFeedMessage(
          candles.depthWarning ||
          candles.missingEvidence.join(" ") ||
            "TradingView MCP wrapper is connected, but no candles were returned. Check the TradingView Desktop chart symbol/timeframe."
        );
        return;
      }

      const feed = await storeActiveTradingViewMcpChartFeed(
        createActiveTradingViewMcpChartFeed({
          candlesResponse: candles,
          gotraderSymbol: symbol,
          gotraderTimeframe: timeframe,
          usageMode: "chart_only"
        })
      );
      setTradingViewFeed(feed);
      setTradingViewRuntime(resolveTradingViewMcpRuntimeState());
      setTradingViewFeedMessage(
        [
          `TradingView MCP chart source active with ${feed.candleCount.toLocaleString()} read-only candles.`,
          feed.requestedLimit
            ? `Depth: ${feed.candleCount.toLocaleString()} of ${feed.requestedLimit.toLocaleString()} requested (${formatToken(feed.depthStatus)}).`
            : undefined,
          feed.depthWarning,
          quote.latestPrice ? `Latest quote ${quote.latestPrice}.` : undefined,
          feed.activeForResearch
            ? "Research-source gate is eligible."
            : `Research remains guarded: ${feed.researchEligibility.reasons.join(" ")}`
        ].filter(Boolean).join(" ")
      );
    } finally {
      setTradingViewConnecting(false);
    }
  };

  const fetchTradingViewCandlesForChart = async () => {
    setTradingViewFeedMessage(`Fetching TradingView MCP candles for ${symbol} ${timeframe}...`);
    setChartVerification(undefined);
    const settings = loadTradingViewMcpSettings();
    const candles = await fetchTradingViewMcpCandles(
      { symbol, timeframe, limit: tradingViewDisplayLimit },
      { ...settings, enabled: true }
    );
    setTradingViewCandles(candles);
    const candidate = createActiveTradingViewMcpChartFeed({
      candlesResponse: candles,
      gotraderSymbol: symbol,
      gotraderTimeframe: timeframe,
      usageMode: "chart_only"
    });
    if (candles.candleCount) {
      const feed = await storeActiveTradingViewMcpChartFeed(candidate);
      setTradingViewFeed(feed);
    }
    setTradingViewRuntime(resolveTradingViewMcpRuntimeState());
    setTradingViewFeedMessage(
      candles.candleCount
        ? [
            `TradingView MCP returned ${candles.candleCount.toLocaleString()} candles and activated chart-only display.`,
            candles.requestedLimit ? `Requested ${candles.requestedLimit.toLocaleString()}; depth ${formatToken(candles.depthStatus)}.` : undefined,
            candles.depthWarning,
            `Eligibility: ${formatToken(candidate.researchEligibility.state)}.`
          ].filter(Boolean).join(" ")
        : candles.depthWarning || candles.missingEvidence.join(" ") || "TradingView MCP connected but candle series unavailable."
    );
  };

  const useTradingViewCandlesAsSource = async (usageMode: "chart_only" | "research_source") => {
    setTradingViewFeedMessage(
      usageMode === "research_source"
        ? `Evaluating TradingView MCP candles as a guarded research source for ${symbol} ${timeframe}...`
        : `Loading TradingView MCP candles into GoTrader chart for ${symbol} ${timeframe}...`
    );
    setChartVerification(undefined);
    const settings = loadTradingViewMcpSettings();
    const feed = await fetchAndStoreTradingViewMcpChartFeed({
      symbol,
      timeframe,
      gotraderSymbol: symbol,
      gotraderTimeframe: timeframe,
      limit: usageMode === "research_source" ? Math.max(400, tradingViewDisplayLimit) : tradingViewDisplayLimit,
      settings: { ...settings, enabled: true },
      usageMode
    });
    setTradingViewFeed(feed);
    setTradingViewRuntime(resolveTradingViewMcpRuntimeState());
    setTradingViewFeedMessage(
      feed.candleCount
        ? usageMode === "research_source" && !feed.activeForResearch
          ? `TradingView MCP remains visual-only. Eligibility: ${formatToken(feed.researchEligibility.state)}. ${feed.depthWarning ?? feed.researchEligibility.reasons.join(" ")}`
          : [
              `TradingView MCP ${usageMode === "research_source" ? "research source" : "chart source"} active with ${feed.candleCount.toLocaleString()} read-only candles.`,
              feed.requestedLimit ? `Depth: ${feed.candleCount.toLocaleString()} of ${feed.requestedLimit.toLocaleString()} requested (${formatToken(feed.depthStatus)}).` : undefined,
              feed.matchReason
            ].filter(Boolean).join(" ")
        : feed.missingEvidence.join(" ") || "TradingView MCP connected but did not return full candle series."
    );
  };

  const clearTradingViewChartSource = async () => {
    await clearTradingViewMcpChartFeedCache();
    setTradingViewFeed(undefined);
    setTradingViewRuntime(resolveTradingViewMcpRuntimeState());
    setChartVerification(undefined);
    setTradingViewFeedMessage("TradingView MCP cached candles cleared. Falling back to imported/mock candles.");
  };

  const verifyChartSource = () => {
    const actualCandles = previewChartData.candles
      .map((candle) => candle.sourceCandle)
      .filter((candle): candle is Candle => Boolean(candle));
    const actualChartInput = createCandleSourceIdentity(
      actualCandles,
      displaySource.activeChartDisplaySourceMode,
      displaySource.activeChartDisplaySourceLabel
    );
    setChartVerification({
      actualChartInput,
      equalsImportedSource: sameCandleSeries(actualChartInput, displaySource.importedIdentity),
      equalsTradingViewMcpSource: sameCandleSeries(actualChartInput, displaySource.tradingViewMcpIdentity),
      expectedChartDisplay: displaySource.chartDisplayIdentity,
      importedSource: displaySource.importedIdentity,
      tradingViewMcpSource: displaySource.tradingViewMcpIdentity,
      verifiedAt: new Date().toISOString()
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Market data architecture</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Market Data Context</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Advanced data inspection and import management. Most users should operate from Command Center for
            TradingView MCP connection, chart activation, research eligibility, and autonomous research startup.
          </p>
        </div>
        <Badge variant={activeSource.mode === "imported" ? "success" : "warning"}>
          {activeSource.mode === "imported" ? "imported historical data active" : "mock / planning only"}
        </Badge>
      </div>

      <SafetyLockBanner message="Market data adapters are research inputs only. No broker execution or live trading." />

      <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-4 text-sm text-cyan-100">
        <p className="font-semibold">Command Center is the primary operating surface.</p>
        <p className="mt-1 text-cyan-100/80">
          Use Dashboard / Command Center to connect TradingView MCP, activate the chart feed, check research-source eligibility,
          and start autonomous research. This page is for advanced source inspection, local imports, and troubleshooting.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            Live Data Adapter Status
          </CardTitle>
          <CardDescription>
            Read-only feed status for chart data. TradingView MCP is analysis-only and MT5 remains locked unless a
            separate read-only bridge is explicitly connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <StatusTile label="Current chart source" value={displaySource.activeChartDisplaySourceMode.replace(/_/g, " ")} />
            <StatusTile label="Live feed" value={liveMarketDataStatus.liveFeedAvailable ? "connected" : "not connected"} />
            <StatusTile label="Provider" value={liveMarketDataStatus.provider} />
            <StatusTile label="Connection" value={liveMarketDataStatus.connectionStatus} />
            <StatusTile label="Chart display source" value={displaySource.activeChartDisplaySourceLabel} />
            <StatusTile label="Research source" value={displaySource.activeResearchSourceLabel} />
            <StatusTile label="Display candles" value={displaySource.activeChartDisplayCandleSource.length.toLocaleString()} />
            <StatusTile label="Research candles" value={displaySource.activeResearchCandleSource.length.toLocaleString()} />
            <StatusTile label="MCP auto-refresh" value={formatToken(tradingViewAutoRefresh.status)} />
            <StatusTile label="Auto interval" value={`${tradingViewAutoRefresh.refreshIntervalSeconds}s`} />
            <StatusTile label="Auto limit" value={`${tradingViewAutoRefresh.candleLimit.toLocaleString()} candles`} />
            <StatusTile label="Auto last refresh" value={formatDate(tradingViewAutoRefresh.lastRefreshAt)} />
            <StatusTile label="Auto in progress" value={tradingViewAutoRefresh.refreshInProgress ? "yes" : "no"} />
            <StatusTile label="Auto skipped overlaps" value={String(tradingViewAutoRefresh.skippedRefreshCount)} />
            <StatusTile label="Auto last checked" value={formatDate(tradingViewAutoRefresh.lastCheckedAt)} />
            <StatusTile label="Auto candle update" value={formatDate(tradingViewAutoRefresh.lastCandleUpdateAt)} />
            <StatusTile label="Auto latest price" value={String(tradingViewAutoRefresh.lastPrice ?? "n/a")} />
            <StatusTile label="Auto failures" value={String(tradingViewAutoRefresh.consecutiveFailures)} />
          </div>
          {displaySource.chartDisplayWarning ? (
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              {displaySource.chartDisplayWarning}
            </div>
          ) : null}
          {!liveMarketDataStatus.liveFeedAvailable ? (
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              {displaySource.chartDisplayUsesTradingViewMcp
                ? "Live feed not connected. Charts are using TradingView MCP read-only chart candles for visual display only."
                : "Live feed not connected. Charts are using imported/mock/replay data."}
            </div>
          ) : null}
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-md border border-border bg-background/45 p-3">
              <p className="font-medium text-foreground">TradingView MCP</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tradingViewRuntime.bridgeStatus === "connected_analysis_only"
                  ? tradingViewRuntime.evidenceAvailable
                    ? "Read-only chart evidence available."
                    : "Bridge/feed connected; chart evidence has not been fetched yet."
                  : "Analysis/evidence source is disconnected."}{" "}
                {tradingViewFeed?.activeForChart ? "Read-only chart candles are active for visual display." : "Chart candles are not active."} It is not
                market-data truth, not a broker feed, and not an execution source.
              </p>
              <Badge variant={tradingViewRuntime.bridgeStatus === "connected_analysis_only" ? "success" : "warning"} className="mt-2">
                bridge {formatToken(tradingViewRuntime.bridgeStatus)}
              </Badge>
              <Badge variant={tradingViewFeed?.activeForChart ? "success" : "secondary"} className="mt-2 ml-2">
                chart feed {tradingViewFeed?.activeForChart ? "active" : "inactive"}
              </Badge>
            </div>
            <div className="rounded-md border border-border bg-background/45 p-3">
              <p className="font-medium text-foreground">MT5</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Broker adapter locked. Read-only candles/quotes are not connected in this app state.
              </p>
            </div>
            <div className="rounded-md border border-border bg-background/45 p-3">
              <p className="font-medium text-foreground">Execution</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Disabled. No order placement, readiness override, or broker authority is available.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseZap className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            Canonical Candle Source Manager
          </CardTitle>
          <CardDescription>
            Provider-neutral source registry for chart display, research cycles, and future walk-forward feeds. Sources
            remain read-only and carry no execution authority.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <StatusTile label="Active chart source" value={`${displaySource.activeChartSource.provider.replace(/_/g, " ")} / ${displaySource.activeChartSource.candleCount.toLocaleString()}`} />
            <StatusTile label="Active research source" value={`${displaySource.activeResearchSource.provider.replace(/_/g, " ")} / ${displaySource.activeResearchSource.candleCount.toLocaleString()}`} />
            <StatusTile label="Walk-forward source" value={`${displaySource.activeWalkForwardSource.provider.replace(/_/g, " ")} / ${displaySource.activeWalkForwardSource.candleCount.toLocaleString()}`} />
          </div>
          {displaySource.canonicalWarnings.length ? (
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              {displaySource.canonicalWarnings.join(" ")}
            </div>
          ) : null}
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[1.1fr_0.9fr_0.8fr_0.7fr_0.7fr_0.8fr_0.8fr] gap-2 bg-muted/30 px-3 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <span>Provider</span>
              <span>Symbol</span>
              <span>Timeframe</span>
              <span>Candles</span>
              <span>Chart</span>
              <span>Research</span>
              <span>Storage</span>
            </div>
            {displaySource.allAvailableSources.map((source) => (
              <div
                key={source.sourceId}
                className="grid grid-cols-[1.1fr_0.9fr_0.8fr_0.7fr_0.7fr_0.8fr_0.8fr] gap-2 border-t border-border px-3 py-2 text-xs"
              >
                <span className="truncate font-medium text-foreground">{source.provider.replace(/_/g, " ")}</span>
                <span className="truncate">{source.normalizedSymbol}</span>
                <span>{source.timeframe}</span>
                <span className="font-mono">{source.candleCount.toLocaleString()}</span>
                <span>{source.eligibility.chartDisplay ? "yes" : "no"}</span>
                <span>{source.eligibility.researchCycle ? "yes" : "no"}</span>
                <span className="truncate">{source.storageBackend}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            MT5 read-only appears here as planned/disconnected until a local read-only endpoint is explicitly configured.
            It has no order methods and no broker authority in this phase.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-sky-300" aria-hidden="true" />
            TradingView MCP Chart Feed
          </CardTitle>
          <CardDescription>
            Pull read-only candles from the local TradingView MCP wrapper into GoTrader Lightweight Charts. This is not
            broker truth and has no execution authority.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!displaySource.chartDisplayUsesTradingViewMcp && tradingViewRuntime.chartFeedCandleCount === 0 ? (
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              TradingView MCP is not active because no candles are loaded. Click Connect and use TradingView MCP chart.
            </div>
          ) : null}
          {tradingViewLoadedButChartImported ? (
            <div className="rounded-md border border-red-300/25 bg-red-300/10 p-3 text-red-100">
              MCP candles are loaded but chart display source is still imported.
            </div>
          ) : null}
          <div className="rounded-lg border border-sky-300/25 bg-sky-300/10 p-4 text-sky-100">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-semibold">One-click chart activation</p>
                <p className="mt-1 text-xs text-sky-100/80">
                  Checks the local bridge, fetches a quote and candles, then activates TradingView MCP as the visual chart source when candles are available.
                </p>
              </div>
              <Button variant="secondary" onClick={() => void connectTradingViewMcp()} disabled={tradingViewConnecting}>
                {tradingViewConnecting ? "Connecting..." : "Connect and use TradingView MCP chart"}
              </Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-7">
            <div className="space-y-2">
              <Label htmlFor="tradingview-feed-symbol">Symbol</Label>
              <Select
                id="tradingview-feed-symbol"
                value={symbol}
                options={symbolOptions}
                onChange={(event) => setSymbol(event.target.value as FuturesSymbol)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tradingview-feed-timeframe">Timeframe</Label>
              <Select
                id="tradingview-feed-timeframe"
                value={timeframe}
                options={timeframeOptions}
                onChange={(event) => setTimeframe(event.target.value as Timeframe)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tradingview-feed-limit">Candle limit</Label>
              <Select
                id="tradingview-feed-limit"
                value={tradingViewCandleLimit}
                options={tradingViewCandleLimitOptions}
                onChange={(event) => setTradingViewCandleLimit(event.target.value)}
              />
            </div>
            <Button variant="secondary" onClick={() => void fetchTradingViewQuoteForChart()} className="self-end">
              Fetch quote
            </Button>
            <Button variant="outline" onClick={() => void fetchTradingViewCandlesForChart()} className="self-end">
              Fetch candles
            </Button>
            <Button variant="secondary" onClick={() => void useTradingViewCandlesAsSource("chart_only")} className="self-end">
              Use for chart only
            </Button>
            <Button
              variant="secondary"
              disabled={!tradingViewResearchSourceEligible}
              onClick={() => void useTradingViewCandlesAsSource("research_source")}
              className="self-end"
              title={
                tradingViewResearchSourceEligible
                  ? "TradingView MCP candles satisfy the research-source gate."
                  : tradingViewEligibilityReasons[0]
              }
            >
              Use for research source
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <StatusTile label="Wrapper running" value={tradingViewRuntime.wrapperRunning ? "yes" : "no"} />
            <StatusTile
              label="Desktop CDP"
              value={
                typeof tradingViewRuntime.tradingViewDesktopCdpConnected === "boolean"
                  ? tradingViewRuntime.tradingViewDesktopCdpConnected ? "yes" : "no"
                  : "unknown"
              }
            />
            <StatusTile label="Evidence available" value={tradingViewRuntime.evidenceAvailable ? "yes" : "no"} />
            <StatusTile label="Candles loaded" value={tradingViewRuntime.chartFeedCandleCount > 0 ? "yes" : "no"} />
            <StatusTile label="Chart source active" value={displaySource.chartDisplayUsesTradingViewMcp ? "yes" : "no"} />
            <StatusTile label="Research eligible" value={tradingViewResearchSourceEligible ? "yes" : "no"} />
            <StatusTile label="Active chart display source" value={displaySource.activeChartDisplaySourceMode.replace(/_/g, " ")} />
            <StatusTile label="Active research source" value={displaySource.activeResearchSourceMode.replace(/_/g, " ")} />
            <StatusTile label="Bridge" value={tradingViewRuntime.bridgeStatus.replace(/_/g, " ")} />
            <StatusTile label="Quote latest" value={String(tradingViewQuote?.latestPrice ?? tradingViewFeed?.latestClose ?? "none")} />
            <StatusTile label="Candle status" value={(tradingViewCandles?.connectionStatus ?? tradingViewFeed?.connectionStatus ?? "not loaded").replace(/_/g, " ")} />
            <StatusTile label="Candle count" value={String(tradingViewCandles?.candleCount ?? tradingViewFeed?.candleCount ?? 0)} />
            <StatusTile label="Requested candles" value={String(tradingViewCandles?.requestedLimit ?? tradingViewFeed?.requestedLimit ?? tradingViewDisplayLimit)} />
            <StatusTile label="Returned candles" value={String(tradingViewCandles?.returnedCount ?? tradingViewFeed?.returnedCount ?? tradingViewCandles?.candleCount ?? tradingViewFeed?.candleCount ?? 0)} />
            <StatusTile label="Research minimum" value={String(tradingViewCandles?.researchMinimumCandles ?? tradingViewFeed?.researchMinimumCandles ?? 400)} />
            <StatusTile label="Depth status" value={formatToken(tradingViewCandles?.depthStatus ?? tradingViewFeed?.depthStatus)} />
            <StatusTile label="First candle" value={formatDate(tradingViewCandles?.firstTimestamp ?? tradingViewFeed?.firstTimestamp)} />
            <StatusTile label="Last candle" value={formatDate(tradingViewCandles?.lastTimestamp ?? tradingViewFeed?.lastTimestamp)} />
            <StatusTile label="Match state" value={(tradingViewCandidateFeed?.matchState ?? tradingViewFeed?.matchState ?? "unavailable").replace(/_/g, " ")} />
            <StatusTile label="Eligibility" value={formatToken(tradingViewEligibility?.state)} />
            <StatusTile label="Symbol match" value={String(tradingViewEligibility?.symbolMatch ?? false)} />
            <StatusTile label="Timeframe match" value={String(tradingViewEligibility?.timeframeMatch ?? false)} />
            <StatusTile label="Usage mode" value={formatToken(tradingViewFeed?.usageMode)} />
            <StatusTile label="Authority" value="none" />
            <StatusTile label="Feed stored" value={tradingViewFeed?.candlesPersisted ? "yes" : tradingViewFeed ? "session-only" : "no"} />
            <StatusTile label="Storage backend" value={tradingViewFeed?.storageBackend ?? tradingViewRuntime.chartFeedStorageBackend ?? "none"} />
            <StatusTile label="Last feed id" value={tradingViewFeed?.feedId ?? tradingViewRuntime.chartFeedId ?? "none"} />
            <StatusTile label="Auto-refresh status" value={formatToken(tradingViewAutoRefresh.status)} />
            <StatusTile label="Auto-refresh interval" value={`${tradingViewAutoRefresh.refreshIntervalSeconds}s`} />
            <StatusTile label="Auto-refresh count" value={String(tradingViewAutoRefresh.refreshCount)} />
            <StatusTile label="Auto latest candle" value={formatDate(tradingViewAutoRefresh.lastCandleTimestamp)} />
            <StatusTile label="Auto last checked" value={formatDate(tradingViewAutoRefresh.lastCheckedAt)} />
            <StatusTile label="Auto skipped overlaps" value={String(tradingViewAutoRefresh.skippedRefreshCount)} />
            <StatusTile label="Auto storage write" value={tradingViewAutoRefresh.lastStorageWriteSkipped ? "skipped unchanged" : "write allowed"} />
          </div>
          <div
            className={`rounded-md border p-3 text-sm ${
              tradingViewResearchSourceEligible
                ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                : tradingViewEligibility?.visualEligible
                  ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                  : "border-slate-300/15 bg-slate-300/5 text-muted-foreground"
            }`}
          >
            <p className="font-medium">
              TradingView MCP eligibility: {formatToken(tradingViewEligibility?.state)}
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {tradingViewEligibilityReasons.slice(0, 4).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {(tradingViewCandles?.depthWarning ?? tradingViewFeed?.depthWarning) ? (
              <p className="mt-2 text-xs">
                {tradingViewCandles?.depthWarning ?? tradingViewFeed?.depthWarning}
              </p>
            ) : null}
            {(tradingViewCandles?.nextRecommendedAction ?? tradingViewFeed?.nextRecommendedAction) ? (
              <p className="mt-1 text-xs">
                Next: {tradingViewCandles?.nextRecommendedAction ?? tradingViewFeed?.nextRecommendedAction}
              </p>
            ) : null}
          </div>
          {tradingViewFeedMessage ? (
            <div className="rounded-md border border-sky-300/25 bg-sky-300/10 p-3 text-sky-100">
              {tradingViewFeedMessage}
            </div>
          ) : null}
          {tradingViewFeed?.activeForChart ? (
            <div className="flex flex-col gap-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-3 text-emerald-100 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">
                  TradingView MCP {tradingViewFeed.activeForResearch ? "research source" : "chart source"} active
                </p>
                <p className="mt-1 text-xs text-emerald-100/80">
                  {tradingViewFeed.providerSymbol} {tradingViewFeed.timeframe} / {tradingViewFeed.candleCount.toLocaleString()} candles / {tradingViewFeed.matchReason}
                </p>
                {tradingViewFeed.requestedLimit ? (
                  <p className="mt-1 text-xs text-emerald-100/80">
                    Requested {tradingViewFeed.requestedLimit.toLocaleString()} / returned {tradingViewFeed.candleCount.toLocaleString()} / depth {formatToken(tradingViewFeed.depthStatus)}.
                  </p>
                ) : null}
                {tradingViewFeed.depthWarning ? (
                  <p className="mt-1 text-xs text-amber-100">
                    {tradingViewFeed.depthWarning}
                  </p>
                ) : null}
                {!tradingViewFeed.activeForResearch ? (
                  <p className="mt-1 text-xs text-emerald-100/80">
                    Visual-only unless the research gate reports eligible for research cycle.
                  </p>
                ) : null}
              </div>
              <Button variant="outline" onClick={clearTradingViewChartSource} className="shrink-0">
                Clear TradingView MCP cached candles
              </Button>
            </div>
          ) : (
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
              TradingView MCP chart feed is not active. If the bridge connects but returns no full candles, GoTrader
              keeps using imported/mock/replay candles and shows a clear fallback.
            </div>
          )}
          <div className="rounded-md border border-border bg-background/45 p-3 text-xs text-muted-foreground">
            Source distinction: TradingView MCP candles are read-only chart data. Broker quotes, fills, positions, and
            account truth must come from future broker adapters, and execution remains disabled.
          </div>
        </CardContent>
      </Card>

      <Card className={activeSource.mode === "imported" ? "border-emerald-300/25 bg-emerald-300/10" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            Historical Candle Import
          </CardTitle>
          <CardDescription>
            Import local `.xlsx` or `.csv` OHLCV files. Imported candles stay in browser IndexedDB and are used by
            Backtest Lab and the dashboard AI Research Cycle when selected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">Import Excel/CSV OHLCV</span>
              <input
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleImport}
                disabled={importing}
                className="block w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">Active candle source</span>
              <Select
                value={activeSource.metadata?.importId ?? "mock"}
                options={importOptions}
                onChange={(event) => void handleSourceChange(event.target.value)}
                aria-label="Active candle source"
              />
            </label>
            <Button
              variant="secondary"
              onClick={() => void refreshImports()}
              disabled={importing}
              className="justify-center"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {importing ? "Importing" : "Refresh"}
            </Button>
          </div>

          {localDevImportAvailable ? (
            <div className="flex flex-col gap-3 rounded-md border border-cyan-300/25 bg-cyan-300/10 p-3 text-sm text-cyan-100 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Local dev import helper</p>
                <p className="mt-1 text-cyan-100/75">
                  Run <span className="font-mono">npm run import:local-mnq-history</span>, then load the generated normalized MNQ JSON without the browser file picker.
                </p>
              </div>
              <Button variant="secondary" onClick={() => void handleLocalNormalizedJsonImport()} disabled={importing} className="shrink-0">
                Import normalized local JSON
              </Button>
            </div>
          ) : null}

          {importMessage ? (
            <div className="rounded-md border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">
              {importMessage}
            </div>
          ) : null}
          {importError ? (
            <div className="rounded-md border border-red-300/25 bg-red-300/10 p-3 text-sm text-red-100">
              {importError}
            </div>
          ) : null}

          {activeImportIsStale ? (
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              Active import id <span className="font-mono">{activeImportId}</span> is stale or missing from IndexedDB.
              Reactivate a stored dataset below, or re-import MNQ if no matching dataset remains.
            </div>
          ) : null}

          {importedDatasetsNeedActivation ? (
            <div className="flex flex-col gap-3 rounded-md border border-cyan-300/25 bg-cyan-300/10 p-3 text-sm text-cyan-100 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Imported historical datasets are available but not active.</p>
                <p className="mt-1 text-cyan-100/75">
                  Reactivate one before running imported MNQ research. Mock candles are demo/fallback only and are not valid for imported-data comparison.
                </p>
              </div>
              {latestImport ? (
                <Button variant="secondary" onClick={() => void reactivateImport(latestImport.importId)} className="shrink-0">
                  Reactivate latest imported dataset
                </Button>
              ) : null}
            </div>
          ) : null}

          {!imports.length && activeSource.mode !== "imported" ? (
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              Re-import required: no historical candle datasets were found in IndexedDB. Current mock candles are not valid for imported MNQ comparison.
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <StatusTile label="Source mode" value={activeSource.mode === "imported" ? "imported history" : "mock"} />
            <StatusTile label="Active label" value={activeSource.label} />
            <StatusTile label="Raw candles" value={String(activeSource.rawCandleCount || context.priceVolume.ohlcv.candles.length)} />
            <StatusTile label="Research window" value={String(activeSource.researchWindowCandles || context.priceVolume.ohlcv.candles.length)} />
            <StatusTile label="Processed candles" value={String(activeSource.processedCandleCount || context.priceVolume.ohlcv.candles.length)} />
            <StatusTile label="Validation" value={activeSource.metadata?.status.replace(/_/g, " ") ?? "mock data"} />
          </div>

          <div className="rounded-lg border border-border bg-background/45 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Research Window Controls</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Dashboard and Backtest Lab use this prepared window instead of the full raw file. Default is latest
                  500 raw candles aggregated to 5m for dashboard Safe mode; Standard uses 2,000.
                </p>
              </div>
              <Badge variant={activeSource.performanceMode === "safe" ? "success" : "warning"}>
                performance mode: {activeSource.performanceMode}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Button
                variant="secondary"
                onClick={() => void applyImportedPreset("safe")}
                className="justify-center"
              >
                Safe: 500 raw → 5m
              </Button>
              <Button
                variant="outline"
                onClick={() => void applyImportedPreset("standard")}
                className="justify-center"
              >
                Standard: 2,000 raw → 5m
              </Button>
              <Button
                variant="outline"
                onClick={() => void applyImportedPreset("advanced")}
                className="justify-center"
              >
                Advanced custom
              </Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="market-data-window-size">Window size</Label>
                <Select
                  id="market-data-window-size"
                  value={safeWindowSizeOptions.includes(windowSettings.windowSize) ? String(windowSettings.windowSize) : "custom"}
                  options={windowSizeOptions}
                  onChange={(event) => {
                    if (event.target.value !== "custom") {
                      void patchWindowSettings({ windowSize: Number(event.target.value), advancedMode: false });
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="market-data-timeframe">Research timeframe</Label>
                <Select
                  id="market-data-timeframe"
                  value={windowSettings.targetTimeframe}
                  options={researchTimeframeOptions}
                  onChange={(event) => void patchWindowSettings({ targetTimeframe: event.target.value as CandleWindowSettings["targetTimeframe"] })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="market-data-session-filter">Session filter</Label>
                <Select
                  id="market-data-session-filter"
                  value={windowSettings.sessionFilter}
                  options={["all", "Asia", "London", "New York", "Off hours"].map((value) => ({ label: value, value }))}
                  onChange={(event) => void patchWindowSettings({ sessionFilter: event.target.value as CandleWindowSettings["sessionFilter"] })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="market-data-custom-window">Custom window</Label>
                <Input
                  id="market-data-custom-window"
                  type="number"
                  min="100"
                  max="50000"
                  value={String(windowSettings.windowSize)}
                  onChange={(event) =>
                    void patchWindowSettings({
                      windowSize: Number(event.target.value),
                      advancedMode: Number(event.target.value) > 5000
                    })
                  }
                />
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-border bg-card/45 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={windowSettings.advancedMode}
                  onChange={(event) => void patchWindowSettings({ advancedMode: event.target.checked })}
                />
                Advanced large-window mode
              </label>
            </div>
            <div className="mt-3 grid gap-2 text-xs md:grid-cols-4">
              <StatusTile label="Raw import" value={activeSource.rawCandleCount.toLocaleString()} />
              <StatusTile label="Window used" value={activeSource.researchWindowCandles.toLocaleString()} />
              <StatusTile label="Research timeframe" value={activeSource.appliedSettings.targetTimeframe} />
              <StatusTile label="After aggregation" value={activeSource.processedCandleCount.toLocaleString()} />
            </div>
            {activeSource.warnings.length ? (
              <div className="mt-3 rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">
                {activeSource.warnings.join(" ")}
              </div>
            ) : null}
          </div>

          {activeSource.metadata ? <ImportMetadataPanel metadata={activeSource.metadata} /> : null}

          <StoredImportsPanel
            activeImportId={activeSource.metadata?.importId}
            imports={imports}
            onReactivate={(importId) => void reactivateImport(importId)}
          />

          <div className="rounded-lg border border-border bg-background/45 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Prepared Candle Preview</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Shared Lightweight Charts preview of the current research window. Current chart source:{" "}
                  {displaySource.activeChartDisplaySourceLabel}.{" "}
                  {displaySource.chartDisplayUsesTradingViewMcp
                    ? "Read-only TradingView MCP data; not broker truth."
                    : liveMarketDataStatus.liveFeedAvailable
                      ? liveMarketDataStatus.liveFeedSourceLabel
                      : "Live feed not connected."}
                  {displaySource.chartDisplayWarning ? ` ${displaySource.chartDisplayWarning}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={displaySource.chartDisplayUsesTradingViewMcp ? "secondary" : activeSource.mode === "imported" ? "success" : "warning"}>
                  {displaySource.chartDisplayUsesTradingViewMcp ? "TRADINGVIEW MCP" : activeSource.mode === "imported" ? "IMPORTED" : "MOCK"}
                </Badge>
                {displaySource.chartDisplayUsesTradingViewMcp ? (
                  <>
                    <Badge variant="secondary">READ-ONLY</Badge>
                    <Badge variant="warning">NOT BROKER TRUTH</Badge>
                  </>
                ) : null}
              </div>
            </div>
            <div className="mb-3 grid gap-2 text-xs md:grid-cols-4">
              <StatusTile label="Chart first" value={`${formatDate(displaySource.chartDisplayIdentity.firstTimestamp)} / ${displaySource.chartDisplayIdentity.firstClose ?? "n/a"}`} />
              <StatusTile label="Chart last" value={`${formatDate(displaySource.chartDisplayIdentity.lastTimestamp)} / ${displaySource.chartDisplayIdentity.lastClose ?? "n/a"}`} />
              <StatusTile label="TradingView MCP candles" value={`${displaySource.tradingViewMcpIdentity.candleCount.toLocaleString()} / ${formatDate(displaySource.tradingViewMcpIdentity.lastTimestamp)}`} />
              <StatusTile label="Imported/source candles" value={`${displaySource.importedIdentity.candleCount.toLocaleString()} / ${formatDate(displaySource.importedIdentity.lastTimestamp)}`} />
            </div>
            <TradingChart key={previewChartData.source.sourceKey} {...previewChartData} heightClassName="h-[280px]" />
            <div className="mt-3 rounded-md border border-border bg-background/45 p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">Chart source verification</p>
                  <p className="mt-1">
                    Confirms the exact candle identity passed into the shared TradingChart props.
                  </p>
                </div>
                <Button variant="outline" onClick={verifyChartSource}>
                  Verify chart source
                </Button>
              </div>
              {chartVerification ? (
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <StatusTile label="Expected source" value={chartVerification.expectedChartDisplay.sourceLabel} />
                  <StatusTile label="Actual chart input" value={chartVerification.actualChartInput.sourceLabel} />
                  <StatusTile label="Verified" value={formatDate(chartVerification.verifiedAt)} />
                  <StatusTile label="Input candles" value={chartVerification.actualChartInput.candleCount.toLocaleString()} />
                  <StatusTile label="Input first" value={`${formatDate(chartVerification.actualChartInput.firstTimestamp)} / ${chartVerification.actualChartInput.firstClose ?? "n/a"}`} />
                  <StatusTile label="Input last" value={`${formatDate(chartVerification.actualChartInput.lastTimestamp)} / ${chartVerification.actualChartInput.lastClose ?? "n/a"}`} />
                  <StatusTile label="Equals TradingView MCP" value={chartVerification.equalsTradingViewMcpSource ? "yes" : "no"} />
                  <StatusTile label="Equals imported source" value={chartVerification.equalsImportedSource ? "yes" : "no"} />
                  <StatusTile label="Source key" value={chartVerification.actualChartInput.dataFingerprint.slice(0, 72)} />
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseZap className="h-4 w-4 text-primary" aria-hidden="true" />
              Context Selector
            </CardTitle>
            <CardDescription>Preview the active adapter context. Imported candles override the mock picker while active.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={symbol}
                options={symbolOptions}
                onChange={(event) => setSymbol(event.target.value as FuturesSymbol)}
                aria-label="Market data symbol"
              />
              <Select
                value={timeframe}
                options={timeframeOptions}
                onChange={(event) => setTimeframe(event.target.value as Timeframe)}
                aria-label="Market data timeframe"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatusTile label="Mode" value={context.mode} />
              <StatusTile label="OHLCV candles" value={String(context.priceVolume.ohlcv.candles.length)} />
              <StatusTile label="VWAP" value={String(context.priceVolume.volumeProfile.vwap ?? "planned")} />
              <StatusTile label="VPOC" value={String(context.priceVolume.volumeProfile.vpoc ?? "planned")} />
            </div>
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              File imports are local historical data only. Real providers are roadmap items; no API calls, websocket
              feeds, broker feeds, or order routing are active.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-300" aria-hidden="true" />
              Current Context Modules
            </CardTitle>
            <CardDescription>Available mock context versus missing future modules.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {context.availableModules.map((module) => (
              <ModuleRow key={module.id} name={module.name} status={module.status} summary={module.summary} />
            ))}
            {context.missingModules.map((module) => (
              <ModuleRow key={module.id} name={module.name} status={module.status} summary={module.summary} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <ContextCard
          title="Price & Volume"
          items={[
            ["OHLCV", `${context.priceVolume.ohlcv.candles.length} ${context.priceVolume.ohlcv.source.replace(/_/g, " ")} candles`],
            ["Tick data", context.priceVolume.tickDataStatus],
            ["VWAP", String(context.priceVolume.volumeProfile.vwap)],
            ["Anchored VWAP", String(context.priceVolume.volumeProfile.anchoredVwap)],
            ["VAH / VAL", `${context.priceVolume.volumeProfile.vah} / ${context.priceVolume.volumeProfile.val}`],
            ["Globex range", `${context.priceVolume.globexRange.high} / ${context.priceVolume.globexRange.low}`]
          ]}
        />
        <ContextCard
          title="Macro & Intermarket"
          items={[
            ["Calendar events", String(context.macro.economicCalendar.length)],
            ["DXY", String(context.macro.dxy)],
            ["VIX", String(context.macro.vix)],
            ["2Y / 10Y", `${context.macro.twoYearYield} / ${context.macro.tenYearYield}`],
            ["ES/NQ ratio", String(context.intermarket.esNqRatio)],
            ["VIX/equity", context.intermarket.vixEquityRelationship ?? "planned"]
          ]}
        />
        <ContextCard
          title="Positioning & Order Flow"
          items={[
            ["Put/call", String(context.positioning.putCallRatio)],
            ["Gamma levels", String(context.positioning.gammaLevels.length)],
            ["Dealer gamma flip", String(context.positioning.dealerGammaFlip)],
            ["Net positioning", context.positioning.netPositioningBias],
            ["DOM", context.orderFlow.domStatus],
            ["Footprint", context.orderFlow.footprintStatus]
          ]}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-primary" aria-hidden="true" />
            Planned Market Data Agents
          </CardTitle>
          <CardDescription>Future agents consume adapter outputs as research context only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {context.plannedAgents.map((agent) => (
            <div key={agent.agentId} className="rounded-lg border border-border bg-background/45 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{agent.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{agent.purpose}</p>
                </div>
                <Badge variant="secondary">{agent.status}</Badge>
              </div>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <p><span className="text-foreground">Input:</span> {agent.inputData.join(", ")}</p>
                <p><span className="text-foreground">Output:</span> {agent.output}</p>
                <p><span className="text-foreground">Why:</span> {agent.whyItMatters}</p>
              </div>
              <div className="mt-3 rounded-md border border-emerald-400/20 bg-emerald-400/5 px-2 py-1 text-xs text-emerald-100">
                execution authority: {agent.executionAuthority}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <TechnicalDetails
        title="Future provider roadmap"
        description="Open for planned provider categories and first safe integration steps."
      >
        <div className="mb-4 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs text-cyan-100">
          <p className="font-semibold">Canonical TradingView MCP runtime state</p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <StatusTile label="Bridge status" value={tradingViewRuntime.bridgeStatus.replace(/_/g, " ")} />
            <StatusTile label="Evidence" value={tradingViewRuntime.evidenceAvailable ? "available" : "not fetched"} />
            <StatusTile label="Chart feed" value={tradingViewRuntime.chartFeedStatus.replace(/_/g, " ")} />
            <StatusTile label="Usage mode" value={formatToken(tradingViewRuntime.usageMode)} />
            <StatusTile label="Feed candles" value={tradingViewRuntime.chartFeedCandleCount.toLocaleString()} />
            <StatusTile label="Feed range" value={`${formatDate(tradingViewRuntime.chartFeedFirstTimestamp)} -> ${formatDate(tradingViewRuntime.chartFeedLastTimestamp)}`} />
            <StatusTile label="Chart source key" value={displaySource.chartDisplaySourceKey.slice(0, 72)} />
            <StatusTile label="Research source key" value={displaySource.researchSourceKey.slice(0, 72)} />
            <StatusTile label="TradingView key" value={displaySource.tradingViewMcpIdentity.dataFingerprint.slice(0, 72)} />
          </div>
          {tradingViewRuntime.sourceWarnings.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-cyan-100/80">
              {tradingViewRuntime.sourceWarnings.slice(0, 5).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {context.providerRoadmap.map((entry) => (
            <div key={entry.category} className="rounded-lg border border-border bg-background/45 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold capitalize">{entry.category}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p>
                </div>
                <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                <p><span className="text-foreground">Providers:</span> {entry.futureProviders.join(", ")}</p>
                <p className="mt-1"><span className="text-foreground">First safe step:</span> {entry.firstSafeStep}</p>
              </div>
            </div>
          ))}
        </div>
      </TechnicalDetails>

      <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
        <ShieldCheck className="mr-2 inline h-4 w-4" aria-hidden="true" />
        Adapter interfaces are designed so future real APIs plug into context builders without changing agent logic.
      </div>
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/45 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium text-foreground">{value}</p>
    </div>
  );
}

function ModuleRow({ name, status, summary }: { name: string; status: string; summary: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/45 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{name}</p>
        <Badge variant={statusVariant(status)}>{status.replace(/_/g, " ")}</Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{summary}</p>
    </div>
  );
}

function StoredImportsPanel({
  activeImportId,
  imports,
  onReactivate
}: {
  activeImportId?: string;
  imports: ImportedCandleMetadata[];
  onReactivate: (importId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/45 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Stored Imported Datasets</p>
          <p className="mt-1 text-xs text-muted-foreground">
            IndexedDB imports remain local to this browser. Reactivate a dataset after refresh before running imported-data research.
          </p>
        </div>
        <Badge variant={imports.length ? "success" : "warning"}>
          {imports.length ? `${imports.length} stored` : "none found"}
        </Badge>
      </div>
      {imports.length ? (
        <div className="mt-3 space-y-2">
          {imports.map((metadata) => {
            const isActive = metadata.importId === activeImportId;
            return (
              <div
                key={metadata.importId}
                className="flex flex-col gap-3 rounded-md border border-border bg-card/45 p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{metadata.sourceLabel}</p>
                    {isActive ? <Badge variant="success">active</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {metadata.fileName} / {metadata.candleCount.toLocaleString()} candles / {formatDate(metadata.firstTimestamp)} to {formatDate(metadata.lastTimestamp)}
                  </p>
                  <p className="mt-1 break-all font-mono text-[0.7rem] text-muted-foreground">{metadata.importId}</p>
                </div>
                <Button
                  variant={isActive ? "secondary" : "outline"}
                  disabled={isActive}
                  onClick={() => onReactivate(metadata.importId)}
                  className="shrink-0"
                >
                  {isActive ? "Active" : "Reactivate imported dataset"}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-2 text-xs text-amber-100">
          No imported datasets are discoverable. Import the MNQ historical file again before running imported-data comparisons.
        </div>
      )}
    </div>
  );
}

function ImportMetadataPanel({ metadata }: { metadata: ImportedCandleMetadata }) {
  return (
    <div className="rounded-lg border border-border bg-background/45 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{metadata.sourceLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sheet {metadata.sheetName ?? "n/a"} from {metadata.fileName}
          </p>
        </div>
        <Badge variant={metadata.status === "valid" ? "success" : metadata.status === "invalid" ? "danger" : "warning"}>
          {metadata.status.replace(/_/g, " ")}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
        <StatusTile label="Symbol / contract" value={`${metadata.symbol}${metadata.contract ? ` ${metadata.contract}` : ""}`} />
        <StatusTile label="Detected timeframe" value={metadata.timeframe ?? "not detected"} />
        <StatusTile label="Dominant interval" value={metadata.dominantIntervalMinutes ? `${metadata.dominantIntervalMinutes}m` : "n/a"} />
        <StatusTile label="First timestamp" value={formatDate(metadata.firstTimestamp)} />
        <StatusTile label="Last timestamp" value={formatDate(metadata.lastTimestamp)} />
        <StatusTile label="Duplicates skipped" value={String(metadata.duplicateTimestampsHandled)} />
      </div>
      <div className="mt-3 rounded-md border border-border bg-card/45 p-2 text-xs text-muted-foreground">
        <span className="text-foreground">Columns:</span> {metadata.columnNames.join(", ")}
      </div>
      {metadata.validationWarnings.length ? (
        <div className="mt-3 space-y-2">
          {metadata.validationWarnings.map((warning) => (
            <div
              key={warning.code}
              className="rounded-md border border-amber-300/20 bg-amber-300/10 p-2 text-xs text-amber-100"
            >
              <span className="font-semibold">{warning.code.replace(/_/g, " ")}:</span> {warning.message}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-2 text-xs text-emerald-100">
          No validation warnings detected.
        </div>
      )}
    </div>
  );
}

function ContextCard({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="max-w-[12rem] truncate font-mono text-foreground">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
