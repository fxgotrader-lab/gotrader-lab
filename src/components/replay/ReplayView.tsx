import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, ShieldAlert, SkipBack, SkipForward } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { TradingChart } from "@/components/charts/TradingChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  createMockBacktestCandleSource,
  createReplayState,
  describeBacktestConfig,
  getReplayFrame,
  jumpReplay,
  clearReplaySnapshotSourceMeta,
  loadResolvedBacktestCandleSource,
  runBacktest,
  sanitizeBacktestConfig,
  setReplayPlaying,
  storeReplaySnapshotSourceMeta,
  stepReplay
} from "@/lib/backtesting";
import type { BacktestResult, BacktestSourcePreference, ResolvedBacktestCandleSource } from "@/lib/backtesting";
import {
  buildIctMarkers,
  buildTradePlanOverlays,
  buildVwapOverlay,
  createTradingChartData,
  type ChartDataSourceType,
  type TradingChartLineOverlay
} from "@/lib/charting";
import { MT5_READ_ONLY_UPDATED_EVENT } from "@/lib/integrations/mt5";
import { resolveActiveBacktestConfig } from "@/lib/selfImprovement";
import type { FuturesSymbol, MarketBias, Timeframe, TradeThesis } from "@/lib/types";
import { formatPercent, formatSigned } from "@/lib/utils";

const formatTime = (timestamp?: string) => timestamp ? timestamp.slice(11, 16) : "n/a";
const formatDateTime = (timestamp?: string) => timestamp ? timestamp.replace("T", " ").slice(0, 16) : "n/a";
const formatSource = (value?: string) => (value ?? "unknown").replace(/_/g, " ");
const supportedReplaySymbols: FuturesSymbol[] = ["ES", "NQ", "MES", "MNQ"];
const supportedReplayTimeframes: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const sourceVariant = (source: ResolvedBacktestCandleSource) =>
  source.provider === "mt5_read_only" ? "success" as const : source.provider === "mock" ? "warning" as const : "secondary" as const;

const sourceTypeForReplay = (source: ResolvedBacktestCandleSource): ChartDataSourceType =>
  source.provider === "mt5_read_only"
    ? "mt5_read_only"
    : source.provider === "imported_historical"
      ? "imported"
      : source.provider === "tradingview_mcp"
        ? "tradingview_mcp_chart"
        : source.provider === "mock"
        ? "mock"
        : "replay";

const withReplaySourceTimeout = <T,>(promise: Promise<T>, timeoutMs = 12000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`Replay source resolution timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });

const supportedReplaySymbol = (symbol?: string): FuturesSymbol =>
  supportedReplaySymbols.includes(symbol as FuturesSymbol) ? symbol as FuturesSymbol : "MNQ";

const supportedReplayTimeframe = (timeframe?: string): Timeframe =>
  supportedReplayTimeframes.includes(timeframe as Timeframe) ? timeframe as Timeframe : "5m";

const configForReplaySource = (source: ResolvedBacktestCandleSource) =>
  sanitizeBacktestConfig({
    ...resolveActiveBacktestConfig().config,
    symbol: supportedReplaySymbol(source.requestedSymbol),
    timeframe: supportedReplayTimeframe(source.candles[0]?.timeframe ?? source.appliedSettings.targetTimeframe)
  });

const buildReplayBacktest = (source: ResolvedBacktestCandleSource) => runBacktest(source.candles, configForReplaySource(source));

const biasVariant = (bias?: MarketBias) => {
  if (bias === "bullish") {
    return "success" as const;
  }
  if (bias === "bearish") {
    return "danger" as const;
  }
  return "warning" as const;
};

function ReplayTradingChart({ frameCandles, source, snapshotCreatedAt, thesis, currentCandle }: {
  frameCandles: BacktestResult["candles"];
  source: ResolvedBacktestCandleSource;
  snapshotCreatedAt?: string;
  thesis?: TradeThesis;
  currentCandle?: BacktestResult["candles"][number];
}) {
  const chartData = useMemo(() => {
    const snapshotLabel = snapshotCreatedAt ? `Replay snapshot ${formatDateTime(snapshotCreatedAt)}` : "Replay snapshot";
    const base = createTradingChartData({
      candles: frameCandles,
      sourceLabel: `${snapshotLabel}: ${source.label}`,
      sourceType: sourceTypeForReplay(source),
      symbol: currentCandle?.symbol ?? frameCandles[0]?.symbol ?? source.requestedSymbol,
      timeframe: currentCandle?.timeframe ?? frameCandles[0]?.timeframe ?? source.appliedSettings.targetTimeframe
    });
    const vwap = buildVwapOverlay(frameCandles);
    return {
      ...base,
      bias: thesis?.finalBias ?? "neutral",
      lineOverlays: [vwap, ...buildTradePlanOverlays(frameCandles, thesis)].filter(
        (overlay): overlay is TradingChartLineOverlay => Boolean(overlay)
      ),
      markers: buildIctMarkers({ currentCandle, thesis }),
      stateLabel: source.provider === "mt5_read_only" ? "MT5 REPLAY SNAPSHOT" : "REPLAY SNAPSHOT"
    };
  }, [currentCandle, frameCandles, snapshotCreatedAt, source, thesis]);

  return (
    <TradingChart {...chartData} heightClassName="h-[340px]" />
  );
}

function ReplayControls({ result, isAtEnd, onSetState }: {
  result: BacktestResult;
  isAtEnd: boolean;
  onSetState: Dispatch<SetStateAction<ReturnType<typeof createReplayState>>>;
}) {
  const firstDecision = result.decisions[0]?.decisionIndex ?? 0;
  const lastIndex = result.candles.length - 1;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="icon" variant="outline" title="Jump to first decision" onClick={() => onSetState((state) => jumpReplay(setReplayPlaying(state, false), result, firstDecision))}>
        <SkipBack className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button size="icon" variant="outline" title="Step backward" onClick={() => onSetState((state) => stepReplay(setReplayPlaying(state, false), result, -1))}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="secondary"
        title={isAtEnd ? "Replay finished" : "Play or pause replay"}
        onClick={() => onSetState((state) => setReplayPlaying(state, !state.isPlaying && !isAtEnd))}
      >
        {isAtEnd ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
        {isAtEnd ? "Finished" : "Play / pause"}
      </Button>
      <Button size="icon" variant="outline" title="Pause" onClick={() => onSetState((state) => setReplayPlaying(state, false))}>
        <Pause className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button size="icon" variant="outline" title="Step forward" onClick={() => onSetState((state) => stepReplay(setReplayPlaying(state, false), result, 1))}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button size="icon" variant="outline" title="Jump to final candle" onClick={() => onSetState((state) => jumpReplay(setReplayPlaying(state, false), result, lastIndex))}>
        <SkipForward className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function ReplayView() {
  const [replaySource, setReplaySource] = useState<ResolvedBacktestCandleSource>(() => createMockBacktestCandleSource());
  const [backtest, setBacktest] = useState<BacktestResult>(() => buildReplayBacktest(createMockBacktestCandleSource()));
  const [replayState, setReplayState] = useState(() => createReplayState(backtest));
  const [snapshotStatus, setSnapshotStatus] = useState("Replay is waiting for a frozen active MT5 source snapshot.");
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotCreatedAt, setSnapshotCreatedAt] = useState<string>();
  const [snapshotMode, setSnapshotMode] = useState<BacktestSourcePreference>("active_research");
  const [snapshotReady, setSnapshotReady] = useState(false);
  const frame = useMemo(() => getReplayFrame(backtest, replayState), [backtest, replayState]);
  const progress = backtest.candles.length ? frame.currentIndex / Math.max(1, backtest.candles.length - 1) : 0;
  const activeIct = frame.activeDecision?.ictContext;
  const activeThesis = frame.activeThesis;
  const latestCompleted = frame.completedTrades.slice(-8).reverse();
  const isAtEnd = frame.currentIndex >= backtest.candles.length - 1;

  const createSnapshot = useCallback(async (
    preference: BacktestSourcePreference = "active_research",
    options: { requireMt5?: boolean } = {}
  ) => {
    setSnapshotBusy(true);
    setReplayState((state) => setReplayPlaying(state, false));
    try {
      const source = await withReplaySourceTimeout(loadResolvedBacktestCandleSource({ preference }));
      if (options.requireMt5 && source.provider !== "mt5_read_only") {
        clearReplaySnapshotSourceMeta();
        setSnapshotReady(false);
        setSnapshotCreatedAt(undefined);
        setSnapshotMode(preference);
        setSnapshotStatus(
          [
            "Active MT5 replay snapshot blocked: the active canonical research source did not resolve to MT5 read-only.",
            ...source.sourceWarnings,
            "Use Imported Snapshot or Mock Demo Snapshot only when you intentionally want a non-MT5 replay."
          ].join(" ")
        );
        return;
      }
      const nextBacktest = buildReplayBacktest(source);
      const createdAt = new Date().toISOString();
      storeReplaySnapshotSourceMeta(source, preference, createdAt);
      setReplaySource(source);
      setBacktest(nextBacktest);
      setReplayState(createReplayState(nextBacktest));
      setSnapshotCreatedAt(createdAt);
      setSnapshotMode(preference);
      setSnapshotReady(true);
      setSnapshotStatus(
        source.provider === "mt5_read_only"
          ? `Frozen MT5 replay snapshot created: ${source.brokerSymbol ?? "broker symbol"} for ${source.requestedSymbol}, ${source.candles.length.toLocaleString()} candles.`
          : `Frozen replay snapshot created from ${formatSource(source.provider)}, ${source.candles.length.toLocaleString()} candles.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      clearReplaySnapshotSourceMeta();
      setSnapshotReady(false);
      setSnapshotCreatedAt(undefined);
      setSnapshotStatus(`Replay source resolution failed: ${message}`);
    } finally {
      setSnapshotBusy(false);
    }
  }, []);

  const clearReplaySnapshot = useCallback(() => {
    clearReplaySnapshotSourceMeta();
    setReplayState((state) => setReplayPlaying(state, false));
    setSnapshotReady(false);
    setSnapshotCreatedAt(undefined);
    setSnapshotStatus("Replay snapshot cleared. Create Replay from Active MT5 Source to avoid stale replay charts.");
  }, []);

  useEffect(() => {
    const refreshStatus = () => {
      if (snapshotReady && replaySource.provider === "mt5_read_only") {
        setSnapshotStatus("MT5 source updated in the background; create a new replay snapshot to refresh this frozen session.");
      }
    };
    window.addEventListener(MT5_READ_ONLY_UPDATED_EVENT, refreshStatus);
    return () => window.removeEventListener(MT5_READ_ONLY_UPDATED_EVENT, refreshStatus);
  }, [replaySource.provider, snapshotReady]);

  useEffect(() => {
    if (!replayState.isPlaying) {
      return;
    }
    const interval = window.setInterval(() => {
      setReplayState((state) => stepReplay(state, backtest, 1));
    }, 900);
    return () => window.clearInterval(interval);
  }, [backtest, replayState.isPlaying]);

  useEffect(() => {
    if (isAtEnd && replayState.isPlaying) {
      setReplayState((state) => setReplayPlaying(state, false));
    }
  }, [isAtEnd, replayState.isPlaying]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Candle-by-candle research replay</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Replay Lab</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Step through a frozen snapshot from the selected canonical source and watch the ICT engine, internal agents,
            CIO synthesis, and simulated outcomes evolve.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">Replay simulation</Badge>
          {snapshotReady ? (
            <>
              <Badge variant={sourceVariant(replaySource)}>{formatSource(replaySource.provider)}</Badge>
              {replaySource.brokerSymbol ? <Badge variant="secondary">{replaySource.brokerSymbol} for {replaySource.requestedSymbol}</Badge> : null}
            </>
          ) : (
            <Badge variant="secondary">no replay snapshot</Badge>
          )}
          <Badge variant="danger">authority none</Badge>
        </div>
      </div>

      <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
        <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
        Simulation only. No broker connection, no execution authority, and no real orders.
      </div>

      <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">
        Replay source: frozen snapshot from a canonical source. MT5 read-only snapshots are CFD/proxy market data for
        MNQ-style research, not CME MNQ futures broker truth.
      </div>

      <Card className={snapshotReady && replaySource.provider === "mt5_read_only" ? "border-emerald-300/25 bg-emerald-300/10" : ""}>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-start">
            <div>
              <CardTitle>Replay Source</CardTitle>
              <CardDescription>{snapshotStatus}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={snapshotBusy} onClick={() => void createSnapshot("active_research", { requireMt5: true })}>
                {snapshotBusy ? "Creating..." : "Create Replay from Active MT5 Source"}
              </Button>
              <Button variant="secondary" disabled={snapshotBusy} onClick={() => void createSnapshot("imported_historical")}>
                Imported Snapshot
              </Button>
              <Button variant="outline" disabled={snapshotBusy} onClick={() => void createSnapshot("mock_demo")}>
                Mock Demo Snapshot
              </Button>
              <Button variant="ghost" disabled={snapshotBusy && !snapshotReady} onClick={clearReplaySnapshot}>
                Clear stale replay snapshots
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {snapshotReady ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard label="Provider" value={formatSource(replaySource.provider)} detail={replaySource.sourceRole.replace(/_/g, " ")} />
                <MetricCard label="Requested symbol" value={replaySource.requestedSymbol} detail={replaySource.brokerSymbol ? `Broker ${replaySource.brokerSymbol}` : "No broker alias"} />
                <MetricCard label="Candle count" value={replaySource.candles.length.toLocaleString()} detail={`${formatDateTime(replaySource.firstTimestamp)} to ${formatDateTime(replaySource.lastTimestamp)}`} />
                <MetricCard label="Snapshot created" value={formatDateTime(snapshotCreatedAt)} detail={snapshotMode.replace(/_/g, " ")} />
                <MetricCard label="Authority" value="none" detail="execution none / broker none / readiness override none" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Source fingerprint</p>
                  <p className="mt-2 break-all font-mono text-xs text-foreground">{replaySource.sourceFingerprint}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Replay mode</p>
                  <p className="mt-2 text-foreground">
                    Frozen snapshot. Refreshing MT5 candles does not mutate this replay until a new snapshot is created.
                  </p>
                </div>
              </div>
              {replaySource.sourceWarnings.length ? (
                <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
                  <p className="font-semibold">Source warnings</p>
                  <ul className="mt-2 space-y-1">
                    {replaySource.sourceWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-lg border border-border bg-background/45 p-4 text-muted-foreground">
              Replay source is not loaded yet. Active-source replay now requires an eligible MT5 read-only canonical source;
              imported and mock replay modes must be selected explicitly.
            </div>
          )}
        </CardContent>
      </Card>

      {!snapshotReady ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Replay preview unavailable until a frozen source snapshot is created. This prevents stale imported/mock candles from
            appearing as the active MT5 replay.
          </CardContent>
        </Card>
      ) : (
        <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Replay candle" value={`${frame.currentIndex + 1} / ${backtest.candles.length}`} detail={formatTime(frame.currentCandle?.timestamp)} />
        <MetricCard label="Decision points" value={String(backtest.decisions.length)} detail={`Every ${backtest.config.decisionInterval} candles`} />
        <MetricCard label="Completed records" value={String(frame.completedTrades.length)} detail="Resolved by current candle" />
        <MetricCard label="Backtest win rate" value={formatPercent(backtest.summary.winRate)} detail={`${backtest.summary.wins} targets`} />
        <MetricCard label="Average R" value={formatSigned(backtest.summary.averageR, 2)} detail={`${backtest.summary.maxDrawdown.toFixed(2)}R max DD`} tone={backtest.summary.averageR >= 0 ? "positive" : "danger"} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Active Backtest Configuration</p>
            <p className="mt-1 text-sm text-muted-foreground">{describeBacktestConfig(backtest.config)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">max {backtest.config.maxBarsToResolveTrade} bars</Badge>
            <Badge variant="secondary">stop: {backtest.config.stopModel}</Badge>
            <Badge variant="secondary">skipped {backtest.summary.skippedSignals}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-start">
            <div>
              <CardTitle>Replay Candle Window</CardTitle>
              <CardDescription>
                Visible replay window ending at {frame.currentCandle?.symbol ?? replaySource.requestedSymbol} {frame.currentCandle?.timeframe ?? replaySource.appliedSettings.targetTimeframe} candle {frame.currentIndex + 1}.
              </CardDescription>
            </div>
            <ReplayControls result={backtest} isAtEnd={isAtEnd} onSetState={setReplayState} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ReplayTradingChart frameCandles={frame.visibleCandles} source={replaySource} snapshotCreatedAt={snapshotCreatedAt} currentCandle={frame.currentCandle} thesis={activeThesis} />
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Replay progress</span>
              <span className="font-mono">{formatPercent(progress)}</span>
            </div>
            <Progress value={progress * 100} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Current ICT Context</CardTitle>
                <CardDescription>Context rebuilt only from candles visible up to this replay decision.</CardDescription>
              </div>
              <Badge variant={biasVariant(activeIct?.bias)}>{activeIct?.bias ?? "neutral"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeIct ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-border bg-background/45 p-3">
                    <p className="text-xs text-muted-foreground">Confluence</p>
                    <p className="mt-1 font-mono text-lg">{formatPercent(activeIct.confluenceScore)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/45 p-3">
                    <p className="text-xs text-muted-foreground">Kill zone</p>
                    <p className="mt-1 font-mono text-lg">{activeIct.killZone}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/45 p-3">
                    <p className="text-xs text-muted-foreground">Swing high</p>
                    <p className="mt-1 font-mono text-lg">{activeIct.latestSwingHigh?.price ?? "n/a"}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/45 p-3">
                    <p className="text-xs text-muted-foreground">Swing low</p>
                    <p className="mt-1 font-mono text-lg">{activeIct.latestSwingLow?.price ?? "n/a"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={activeIct.hasBullishMSS ? "success" : "muted"}>bull MSS</Badge>
                  <Badge variant={activeIct.hasBearishMSS ? "danger" : "muted"}>bear MSS</Badge>
                  <Badge variant={activeIct.hasBullishBOS ? "success" : "muted"}>bull BOS</Badge>
                  <Badge variant={activeIct.hasBearishBOS ? "danger" : "muted"}>bear BOS</Badge>
                  <Badge variant="secondary">{activeIct.liquiditySweeps.length} sweep(s)</Badge>
                  <Badge variant="secondary">{activeIct.fairValueGaps.length} FVG(s)</Badge>
                  <Badge variant="secondary">{activeIct.premiumDiscount}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{activeIct.narrativeSummary}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Advance to the first replay decision to build ICT context.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Current CIO Thesis</CardTitle>
                <CardDescription>Simulation-only synthesis for the active replay decision.</CardDescription>
              </div>
              <Badge variant={biasVariant(activeThesis?.finalBias)}>{activeThesis?.finalBias ?? "neutral"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeThesis ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-background/45 p-3">
                    <p className="text-xs text-muted-foreground">Confidence</p>
                    <p className="mt-1 font-mono text-lg">{formatPercent(activeThesis.confidence)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/45 p-3">
                    <p className="text-xs text-muted-foreground">Entry</p>
                    <p className="mt-1 font-mono text-sm">
                      {activeThesis.simulatedTradePlan.entryZone[0]} - {activeThesis.simulatedTradePlan.entryZone[1]}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/45 p-3">
                    <p className="text-xs text-muted-foreground">Invalidation</p>
                    <p className="mt-1 font-mono text-lg">{activeThesis.invalidationLevel}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/45 p-3">
                    <p className="text-xs text-muted-foreground">Target</p>
                    <p className="mt-1 font-mono text-lg">{activeThesis.targetLiquidity}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{activeThesis.thesisSummary}</p>
                <p className="text-sm text-muted-foreground">{activeThesis.riskNotes}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No active thesis yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent Debate</CardTitle>
          <CardDescription>Internal deterministic agent opinions at the active replay decision.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {frame.activeDecision?.agentOpinions.map((opinion) => (
            <div key={opinion.agentId} className="rounded-lg border border-border bg-background/45 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{opinion.name}</p>
                  <p className="text-xs text-muted-foreground">weight {formatPercent(opinion.weight)}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge variant={biasVariant(opinion.bias)}>{opinion.bias}</Badge>
                  <Badge variant="secondary">{formatPercent(opinion.confidence)}</Badge>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{opinion.reasoning}</p>
              <p className="mt-2 rounded-md border border-border bg-card/45 p-2 text-xs text-muted-foreground">
                {opinion.recommendation}
              </p>
            </div>
          )) ?? <p className="text-sm text-muted-foreground">Advance to the first decision to populate agent debate.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completed Simulated Trades</CardTitle>
          <CardDescription>Resolved target, stop, or expiry records through the current replay candle.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-3 pr-3">Resolved</th>
                <th className="py-3 pr-3">Bias</th>
                <th className="py-3 pr-3">Outcome</th>
                <th className="py-3 pr-3">R</th>
                <th className="py-3 pr-3">MFE</th>
                <th className="py-3 pr-3">MAE</th>
                <th className="py-3 pr-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {latestCompleted.map((trade) => (
                <tr key={trade.id} className="border-b border-border/70">
                  <td className="py-3 pr-3 font-mono">{formatTime(trade.resolvedAt)}</td>
                  <td className="py-3 pr-3">
                    <Badge variant={biasVariant(trade.bias)}>{trade.bias}</Badge>
                  </td>
                  <td className="py-3 pr-3">{trade.outcome.replace("_", " ")}</td>
                  <td className="py-3 pr-3 font-mono">{formatSigned(trade.rMultiple, 2)}R</td>
                  <td className="py-3 pr-3 font-mono">{trade.maxFavorableExcursion.toFixed(2)}</td>
                  <td className="py-3 pr-3 font-mono">{trade.maxAdverseExcursion.toFixed(2)}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{trade.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!latestCompleted.length ? (
            <p className="mt-3 text-sm text-muted-foreground">No simulated records have resolved at this replay candle.</p>
          ) : null}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
