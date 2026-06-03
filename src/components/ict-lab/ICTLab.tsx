import { useEffect, useMemo, useState } from "react";
import { Activity, ChartCandlestick, Clock, Layers, ScanLine, ShieldAlert, Target } from "lucide-react";

import { MetricCard } from "@/components/MetricCard";
import { TradingChart } from "@/components/charts/TradingChart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  buildFvgZoneOverlays,
  buildIctMarkers,
  buildPremiumDiscountOverlays,
  buildSwingLevelOverlays,
  buildVwapOverlay,
  createTradingChartData,
  horizontalOverlay,
  type TradingChartLineOverlay
} from "@/lib/charting";
import {
  detectBOS,
  detectFairValueGaps,
  detectLiquiditySweeps,
  detectMSS,
  detectPremiumDiscount,
  detectSwings,
  tagSessions
} from "@/lib/ict";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  MARKET_DATA_IMPORT_UPDATED_EVENT,
  defaultCandleWindowSettings,
  resolveChartDisplayCandleSource,
  loadPreparedCandleSource
} from "@/lib/marketData";
import { resolveSessionTimeMapping } from "@/lib/sessions";
import {
  hydrateActiveTradingViewMcpChartFeed,
  loadActiveTradingViewMcpChartFeed,
  resolveTradingViewMcpRuntimeState,
  TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT,
  TRADINGVIEW_MCP_EVIDENCE_UPDATED_EVENT,
  TRADINGVIEW_MCP_SETTINGS_UPDATED_EVENT
} from "@/lib/integrations/tradingview";
import {
  hydrateActiveMt5ReadOnlyCandleFeed,
  loadActiveMt5ReadOnlyCandleFeed,
  MT5_READ_ONLY_UPDATED_EVENT,
  resolveMt5ReadOnlyRuntimeState
} from "@/lib/integrations/mt5";
import { mockCandles } from "@/lib/mockData/mockCandles";
import {
  analyzeGrinchPhase1,
  analyzeGrinchPhase2Reversal,
  analyzeGrinchPhase3Consolidation,
  analyzeGrinchPhase4Smt,
  buildGrinchProfileEvidenceDiagnostics,
  calculateGrinchStrategyScore
} from "@/lib/strategyLibrary";
import type { Candle, MarketBias, MarketStructureEvent, SessionContext } from "@/lib/types";

const formatTime = (timestamp: string) => timestamp.slice(11, 16);

const directionVariant = (direction: "bullish" | "bearish") => (direction === "bullish" ? "success" : "danger");

const useActiveResearchCandles = () => {
  const [preparedSource, setPreparedSource] = useState<Awaited<ReturnType<typeof loadPreparedCandleSource>>>();

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void loadPreparedCandleSource()
        .then((source) => {
          if (mounted) {
            setPreparedSource(source);
          }
        })
        .catch(() => {
          if (mounted) {
            setPreparedSource(undefined);
          }
        });
    };
    refresh();
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      mounted = false;
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return preparedSource;
};

export function ICTLab() {
  const preparedSource = useActiveResearchCandles();
  const [tradingViewRuntime, setTradingViewRuntime] = useState(() => resolveTradingViewMcpRuntimeState());
  const [tradingViewFeed, setTradingViewFeed] = useState(() => loadActiveTradingViewMcpChartFeed());
  const [mt5Runtime, setMt5Runtime] = useState(() => resolveMt5ReadOnlyRuntimeState());
  const [mt5Feed, setMt5Feed] = useState(() => loadActiveMt5ReadOnlyCandleFeed());
  const fallbackPreparedSource = useMemo(
    () => ({
      mode: "mock" as const,
      label: "Mock research candles",
      candles: mockCandles,
      rawCandleCount: mockCandles.length,
      researchWindowCandles: mockCandles.length,
      processedCandleCount: mockCandles.length,
      estimatedProcessedCandles: mockCandles.length,
      appliedSettings: defaultCandleWindowSettings,
      aggregationApplied: false,
      performanceMode: "safe" as const,
      warnings: []
    }),
    []
  );
  const sourceForDisplay = preparedSource ?? fallbackPreparedSource;
  const displaySource = useMemo(
    () => resolveChartDisplayCandleSource(sourceForDisplay, tradingViewFeed, mt5Feed),
    [sourceForDisplay, tradingViewFeed, mt5Feed]
  );
  const tradingViewCandles = displaySource.chartDisplayUsesTradingViewMcp ? displaySource.activeChartDisplayCandleSource : [];
  const tradingViewResearchEligible = displaySource.researchUsesTradingViewMcp;
  const mt5ResearchEligible = displaySource.researchUsesMt5ReadOnly;
  const activeCandles = displaySource.activeResearchCandleSource.length ? displaySource.activeResearchCandleSource : mockCandles;
  const chartCandles = displaySource.activeChartDisplayCandleSource.length ? displaySource.activeChartDisplayCandleSource : activeCandles;
  const sourceType = displaySource.activeResearchSourceMode;
  const chartSourceType = displaySource.activeChartDisplaySourceMode;
  const sourceLabel = displaySource.activeResearchSourceLabel;
  const chartSourceLabel = displaySource.activeChartDisplaySourceLabel;
  const mt5BrokerSymbol = mt5Runtime.brokerSymbol ?? mt5Feed?.brokerSymbol ?? "USTECH";
  const mt5RequestedSymbol = mt5Feed?.requestedSymbol ?? "MNQ";
  const sessionTimeMapping = useMemo(
    () =>
      resolveSessionTimeMapping({
        provider: sourceType,
        requestedSymbol: mt5RequestedSymbol,
        brokerSymbol: mt5BrokerSymbol,
        candles: activeCandles
      }),
    [activeCandles, mt5BrokerSymbol, mt5RequestedSymbol, sourceType]
  );

  const analysis = useMemo(() => {
    const latestAnalysisCandle = activeCandles[activeCandles.length - 1];
    const swings = detectSwings(activeCandles, 2);
    const mss = detectMSS(activeCandles, swings);
    const bos = detectBOS(activeCandles, swings);
    const sweeps = detectLiquiditySweeps(activeCandles, swings);
    const gaps = detectFairValueGaps(activeCandles);
    const zone = detectPremiumDiscount(activeCandles, swings);
    const sessions = tagSessions(activeCandles, sessionTimeMapping);
    const structureEvents = [...mss, ...bos].sort((a, b) => a.index - b.index);
    const grinchPhase1 = analyzeGrinchPhase1({
      candles: activeCandles,
      fairValueGaps: gaps,
      liquiditySweeps: sweeps,
      structureEvents,
      swings,
      options: {
        symbol: latestAnalysisCandle?.symbol,
        timeframe: latestAnalysisCandle?.timeframe,
        currentTimestamp: latestAnalysisCandle?.timestamp,
        sourceProvider: sourceType,
        requestedSymbol: mt5RequestedSymbol,
        brokerSymbol: mt5BrokerSymbol,
        sessionTimeMapping
      }
    });
    const grinchReversalProfile = analyzeGrinchPhase2Reversal({
      candles: activeCandles,
      fairValueGaps: gaps,
      liquiditySweeps: sweeps,
      structureEvents,
      swings,
      phase1: grinchPhase1,
      options: {
        symbol: latestAnalysisCandle?.symbol,
        timeframe: latestAnalysisCandle?.timeframe,
        currentTimestamp: latestAnalysisCandle?.timestamp,
        sourceProvider: sourceType,
        requestedSymbol: mt5RequestedSymbol,
        brokerSymbol: mt5BrokerSymbol,
        sessionTimeMapping
      }
    });
    const grinchConsolidationProfile = analyzeGrinchPhase3Consolidation({
      candles: activeCandles,
      fairValueGaps: gaps,
      liquiditySweeps: sweeps,
      structureEvents,
      swings,
      phase1: grinchPhase1,
      options: {
        symbol: latestAnalysisCandle?.symbol,
        timeframe: latestAnalysisCandle?.timeframe,
        currentTimestamp: latestAnalysisCandle?.timestamp,
        sourceProvider: sourceType,
        requestedSymbol: mt5RequestedSymbol,
        brokerSymbol: mt5BrokerSymbol,
        sessionTimeMapping
      }
    });
    const grinchSmtProfile = analyzeGrinchPhase4Smt({
      candles: activeCandles,
      fairValueGaps: gaps,
      liquiditySweeps: sweeps,
      structureEvents,
      swings,
      phase1: grinchPhase1,
      reversal: grinchReversalProfile,
      consolidation: grinchConsolidationProfile,
      options: {
        symbol: latestAnalysisCandle?.symbol,
        timeframe: latestAnalysisCandle?.timeframe,
        currentTimestamp: latestAnalysisCandle?.timestamp,
        sourceProvider: sourceType,
        requestedSymbol: mt5RequestedSymbol,
        brokerSymbol: mt5BrokerSymbol,
        sessionTimeMapping
      }
    });
    const grinchStrategyScore = calculateGrinchStrategyScore({
      candles: activeCandles,
      fairValueGaps: gaps,
      liquiditySweeps: sweeps,
      structureEvents,
      swings,
      phase1: grinchPhase1,
      reversal: grinchReversalProfile,
      consolidation: grinchConsolidationProfile,
      smt: grinchSmtProfile,
      options: {
        symbol: latestAnalysisCandle?.symbol,
        timeframe: latestAnalysisCandle?.timeframe,
        currentTimestamp: latestAnalysisCandle?.timestamp,
        sourceProvider: sourceType,
        requestedSymbol: mt5RequestedSymbol,
        brokerSymbol: mt5BrokerSymbol,
        sessionTimeMapping
      }
    });
    return { bos, gaps, grinchConsolidationProfile, grinchPhase1, grinchReversalProfile, grinchSmtProfile, grinchStrategyScore, mss, sessions, structureEvents, sweeps, swings, zone };
  }, [activeCandles, mt5BrokerSymbol, mt5RequestedSymbol, sessionTimeMapping, sourceType]);

  const latestCandle = activeCandles[activeCandles.length - 1];
  const chartLatestCandle = chartCandles[chartCandles.length - 1] ?? latestCandle;
  const latestSession = analysis.sessions[analysis.sessions.length - 1];
  const latestStructure = analysis.structureEvents[analysis.structureEvents.length - 1];
  const latestSweep = analysis.sweeps[analysis.sweeps.length - 1];
  const unmitigatedGaps = analysis.gaps.filter((gap) => !gap.mitigated);
  const sessionCounts = analysis.sessions.reduce<Record<string, number>>((counts, session) => {
    counts[session.session] = (counts[session.session] ?? 0) + 1;
    return counts;
  }, {});
  const grinchProfileDiagnostics = useMemo(
    () =>
      buildGrinchProfileEvidenceDiagnostics({
        phase1: analysis.grinchPhase1,
        reversal: analysis.grinchReversalProfile,
        consolidation: analysis.grinchConsolidationProfile,
        score: analysis.grinchStrategyScore
      }),
    [analysis]
  );

  useEffect(() => {
    const refreshTradingViewStatus = () => {
      setTradingViewRuntime(resolveTradingViewMcpRuntimeState());
      setTradingViewFeed(loadActiveTradingViewMcpChartFeed());
      void hydrateActiveTradingViewMcpChartFeed()
        .then((feed) => {
          setTradingViewRuntime(resolveTradingViewMcpRuntimeState(feed));
          setTradingViewFeed(feed);
        })
        .catch(() => undefined);
    };
    refreshTradingViewStatus();
    window.addEventListener(TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT, refreshTradingViewStatus);
    window.addEventListener(TRADINGVIEW_MCP_EVIDENCE_UPDATED_EVENT, refreshTradingViewStatus);
    window.addEventListener(TRADINGVIEW_MCP_SETTINGS_UPDATED_EVENT, refreshTradingViewStatus);
    window.addEventListener("storage", refreshTradingViewStatus);
    return () => {
      window.removeEventListener(TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT, refreshTradingViewStatus);
      window.removeEventListener(TRADINGVIEW_MCP_EVIDENCE_UPDATED_EVENT, refreshTradingViewStatus);
      window.removeEventListener(TRADINGVIEW_MCP_SETTINGS_UPDATED_EVENT, refreshTradingViewStatus);
      window.removeEventListener("storage", refreshTradingViewStatus);
    };
  }, []);

  useEffect(() => {
    const refreshMt5Status = () => {
      setMt5Runtime(resolveMt5ReadOnlyRuntimeState());
      setMt5Feed(loadActiveMt5ReadOnlyCandleFeed());
      void hydrateActiveMt5ReadOnlyCandleFeed()
        .then((feed) => {
          setMt5Runtime(resolveMt5ReadOnlyRuntimeState(feed));
          setMt5Feed(feed);
        })
        .catch(() => undefined);
    };
    refreshMt5Status();
    window.addEventListener(MT5_READ_ONLY_UPDATED_EVENT, refreshMt5Status);
    window.addEventListener("storage", refreshMt5Status);
    return () => {
      window.removeEventListener(MT5_READ_ONLY_UPDATED_EVENT, refreshMt5Status);
      window.removeEventListener("storage", refreshMt5Status);
    };
  }, []);

  const chartData = useMemo(() => {
    const visualOnlyTradingViewChart = tradingViewCandles.length > 0 && !tradingViewResearchEligible;
    const visualOnlyMt5Chart = displaySource.chartDisplayUsesMt5ReadOnly && !mt5ResearchEligible;
    const base = createTradingChartData({
      candles: chartCandles,
      sourceLabel: chartSourceLabel,
      sourceType: chartSourceType,
      symbol: chartLatestCandle?.symbol,
      timeframe: chartLatestCandle?.timeframe
    });
    const chartBias: MarketBias = visualOnlyTradingViewChart || visualOnlyMt5Chart ? "neutral" : latestStructure?.direction ?? "neutral";
    const overlays = visualOnlyTradingViewChart || visualOnlyMt5Chart
      ? [buildVwapOverlay(chartCandles)].filter((overlay): overlay is TradingChartLineOverlay => Boolean(overlay))
      : [
      buildVwapOverlay(activeCandles),
      horizontalOverlay(activeCandles, analysis.grinchPhase1.sundayOpenState.price, "grinch-sunday-open", "Sunday Open", "#a78bfa", "liquidity_level", {
        lineWidth: 2
      }),
      horizontalOverlay(activeCandles, analysis.grinchPhase1.twelveAmOpenState.price, "grinch-12am-open", "12AM Open", "#38bdf8", "liquidity_level", {
        lineWidth: 2
      }),
      horizontalOverlay(activeCandles, analysis.grinchPhase1.dealingRange.rangeHigh, "grinch-range-high", "Grinch range high", "#f59e0b", "liquidity_level", {
        visibleByDefault: false
      }),
      horizontalOverlay(activeCandles, analysis.grinchPhase1.dealingRange.equilibrium, "grinch-equilibrium", "Grinch equilibrium", "#facc15", "liquidity_level"),
      horizontalOverlay(activeCandles, analysis.grinchPhase1.dealingRange.rangeLow, "grinch-range-low", "Grinch range low", "#14b8a6", "liquidity_level", {
        visibleByDefault: false
      }),
      horizontalOverlay(
        activeCandles,
        analysis.grinchPhase1.activePdArrays[0]?.midpoint,
        "grinch-active-pd-array",
        analysis.grinchPhase1.activePdArrays[0]?.label ?? "Active PD array",
        "#f472b6",
        "liquidity_level",
        { visibleByDefault: Boolean(analysis.grinchPhase1.activePdArrays[0]) }
      ),
      horizontalOverlay(
        activeCandles,
        analysis.grinchConsolidationProfile.consolidationRange.rangeHigh,
        "grinch-consolidation-high",
        "Consolidation high",
        "#fb7185",
        "liquidity_level",
        { visibleByDefault: analysis.grinchConsolidationProfile.consolidationProfileState === "valid" }
      ),
      horizontalOverlay(
        activeCandles,
        analysis.grinchConsolidationProfile.consolidationRange.rangeMidpoint,
        "grinch-consolidation-mid",
        "Consolidation midpoint",
        "#c084fc",
        "liquidity_level",
        { visibleByDefault: analysis.grinchConsolidationProfile.consolidationProfileState === "valid" }
      ),
      horizontalOverlay(
        activeCandles,
        analysis.grinchConsolidationProfile.consolidationRange.rangeLow,
        "grinch-consolidation-low",
        "Consolidation low",
        "#34d399",
        "liquidity_level",
        { visibleByDefault: analysis.grinchConsolidationProfile.consolidationProfileState === "valid" }
      ),
      ...buildPremiumDiscountOverlays(activeCandles, analysis.zone),
      ...buildSwingLevelOverlays(activeCandles, analysis.swings, 6)
    ].filter((overlay): overlay is TradingChartLineOverlay => Boolean(overlay));

    return {
      ...base,
      bias: chartBias,
      lineOverlays: overlays,
      markers: visualOnlyTradingViewChart || visualOnlyMt5Chart ? [] : buildIctMarkers({
        structureEvents: analysis.structureEvents.slice(-18) as MarketStructureEvent[],
        sweeps: analysis.sweeps.slice(-14)
      }),
      stateLabel: visualOnlyTradingViewChart
        ? "visual only / tradingview_mcp_chart"
        : visualOnlyMt5Chart
          ? "visual only / mt5_read_only"
          : `${analysis.zone.currentZone} / ${sourceType}`,
      zoneOverlays: visualOnlyTradingViewChart || visualOnlyMt5Chart ? [] : buildFvgZoneOverlays(activeCandles, analysis.gaps)
    };
  }, [
    activeCandles,
    analysis,
    chartCandles,
    chartLatestCandle?.symbol,
    chartLatestCandle?.timeframe,
    chartSourceLabel,
    chartSourceType,
    latestStructure?.direction,
    mt5ResearchEligible,
    sourceType,
    displaySource.chartDisplayUsesMt5ReadOnly,
    tradingViewCandles.length,
    tradingViewResearchEligible
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Structured ICT context engine</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">ICT Lab</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Deterministic market-structure analysis over the active research candle source.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={sourceType === "imported" ? "success" : "warning"}>
            {sourceType === "tradingview_mcp_chart"
              ? "TradingView research source active"
              : sourceType === "mt5_read_only"
                ? "MT5 research source active"
              : sourceType === "imported"
                ? "Imported data active"
                : "Mock data active"}
          </Badge>
          {tradingViewCandles.length && !tradingViewResearchEligible ? (
            <Badge variant="warning">TradingView visual only</Badge>
          ) : null}
          {displaySource.chartDisplayUsesMt5ReadOnly && !mt5ResearchEligible ? (
            <Badge variant="warning">MT5 visual only</Badge>
          ) : null}
          <Badge variant={mt5Runtime.candleFeedAvailable ? "success" : "secondary"}>
            MT5 {mt5Runtime.connectionStatus.replace(/_/g, " ")}
          </Badge>
          <Badge variant="muted">No execution</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Candles" value={String(activeCandles.length)} detail={`${latestCandle.symbol} ${latestCandle.timeframe}`} icon={<ChartCandlestick className="h-4 w-4" />} />
        <MetricCard label="Swings" value={String(analysis.swings.length)} detail="Confirmed pivots" icon={<ScanLine className="h-4 w-4" />} />
        <MetricCard label="MSS / BOS" value={`${analysis.mss.length} / ${analysis.bos.length}`} detail={latestStructure?.direction ?? "none"} icon={<Layers className="h-4 w-4" />} />
        <MetricCard label="Sweeps" value={String(analysis.sweeps.length)} detail={latestSweep?.direction ?? "none"} icon={<Target className="h-4 w-4" />} />
        <MetricCard label="Open FVGs" value={String(unmitigatedGaps.length)} detail={`${analysis.zone.currentZone} now`} icon={<Activity className="h-4 w-4" />} />
      </div>

      <Card className="border-cyan-300/20 bg-cyan-300/5">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Active Source Provenance</CardTitle>
              <CardDescription>
                ICT analysis reads the canonical active candle source. MT5 read-only is CFD/proxy market data with no execution authority.
              </CardDescription>
            </div>
            <Badge variant={sourceType === "mt5_read_only" || chartSourceType === "mt5_read_only" ? "success" : "warning"}>
              {sourceType === "mt5_read_only" || chartSourceType === "mt5_read_only" ? "MT5 read-only active" : "fallback source active"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-4">
          <StatusTile label="Chart source" value={chartSourceType.replace(/_/g, " ")} />
          <StatusTile label="Research source" value={sourceType.replace(/_/g, " ")} />
          <StatusTile label="Broker symbol" value={chartSourceType === "mt5_read_only" || sourceType === "mt5_read_only" ? mt5BrokerSymbol : "n/a"} />
          <StatusTile label="Authority" value="execution none" />
          <div className="rounded-lg border border-cyan-300/20 bg-background/45 p-3 text-cyan-100 md:col-span-4">
            {sourceType === "mt5_read_only" || chartSourceType === "mt5_read_only"
              ? `MT5 read-only is active for GoTrader ${mt5RequestedSymbol} via broker symbol ${mt5BrokerSymbol}. Treat this as CFD/proxy chart data, not CME MNQ futures broker truth.`
              : tradingViewCandles.length
              ? tradingViewResearchEligible
                ? `TradingView MCP chart feed is active for research analysis with ${tradingViewCandles.length.toLocaleString()} read-only candles. It is still not broker truth.`
                : `Displaying TradingView MCP candles visually; analysis uses ${displaySource.activeResearchSourceLabel} unless research eligibility passes. ${tradingViewFeed?.researchEligibility.reasons[0] ?? "It is not eligible for ICT analysis."}`
              : tradingViewRuntime.latestEvidence?.technicalSummary ??
                "TradingView MCP evidence is not connected. ICT Lab is using GoTrader candles and deterministic structure analysis only."}
          </div>
          <div className="rounded-lg border border-cyan-300/20 bg-background/45 p-3 text-xs text-cyan-100/80 md:col-span-4">
            Chart input: {displaySource.chartDisplayIdentity.sourceLabel} / {displaySource.chartDisplayIdentity.candleCount.toLocaleString()} candles / first{" "}
            {displaySource.chartDisplayIdentity.firstTimestamp ?? "n/a"} close {displaySource.chartDisplayIdentity.firstClose ?? "n/a"} / last{" "}
            {displaySource.chartDisplayIdentity.lastTimestamp ?? "n/a"} close {displaySource.chartDisplayIdentity.lastClose ?? "n/a"}.
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-300/20 bg-emerald-300/5">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Grinch Strategy Score</CardTitle>
              <CardDescription>
                Research-only score used by Auto Research and walk-forward as supporting evidence. It cannot approve readiness by itself.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={analysis.grinchStrategyScore.grinchModelScore >= 70 ? "success" : analysis.grinchStrategyScore.grinchModelScore >= 50 ? "warning" : "muted"}>
                Score {analysis.grinchStrategyScore.grinchModelScore}/100
              </Badge>
              <Badge variant={analysis.grinchStrategyScore.falsePositiveRisk >= 55 ? "danger" : analysis.grinchStrategyScore.falsePositiveRisk >= 35 ? "warning" : "success"}>
                False-positive risk {analysis.grinchStrategyScore.falsePositiveRisk}/100
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {analysis.grinchStrategyScore.hardGateReason ||
          analysis.grinchStrategyScore.timingGrade === "expired" ||
          analysis.grinchStrategyScore.modelOneBlocked ||
          analysis.grinchStrategyScore.noValidProfile ||
          analysis.grinchStrategyScore.profileState === "weak" ? (
            <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
              <p className="font-medium">
                {analysis.grinchStrategyScore.noValidProfile
                  ? "No valid Grinch profile in this window."
                  : analysis.grinchStrategyScore.fallbackProfileUsed !== "none"
                    ? "Model 1 blocked. Evaluating Reversal/Consolidation fallback."
                    : "Grinch profile is weak and timing is expired; this should be treated as no-trade or low-probability."}
              </p>
              <p className="mt-1 text-amber-100/80">
                High entry confirmation, opening-price alignment, or PD alignment cannot override an expired, weak, or missing profile gate.
              </p>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatusTile label="Active profile" value={analysis.grinchStrategyScore.activeProfile.replace(/_/g, " ")} detail={analysis.grinchStrategyScore.profileState} />
            <StatusTile label="HTF alignment" value={`${analysis.grinchStrategyScore.htfBiasAlignment}/100`} detail={analysis.grinchPhase1.htfBias} />
            <StatusTile label="PD alignment" value={`${analysis.grinchStrategyScore.pdArrayHierarchyAlignment}/100`} detail={analysis.grinchPhase1.activePdArrays[0]?.label ?? "none active"} />
            <StatusTile label="Opening alignment" value={`${analysis.grinchStrategyScore.openingPriceAlignment}/100`} detail={`12AM ${analysis.grinchPhase1.twelveAmOpenState.currentRelation}`} />
            <StatusTile label="SMT confirmation" value={`${analysis.grinchStrategyScore.smtConfirmationScore}/100`} detail={analysis.grinchStrategyScore.smtState.replace(/_/g, " ")} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <InfoBox title="Profile fallback" body={analysis.grinchStrategyScore.noValidProfile ? "No valid Grinch profile in this window; no-trade is the correct research classification." : analysis.grinchStrategyScore.fallbackProfileUsed !== "none" ? `Model 1 fallback selected ${analysis.grinchStrategyScore.fallbackProfileUsed}.` : "Model 1 remains the active timing-valid profile."} />
            <InfoBox title="Entry confirmation" body={`${analysis.grinchStrategyScore.entryConfirmationScore}/100; timing ${analysis.grinchStrategyScore.timingAlignment}/100.`} />
            <InfoBox title="Primary rule block" body={analysis.grinchStrategyScore.primaryRuleBlock ?? "No blocking Grinch rule on the latest profile."} />
            <InfoBox title="Why it matters" body={analysis.grinchStrategyScore.hardGateReason ? `Hard gate ${analysis.grinchStrategyScore.hardGateReason} blocks this as a Grinch-supported trade.` : analysis.grinchStrategyScore.reasons[0] ?? "Grinch scoring is waiting for enough profile evidence."} />
          </div>
          {analysis.grinchStrategyScore.ruleBlocks.length || analysis.grinchStrategyScore.missingEvidence.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                <p className="font-medium">Rules blocking or discounting setup quality</p>
                <ul className="mt-2 space-y-1">
                  {(analysis.grinchStrategyScore.ruleBlocks.length ? analysis.grinchStrategyScore.ruleBlocks : ["No hard Grinch rule block on the latest profile."]).slice(0, 5).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Missing evidence</p>
                <ul className="mt-2 space-y-1">
                  {(analysis.grinchStrategyScore.missingEvidence.length ? analysis.grinchStrategyScore.missingEvidence : ["No missing evidence flagged by the score."]).slice(0, 5).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-amber-300/20 bg-amber-300/5">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Grinch Profile Evidence</CardTitle>
              <CardDescription>
                Explains why the latest ICT foundation did or did not become a Grinch-qualified setup.
              </CardDescription>
            </div>
            <Badge variant={analysis.grinchStrategyScore.noValidProfile ? "warning" : "success"}>
              {analysis.grinchStrategyScore.noValidProfile ? "no valid profile" : "profile evidence present"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoBox title="No-valid-profile reason" body={grinchProfileDiagnostics.noValidProfileReason} />
            <InfoBox title="Timing window" body={grinchProfileDiagnostics.timingWindowStatus} />
            <InfoBox title="Session clock assumption" body={grinchProfileDiagnostics.sessionTimezoneAssumption} />
            <InfoBox title="Hard gate" body={grinchProfileDiagnostics.hardGateReason} />
            {grinchProfileDiagnostics.openingReferences.map((reference) => (
              <InfoBox
                key={reference.label}
                title={`${reference.label} timestamp used`}
                body={`Raw ${reference.timestamp}; local ${reference.localTimestamp}; price ${reference.price}; relation ${reference.relation}; fallback ${reference.fallbackMethod}; source zone ${reference.sourceTimestampZone}. ${
                  reference.missingEvidence[0] ?? "Reference available."
                }`}
              />
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-amber-300/20">
            <table className="min-w-full divide-y divide-amber-300/15 text-left text-xs">
              <thead className="bg-amber-300/10 text-amber-100">
                <tr>
                  <th className="px-3 py-2 font-semibold">Profile</th>
                  <th className="px-3 py-2 font-semibold">State / timing</th>
                  <th className="px-3 py-2 font-semibold">Candidates</th>
                  <th className="px-3 py-2 font-semibold">Selectable</th>
                  <th className="px-3 py-2 font-semibold">Gate reason</th>
                  <th className="px-3 py-2 font-semibold">Missing evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-300/10 bg-background/35 text-muted-foreground">
                {grinchProfileDiagnostics.rows.map((row) => {
                  const evidenceText =
                    row.missingEvidence.slice(0, 3).join(" / ") || row.reasons.slice(0, 2).join(" / ") || "No missing evidence listed.";
                  return (
                    <tr key={row.profile}>
                      <td className="px-3 py-2 font-medium text-foreground">{row.label}</td>
                      <td className="px-3 py-2">
                        {row.state.replace(/_/g, " ")} / {row.timingGrade.replace(/_/g, " ")}
                      </td>
                      <td className="px-3 py-2 font-mono">{row.candidateCount}</td>
                      <td className="px-3 py-2">{row.selectable ? "yes" : "no"}</td>
                      <td className="px-3 py-2">{row.blockReason}</td>
                      <td className="px-3 py-2">{evidenceText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-cyan-400/20 bg-cyan-400/5">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Grinch ICT Phase 1 / Model 1</CardTitle>
              <CardDescription>
                Higher-timeframe bias, opening-price equilibrium, dealing range, PD hierarchy, cycle, timing, and Power 3 OTE profile.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={analysis.grinchPhase1.modelOneState === "valid" ? "success" : analysis.grinchPhase1.modelOneState === "weak" ? "warning" : "muted"}>
                Model 1 {analysis.grinchPhase1.modelOneState.replace(/_/g, " ")}
              </Badge>
              <Badge variant={analysis.grinchPhase1.tradeIntent === "no_trade" ? "muted" : "warning"}>
                {analysis.grinchPhase1.tradeIntent.replace(/_/g, " ")}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatusTile label="HTF bias" value={analysis.grinchPhase1.htfBias} detail={`Draw: ${analysis.grinchPhase1.htfDrawOnLiquidity}`} />
            <StatusTile
              label="Dealing range"
              value={analysis.grinchPhase1.dealingRange.premiumDiscountState}
              detail={`${analysis.grinchPhase1.dealingRange.rangeLow} / ${analysis.grinchPhase1.dealingRange.equilibrium} / ${analysis.grinchPhase1.dealingRange.rangeHigh}`}
            />
            <StatusTile label="Market cycle" value={analysis.grinchPhase1.marketCycle} detail={`Timing: ${analysis.grinchPhase1.timingGrade}`} />
            <StatusTile
              label="PD hierarchy"
              value={analysis.grinchPhase1.activePdArrays[0]?.label ?? "none active"}
              detail={`${analysis.grinchPhase1.activePdArrays.length} active / ${analysis.grinchPhase1.rankedPdArrays.length} ranked`}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <InfoBox title="Target hierarchy" body={`${analysis.grinchPhase1.targetHierarchy.target1} → ${analysis.grinchPhase1.targetHierarchy.target2} → ${analysis.grinchPhase1.targetHierarchy.target3}`} />
            <InfoBox title="Invalidation" body={analysis.grinchPhase1.invalidation.primaryInvalidation} />
            <InfoBox title="Opening prices" body={`Sunday: ${analysis.grinchPhase1.sundayOpenState.currentRelation}; 12AM: ${analysis.grinchPhase1.twelveAmOpenState.currentRelation}`} />
          </div>
          {analysis.grinchPhase1.missingEvidence.length ? (
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              <p className="font-medium">Missing evidence</p>
              <ul className="mt-2 space-y-1">
                {analysis.grinchPhase1.missingEvidence.slice(0, 5).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-violet-400/20 bg-violet-400/5">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Grinch ICT Phase 3 / Consolidation Profile</CardTitle>
              <CardDescription>
                Tracks tight consolidation around 12AM Open into NY, consolidation-side raids, 12AM support/resistance, and expansion direction.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  analysis.grinchConsolidationProfile.consolidationProfileState === "valid"
                    ? "success"
                    : analysis.grinchConsolidationProfile.consolidationProfileState === "weak"
                      ? "warning"
                      : "muted"
                }
              >
                Consolidation {analysis.grinchConsolidationProfile.consolidationProfileState.replace(/_/g, " ")}
              </Badge>
              <Badge variant={analysis.grinchConsolidationProfile.entryIntent === "no_trade" ? "muted" : "warning"}>
                {analysis.grinchConsolidationProfile.entryIntent.replace(/_/g, " ")}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatusTile
              label="Consolidation range"
              value={analysis.grinchConsolidationProfile.consolidationRange.isTight ? "tight" : "not tight"}
              detail={`${analysis.grinchConsolidationProfile.consolidationRange.rangeLow ?? "n/a"} / ${analysis.grinchConsolidationProfile.consolidationRange.rangeMidpoint ?? "n/a"} / ${analysis.grinchConsolidationProfile.consolidationRange.rangeHigh ?? "n/a"}`}
            />
            <StatusTile
              label="12AM relationship"
              value={analysis.grinchConsolidationProfile.twelveAmRelationship.replace(/_/g, " ")}
              detail={`Timing: ${analysis.grinchConsolidationProfile.timingGrade}`}
            />
            <StatusTile
              label="Liquidity raid"
              value={analysis.grinchConsolidationProfile.liquidityRaidState.replace(/([A-Z])/g, " $1")}
              detail={`Expansion: ${analysis.grinchConsolidationProfile.expectedExpansionDirection}`}
            />
            <StatusTile
              label="Target 1"
              value={analysis.grinchConsolidationProfile.targetHierarchy.target1}
              detail={`Confidence adj ${analysis.grinchConsolidationProfile.confidenceAdjustment}`}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <InfoBox title="Target path" body={`${analysis.grinchConsolidationProfile.targetHierarchy.target1} → ${analysis.grinchConsolidationProfile.targetHierarchy.target2} → ${analysis.grinchConsolidationProfile.targetHierarchy.target3}`} />
            <InfoBox title="Invalidation" body={analysis.grinchConsolidationProfile.invalidation.primaryInvalidation} />
            <InfoBox title="Profile reason" body={analysis.grinchConsolidationProfile.reasons[0] ?? "No consolidation profile evidence yet."} />
          </div>
          {analysis.grinchConsolidationProfile.missingEvidence.length ? (
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              <p className="font-medium">Consolidation profile missing evidence</p>
              <ul className="mt-2 space-y-1">
                {analysis.grinchConsolidationProfile.missingEvidence.slice(0, 5).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-fuchsia-400/20 bg-fuchsia-400/5">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Grinch ICT Phase 4 / SMT Intermarket Confirmation</CardTitle>
              <CardDescription>
                Confirms or conflicts with the active Grinch profile by comparing NQ, ES, and YM liquidity raids. It cannot create standalone trade signals.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  analysis.grinchSmtProfile.smtState === "bullish_confirmation" || analysis.grinchSmtProfile.smtState === "bearish_confirmation"
                    ? "success"
                    : analysis.grinchSmtProfile.smtState === "conflict"
                      ? "danger"
                      : analysis.grinchSmtProfile.smtState === "unavailable"
                        ? "warning"
                        : "muted"
                }
              >
                SMT {analysis.grinchSmtProfile.smtState.replace(/_/g, " ")}
              </Badge>
              <Badge variant="secondary">{analysis.grinchSmtProfile.primaryPair}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatusTile
              label="Divergence"
              value={analysis.grinchSmtProfile.divergenceType.replace(/_/g, " ")}
              detail={`Liquidity taken: ${analysis.grinchSmtProfile.liquidityTaken}`}
            />
            <StatusTile
              label="Leader / non-confirming"
              value={`${analysis.grinchSmtProfile.leaderInstrument} / ${analysis.grinchSmtProfile.nonConfirmingInstrument}`}
              detail={`Pair: ${analysis.grinchSmtProfile.primaryPair}`}
            />
            <StatusTile
              label="Supports bias"
              value={String(analysis.grinchSmtProfile.supportsBias)}
              detail={`Supports profile: ${String(analysis.grinchSmtProfile.supportsActiveProfile)}`}
            />
            <StatusTile
              label="Confidence adjustment"
              value={String(analysis.grinchSmtProfile.confidenceAdjustment)}
              detail={`Active profile: ${analysis.grinchSmtProfile.activeProfile.replace(/_/g, " ")}`}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <InfoBox title="Confirmation rule" body="SMT can support or weaken an existing HTF/profile thesis, but it cannot create bias or an entry by itself." />
            <InfoBox title="Profile reason" body={analysis.grinchSmtProfile.reasons[0] ?? "No SMT confirmation is available yet."} />
            <InfoBox title="Conflict warning" body={analysis.grinchSmtProfile.conflictWarning ?? "No SMT conflict warning."} />
          </div>
          {analysis.grinchSmtProfile.missingEvidence.length ? (
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              <p className="font-medium">SMT missing evidence</p>
              <ul className="mt-2 space-y-1">
                {analysis.grinchSmtProfile.missingEvidence.slice(0, 5).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-fuchsia-400/20 bg-fuchsia-400/5">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Grinch ICT Phase 2 / Reversal Profile</CardTitle>
              <CardDescription>
                Detects failed London interaction with 12AM Open, expansion into NY, first target back to 12AM, and continuation quality.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  analysis.grinchReversalProfile.reversalProfileState === "valid"
                    ? "success"
                    : analysis.grinchReversalProfile.reversalProfileState === "weak"
                      ? "warning"
                      : "muted"
                }
              >
                Reversal {analysis.grinchReversalProfile.reversalProfileState.replace(/_/g, " ")}
              </Badge>
              <Badge variant={analysis.grinchReversalProfile.entryIntent === "reversal_entry" ? "warning" : "secondary"}>
                {analysis.grinchReversalProfile.entryIntent.replace(/_/g, " ")}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatusTile
              label="12AM interaction"
              value={analysis.grinchReversalProfile.twelveAmInteractionState.replace(/_/g, " ")}
              detail={`London: ${analysis.grinchReversalProfile.londonBehavior.replace(/_/g, " ")}`}
            />
            <StatusTile
              label="NY reversal window"
              value={analysis.grinchReversalProfile.nyReversalWindow}
              detail={`Timing: ${analysis.grinchReversalProfile.timingGrade}`}
            />
            <StatusTile
              label="First target"
              value="12AM Open"
              detail={analysis.grinchReversalProfile.firstTargetPrice?.toFixed(2) ?? "level unavailable"}
            />
            <StatusTile
              label="Beyond 12AM"
              value={analysis.grinchReversalProfile.continuationBeyond12am}
              detail={`Confidence adj ${analysis.grinchReversalProfile.confidenceAdjustment}`}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <InfoBox title="Invalidation" body={analysis.grinchReversalProfile.invalidation.primaryInvalidation} />
            <InfoBox
              title="Continuation rule"
              body="Beyond 12AM requires HTF draw, displacement/reclaim, and a valid PD array or liquidity target beyond the open."
            />
            <InfoBox title="Profile reason" body={analysis.grinchReversalProfile.reasons[0] ?? "No reversal profile evidence yet."} />
          </div>
          {analysis.grinchReversalProfile.missingEvidence.length ? (
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              <p className="font-medium">Reversal profile missing evidence</p>
              <ul className="mt-2 space-y-1">
                {analysis.grinchReversalProfile.missingEvidence.slice(0, 5).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>ICT Candle Map</CardTitle>
              <CardDescription>
                {latestCandle.symbol} {latestCandle.timeframe} closes at {latestCandle.close}; latest tag {latestSession?.label ?? "none"}.
              </CardDescription>
            </div>
            <Badge variant={analysis.zone.currentZone === "discount" ? "success" : analysis.zone.currentZone === "premium" ? "warning" : "secondary"}>
              {analysis.zone.currentZone}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <TradingChart key={chartData.source.sourceKey} {...chartData} heightClassName="h-[460px]" />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Structure Tape</CardTitle>
            <CardDescription>Confirmed swing breaks and continuation events from the active source.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.structureEvents.slice(-8).map((event) => (
              <div key={event.id} className="rounded-lg border border-border bg-background/45 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={event.type === "MSS" ? "warning" : "secondary"}>{event.type}</Badge>
                    <Badge variant={directionVariant(event.direction)}>{event.direction}</Badge>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{formatTime(event.timestamp)}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{event.description}</p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">displacement: {event.displacement}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dealing Range</CardTitle>
            <CardDescription>Premium, discount, and equilibrium from confirmed structure.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs text-muted-foreground">Range high</p>
                <p className="mt-1 font-mono text-lg">{analysis.zone.rangeHigh}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs text-muted-foreground">Range low</p>
                <p className="mt-1 font-mono text-lg">{analysis.zone.rangeLow}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs text-muted-foreground">Equilibrium</p>
                <p className="mt-1 font-mono text-lg">{analysis.zone.equilibrium}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs text-muted-foreground">Current</p>
                <p className="mt-1 font-mono text-lg">{analysis.zone.currentPrice}</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              {Object.entries(sessionCounts).map(([session, count]) => (
                <div key={session} className="flex items-center justify-between rounded-lg border border-border bg-background/45 px-3 py-2 text-sm">
                  <span>{session}</span>
                  <span className="font-mono text-muted-foreground">{count} candles</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Liquidity Sweeps</CardTitle>
            <CardDescription>Wick raids that rejected confirmed swing liquidity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.sweeps.slice(-5).map((sweep) => (
              <div key={sweep.id} className="rounded-lg border border-border bg-background/45 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={sweep.direction === "sell-side" ? "success" : "warning"}>{sweep.direction}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{formatTime(sweep.timestamp)}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{sweep.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fair Value Gaps</CardTitle>
            <CardDescription>Three-candle imbalances, including mitigated state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.gaps.slice(-5).map((gap) => (
              <div key={gap.id} className="rounded-lg border border-border bg-background/45 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant={directionVariant(gap.direction)}>{gap.direction}</Badge>
                  <Badge variant={gap.mitigated ? "muted" : "success"}>{gap.mitigated ? "mitigated" : "open"}</Badge>
                </div>
                <p className="mt-2 font-mono text-sm">
                  {gap.start} - {gap.end}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{gap.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session Tags</CardTitle>
            <CardDescription>Exchange-local timestamps tagged by session and kill zone.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.sessions.slice(-8).map((session: SessionContext) => (
              <div key={session.candleId} className="flex items-center justify-between rounded-lg border border-border bg-background/45 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span>{formatTime(session.timestamp)}</span>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge variant="secondary">{session.session}</Badge>
                  <Badge variant={session.killZone === "none" ? "muted" : "warning"}>{session.killZone}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
        <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
        Research-only ICT context. No broker connection, live feed, websocket, order routing, or execution logic is present.
      </div>
    </div>
  );
}

function StatusTile({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/45 p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-sm text-foreground">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function InfoBox({ body, title }: { body: string; title: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/45 p-3">
      <p className="text-xs uppercase text-muted-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
