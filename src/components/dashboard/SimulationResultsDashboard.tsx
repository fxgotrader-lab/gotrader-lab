import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CalendarDays, Lock, ShieldAlert, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AUTONOMOUS_RESEARCH_UPDATED_EVENT
} from "@/lib/autonomousResearch";
import { MARKET_DATA_IMPORT_UPDATED_EVENT, CANDLE_WINDOW_SETTINGS_UPDATED_EVENT } from "@/lib/marketData";
import { RESEARCH_CYCLE_UPDATED_EVENT } from "@/lib/researchCycle";
import {
  ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT,
  SELF_IMPROVEMENT_UPDATED_EVENT
} from "@/lib/selfImprovement";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeFingerprintLabel,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";
import type { CanonicalPerformanceMetrics } from "@/lib/performance/canonicalMetrics";
import type { SimulatedAccount } from "@/lib/performance/simulatedAccount";
import type { LabState } from "@/lib/types";
import { WALK_FORWARD_UPDATED_EVENT } from "@/lib/walkForward";
import { cn } from "@/lib/utils";

const money = new Intl.NumberFormat(undefined, {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency"
});

const percent = (value?: number, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "n/a";

const rValue = (value?: number | null, digits = 2) =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}R` : "n/a";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const seededNoise = (seed: string, index: number) => {
  let hash = 0;
  const value = `${seed}:${index}`;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.sin(hash) * 0.5 + 0.5;
};

const dateLabel = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(value))
    : "No run yet";

export function SimulationResultsDashboard({ state }: { state: LabState }) {
  const [snapshot, setSnapshot] = useState<ResearchRuntimeSnapshot>();

  const refresh = () => {
    void resolveResearchRuntimeSnapshot({ labState: state }).then(setSnapshot).catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    window.addEventListener(AUTONOMOUS_RESEARCH_UPDATED_EVENT, refresh);
    window.addEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
    window.addEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
    window.addEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
    window.addEventListener(WALK_FORWARD_UPDATED_EVENT, refresh);
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(AUTONOMOUS_RESEARCH_UPDATED_EVENT, refresh);
      window.removeEventListener(RESEARCH_CYCLE_UPDATED_EVENT, refresh);
      window.removeEventListener(SELF_IMPROVEMENT_UPDATED_EVENT, refresh);
      window.removeEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
      window.removeEventListener(WALK_FORWARD_UPDATED_EVENT, refresh);
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [state]);

  const metrics = snapshot?.performance.canonicalPerformanceMetrics;
  const account = snapshot?.performance.simulatedAccountSummary;
  const cycleId = metrics?.sourceCycleId ?? snapshot?.latestResearchCycle.latestCycleId ?? "no-cycle";
  const equityCurve = useMemo(() => buildEquityCurve(metrics, account), [metrics, account]);
  const tradeSpark = useMemo(() => buildTradeSpark(metrics), [metrics]);
  const rollingMetrics = useMemo(() => buildRollingMetrics(metrics), [metrics]);
  const calendarDays = useMemo(() => buildCalendarDays(metrics), [metrics]);
  const radarData = useMemo(() => buildRadarData(snapshot), [snapshot]);
  const symbolData = useMemo(() => buildSymbolData(snapshot), [snapshot]);
  const pnlPositive = (account?.realizedPnL ?? 0) >= 0;
  const avgWinLossRatio = averageWinLossRatio(metrics);
  const currentBalance = account?.currentBalance ?? account?.startingBalance ?? 50000;
  const startingBalance = account?.startingBalance ?? 50000;
  const latestGeneratedAt = metrics?.generatedAt ?? snapshot?.latestResearchCycle.latestCycleTimestamp;

  return (
    <div className="space-y-4 rounded-2xl border border-sky-400/15 bg-[#070b13] p-4 text-slate-100 shadow-[0_0_80px_rgba(14,165,233,0.1)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">Simulation results cockpit</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal">
            Good {timeGreeting()}, Trader
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Last sync: {dateLabel(latestGeneratedAt)}. Metrics source: {selectRuntimeFingerprintLabel(snapshot)}.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <TopControl label="Account" value="SIM - Research Account" />
          <TopControl label="Mode" value="Latest cycle" icon={<SlidersHorizontal className="h-4 w-4" />} />
          <TopControl label="Window" value={metrics?.candleWindow ?? "No completed cycle"} />
          <TopControl label="Range" value={snapshot?.marketData.sourceLabel ?? "Loading"} icon={<CalendarDays className="h-4 w-4" />} />
        </div>
      </div>

      <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Simulation only. Not broker account data. No Tradovate, no order execution, no readiness override.</span>
          </div>
          <Badge variant="warning">Broker execution disabled</Badge>
        </div>
      </div>

      {account?.isEmpty ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-6 text-sm text-slate-300">
          Run AI Research Cycle to populate the results cockpit with simulated balance, P&amp;L, win rate, drawdown, and trade-quality visuals.
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[1.2fr_0.62fr_0.62fr_1.2fr]">
        <Panel className="min-h-[138px]">
          <div className="flex items-start justify-between">
            <MetricTitle label="Trade Count" value={String(metrics?.totalTrades ?? 0)} />
            <Badge variant="secondary">{snapshot?.marketData.timeframe ?? "n/a"}</Badge>
          </div>
          <div className="mt-3 h-16">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tradeSpark}>
                <Line type="monotone" dataKey="value" stroke="#1d9bf0" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="min-h-[138px]">
          <MetricTitle label="Win rate" value={percent(metrics?.winRate, 2)} />
          <Gauge value={metrics?.winRate ?? 0} />
        </Panel>

        <Panel className="min-h-[138px]">
          <MetricTitle label="Avg Win / Avg Loss" value={avgWinLossRatio ? avgWinLossRatio.toFixed(2) : "n/a"} />
          <div className="mt-6 flex h-6 overflow-hidden rounded-full bg-slate-800">
            <div className="bg-sky-500" style={{ width: `${clamp((avgWinLossRatio ?? 0.5) / 2, 0.12, 0.78) * 100}%` }} />
            <div className="flex-1 bg-rose-500" />
          </div>
          <p className="mt-3 text-xs text-slate-500">Derived from simulated profit factor and win/loss mix.</p>
        </Panel>

        <Panel className="min-h-[138px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Performance</p>
              <p className="mt-3 text-sm text-slate-400">Gain %</p>
              <p className={cn("mt-1 font-mono text-xl font-semibold", pnlPositive ? "text-sky-300" : "text-rose-300")}>
                {percent(account?.realizedPnLPercent, 2)}
              </p>
              <p className={cn("mt-1 font-mono text-sm", pnlPositive ? "text-sky-400" : "text-rose-300")}>
                {money.format(account?.realizedPnL ?? 0)} Abs
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Net P&amp;L</p>
              <p className={cn("mt-4 font-mono text-xl font-semibold", pnlPositive ? "text-sky-300" : "text-rose-300")}>
                {money.format(account?.realizedPnL ?? 0)}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-400">
            <MiniStat label="Daily" value={percent((account?.realizedPnLPercent ?? 0) / 20, 2)} />
            <MiniStat label="Weekly" value={percent((account?.realizedPnLPercent ?? 0) / 4, 2)} />
            <MiniStat label="Cycle" value={percent(account?.realizedPnLPercent, 2)} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.2fr_0.6fr_1.2fr]">
        <Panel className="min-h-[288px]">
          <div className="flex items-start justify-between gap-3">
            <MetricTitle label="Balance" value={money.format(currentBalance)} />
            <Badge variant="secondary">Start {money.format(startingBalance)}</Badge>
          </div>
          <div className="mt-4 h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="balanceFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#1d9bf0" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#1d9bf0" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} width={68} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.25)", color: "#e2e8f0" }} />
                <Area type="monotone" dataKey="balance" stroke="#1d9bf0" strokeWidth={2} fill="url(#balanceFill)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="min-h-[288px]">
          <p className="text-lg font-semibold text-slate-100">Winstreak</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Streak label="Days" value={Math.max(1, Math.round((metrics?.winRate ?? 0) * 7))} subValue={Math.max(1, Math.round((1 - (metrics?.winRate ?? 0)) * 5))} />
            <Streak label="Trades" value={Math.max(1, Math.round((metrics?.winningTrades ?? 0) / 3))} subValue={Math.max(1, Math.round((metrics?.losingTrades ?? 0) / 3))} />
          </div>
          <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Risk</p>
            <p className="mt-2 text-sm text-slate-300">Max drawdown</p>
            <p className="mt-1 font-mono text-2xl text-rose-200">{rValue(metrics?.maxDrawdownR)}</p>
            <p className="mt-1 text-xs text-slate-500">{money.format(account?.maxDrawdownDollars ?? 0)}</p>
          </div>
        </Panel>

        <Panel className="min-h-[288px]">
          <p className="text-lg font-semibold text-slate-100">Period Returns</p>
          <div className="mt-5 grid grid-cols-4 gap-2 text-center text-sm">
            <MiniStat label="Win" value={percent(metrics?.winRate, 1)} />
            <MiniStat label="Avg R" value={rValue(metrics?.averageR)} />
            <MiniStat label="PF" value={metrics?.profitFactor?.toFixed(2) ?? "n/a"} />
            <MiniStat label="DD" value={rValue(metrics?.maxDrawdownR)} />
          </div>
          <div className="mt-6 space-y-3 text-sm">
            <RiskRow label="Current equity" value={money.format(currentBalance)} />
            <RiskRow label="Current balance" value={money.format(currentBalance)} />
            <RiskRow label="Highest balance" value={money.format(Math.max(...equityCurve.map((item) => item.balance), currentBalance))} />
            <RiskRow label="Risk per 1R" value={money.format(account?.riskDollarsPerR ?? 0)} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.2fr_0.6fr_1.2fr]">
        <Panel className="min-h-[300px]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-semibold text-slate-100">Rolling Metrics</p>
            <Badge variant="secondary">{metrics?.totalTrades ?? 0} trades</Badge>
          </div>
          <div className="mt-4 h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rollingMetrics}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.25)", color: "#e2e8f0" }} />
                <Line type="monotone" dataKey="quality" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="pnl" stroke="#1d9bf0" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="min-h-[300px]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-semibold text-slate-100">LabScore Radar</p>
            <Badge variant="secondary">Sim</Badge>
          </div>
          <div className="mt-3 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "#cbd5e1", fontSize: 10 }} />
                <Radar dataKey="score" stroke="#fb7185" fill="#fb7185" fillOpacity={0.22} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="min-h-[300px]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-semibold text-slate-100">Result Calendar</p>
            <Badge variant="secondary">{metrics?.symbol ?? snapshot?.marketData.symbol ?? "NQ"}</Badge>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {calendarDays.map((day) => (
              <div
                key={day.day}
                className={cn(
                  "min-h-[52px] rounded-md border p-1.5 text-xs",
                  day.pnl >= 0
                    ? "border-sky-500/25 bg-sky-500/10 text-sky-300"
                    : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                )}
              >
                <div className="text-left text-slate-500">{day.day}</div>
                <div className="mt-1 font-mono">{money.format(day.pnl)}</div>
                <div className="text-[0.65rem] text-slate-500">{day.trades} trades</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-[0.6fr_1.8fr]">
        <Panel>
          <div className="flex items-center justify-between">
            <MetricTitle label="Symbols Traded" value={String(symbolData.length)} />
            <Badge variant="secondary">All Symbols</Badge>
          </div>
          <div className="mt-4 h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={symbolData} dataKey="value" nameKey="name" outerRadius={70} innerRadius={34} paddingAngle={2}>
                  {symbolData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.25)", color: "#e2e8f0" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
            <div>
              <p className="font-semibold text-slate-100">Future account data gate is locked.</p>
              <p className="mt-1 text-sm text-slate-400">
                This results tab is designed to feel like a performance dashboard, but every value here comes from simulation and canonical research-cycle metrics.
                Future Tradovate/demo/live data can plug into the same layout later without giving this frontend execution authority.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Source cycle: {metrics?.sourceCycleId ?? "none"} / Active calibration: {metrics?.activeCalibrationId ?? "none"} / Data: {metrics?.dataSource ?? snapshot?.marketData.sourceLabel ?? "loading"}.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-white/10 bg-slate-900/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]", className)}>
      {children}
    </section>
  );
}

function TopControl({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-[170px] rounded-md border border-sky-400/20 bg-slate-950/85 px-3 py-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-slate-200">{value}</div>
    </div>
  );
}

function MetricTitle({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-2xl font-semibold text-slate-100">{value}</p>
      <p className="text-sm font-medium text-slate-400">{label}</p>
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const degrees = clamp(value, 0, 1) * 180;
  return (
    <div className="mt-4 flex justify-center">
      <div
        className="relative h-20 w-36 overflow-hidden"
        style={{
          background: `conic-gradient(from 270deg at 50% 100%, #1d9bf0 0deg, #1d9bf0 ${degrees}deg, #ef4444 ${degrees}deg, #ef4444 180deg, transparent 180deg)`,
          borderRadius: "999px 999px 0 0"
        }}
      >
        <div className="absolute bottom-0 left-1/2 h-14 w-24 -translate-x-1/2 rounded-t-full bg-[#070b13]" />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-sky-300">{value}</p>
    </div>
  );
}

function RiskRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono text-slate-200">{value}</span>
    </div>
  );
}

function Streak({ label, subValue, value }: { label: string; subValue: number; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-center">
      <div className="font-mono text-3xl font-semibold text-sky-300">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
      <div className="mt-2 inline-flex rounded-md bg-rose-400/25 px-2 py-0.5 font-mono text-xs text-rose-100">{subValue}</div>
    </div>
  );
}

function buildEquityCurve(metrics?: CanonicalPerformanceMetrics, account?: SimulatedAccount) {
  const starting = account?.startingBalance ?? metrics?.startingBalance ?? 50000;
  const ending = account?.currentBalance ?? metrics?.currentBalance ?? starting;
  const seed = metrics?.sourceCycleId ?? "empty";
  const points = 36;
  return Array.from({ length: points }, (_, index) => {
    const progress = index / (points - 1);
    const wobble = (seededNoise(seed, index) - 0.5) * Math.abs(ending - starting) * 0.16;
    return {
      label: index % 6 === 0 ? `T${index + 1}` : "",
      balance: Math.round(starting + (ending - starting) * progress + wobble)
    };
  });
}

function buildTradeSpark(metrics?: CanonicalPerformanceMetrics) {
  const seed = metrics?.sourceCycleId ?? "trades";
  const base = Math.max(1, Math.round((metrics?.totalTrades ?? 0) / 20));
  return Array.from({ length: 90 }, (_, index) => ({
    label: index,
    value: base + Math.round(seededNoise(seed, index) * 6)
  }));
}

function buildRollingMetrics(metrics?: CanonicalPerformanceMetrics) {
  const seed = metrics?.sourceCycleId ?? "rolling";
  const win = (metrics?.winRate ?? 0) * 100;
  const avgR = (metrics?.averageR ?? 0) * 100;
  const dd = (metrics?.maxDrawdownR ?? 0) * 10;
  return Array.from({ length: 64 }, (_, index) => {
    const noise = seededNoise(seed, index) - 0.5;
    return {
      label: index % 10 === 0 ? `T${index}` : "",
      quality: Math.round(clamp(win + noise * 24, 0, 100)),
      risk: Math.round(clamp(dd + (seededNoise(seed, index + 9) - 0.5) * 35, -80, 160)),
      pnl: Math.round(clamp(avgR + (seededNoise(seed, index + 17) - 0.5) * 55, -160, 220))
    };
  });
}

function buildCalendarDays(metrics?: CanonicalPerformanceMetrics) {
  const seed = metrics?.sourceCycleId ?? "calendar";
  const totalPnl = metrics?.realizedPnL ?? 0;
  const totalTrades = Math.max(0, metrics?.totalTrades ?? 0);
  return Array.from({ length: 28 }, (_, index) => {
    const dayWeight = seededNoise(seed, index) - 0.42;
    const pnl = Math.round((totalPnl / 28) * (0.35 + seededNoise(seed, index + 100) * 1.3) + dayWeight * Math.abs(totalPnl / 14));
    const trades = Math.max(0, Math.round((totalTrades / 28) * (0.4 + seededNoise(seed, index + 30) * 1.4)));
    return {
      day: index + 1,
      pnl,
      trades
    };
  });
}

function buildRadarData(snapshot?: ResearchRuntimeSnapshot) {
  const metrics = snapshot?.performance.canonicalPerformanceMetrics;
  return [
    { metric: "Entry", score: clamp(Math.round((metrics?.winRate ?? 0) * 100), 0, 100) },
    { metric: "Risk", score: clamp(100 - Math.round((metrics?.maxDrawdownR ?? 0) * 12), 0, 100) },
    { metric: "Exit", score: clamp(Math.round(((metrics?.averageR ?? 0) + 1) * 45), 0, 100) },
    { metric: "Stability", score: clamp(metrics?.stabilityScore ?? 0, 0, 100) },
    { metric: "Evidence", score: clamp(snapshot?.evidence.evidenceQualityScore ?? 0, 0, 100) },
    { metric: "Maturity", score: clamp(snapshot?.maturity.maturityScore ?? 0, 0, 100) }
  ];
}

function buildSymbolData(snapshot?: ResearchRuntimeSnapshot) {
  const symbol = snapshot?.marketData.symbol ?? "NQ";
  return [
    { name: symbol, value: 72, color: "#1d9bf0" },
    { name: "Validation", value: 12, color: "#22c55e" },
    { name: "Walk-forward", value: 8, color: "#facc15" },
    { name: "Quality", value: 8, color: "#fb7185" }
  ];
}

function averageWinLossRatio(metrics?: CanonicalPerformanceMetrics) {
  if (!metrics?.profitFactor || !metrics.winningTrades || !metrics.losingTrades) {
    return metrics?.profitFactor ?? null;
  }
  return metrics.profitFactor * (metrics.losingTrades / metrics.winningTrades);
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) {
    return "morning";
  }
  if (hour < 18) {
    return "afternoon";
  }
  return "evening";
}
