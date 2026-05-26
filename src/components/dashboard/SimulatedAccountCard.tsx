import { DollarSign, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SimulatedAccount } from "@/lib/performance/simulatedAccount";
import { cn } from "@/lib/utils";

const currency = (value: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const rValue = (value: number | null) => (typeof value === "number" ? `${value.toFixed(2)}R` : "n/a");
const profitFactor = (value: number | null) => (typeof value === "number" ? value.toFixed(2) : "n/a");

export function SimulatedAccountCard({ account }: { account: SimulatedAccount }) {
  const pnlPositive = account.realizedPnL >= 0;

  return (
    <Card className="border-cyan-400/20 bg-slate-950/75">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <DollarSign className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            Simulated Account
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Research P&amp;L model only. Uses simulated backtest R, not broker account data.
          </p>
          <p className="mt-1 text-xs text-cyan-100/70">
            Metrics source: {account.metricSourceLabel ?? account.sourceLabel}
          </p>
        </div>
        <Badge variant="warning">Simulation only</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {account.isEmpty ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            Run AI Research Cycle to generate simulated account results.
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Simulated Balance</p>
                <p className="mt-2 text-3xl font-semibold text-slate-50">{currency(account.currentBalance)}</p>
                <p className="mt-1 text-xs text-slate-500">Start {currency(account.startingBalance)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Simulated P&amp;L</p>
                <p className={cn("mt-2 flex items-center gap-2 text-3xl font-semibold", pnlPositive ? "text-emerald-300" : "text-rose-200")}>
                  {pnlPositive ? <TrendingUp className="h-5 w-5" aria-hidden="true" /> : <TrendingDown className="h-5 w-5" aria-hidden="true" />}
                  {currency(account.realizedPnL)}
                </p>
                <p className="mt-1 text-xs text-slate-500">{percent(account.realizedPnLPercent)} at {currency(account.riskDollarsPerR)} per 1R</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Max Drawdown</p>
                <p className="mt-2 text-3xl font-semibold text-amber-100">{currency(account.maxDrawdownDollars)}</p>
                <p className="mt-1 text-xs text-slate-500">{rValue(account.maxDrawdownR)}</p>
              </div>
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-6">
              <Metric label="Total trades" value={String(account.totalTrades)} />
              <Metric label="Win rate" value={percent(account.winRate)} detail={`${account.winningTrades}W / ${account.losingTrades}L`} />
              <Metric label="Average R" value={rValue(account.averageR)} />
              <Metric label="Profit factor" value={profitFactor(account.profitFactor)} />
              <Metric label="Best trade" value={rValue(account.bestTradeR)} />
              <Metric label="Worst trade" value={rValue(account.worstTradeR)} />
            </div>
          </>
        )}

        <div className="flex flex-col gap-2 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Simulation only. Not connected to broker.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{account.sourceNote}</Badge>
            {account.sourceCycleId ? <Badge variant="secondary">Cycle: {account.sourceCycleId}</Badge> : null}
            <Badge variant="secondary">Risk: {currency(account.riskDollarsPerR)} / 1R</Badge>
            <Badge variant="secondary">Provider: {account.accountProvider}</Badge>
          </div>
          {account.pnlAssumption ? <span className="md:basis-full">{account.pnlAssumption}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-sm text-slate-100">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}
