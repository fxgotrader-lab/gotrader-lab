import { useMemo } from "react";
import { Activity, ChartCandlestick, Clock, Layers, ScanLine, ShieldAlert, Target } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  detectBOS,
  detectFairValueGaps,
  detectLiquiditySweeps,
  detectMSS,
  detectPremiumDiscount,
  detectSwings,
  tagSessions
} from "@/lib/ict";
import { mockCandles } from "@/lib/mockData/mockCandles";
import type {
  Candle,
  FairValueGap,
  LiquiditySweep,
  MarketStructureEvent,
  PremiumDiscountZone,
  SessionContext,
  SwingPoint
} from "@/lib/types";

const formatTime = (timestamp: string) => timestamp.slice(11, 16);

const directionVariant = (direction: "bullish" | "bearish") => (direction === "bullish" ? "success" : "danger");

function sessionColor(session: SessionContext["session"]) {
  if (session === "Asia") {
    return "#64748b";
  }
  if (session === "London") {
    return "#a78bfa";
  }
  if (session === "New York") {
    return "#2dd4bf";
  }
  return "#475569";
}

function ICTCandleChart({
  candles,
  swings,
  structureEvents,
  sweeps,
  gaps,
  zone,
  sessions
}: {
  candles: Candle[];
  swings: SwingPoint[];
  structureEvents: MarketStructureEvent[];
  sweeps: LiquiditySweep[];
  gaps: FairValueGap[];
  zone: PremiumDiscountZone;
  sessions: SessionContext[];
}) {
  const width = 1120;
  const height = 430;
  const left = 54;
  const right = 46;
  const top = 24;
  const bottom = 58;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const high = Math.max(...candles.map((candle) => candle.high), zone.rangeHigh);
  const low = Math.min(...candles.map((candle) => candle.low), zone.rangeLow);
  const padding = Math.max(4, (high - low) * 0.05);
  const maxPrice = high + padding;
  const minPrice = low - padding;
  const priceRange = maxPrice - minPrice || 1;
  const step = chartWidth / candles.length;
  const candleWidth = Math.max(5, step * 0.52);
  const yFor = (price: number) => top + ((maxPrice - price) / priceRange) * chartHeight;
  const xFor = (index: number) => left + index * step + step / 2;
  const sessionByCandle = new Map(sessions.map((session) => [session.candleId, session]));
  const visibleGaps = gaps.filter((gap) => gap.createdByDisplacement).slice(-10);
  const priceTicks = Array.from({ length: 5 }, (_, index) => minPrice + (priceRange * index) / 4).reverse();

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <svg
        role="img"
        aria-label="Mock NQ candle chart with ICT swing, structure, FVG, liquidity, and session annotations"
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[980px]"
      >
        <rect x="0" y="0" width={width} height={height} rx="8" fill="#0b1220" />

        <rect
          x={left}
          y={yFor(zone.rangeHigh)}
          width={chartWidth}
          height={Math.max(0, yFor(zone.equilibrium) - yFor(zone.rangeHigh))}
          fill="rgba(251, 191, 36, 0.055)"
        />
        <rect
          x={left}
          y={yFor(zone.equilibrium)}
          width={chartWidth}
          height={Math.max(0, yFor(zone.rangeLow) - yFor(zone.equilibrium))}
          fill="rgba(45, 212, 191, 0.055)"
        />
        <line x1={left} x2={left + chartWidth} y1={yFor(zone.equilibrium)} y2={yFor(zone.equilibrium)} stroke="rgba(250, 204, 21, 0.5)" strokeDasharray="6 6" />

        {priceTicks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={left + chartWidth} y1={yFor(tick)} y2={yFor(tick)} stroke="rgba(148,163,184,0.12)" />
            <text x={width - 12} y={yFor(tick) + 4} textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="ui-monospace, monospace">
              {tick.toFixed(0)}
            </text>
          </g>
        ))}

        {visibleGaps.map((gap) => {
          const x = xFor(gap.index) - step / 2;
          const y = yFor(gap.end);
          const gapHeight = Math.max(3, yFor(gap.start) - y);
          return (
            <g key={gap.id}>
              <rect
                x={x}
                y={y}
                width={Math.min(step * 8, left + chartWidth - x)}
                height={gapHeight}
                fill={gap.direction === "bullish" ? "rgba(45, 212, 191, 0.13)" : "rgba(251, 113, 133, 0.13)"}
                stroke={gap.direction === "bullish" ? "rgba(45, 212, 191, 0.45)" : "rgba(251, 113, 133, 0.45)"}
                strokeDasharray={gap.mitigated ? "4 4" : "0"}
              />
              <text x={x + 4} y={y - 4} fill="#cbd5e1" fontSize="10" fontFamily="ui-monospace, monospace">
                FVG
              </text>
            </g>
          );
        })}

        {candles.map((candle, index) => {
          const x = xFor(index);
          const isUp = candle.close >= candle.open;
          const bodyTop = yFor(Math.max(candle.open, candle.close));
          const bodyBottom = yFor(Math.min(candle.open, candle.close));
          const bodyHeight = Math.max(2, bodyBottom - bodyTop);
          const color = isUp ? "#2dd4bf" : "#fb7185";
          const session = sessionByCandle.get(candle.id);

          return (
            <g key={candle.id}>
              <rect x={left + index * step} y={height - 34} width={Math.max(1, step - 1)} height="9" fill={session ? sessionColor(session.session) : "#475569"} opacity="0.45" />
              <line x1={x} x2={x} y1={yFor(candle.high)} y2={yFor(candle.low)} stroke={color} strokeWidth="1.4" />
              <rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} rx="1.5" fill={color} opacity={isUp ? 0.82 : 0.72} />
              {index % 6 === 0 || index === candles.length - 1 ? (
                <text x={x} y={height - 10} textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="ui-monospace, monospace">
                  {formatTime(candle.timestamp)}
                </text>
              ) : null}
            </g>
          );
        })}

        {swings.map((swing) => {
          const x = xFor(swing.index);
          const y = yFor(swing.price);
          const isHigh = swing.type === "high";
          return (
            <g key={swing.id}>
              <circle cx={x} cy={y} r="4" fill={isHigh ? "#facc15" : "#38bdf8"} stroke="#0b1220" strokeWidth="2" />
              <text x={x} y={y + (isHigh ? -9 : 16)} textAnchor="middle" fill={isHigh ? "#fde68a" : "#bae6fd"} fontSize="10" fontFamily="ui-monospace, monospace">
                {isHigh ? "SH" : "SL"}
              </text>
            </g>
          );
        })}

        {sweeps.map((sweep) => {
          const x = xFor(sweep.index);
          const y = yFor(sweep.sweptLevel);
          const color = sweep.direction === "sell-side" ? "#38bdf8" : "#f59e0b";
          return (
            <g key={sweep.id}>
              <path d={`M ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} L ${x - 7} ${y} Z`} fill={color} opacity="0.9" />
              <text x={x} y={y + (sweep.direction === "sell-side" ? 22 : -14)} textAnchor="middle" fill="#e2e8f0" fontSize="10" fontFamily="ui-monospace, monospace">
                SWEEP
              </text>
            </g>
          );
        })}

        {structureEvents.map((event) => {
          const x = xFor(event.index);
          const y = yFor(event.price);
          const color = event.direction === "bullish" ? "#34d399" : "#fb7185";
          const labelY = event.direction === "bullish" ? y - 22 : y + 28;
          return (
            <g key={event.id}>
              <line x1={x - step * 1.6} x2={x + step * 1.6} y1={y} y2={y} stroke={color} strokeWidth="2" />
              <rect x={x - 18} y={labelY - 12} width="36" height="18" rx="4" fill="rgba(15, 23, 42, 0.92)" stroke={color} />
              <text x={x} y={labelY + 1} textAnchor="middle" fill={color} fontSize="10" fontFamily="ui-monospace, monospace" fontWeight="700">
                {event.type}
              </text>
            </g>
          );
        })}

        <text x={left} y={18} fill="#94a3b8" fontSize="11">
          Premium
        </text>
        <text x={left} y={height - 42} fill="#94a3b8" fontSize="11">
          Session strip: Asia, London, New York
        </text>
      </svg>
    </div>
  );
}

export function ICTLab() {
  const analysis = useMemo(() => {
    const swings = detectSwings(mockCandles, 2);
    const mss = detectMSS(mockCandles, swings);
    const bos = detectBOS(mockCandles, swings);
    const sweeps = detectLiquiditySweeps(mockCandles, swings);
    const gaps = detectFairValueGaps(mockCandles);
    const zone = detectPremiumDiscount(mockCandles, swings);
    const sessions = tagSessions(mockCandles);
    const structureEvents = [...mss, ...bos].sort((a, b) => a.index - b.index);
    return { swings, mss, bos, sweeps, gaps, zone, sessions, structureEvents };
  }, []);

  const latestCandle = mockCandles[mockCandles.length - 1];
  const latestSession = analysis.sessions[analysis.sessions.length - 1];
  const latestStructure = analysis.structureEvents[analysis.structureEvents.length - 1];
  const latestSweep = analysis.sweeps[analysis.sweeps.length - 1];
  const unmitigatedGaps = analysis.gaps.filter((gap) => !gap.mitigated);
  const sessionCounts = analysis.sessions.reduce<Record<string, number>>((counts, session) => {
    counts[session.session] = (counts[session.session] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Structured ICT context engine</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">ICT Lab</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Deterministic market-structure analysis over local mock OHLC candles for NQ futures research.
          </p>
        </div>
        <Badge variant="warning">Mock data only</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Candles" value={String(mockCandles.length)} detail={`${latestCandle.symbol} ${latestCandle.timeframe}`} icon={<ChartCandlestick className="h-4 w-4" />} />
        <MetricCard label="Swings" value={String(analysis.swings.length)} detail="Confirmed pivots" icon={<ScanLine className="h-4 w-4" />} />
        <MetricCard label="MSS / BOS" value={`${analysis.mss.length} / ${analysis.bos.length}`} detail={latestStructure?.direction ?? "none"} icon={<Layers className="h-4 w-4" />} />
        <MetricCard label="Sweeps" value={String(analysis.sweeps.length)} detail={latestSweep?.direction ?? "none"} icon={<Target className="h-4 w-4" />} />
        <MetricCard label="Open FVGs" value={String(unmitigatedGaps.length)} detail={`${analysis.zone.currentZone} now`} icon={<Activity className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Mock Candle Map</CardTitle>
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
          <ICTCandleChart
            candles={mockCandles}
            swings={analysis.swings}
            structureEvents={analysis.structureEvents}
            sweeps={analysis.sweeps}
            gaps={analysis.gaps}
            zone={analysis.zone}
            sessions={analysis.sessions}
          />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Structure Tape</CardTitle>
            <CardDescription>Confirmed swing breaks and continuation events from the mock sample.</CardDescription>
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
            <CardDescription>Premium, discount, and equilibrium from confirmed mock structure.</CardDescription>
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
            <CardDescription>Exchange-local mock timestamps tagged by session and kill zone.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.sessions.slice(-8).map((session) => (
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
        Research-only ICT context over local mock candles. No broker connection, live feed, websocket, order routing, or execution logic is present.
      </div>
    </div>
  );
}
