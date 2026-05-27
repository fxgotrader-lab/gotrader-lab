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
  loadPreparedCandleSource
} from "@/lib/marketData";
import { mockCandles } from "@/lib/mockData/mockCandles";
import type { Candle, MarketStructureEvent, SessionContext } from "@/lib/types";

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
  const activeCandles = preparedSource?.candles.length ? preparedSource.candles : mockCandles;
  const sourceType = preparedSource?.mode === "imported" ? "imported" : "mock";
  const sourceLabel = preparedSource?.mode === "imported" ? preparedSource.label : "Mock research candles";

  const analysis = useMemo(() => {
    const swings = detectSwings(activeCandles, 2);
    const mss = detectMSS(activeCandles, swings);
    const bos = detectBOS(activeCandles, swings);
    const sweeps = detectLiquiditySweeps(activeCandles, swings);
    const gaps = detectFairValueGaps(activeCandles);
    const zone = detectPremiumDiscount(activeCandles, swings);
    const sessions = tagSessions(activeCandles);
    const structureEvents = [...mss, ...bos].sort((a, b) => a.index - b.index);
    return { bos, gaps, mss, sessions, structureEvents, sweeps, swings, zone };
  }, [activeCandles]);

  const latestCandle = activeCandles[activeCandles.length - 1];
  const latestSession = analysis.sessions[analysis.sessions.length - 1];
  const latestStructure = analysis.structureEvents[analysis.structureEvents.length - 1];
  const latestSweep = analysis.sweeps[analysis.sweeps.length - 1];
  const unmitigatedGaps = analysis.gaps.filter((gap) => !gap.mitigated);
  const sessionCounts = analysis.sessions.reduce<Record<string, number>>((counts, session) => {
    counts[session.session] = (counts[session.session] ?? 0) + 1;
    return counts;
  }, {});

  const chartData = useMemo(() => {
    const base = createTradingChartData({
      candles: activeCandles,
      sourceLabel,
      sourceType,
      symbol: latestCandle?.symbol,
      timeframe: latestCandle?.timeframe
    });
    const overlays = [
      buildVwapOverlay(activeCandles),
      ...buildPremiumDiscountOverlays(activeCandles, analysis.zone),
      ...buildSwingLevelOverlays(activeCandles, analysis.swings, 6)
    ].filter((overlay): overlay is TradingChartLineOverlay => Boolean(overlay));

    return {
      ...base,
      bias: latestStructure?.direction ?? "neutral",
      lineOverlays: overlays,
      markers: buildIctMarkers({
        structureEvents: analysis.structureEvents.slice(-18) as MarketStructureEvent[],
        sweeps: analysis.sweeps.slice(-14)
      }),
      stateLabel: `${analysis.zone.currentZone} / ${sourceType}`,
      zoneOverlays: buildFvgZoneOverlays(activeCandles, analysis.gaps)
    };
  }, [activeCandles, analysis, latestCandle?.symbol, latestCandle?.timeframe, latestStructure?.direction, sourceLabel, sourceType]);

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
            {sourceType === "imported" ? "Imported data active" : "Mock data active"}
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
          <TradingChart {...chartData} heightClassName="h-[460px]" />
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
