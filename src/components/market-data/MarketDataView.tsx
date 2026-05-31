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
  listImportedCandleMetadata,
  loadCandleWindowSettings,
  loadPreparedCandleSource,
  MARKET_DATA_IMPORT_UPDATED_EVENT,
  saveImportedCandleSet,
  setActiveImportedCandleSet,
  safeWindowSizeOptions,
  saveCandleWindowSettings,
  type CandleWindowSettings,
  type ImportedCandleMetadata,
  type PreparedCandleSource
} from "@/lib/marketData";
import { buildVwapOverlay, createTradingChartData } from "@/lib/charting";
import type { FuturesSymbol, Timeframe } from "@/lib/types";

const symbolOptions = ["ES", "NQ", "MES", "MNQ"].map((value) => ({ label: value, value }));
const timeframeOptions = ["1m", "5m", "15m", "1h"].map((value) => ({ label: value, value }));
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
  const previewChartData = useMemo(() => {
    const candles = activeSource.candles.slice(-240);
    const vwap = buildVwapOverlay(candles);
    return {
      ...createTradingChartData({
        candles,
        sourceLabel: activeSource.label,
        sourceType: activeSource.mode === "imported" ? "imported" : "mock",
        symbol: contextSymbol,
        timeframe: contextTimeframe
      }),
      lineOverlays: vwap ? [vwap] : [],
      stateLabel: "Data preview"
    };
  }, [activeSource.candles, activeSource.label, activeSource.mode, contextSymbol, contextTimeframe]);
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

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Market data architecture</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Market Data Context</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Planning layer for future market data APIs plus local historical file imports. Excel/CSV candles are used
            only as simulation research inputs, never as live feeds or broker execution instructions.
          </p>
        </div>
        <Badge variant={activeSource.mode === "imported" ? "success" : "warning"}>
          {activeSource.mode === "imported" ? "imported historical data active" : "mock / planning only"}
        </Badge>
      </div>

      <SafetyLockBanner message="Market data adapters are research inputs only. No broker execution or live trading." />

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
                  Shared Lightweight Charts preview of the current research window. This is historical or mock data, not a live feed.
                </p>
              </div>
              <Badge variant={activeSource.mode === "imported" ? "success" : "warning"}>
                {activeSource.mode === "imported" ? "IMPORTED" : "MOCK"}
              </Badge>
            </div>
            <TradingChart {...previewChartData} heightClassName="h-[280px]" />
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
