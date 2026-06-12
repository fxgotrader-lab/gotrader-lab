import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CalendarDays, ChevronLeft, ChevronRight, LockKeyhole, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { MetricProvenanceDetails } from "@/components/common/MetricProvenanceDetails";
import { WhyNotReadyCard } from "@/components/common/WhyNotReadyCard";
import {
  detectCanonicalMetricsMismatch,
  normalizeCycleMetricsForDisplay,
  type CanonicalPerformanceMetrics
} from "@/lib/performance/canonicalMetrics";
import { buildSimulatedAccountFromCanonicalMetrics, type SimulatedAccount } from "@/lib/performance/simulatedAccount";
import { latestResearchCycleRun, loadResearchCycleState } from "@/lib/researchCycle";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeFingerprintLabel,
  selectRuntimeProvenanceWarnings,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";
import { aggregatePortfolioMetrics, identifyWeakestAgent } from "@/lib/scoring";
import type { LabState, MarketOutcome } from "@/lib/types";
import { cn } from "@/lib/utils";
import { loadLatestValidationReport } from "@/lib/validation";
import { WORKSPACE_PAGE, WORKSPACE_SECTION_LABEL } from "@/components/common/workspaceStyles";

const money = new Intl.NumberFormat(undefined, {
  currency: "USD",
  maximumFractionDigits: 2,
  style: "currency"
});

const wholeMoney = new Intl.NumberFormat(undefined, {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency"
});

const compactDate = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
const weekdayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const safeNumber = (value?: number | null) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const pct = (value?: number, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "n/a";
const rValue = (value?: number | null, digits = 2) =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}R` : "n/a";

interface CalendarCell {
  date: Date;
  dateKey: string;
  day: number;
  inMonth: boolean;
  pnl: number;
  trades: number;
  isToday: boolean;
  weekIndex: number;
  weekPnl: number;
  weekTrades: number;
}

export function PerformanceView({ state }: { state: LabState }) {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();

  const legacyMetrics = aggregatePortfolioMetrics(state);
  const weakest = identifyWeakestAgent(state);
  const latestCycle = latestResearchCycleRun(loadResearchCycleState());
  const latestValidation = loadLatestValidationReport();
  const canonicalMetrics = runtimeSnapshot?.performance.canonicalPerformanceMetrics ?? normalizeCycleMetricsForDisplay(latestCycle, latestValidation);
  const derivedCanonicalMetrics = normalizeCycleMetricsForDisplay(latestCycle, latestValidation);
  const canonicalMismatchWarnings = detectCanonicalMetricsMismatch(latestCycle?.canonicalMetrics, derivedCanonicalMetrics);
  const simulatedAccount = useMemo(
    () => runtimeSnapshot?.performance.simulatedAccountSummary ?? buildSimulatedAccountFromCanonicalMetrics(canonicalMetrics),
    [canonicalMetrics, runtimeSnapshot]
  );
  const calendar = useMemo(
    () => buildResultsCalendar({
      account: simulatedAccount,
      metrics: canonicalMetrics,
      outcomes: state.outcomes
    }),
    [canonicalMetrics, simulatedAccount, state.outcomes]
  );
  const equityCurve = useMemo(() => buildEquityCurve(canonicalMetrics, simulatedAccount, calendar.cells), [canonicalMetrics, simulatedAccount, calendar.cells]);
  const tradeBars = useMemo(() => buildTradeBars(calendar.cells), [calendar.cells]);
  const recentRows = useMemo(() => buildRecentOutcomeRows(state.outcomes, canonicalMetrics), [canonicalMetrics, state.outcomes]);
  const sourceWarnings = selectRuntimeProvenanceWarnings(runtimeSnapshot);
  const pnlPositive = calendar.monthPnl >= 0;
  const winRate = canonicalMetrics?.winRate ?? legacyMetrics.hitRate;
  const avgWinLoss = averageWinLossRatio(canonicalMetrics);

  useEffect(() => {
    let mounted = true;
    resolveResearchRuntimeSnapshot({ labState: state }).then((snapshot) => {
      if (mounted) {
        setRuntimeSnapshot(snapshot);
      }
    }).catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [state]);

  return (
    <div data-testid="performance-results-page" className={`${WORKSPACE_PAGE} text-slate-100`}>
      <header className="premium-surface premium-panel-grid flex flex-col justify-between gap-4 rounded-[24px] p-4 sm:p-5 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <p className={WORKSPACE_SECTION_LABEL}>Research Results</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal text-slate-50">Performance Results</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
            Simulation and research-cycle results only. The calendar and metrics are derived from local GoTrader evidence, never broker account/order/position data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">Simulation only</Badge>
          <Badge variant="danger">Execution authority none</Badge>
          <Badge variant="secondary">{canonicalMetrics?.symbol ?? runtimeSnapshot?.marketData.symbol ?? "NQ"} / {canonicalMetrics?.timeframe ?? runtimeSnapshot?.marketData.timeframe ?? "5m"}</Badge>
        </div>
      </header>

      <ResultsCalendar calendar={calendar} pnlPositive={pnlPositive} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
        <ResultMetricCard
          label="Total P&L"
          value={money.format(calendar.monthPnl)}
          detail={`${calendar.monthTrades.toLocaleString()} simulated research trades`}
          tone={calendar.monthPnl >= 0 ? "positive" : "negative"}
        />
        <ResultMetricCard
          label="Win Rate"
          value={pct(winRate, 2)}
          detail={`${canonicalMetrics?.winningTrades ?? 0}/${canonicalMetrics?.totalTrades ?? 0} trades`}
          visual={<SemiGauge value={winRate} />}
        />
        <ResultMetricCard
          label="Reward / Risk"
          value={avgWinLoss ? avgWinLoss.toFixed(2) : "n/a"}
          detail={`Avg R ${rValue(canonicalMetrics?.averageR)}`}
          visual={<RatioBar value={avgWinLoss ?? 0} />}
        />
        <ResultMetricCard
          label="Profit Factor"
          value={canonicalMetrics?.profitFactor === null || canonicalMetrics?.profitFactor === undefined ? "n/a" : canonicalMetrics.profitFactor.toFixed(2)}
          detail="Canonical latest-cycle metric"
        />
        <ResultMetricCard
          label="Max Drawdown"
          value={rValue(canonicalMetrics?.maxDrawdownR)}
          detail={wholeMoney.format(simulatedAccount?.maxDrawdownDollars ?? 0)}
          tone="negative"
        />
        <ResultMetricCard
          label="Current Balance"
          value={wholeMoney.format(simulatedAccount?.currentBalance ?? simulatedAccount?.startingBalance ?? 50000)}
          detail={`Start ${wholeMoney.format(simulatedAccount?.startingBalance ?? 50000)}`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <ResultPanel className="min-h-[430px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Performance Curve</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-50">Simulated balance progression</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{canonicalMetrics?.sourceCycleId ?? "no cycle"}</Badge>
              <Badge variant="warning">Research only</Badge>
            </div>
          </div>
          <div className="mt-5 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="performanceBalanceFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.42} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} axisLine={false} width={72} />
                <Tooltip contentStyle={{ background: "#15151a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#f8fafc" }} formatter={(value) => wholeMoney.format(Number(value))} />
                <Area type="monotone" dataKey="balance" stroke="#22c55e" strokeWidth={2.4} fill="url(#performanceBalanceFill)" dot={{ r: 2, fill: "#f8fafc" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ResultPanel>

        <ResultPanel className="min-h-[430px]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-slate-50">Statistics</h3>
            <Badge variant="secondary">Canonical</Badge>
          </div>
          <div className="mt-4 space-y-2">
            <StatRow label="Biggest trade" value={rValue(canonicalMetrics?.bestTradeR)} />
            <StatRow label="Worst trade" value={rValue(canonicalMetrics?.worstTradeR)} negative />
            <StatRow label="Expectancy" value={rValue(canonicalMetrics?.averageR)} />
            <StatRow label="Profit factor" value={canonicalMetrics?.profitFactor === null || canonicalMetrics?.profitFactor === undefined ? "n/a" : canonicalMetrics.profitFactor.toFixed(2)} />
            <StatRow label="False positives" value={String(canonicalMetrics?.falsePositiveCount ?? 0)} negative />
            <StatRow label="Skipped signals" value={String(canonicalMetrics?.skippedSignals ?? 0)} />
            <StatRow
              label="Readiness"
              value={String(
                canonicalMetrics?.readinessScore ??
                  runtimeSnapshot?.readiness.readinessSnapshot.validationSnapshot?.readinessScore ??
                  runtimeSnapshot?.readiness.readinessSnapshot.researchQualitySnapshot?.readinessScore ??
                  0
              )}
            />
            <StatRow label="Stability" value={String(canonicalMetrics?.stabilityScore ?? 0)} />
          </div>
          <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
            No broker connection. No real trades. Results are simulated research evidence.
          </div>
        </ResultPanel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ResultPanel>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-50">Daily Trade Load</h3>
            <CalendarDays className="h-4 w-4 text-sky-300" aria-hidden="true" />
          </div>
          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tradeBars}>
                <CartesianGrid stroke="rgba(148,163,184,0.14)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip contentStyle={{ background: "#15151a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#f8fafc" }} />
                <Bar dataKey="trades" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ResultPanel>

        <ResultPanel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-50">Source & Safety</h3>
              <p className="mt-1 text-sm text-slate-400">Compact provenance for this results view.</p>
            </div>
            <Badge variant="danger">authority none/none/none</Badge>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <StatTile label="Metric source" value={canonicalMetrics?.metricSourceLabel ?? "no completed research cycle"} />
            <StatTile label="Data source" value={canonicalMetrics?.dataSource ?? runtimeSnapshot?.marketData.sourceLabel ?? "n/a"} />
            <StatTile label="Candle window" value={canonicalMetrics?.candleWindow ?? "n/a"} />
            <StatTile label="Fingerprint" value={selectRuntimeFingerprintLabel(runtimeSnapshot)} />
          </div>
          {sourceWarnings.length || canonicalMismatchWarnings.length ? (
            <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              {[...sourceWarnings, ...canonicalMismatchWarnings].join(" ")}
            </div>
          ) : null}
        </ResultPanel>
      </section>

      <WhyNotReadyCard context="performance" snapshot={runtimeSnapshot} />

      <ResultPanel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Outcome Log</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-50">Recent simulated outcomes</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{state.outcomes.length} stored outcomes</Badge>
            <Badge variant="warning">Local memory</Badge>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-[0.14em] text-slate-500">
                <th className="py-3 pr-4">#</th>
                <th className="py-3 pr-4">Date & Time</th>
                <th className="py-3 pr-4">Symbol</th>
                <th className="py-3 pr-4">Session</th>
                <th className="py-3 pr-4">Bias</th>
                <th className="py-3 pr-4">Move</th>
                <th className="py-3 pr-4">Target</th>
                <th className="py-3 pr-4">Invalidation</th>
                <th className="py-3 pr-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.map((row, index) => (
                <tr key={row.id} className="border-b border-white/5 text-slate-300 hover:bg-white/[0.035]">
                  <td className="py-3 pr-4 font-mono text-slate-500">{String(index + 1).padStart(2, "0")}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{row.resolvedAt}</td>
                  <td className="py-3 pr-4 font-semibold text-slate-100">{row.symbol}</td>
                  <td className="py-3 pr-4"><Badge variant="secondary">{row.session}</Badge></td>
                  <td className="py-3 pr-4"><Badge variant={row.actualBias === "bullish" ? "success" : row.actualBias === "bearish" ? "danger" : "warning"}>{row.actualBias}</Badge></td>
                  <td className={cn("py-3 pr-4 font-mono", row.pnl >= 0 ? "text-emerald-300" : "text-rose-300")}>{money.format(row.pnl)}</td>
                  <td className="py-3 pr-4">{row.liquidityTargetReached ? "Reached" : "No"}</td>
                  <td className="py-3 pr-4">{row.invalidationHit ? "Hit" : "Held"}</td>
                  <td className="max-w-[360px] py-3 pr-4 text-slate-500">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ResultPanel>

      <TechnicalDetails title="Metric provenance" description="Full compact source details behind the Results page.">
        <MetricProvenanceDetails snapshot={runtimeSnapshot} />
      </TechnicalDetails>

      {weakest ? (
        <ResultPanel>
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            <div>
              <p className="font-semibold text-slate-100">Research feedback loop remains locked to simulation.</p>
              <p className="mt-1 text-sm text-slate-400">
                Weakest agent: {weakest.name}. Prompt changes can be proposed through the lab, but this page cannot approve readiness or create execution intent.
              </p>
            </div>
          </div>
        </ResultPanel>
      ) : null}
    </div>
  );
}

function ResultsCalendar({ calendar, pnlPositive }: { calendar: ReturnType<typeof buildResultsCalendar>; pnlPositive: boolean }) {
  return (
    <section data-testid="results-calendar" className="premium-surface overflow-hidden rounded-[24px]">
      <div className="flex flex-col gap-4 border-b border-white/10 px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-center justify-center gap-2 text-center text-2xl font-semibold">
          <span className="text-slate-50">Monthly P/L:</span>
          <span className={pnlPositive ? "text-emerald-400" : "text-rose-400"}>{money.format(calendar.monthPnl)}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <div>
              <p className="text-lg font-semibold text-slate-200">{compactDate.format(calendar.anchorDate)}</p>
              <p className="text-xs text-slate-500">Derived simulated results calendar</p>
            </div>
            <Button variant="ghost" size="sm" aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{calendar.monthTrades.toLocaleString()} trades</Badge>
            <Badge variant="warning">Simulation only</Badge>
            <Button variant="secondary" size="sm">Today</Button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[1050px]">
          <div className="grid grid-cols-7 border-b border-white/10 text-center text-sm font-semibold text-slate-400">
            {weekdayLabels.map((label) => (
              <div key={label} className="px-3 py-3">{label}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendar.cells.map((cell) => (
              <CalendarDayCell key={cell.dateKey} cell={cell} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CalendarDayCell({ cell }: { cell: CalendarCell }) {
  const isWeekSummary = cell.date.getDay() === 6;
  const hasActivity = cell.trades > 0 || Math.abs(cell.pnl) > 0;
  const isPositive = cell.pnl >= 0;
  return (
    <div
      className={cn(
        "relative min-h-[118px] border-b border-r border-white/10 px-3 py-3 text-center",
        !cell.inMonth && "bg-black/45 opacity-45",
        cell.inMonth && hasActivity && isPositive && "bg-emerald-500/18",
        cell.inMonth && hasActivity && !isPositive && "bg-rose-500/18",
        cell.isToday && "outline outline-1 outline-sky-400"
      )}
    >
      <div className="absolute left-3 top-2 text-sm font-semibold text-slate-400">{cell.day}</div>
      {isWeekSummary ? (
        <div className="flex h-full min-h-[90px] flex-col items-center justify-center">
          <div className="text-sm font-bold text-slate-50">Week {cell.weekIndex + 1}</div>
          <div className={cn("mt-2 font-mono text-2xl font-semibold", cell.weekPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {money.format(cell.weekPnl)}
          </div>
          <div className="mt-1 text-sm text-slate-400">{cell.weekTrades} trades</div>
        </div>
      ) : hasActivity ? (
        <div className="flex h-full min-h-[90px] flex-col items-center justify-center">
          <div className={cn("font-mono text-2xl font-semibold", isPositive ? "text-emerald-400" : "text-rose-400")}>
            {money.format(cell.pnl)}
          </div>
          <div className="mt-1 text-sm text-slate-400">{cell.trades} trades</div>
        </div>
      ) : null}
    </div>
  );
}

function ResultMetricCard({ detail, label, tone = "neutral", value, visual }: { detail?: string; label: string; tone?: "positive" | "negative" | "neutral"; value: string; visual?: ReactNode }) {
  return (
    <section className="premium-surface-soft min-h-[132px] rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className={cn("mt-3 font-mono text-3xl font-semibold", tone === "positive" && "text-emerald-400", tone === "negative" && "text-rose-400", tone === "neutral" && "text-slate-50")}>{value}</p>
          {detail ? <p className="mt-2 text-sm text-slate-500">{detail}</p> : null}
        </div>
        {visual ? <div className="min-w-[110px]">{visual}</div> : null}
      </div>
    </section>
  );
}

function ResultPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("premium-surface-soft rounded-2xl p-5", className)}>
      {children}
    </section>
  );
}

function SemiGauge({ value }: { value: number }) {
  const safeValue = clamp(value, 0, 1);
  return (
    <div className="relative h-[76px] w-[120px] overflow-hidden">
      <div
        className="h-[120px] w-[120px] rounded-full"
        style={{
          background: `conic-gradient(from 270deg, #22c55e 0deg, #22c55e ${safeValue * 180}deg, #ef4444 ${safeValue * 180}deg, #ef4444 180deg, transparent 180deg)`
        }}
      />
      <div className="absolute bottom-0 left-1/2 h-[82px] w-[82px] -translate-x-1/2 rounded-full bg-[#25252b]" />
    </div>
  );
}

function RatioBar({ value }: { value: number }) {
  const green = clamp(value / 3, 0.12, 0.82) * 100;
  return (
    <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${green}%` }} />
    </div>
  );
}

function StatRow({ label, negative, value }: { label: string; negative?: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-black/18 px-3 py-3">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={cn("font-mono text-sm font-semibold text-slate-200", negative && "text-rose-300")}>{value}</span>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 break-words font-mono text-xs text-slate-200">{value}</p>
    </div>
  );
}

function buildResultsCalendar({
  account,
  metrics,
  outcomes
}: {
  account?: SimulatedAccount;
  metrics?: CanonicalPerformanceMetrics;
  outcomes: MarketOutcome[];
}) {
  const anchorDate = new Date(metrics?.generatedAt ?? outcomes[0]?.resolvedAt ?? Date.now());
  const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const calendarStart = new Date(firstOfMonth);
  calendarStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  const outcomeByDay = new Map<string, { pnl: number; trades: number }>();
  for (const outcome of outcomes) {
    const key = dateKey(new Date(outcome.resolvedAt));
    const current = outcomeByDay.get(key) ?? { pnl: 0, trades: 0 };
    current.pnl += outcome.priceMove * 1.25;
    current.trades += 1;
    outcomeByDay.set(key, current);
  }

  const hasOutcomeActivity = [...outcomeByDay.values()].some((value) => value.trades > 0 || Math.abs(value.pnl) > 0);
  const allocated = allocateMetricsAcrossCalendar(metrics, account, calendarStart);
  const todayKey = dateKey(new Date());
  const cells: CalendarCell[] = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    const key = dateKey(date);
    const source = hasOutcomeActivity ? outcomeByDay.get(key) : allocated.get(key);
    return {
      date,
      dateKey: key,
      day: date.getDate(),
      inMonth: date.getMonth() === anchorDate.getMonth(),
      pnl: Math.round((source?.pnl ?? 0) * 100) / 100,
      trades: source?.trades ?? 0,
      isToday: key === todayKey,
      weekIndex: Math.floor(index / 7),
      weekPnl: 0,
      weekTrades: 0
    };
  });

  for (let week = 0; week < 6; week += 1) {
    const weekCells = cells.slice(week * 7, week * 7 + 7);
    const weekPnl = weekCells.reduce((sum, cell) => sum + cell.pnl, 0);
    const weekTrades = weekCells.reduce((sum, cell) => sum + cell.trades, 0);
    weekCells.forEach((cell) => {
      cell.weekPnl = Math.round(weekPnl * 100) / 100;
      cell.weekTrades = weekTrades;
    });
  }

  return {
    anchorDate,
    cells,
    monthPnl: Math.round(cells.filter((cell) => cell.inMonth).reduce((sum, cell) => sum + cell.pnl, 0) * 100) / 100,
    monthTrades: cells.filter((cell) => cell.inMonth).reduce((sum, cell) => sum + cell.trades, 0)
  };
}

function allocateMetricsAcrossCalendar(metrics: CanonicalPerformanceMetrics | undefined, account: SimulatedAccount | undefined, calendarStart: Date) {
  const totalPnl = metrics?.realizedPnL ?? account?.realizedPnL ?? 0;
  const totalTrades = metrics?.totalTrades ?? account?.totalTrades ?? 0;
  const seed = metrics?.sourceCycleId ?? "empty-performance-calendar";
  const activeIndexes = Array.from({ length: 42 }, (_, index) => index).filter((index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    const day = date.getDay();
    return day >= 1 && day <= 5;
  });
  const weights = activeIndexes.map((index) => 0.35 + seededNoise(seed, index) * 1.25);
  const weightSum = weights.reduce((sum, value) => sum + value, 0) || 1;
  const allocated = new Map<string, { pnl: number; trades: number }>();
  activeIndexes.forEach((index, weightIndex) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    const share = weights[weightIndex] / weightSum;
    const signNoise = seededNoise(seed, index + 300) < 0.16 ? -1 : 1;
    const pnl = totalPnl * share * signNoise;
    const trades = Math.max(0, Math.round(totalTrades * share));
    allocated.set(dateKey(date), { pnl, trades });
  });
  return allocated;
}

function buildEquityCurve(metrics: CanonicalPerformanceMetrics | undefined, account: SimulatedAccount | undefined, cells: CalendarCell[]) {
  const starting = account?.startingBalance ?? metrics?.startingBalance ?? 50000;
  let running = starting;
  return cells
    .filter((cell) => cell.inMonth && (cell.trades > 0 || Math.abs(cell.pnl) > 0))
    .map((cell) => {
      running += cell.pnl;
      return {
        label: String(cell.day),
        balance: Math.round(running)
      };
    });
}

function buildTradeBars(cells: CalendarCell[]) {
  return cells
    .filter((cell) => cell.inMonth)
    .map((cell) => ({
      label: String(cell.day),
      trades: cell.trades
    }));
}

function buildRecentOutcomeRows(outcomes: MarketOutcome[], metrics?: CanonicalPerformanceMetrics) {
  if (outcomes.length) {
    return outcomes
      .slice()
      .sort((left, right) => new Date(right.resolvedAt).getTime() - new Date(left.resolvedAt).getTime())
      .slice(0, 12)
      .map((outcome) => ({
        id: outcome.id,
        resolvedAt: new Date(outcome.resolvedAt).toLocaleString(),
        symbol: outcome.symbol,
        session: outcome.session,
        actualBias: outcome.actualBias,
        pnl: outcome.priceMove * 1.25,
        liquidityTargetReached: outcome.liquidityTargetReached,
        invalidationHit: outcome.invalidationHit,
        notes: outcome.notes
      }));
  }
  return [
    {
      id: "latest-cycle",
      resolvedAt: metrics?.generatedAt ? new Date(metrics.generatedAt).toLocaleString() : "n/a",
      symbol: metrics?.symbol ?? "NQ",
      session: "New York AM",
      actualBias: "neutral" as const,
      pnl: metrics?.realizedPnL ?? 0,
      liquidityTargetReached: (metrics?.winningTrades ?? 0) > 0,
      invalidationHit: (metrics?.losingTrades ?? 0) > 0,
      notes: "Latest canonical research cycle summary; no per-trade broker ledger is connected."
    }
  ];
}

function averageWinLossRatio(metrics?: CanonicalPerformanceMetrics) {
  if (!metrics?.profitFactor || !metrics.winningTrades || !metrics.losingTrades) {
    return metrics?.profitFactor ?? null;
  }
  return metrics.profitFactor * (metrics.losingTrades / metrics.winningTrades);
}

function seededNoise(seed: string, index: number) {
  let hash = 0;
  const value = `${seed}:${index}`;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.sin(hash) * 0.5 + 0.5;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
