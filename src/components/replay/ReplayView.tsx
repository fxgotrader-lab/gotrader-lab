import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, ShieldAlert, SkipBack, SkipForward } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  createReplayState,
  describeBacktestConfig,
  getReplayFrame,
  jumpReplay,
  runBacktest,
  setReplayPlaying,
  stepReplay
} from "@/lib/backtesting";
import type { BacktestResult } from "@/lib/backtesting";
import { mockCandles } from "@/lib/mockData/mockCandles";
import { resolveActiveBacktestConfig } from "@/lib/selfImprovement";
import type { Candle, MarketBias, TradeThesis } from "@/lib/types";
import { formatPercent, formatSigned } from "@/lib/utils";

const formatTime = (timestamp?: string) => timestamp ? timestamp.slice(11, 16) : "n/a";

const biasVariant = (bias?: MarketBias) => {
  if (bias === "bullish") {
    return "success" as const;
  }
  if (bias === "bearish") {
    return "danger" as const;
  }
  return "warning" as const;
};

function ReplayCandleChart({
  candles,
  currentCandle,
  thesis
}: {
  candles: Candle[];
  currentCandle?: Candle;
  thesis?: TradeThesis;
}) {
  const width = 920;
  const height = 300;
  const left = 54;
  const right = 42;
  const top = 20;
  const bottom = 44;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const levels = thesis
    ? [thesis.simulatedTradePlan.entryZone[0], thesis.simulatedTradePlan.entryZone[1], thesis.invalidationLevel, thesis.targetLiquidity]
    : [];
  const high = Math.max(...candles.map((candle) => candle.high), ...levels);
  const low = Math.min(...candles.map((candle) => candle.low), ...levels);
  const padding = Math.max(6, (high - low) * 0.08);
  const maxPrice = high + padding;
  const minPrice = low - padding;
  const range = maxPrice - minPrice || 1;
  const step = chartWidth / Math.max(1, candles.length);
  const candleWidth = Math.max(5, step * 0.54);
  const yFor = (price: number) => top + ((maxPrice - price) / range) * chartHeight;
  const xFor = (index: number) => left + index * step + step / 2;

  const line = (price: number, label: string, color: string) => (
    <g key={label}>
      <line x1={left} x2={left + chartWidth} y1={yFor(price)} y2={yFor(price)} stroke={color} strokeDasharray="6 5" />
      <text x={width - 10} y={yFor(price) - 4} textAnchor="end" fill={color} fontSize="10" fontFamily="ui-monospace, monospace">
        {label}
      </text>
    </g>
  );

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <svg
        role="img"
        aria-label="Replay candle window using mock OHLC data"
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[840px]"
      >
        <rect x="0" y="0" width={width} height={height} rx="8" fill="#0b1220" />
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + chartHeight * ratio;
          const price = maxPrice - range * ratio;
          return (
            <g key={ratio}>
              <line x1={left} x2={left + chartWidth} y1={y} y2={y} stroke="rgba(148,163,184,0.12)" />
              <text x={width - 10} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="10" fontFamily="ui-monospace, monospace">
                {price.toFixed(0)}
              </text>
            </g>
          );
        })}

        {thesis ? (
          <>
            {line(thesis.targetLiquidity, "target", "#34d399")}
            {line(thesis.invalidationLevel, "invalid", "#fb7185")}
            {line((thesis.simulatedTradePlan.entryZone[0] + thesis.simulatedTradePlan.entryZone[1]) / 2, "entry", "#facc15")}
          </>
        ) : null}

        {candles.map((candle, index) => {
          const isUp = candle.close >= candle.open;
          const color = isUp ? "#2dd4bf" : "#fb7185";
          const x = xFor(index);
          const bodyTop = yFor(Math.max(candle.open, candle.close));
          const bodyBottom = yFor(Math.min(candle.open, candle.close));
          const isCurrent = candle.id === currentCandle?.id;

          return (
            <g key={candle.id}>
              {isCurrent ? (
                <rect x={x - step / 2} y={top - 8} width={step} height={chartHeight + 16} fill="rgba(250,204,21,0.08)" />
              ) : null}
              <line x1={x} x2={x} y1={yFor(candle.high)} y2={yFor(candle.low)} stroke={color} strokeWidth={isCurrent ? "2" : "1.35"} />
              <rect
                x={x - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={Math.max(2, bodyBottom - bodyTop)}
                rx="1.5"
                fill={color}
                opacity={isUp ? 0.86 : 0.75}
              />
              {index % 4 === 0 || isCurrent ? (
                <text x={x} y={height - 14} textAnchor="middle" fill={isCurrent ? "#fde68a" : "#94a3b8"} fontSize="10" fontFamily="ui-monospace, monospace">
                  {formatTime(candle.timestamp)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
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
  const activeConfig = useMemo(() => resolveActiveBacktestConfig().config, []);
  const backtest = useMemo(() => runBacktest(mockCandles, activeConfig), [activeConfig]);
  const [replayState, setReplayState] = useState(() => createReplayState(backtest));
  const frame = useMemo(() => getReplayFrame(backtest, replayState), [backtest, replayState]);
  const progress = backtest.candles.length ? frame.currentIndex / Math.max(1, backtest.candles.length - 1) : 0;
  const activeIct = frame.activeDecision?.ictContext;
  const activeThesis = frame.activeThesis;
  const latestCompleted = frame.completedTrades.slice(-8).reverse();
  const isAtEnd = frame.currentIndex >= backtest.candles.length - 1;

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
            Step through local mock OHLC candles and watch the ICT engine, internal agents, CIO synthesis, and simulated
            outcomes evolve.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">Mock data only</Badge>
          <Badge variant="muted">No execution</Badge>
          <Badge variant="secondary">{activeConfig.sessionFilter}</Badge>
        </div>
      </div>

      <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
        <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
        Simulation only. No broker connection. No real trades.
      </div>

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
              <CardTitle>Mock Candle Window</CardTitle>
              <CardDescription>
                Visible replay window ending at {frame.currentCandle?.symbol ?? "NQ"} {frame.currentCandle?.timeframe ?? "5m"} candle {frame.currentIndex + 1}.
              </CardDescription>
            </div>
            <ReplayControls result={backtest} isAtEnd={isAtEnd} onSetState={setReplayState} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ReplayCandleChart candles={frame.visibleCandles} currentCandle={frame.currentCandle} thesis={activeThesis} />
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
    </div>
  );
}
