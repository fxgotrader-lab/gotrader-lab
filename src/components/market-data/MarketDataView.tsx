import { useMemo, useState } from "react";
import { BarChart3, DatabaseZap, PlugZap, RadioTower, ShieldCheck } from "lucide-react";

import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { buildMarketContext } from "@/lib/marketData";
import type { FuturesSymbol, Timeframe } from "@/lib/types";

const symbolOptions = ["ES", "NQ", "MES", "MNQ"].map((value) => ({ label: value, value }));
const timeframeOptions = ["1m", "5m", "15m", "1h"].map((value) => ({ label: value, value }));

const statusVariant = (status: string) =>
  status === "available_mock" || status === "mock_only"
    ? "success"
    : status === "later_advanced"
      ? "warning"
      : status === "missing"
        ? "danger"
        : "secondary";

export function MarketDataView() {
  const [symbol, setSymbol] = useState<FuturesSymbol>("NQ");
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const context = useMemo(() => buildMarketContext({ symbol, timeframe, mode: "mock" }), [symbol, timeframe]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Market data architecture</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Market Data Context</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Planning layer for future real market data APIs. Current mode uses mock context only so agent logic can be
            designed without live feeds, broker connections, or API keys in the browser.
          </p>
        </div>
        <Badge variant="warning">mock / planning only</Badge>
      </div>

      <SafetyLockBanner message="Market data adapters are research inputs only. No broker execution or live trading." />

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseZap className="h-4 w-4 text-primary" aria-hidden="true" />
              Context Selector
            </CardTitle>
            <CardDescription>Mock context picker used to preview adapter contracts.</CardDescription>
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
              <StatusTile label="Mock candles" value={String(context.priceVolume.ohlcv.candles.length)} />
              <StatusTile label="VWAP" value={String(context.priceVolume.volumeProfile.vwap ?? "planned")} />
              <StatusTile label="VPOC" value={String(context.priceVolume.volumeProfile.vpoc ?? "planned")} />
            </div>
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              Real providers are roadmap items only. No API calls, websocket feeds, or broker feeds are active.
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
            ["OHLCV", `${context.priceVolume.ohlcv.candles.length} mock candles`],
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
