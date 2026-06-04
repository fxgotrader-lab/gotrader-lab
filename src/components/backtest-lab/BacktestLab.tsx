import { useEffect, useMemo, useState } from "react";
import { Activity, RotateCcw, ShieldAlert, SlidersHorizontal, Target, TimerReset } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalibrationAssistantPanel } from "@/components/backtest-lab/CalibrationAssistantPanel";
import { TradingChart } from "@/components/charts/TradingChart";
import { MetricProvenanceDetails } from "@/components/common/MetricProvenanceDetails";
import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { MetricCard } from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ValidationGuideCard } from "@/components/validation/ValidationGuideCard";
import {
  backtestSessionFilters,
  backtestStopModels,
  createMockBacktestCandleSource,
  defaultBacktestAgentWeights,
  diagnoseTradeGeneration,
  diagnoseTradeQuality,
  describeBacktestConfig,
  loadResolvedBacktestCandleSource,
  resetBacktestConfig,
  runBacktest,
  sanitizeBacktestConfig,
  saveBacktestConfig
} from "@/lib/backtesting";
import type { BacktestAgentWeightId, BacktestSourcePreference, ResolvedBacktestConfig, ResolvedBacktestCandleSource } from "@/lib/backtesting";
import { buildVwapOverlay, createTradingChartData } from "@/lib/charting";
import {
  ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT,
  clearActiveResearchCalibration,
  loadActiveResearchCalibration,
  resolveActiveBacktestConfig
} from "@/lib/selfImprovement";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  importedDataPresetSettings,
  loadCandleWindowSettings,
  MARKET_DATA_IMPORT_UPDATED_EVENT,
  safeWindowSizeOptions,
  saveCandleWindowSettings,
  type CandleWindowSettings
} from "@/lib/marketData";
import { MT5_READ_ONLY_UPDATED_EVENT } from "@/lib/integrations/mt5";
import {
  resolveResearchRuntimeSnapshot,
  selectRuntimeConfigSummary,
  selectRuntimeFingerprintLabel,
  selectRuntimeMetricSourceLabel,
  selectRuntimeSourceLabel,
  selectRuntimeWarnings,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";
import type { FuturesSymbol, MarketRegime, Timeframe } from "@/lib/types";
import { formatPercent, formatSigned, safeTopN } from "@/lib/utils";

const symbolOptions = ["ES", "NQ", "MES", "MNQ"].map((value) => ({ label: value, value }));
const timeframeOptions = ["1m", "5m", "15m", "1h"].map((value) => ({ label: value, value }));
const researchTimeframeOptions = ["1m", "5m", "15m"].map((value) => ({ label: value, value }));
const windowSizeOptions = [
  ...safeWindowSizeOptions.map((value) => ({ label: `${value.toLocaleString()} candles`, value: String(value) })),
  { label: "Custom", value: "custom" }
];
const sessionOptions = backtestSessionFilters.map((value) => ({ label: value, value }));
const stopModelOptions = backtestStopModels.map((value) => ({ label: value, value }));
const regimeOptions = ["trend", "balanced", "volatile", "range", "news-driven", "risk-off", "risk-on"].map((value) => ({ label: value, value }));
const backtestSourcePreferenceOptions: Array<{ label: string; value: BacktestSourcePreference }> = [
  { label: "Active canonical research source", value: "active_research" },
  { label: "Imported historical", value: "imported_historical" },
  { label: "Mock/demo only", value: "mock_demo" }
];
const BACKTEST_SOURCE_PREFERENCE_KEY = "gotrader-ai-lab-backtest-source-preference";
const loadBacktestSourcePreference = (): BacktestSourcePreference => {
  if (typeof window === "undefined") {
    return "active_research";
  }
  const stored = window.localStorage.getItem(BACKTEST_SOURCE_PREFERENCE_KEY);
  return stored === "imported_historical" || stored === "mock_demo" || stored === "active_research"
    ? stored
    : "active_research";
};
const saveBacktestSourcePreference = (value: BacktestSourcePreference) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BACKTEST_SOURCE_PREFERENCE_KEY, value);
  }
  return value;
};

const agentWeightLabels: Record<BacktestAgentWeightId, string> = {
  "ict-liquidity-agent": "ICT Liquidity",
  "ict-structure-agent": "ICT Structure",
  "grinch-htf-bias-agent": "Grinch HTF Bias",
  "grinch-pd-array-hierarchy-agent": "Grinch PD Hierarchy",
  "grinch-opening-price-equilibrium-agent": "Opening Prices",
  "grinch-dealing-range-agent": "Dealing Range",
  "grinch-market-cycle-agent": "Market Cycle",
  "grinch-model-one-power-three-agent": "Model 1 / Power 3",
  "grinch-reversal-profile-agent": "Reversal Profile",
  "grinch-consolidation-profile-agent": "Consolidation Profile",
  "grinch-smt-intermarket-agent": "SMT / Intermarket",
  "grinch-time-price-alignment-agent": "Time-Price",
  "grinch-entry-confirmation-agent": "Entry Confirmation",
  "session-timing-agent": "Session Timing",
  "risk-reward-agent": "Risk/Reward",
  "session-levels-agent": "Session Levels",
  "auction-volume-profile-agent": "Auction/Profile",
  "macro-event-risk-agent": "Macro Event Risk",
  "composite-regime-agent": "Composite Regime",
  "intermarket-confirmation-agent": "Intermarket",
  "positioning-gamma-agent": "Positioning/Gamma",
  "order-flow-agent": "Order Flow Later",
  "volatility-regime-agent": "Volatility/Regime"
};

const numberFields: Array<{
  key: keyof Pick<
    ResolvedBacktestConfig,
    | "minimumConfluenceThreshold"
    | "minimumConfidenceThreshold"
    | "targetRMultiple"
    | "fixedTickStopSize"
    | "maxBarsToResolveTrade"
    | "warmupCandles"
    | "decisionInterval"
    | "visibleWindow"
  >;
  label: string;
  detail: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "minimumConfluenceThreshold", label: "Minimum confluence", detail: "ICT score gate", min: 0, max: 1, step: 0.01 },
  { key: "minimumConfidenceThreshold", label: "Minimum confidence", detail: "CIO confidence gate", min: 0, max: 1, step: 0.01 },
  { key: "targetRMultiple", label: "Target R multiple", detail: "Simulated target", min: 0.25, max: 8, step: 0.25 },
  { key: "fixedTickStopSize", label: "Fixed tick stop", detail: "Used by fixed stop model", min: 1, max: 400, step: 1 },
  { key: "maxBarsToResolveTrade", label: "Max bars to resolve", detail: "Target/stop/expiry window", min: 1, max: 48, step: 1 },
  { key: "warmupCandles", label: "Warmup candles", detail: "History before first decision", min: 6, max: 100, step: 1 },
  { key: "decisionInterval", label: "Decision interval", detail: "Candles between theses", min: 1, max: 24, step: 1 },
  { key: "visibleWindow", label: "Replay window", detail: "Candles shown in Replay", min: 8, max: 80, step: 1 }
];

const biasVariant = (bias?: string) => {
  if (bias === "bullish") {
    return "success" as const;
  }
  if (bias === "bearish") {
    return "danger" as const;
  }
  return "warning" as const;
};

const candlesForSource = (source: ResolvedBacktestCandleSource) => source.candles;
const sourceTypeForBacktest = (source: ResolvedBacktestCandleSource) =>
  source.provider === "imported_historical"
    ? "imported" as const
    : source.provider === "mt5_read_only"
      ? "mt5_read_only" as const
      : source.provider === "tradingview_mcp"
        ? "tradingview_mcp_chart" as const
        : "mock" as const;
const supportedBacktestSymbol = (symbol?: string): FuturesSymbol =>
  symbolOptions.some((option) => option.value === symbol) ? symbol as FuturesSymbol : "MNQ";
const supportedBacktestTimeframe = (timeframe?: string): Timeframe =>
  timeframeOptions.some((option) => option.value === timeframe) ? timeframe as Timeframe : "5m";
const configForSource = (config: ResolvedBacktestConfig, source: ResolvedBacktestCandleSource) =>
  source.provider !== "mock"
    ? sanitizeBacktestConfig({
        ...config,
        symbol: supportedBacktestSymbol(source.requestedSymbol),
        timeframe: supportedBacktestTimeframe(source.candles[0]?.timeframe ?? source.appliedSettings.targetTimeframe)
      })
    : config;

export function BacktestLab() {
  const [configResolution, setConfigResolution] = useState(() => resolveActiveBacktestConfig());
  const [draftConfig, setDraftConfig] = useState<ResolvedBacktestConfig>(() => resolveActiveBacktestConfig().config);
  const [sourcePreference, setSourcePreference] = useState<BacktestSourcePreference>(() => loadBacktestSourcePreference());
  const [candleSource, setCandleSource] = useState<ResolvedBacktestCandleSource>(() => createMockBacktestCandleSource());
  const [result, setResult] = useState(() => runBacktest(candleSource.candles, resolveActiveBacktestConfig().config));
  const [activeCalibration, setActiveCalibration] = useState(() => loadActiveResearchCalibration());
  const [windowSettings, setWindowSettings] = useState<CandleWindowSettings>(() => loadCandleWindowSettings());
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();
  const summary = result.summary;
  const activeCandles = candlesForSource(candleSource);
  const runtimeWarnings = selectRuntimeWarnings(runtimeSnapshot);
  const zeroTradeDiagnostics = summary.totalTrades === 0
    ? diagnoseTradeGeneration({ candles: activeCandles, config: result.config, result })
    : [];
  const tradeQualityDiagnostics = summary.totalTrades > 0 ? diagnoseTradeQuality({ result }) : [];
  const topTradeQualityDiagnostic =
    tradeQualityDiagnostics.find((item) => item.severity === "blocking") ??
    tradeQualityDiagnostics.find((item) => item.severity === "warning") ??
    tradeQualityDiagnostics[0];
  const lastEquity = summary.equityCurve[summary.equityCurve.length - 1]?.equityR ?? 0;
  const backtestChartData = useMemo(() => {
    const previewCandles = activeCandles.slice(-240);
    const vwap = buildVwapOverlay(previewCandles);
    return {
      ...createTradingChartData({
        candles: previewCandles,
        sourceLabel: candleSource.label,
        sourceType: sourceTypeForBacktest(candleSource),
        symbol: result.config.symbol,
        timeframe: result.config.timeframe
      }),
      lineOverlays: vwap ? [vwap] : [],
      stateLabel: "Backtest preview"
    };
  }, [activeCandles, candleSource, result.config.symbol, result.config.timeframe]);
  const agentWeightTotal = useMemo(
    () => Object.values(draftConfig.agentWeights).reduce((sum, value) => sum + value, 0),
    [draftConfig.agentWeights]
  );

  const patchConfig = (patch: Partial<ResolvedBacktestConfig>) => {
    setDraftConfig((current) => sanitizeBacktestConfig({ ...current, ...patch }));
  };

  const patchNumber = (key: keyof ResolvedBacktestConfig, value: string) => {
    const numeric = Number(value);
    patchConfig({ [key]: Number.isFinite(numeric) ? numeric : draftConfig[key] } as Partial<ResolvedBacktestConfig>);
  };

  const patchAgentWeight = (agentId: BacktestAgentWeightId, value: string) => {
    const numeric = Number(value);
    setDraftConfig((current) =>
      sanitizeBacktestConfig({
        ...current,
        agentWeights: {
          ...current.agentWeights,
          [agentId]: Number.isFinite(numeric) ? numeric : current.agentWeights[agentId]
        }
      })
    );
  };

  const refreshWithActiveSource = async (
    configOverride?: ResolvedBacktestConfig,
    settingsOverride: CandleWindowSettings = loadCandleWindowSettings(),
    preferenceOverride: BacktestSourcePreference = sourcePreference
  ) => {
    const source = await loadResolvedBacktestCandleSource({ preference: preferenceOverride, settings: settingsOverride });
    const resolved = resolveActiveBacktestConfig(configOverride);
    const sourceConfig = configForSource(resolved.config, source);
    const sourceResolved = { ...resolved, config: sourceConfig, finalBacktestConfluenceThreshold: sourceConfig.minimumConfluenceThreshold };
    setCandleSource(source);
    setConfigResolution(sourceResolved);
    setDraftConfig(sourceResolved.config);
    setResult(runBacktest(candlesForSource(source), sourceResolved.config));
    void resolveResearchRuntimeSnapshot({ preparedCandleSource: source }).then(setRuntimeSnapshot).catch(() => undefined);
  };

  const patchWindowSettings = async (patch: Partial<CandleWindowSettings>) => {
    const saved = saveCandleWindowSettings({ ...windowSettings, ...patch });
    setWindowSettings(saved);
    await refreshWithActiveSource(undefined, saved);
  };

  const applyImportedPreset = async (preset: "safe" | "standard" | "advanced") => {
    const preference = saveBacktestSourcePreference("imported_historical");
    setSourcePreference(preference);
    const saved = saveCandleWindowSettings({
      ...windowSettings,
      ...importedDataPresetSettings[preset]
    });
    setWindowSettings(saved);
    await refreshWithActiveSource(undefined, saved, preference);
  };

  const changeSourcePreference = async (value: BacktestSourcePreference) => {
    const saved = saveBacktestSourcePreference(value);
    setSourcePreference(saved);
    await refreshWithActiveSource(undefined, windowSettings, saved);
  };

  const run = async () => {
    const saved = saveBacktestConfig(draftConfig);
    await refreshWithActiveSource(saved);
  };

  const saveOnly = () => {
    const saved = saveBacktestConfig(draftConfig);
    const resolved = resolveActiveBacktestConfig(saved);
    setConfigResolution(resolved);
    setDraftConfig(resolved.config);
  };

  const reset = async () => {
    clearActiveResearchCalibration("Reset Backtest Lab to the default simulation baseline.");
    const next = resetBacktestConfig();
    setActiveCalibration(loadActiveResearchCalibration());
    await refreshWithActiveSource(next);
  };

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      setActiveCalibration(loadActiveResearchCalibration());
      const settings = loadCandleWindowSettings();
      const preference = loadBacktestSourcePreference();
      setWindowSettings(settings);
      setSourcePreference(preference);
      loadResolvedBacktestCandleSource({ preference, settings }).then((source) => {
        if (!mounted) {
          return;
        }
        const resolved = resolveActiveBacktestConfig();
        const sourceConfig = configForSource(resolved.config, source);
        const sourceResolved = { ...resolved, config: sourceConfig, finalBacktestConfluenceThreshold: sourceConfig.minimumConfluenceThreshold };
        setCandleSource(source);
        setConfigResolution(sourceResolved);
        setDraftConfig(sourceResolved.config);
        setResult(runBacktest(candlesForSource(source), sourceResolved.config));
        resolveResearchRuntimeSnapshot({ preparedCandleSource: source })
          .then((snapshot) => {
            if (mounted) {
              setRuntimeSnapshot(snapshot);
            }
          })
          .catch(() => undefined);
      });
    };
    refresh();
    window.addEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
    window.addEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
    window.addEventListener(MT5_READ_ONLY_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      mounted = false;
      window.removeEventListener(ACTIVE_RESEARCH_CALIBRATION_UPDATED_EVENT, refresh);
      window.removeEventListener(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener(MARKET_DATA_IMPORT_UPDATED_EVENT, refresh);
      window.removeEventListener(MT5_READ_ONLY_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Backtest configuration</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Parameter Lab</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Tune simulation replay assumptions for ICT filters, confluence gates, agent weights, stop model, and
            simulated target logic. The run uses the active candle source selected in Market Data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">Simulation only</Badge>
          <Badge variant={candleSource.provider === "mt5_read_only" ? "success" : candleSource.provider === "mock" ? "warning" : "muted"}>
            {candleSource.provider.replace(/_/g, " ")}
          </Badge>
          {candleSource.brokerSymbol ? <Badge variant="secondary">{candleSource.brokerSymbol} -&gt; {candleSource.requestedSymbol}</Badge> : null}
          <Badge variant="danger">authority none</Badge>
        </div>
      </div>

      <SafetyLockBanner message="Simulation calibration only. No broker connection, live market data, or real trades." />

      <Card className="border-cyan-400/20 bg-cyan-400/5">
        <CardContent className="grid gap-3 p-4 text-sm text-cyan-50 md:grid-cols-5">
          <div>
            <div className="text-xs uppercase opacity-70">Metrics source</div>
            <div className="mt-1 font-mono">{selectRuntimeMetricSourceLabel(runtimeSnapshot)}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Runtime data source</div>
            <div className="mt-1 font-mono">{selectRuntimeSourceLabel(runtimeSnapshot)}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Active baseline</div>
            <div className="mt-1 font-mono">{selectRuntimeConfigSummary(runtimeSnapshot)}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Page-local diagnostic</div>
            <div className="mt-1 font-mono">recomputed preview: {summary.totalTrades} trades</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Run fingerprint</div>
            <div className="mt-1 break-all font-mono">{selectRuntimeFingerprintLabel(runtimeSnapshot)}</div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/10">
        <CardContent className="grid gap-3 p-4 text-sm text-primary md:grid-cols-4">
          <div>
            <div className="text-xs uppercase opacity-70">Active calibration storage found</div>
            <div className="mt-1 font-mono">{configResolution.activeCalibrationStorageFound ? "yes" : "no"}</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Active threshold</div>
            <div className="mt-1 font-mono">
              {activeCalibration ? `${(activeCalibration.activeConfigAfter.minimumConfluenceThreshold * 100).toFixed(0)}%` : "n/a"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Default threshold</div>
            <div className="mt-1 font-mono">{(configResolution.defaultConfluenceThreshold * 100).toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70">Resolved threshold</div>
            <div className="mt-1 font-mono">{(configResolution.finalBacktestConfluenceThreshold * 100).toFixed(0)}%</div>
          </div>
        </CardContent>
      </Card>

      <Card className={candleSource.provider === "mt5_read_only" ? "border-emerald-300/25 bg-emerald-300/10" : candleSource.provider === "mock" ? "border-amber-300/25 bg-amber-300/10" : ""}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Backtest Source</CardTitle>
              <CardDescription>Backtests use the selected canonical source. MT5 read-only remains CFD/proxy data with no execution authority.</CardDescription>
            </div>
            <Badge variant={candleSource.provider === "mt5_read_only" ? "success" : candleSource.provider === "mock" ? "warning" : "secondary"}>
              {candleSource.provider.replace(/_/g, " ")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
            <div className="space-y-2">
              <Label htmlFor="backtest-source-preference">Source selector</Label>
              <Select
                id="backtest-source-preference"
                value={sourcePreference}
                options={backtestSourcePreferenceOptions}
                onChange={(event) => void changeSourcePreference(event.target.value as BacktestSourcePreference)}
              />
            </div>
            <div>
              <p className="font-medium">Active candle source: {candleSource.label}</p>
              <p className="mt-1 text-muted-foreground">
                Provider {candleSource.provider.replace(/_/g, " ")}; requested {candleSource.requestedSymbol}
                {candleSource.brokerSymbol ? ` via broker symbol ${candleSource.brokerSymbol}` : ""}; {candleSource.processedCandleCount.toLocaleString()} candle(s)
                from {candleSource.firstTimestamp ?? "n/a"} to {candleSource.lastTimestamp ?? "n/a"}.
              </p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Fingerprint: {candleSource.sourceFingerprint}</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <div className="rounded-md border border-border bg-background/45 p-2">
              <p className="text-xs text-muted-foreground">Eligibility</p>
              <p className="mt-1 text-foreground">{candleSource.provider === "mock" ? "demo only" : "canonical source"}</p>
            </div>
            <div className="rounded-md border border-border bg-background/45 p-2">
              <p className="text-xs text-muted-foreground">Data quality</p>
              <p className="mt-1 text-foreground">{candleSource.dataQuality.replace(/_/g, " ")}</p>
            </div>
            <div className="rounded-md border border-border bg-background/45 p-2">
              <p className="text-xs text-muted-foreground">Authority</p>
              <p className="mt-1 text-foreground">execution none / broker none</p>
            </div>
            <div className="rounded-md border border-border bg-background/45 p-2">
              <p className="text-xs text-muted-foreground">Storage</p>
              <p className="mt-1 text-foreground">{candleSource.provider === "mt5_read_only" ? "canonical MT5 cache" : candleSource.mode}</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <Button variant="secondary" onClick={() => void applyImportedPreset("safe")} className="justify-center">
              Safe: 500 raw → 5m
            </Button>
            <Button variant="outline" onClick={() => void applyImportedPreset("standard")} className="justify-center">
              Standard: 2,000 raw → 5m
            </Button>
            <Button variant="outline" onClick={() => void applyImportedPreset("advanced")} className="justify-center">
              Advanced custom
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="backtest-research-window">Research window</Label>
              <Select
                id="backtest-research-window"
                value={safeWindowSizeOptions.includes(windowSettings.windowSize) ? String(windowSettings.windowSize) : "custom"}
                options={windowSizeOptions}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value !== "custom") {
                    void patchWindowSettings({ windowSize: Number(value), advancedMode: false });
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="backtest-research-timeframe">Research timeframe</Label>
              <Select
                id="backtest-research-timeframe"
                value={windowSettings.targetTimeframe}
                options={researchTimeframeOptions}
                onChange={(event) => void patchWindowSettings({ targetTimeframe: event.target.value as CandleWindowSettings["targetTimeframe"] })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="backtest-custom-window">Custom window</Label>
              <Input
                id="backtest-custom-window"
                type="number"
                min="100"
                max="50000"
                value={String(windowSettings.windowSize)}
                onChange={(event) => void patchWindowSettings({ windowSize: Number(event.target.value), advancedMode: Number(event.target.value) > 5000 })}
              />
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background/45 p-3 text-sm">
              <input
                type="checkbox"
                checked={windowSettings.advancedMode}
                onChange={(event) => void patchWindowSettings({ advancedMode: event.target.checked })}
              />
              Advanced large-window mode
            </label>
          </div>
          {[...candleSource.warnings, ...candleSource.sourceWarnings].length ? (
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">
              {[...candleSource.warnings, ...candleSource.sourceWarnings].join(" ")}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {activeCalibration ? (
        <Card className="border-emerald-300/25 bg-emerald-300/10">
          <CardContent className="flex flex-col gap-3 p-4 text-sm text-emerald-100 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Active approved calibration</p>
              <p className="mt-1">
                {activeCalibration.approvedCalibrationId} is active. Current confluence threshold{" "}
                {(configResolution.config.minimumConfluenceThreshold * 100).toFixed(0)}%.
              </p>
            </div>
            <Button variant="secondary" onClick={reset}>
              Reset to default baseline
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <TechnicalDetails
        title="Active config diagnostics"
        description="Open to verify the saved baseline, active calibration patch, and final threshold used by the backtest."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Active calibration storage found", configResolution.activeCalibrationStorageFound ? "yes" : "no"],
            ["Merge status", configResolution.mergeStatusLabel],
            ["Default threshold", `${(configResolution.defaultConfluenceThreshold * 100).toFixed(0)}%`],
            ["Active threshold", activeCalibration ? `${(activeCalibration.activeConfigAfter.minimumConfluenceThreshold * 100).toFixed(0)}%` : "n/a"],
            ["Saved threshold", `${(configResolution.savedConfluenceThreshold * 100).toFixed(0)}%`],
            ["Final backtest threshold", `${(configResolution.finalBacktestConfluenceThreshold * 100).toFixed(0)}%`]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-border bg-background/45 p-3 text-xs text-muted-foreground">
          <div>Active ID: {configResolution.activeCalibrationId ?? "none"}</div>
          <div>Source trace: {configResolution.sourceTrace.join(" + ")}</div>
          <div>Patch: {JSON.stringify(configResolution.appliedPatch ?? {})}</div>
          {configResolution.mergeError ? <div className="text-amber-100">Merge warning: {configResolution.mergeError}</div> : null}
        </div>
        <div className="mt-3 rounded-lg border border-border bg-background/45 p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Advanced detail: runtime snapshot diagnostics</div>
          <div>Snapshot ID: {runtimeSnapshot?.snapshotId ?? "not loaded"}</div>
          <div>Metrics source: {selectRuntimeMetricSourceLabel(runtimeSnapshot)}</div>
          <div>Source trace: {runtimeSnapshot?.diagnostics.sourceTrace.join(" + ") ?? "n/a"}</div>
          {runtimeWarnings.length ? (
            <div className="mt-2 text-amber-100">Warnings: {runtimeWarnings.join(" ")}</div>
          ) : (
            <div className="mt-2 text-emerald-100">No runtime snapshot mismatch warnings.</div>
          )}
        </div>
        <div className="mt-3">
          <MetricProvenanceDetails snapshot={runtimeSnapshot} source="active_baseline" />
        </div>
      </TechnicalDetails>

      <TechnicalDetails
        title="View validation guide"
        description="Open for the longer step-by-step validation routine and overfitting warnings."
      >
        <ValidationGuideCard compact />
      </TechnicalDetails>

      <CalibrationAssistantPanel result={result} config={result.config} />

      {summary.totalTrades > 0 ? (
        <Card className={topTradeQualityDiagnostic ? "border-violet-300/25 bg-violet-300/10" : ""}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Why trade quality failed?</CardTitle>
                <CardDescription>
                  Diagnose weak win rate, average R, drawdown, stop model, target model, session behavior, and false-positive clusters.
                </CardDescription>
              </div>
              <Badge variant={topTradeQualityDiagnostic?.severity === "blocking" ? "danger" : topTradeQualityDiagnostic ? "warning" : "success"}>
                {topTradeQualityDiagnostic?.severity ?? "stable"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {topTradeQualityDiagnostic ? (
              <>
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <p className="font-medium">{topTradeQualityDiagnostic.reasonCode.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-muted-foreground">{topTradeQualityDiagnostic.explanation}</p>
                  <p className="mt-2 text-violet-100">{topTradeQualityDiagnostic.suggestedFix}</p>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {safeTopN(topTradeQualityDiagnostic.candidateConfigHints, 3).map((hint) => (
                    <div key={hint.label} className="rounded-md border border-border bg-background/45 p-2">
                      <p className="font-medium">{hint.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{hint.reason}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-border bg-background/45 p-3 text-muted-foreground">
                No major trade-quality failure detected in the current backtest.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
                  <CardTitle>Configuration</CardTitle>
                </div>
                <CardDescription>Saved locally and used by Replay and Performance backtest views.</CardDescription>
              </div>
              <Badge variant="secondary">{draftConfig.stopModel}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="backtest-symbol">Symbol</Label>
                <Select
                  id="backtest-symbol"
                  value={draftConfig.symbol}
                  options={symbolOptions}
                  onChange={(event) => patchConfig({ symbol: event.target.value as FuturesSymbol })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backtest-timeframe">Timeframe</Label>
                <Select
                  id="backtest-timeframe"
                  value={draftConfig.timeframe}
                  options={timeframeOptions}
                  onChange={(event) => patchConfig({ timeframe: event.target.value as Timeframe })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backtest-session">Session filter</Label>
                <Select
                  id="backtest-session"
                  value={draftConfig.sessionFilter}
                  options={sessionOptions}
                  onChange={(event) => patchConfig({ sessionFilter: event.target.value as ResolvedBacktestConfig["sessionFilter"] })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backtest-regime">Market regime</Label>
                <Select
                  id="backtest-regime"
                  value={draftConfig.marketRegime}
                  options={regimeOptions}
                  onChange={(event) => patchConfig({ marketRegime: event.target.value as MarketRegime })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backtest-stop-model">Stop model</Label>
                <Select
                  id="backtest-stop-model"
                  value={draftConfig.stopModel}
                  options={stopModelOptions}
                  onChange={(event) => patchConfig({ stopModel: event.target.value as ResolvedBacktestConfig["stopModel"] })}
                />
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-background/45 p-3">
                <p className="text-xs uppercase text-muted-foreground">Direction filters</p>
                <div className="mt-3 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draftConfig.allowLong}
                      onChange={(event) => patchConfig({ allowLong: event.target.checked })}
                    />
                    Allow long
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draftConfig.allowShort}
                      onChange={(event) => patchConfig({ allowShort: event.target.checked })}
                    />
                    Allow short
                  </label>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {numberFields.map((field) => (
                <div key={field.key} className="space-y-2 rounded-lg border border-border bg-background/45 p-3">
                  <Label htmlFor={`backtest-${field.key}`} className="text-xs">
                    {field.label}
                  </Label>
                  <Input
                    id={`backtest-${field.key}`}
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={String(draftConfig[field.key])}
                    onChange={(event) => patchNumber(field.key, event.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">{field.detail}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Agent Weights</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used only inside CIO synthesis for this selected-source backtest. Total {agentWeightTotal.toFixed(2)}.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => patchConfig({ agentWeights: defaultBacktestAgentWeights })}
                >
                  Reset weights
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {Object.entries(draftConfig.agentWeights).map(([agentId, value]) => (
                  <div key={agentId} className="space-y-2">
                    <Label htmlFor={`agent-weight-${agentId}`} className="text-xs">
                      {agentWeightLabels[agentId as BacktestAgentWeightId]}
                    </Label>
                    <Input
                      id={`agent-weight-${agentId}`}
                      type="number"
                      min="0"
                      max="1.5"
                      step="0.01"
                      value={String(value)}
                      onChange={(event) => patchAgentWeight(agentId as BacktestAgentWeightId, event.target.value)}
                      className="font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={run}>
                <Activity className="h-4 w-4" aria-hidden="true" />
                Run Backtest
              </Button>
              <Button variant="secondary" onClick={saveOnly}>
                <Target className="h-4 w-4" aria-hidden="true" />
                Save Config
              </Button>
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset to Defaults
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ICT confluence scoring weights from Settings remain active and compatible with these backtest gates.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Run Summary</CardTitle>
                <CardDescription>{describeBacktestConfig(result.config)}</CardDescription>
              </div>
              <Badge variant="secondary">{result.config.symbol} {result.config.timeframe}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="Total trades" value={String(summary.totalTrades)} detail={`${summary.directionalTrades} directional`} />
              <MetricCard label="Win rate" value={formatPercent(summary.winRate)} detail={`${summary.wins} target hit(s)`} />
              <MetricCard label="Average R" value={formatSigned(summary.averageR, 2)} detail="Per resolved record" tone={summary.averageR >= 0 ? "positive" : "danger"} />
              <MetricCard label="Max drawdown" value={`${summary.maxDrawdown.toFixed(2)}R`} detail="Equity curve" />
              <MetricCard label="Best trade" value={`${formatSigned(summary.bestTrade?.rMultiple ?? 0, 2)}R`} detail={summary.bestTrade?.outcome.replace("_", " ") ?? "n/a"} tone="positive" />
              <MetricCard label="Worst trade" value={`${formatSigned(summary.worstTrade?.rMultiple ?? 0, 2)}R`} detail={summary.worstTrade?.outcome.replace("_", " ") ?? "n/a"} tone="danger" />
            </div>

            {summary.totalTrades === 0 ? (
              <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">Why no trades?</p>
                    <p className="mt-1">
                      {zeroTradeDiagnostics[0]?.explanation ??
                        "The current settings did not produce any valid simulated trade records."}
                    </p>
                  </div>
                  <Badge variant="warning">cannot evaluate</Badge>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {zeroTradeDiagnostics.slice(0, 4).map((item) => (
                    <div key={`${item.reasonCode}-${item.currentValue}`} className="rounded-md border border-amber-200/20 bg-amber-200/5 p-2">
                      <p className="font-medium">{item.reasonCode.replace(/_/g, " ")}</p>
                      <p className="mt-1 text-xs text-amber-100/80">{item.suggestedFix}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Active Candle Preview</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Shared Lightweight Charts engine using the same candle source as this backtest run.
                  </p>
                </div>
                <Badge variant={candleSource.provider === "mt5_read_only" ? "success" : candleSource.provider === "mock" ? "warning" : "secondary"}>
                  {candleSource.provider.replace(/_/g, " ")}
                </Badge>
              </div>
              <TradingChart {...backtestChartData} heightClassName="h-[260px]" />
            </div>

            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Equity Curve Summary</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {summary.equityCurve.length} points, final {formatSigned(lastEquity, 2)}R, max drawdown {summary.maxDrawdown.toFixed(2)}R.
                  </p>
                </div>
                <Badge variant={lastEquity >= 0 ? "success" : "danger"}>{formatSigned(lastEquity, 2)}R</Badge>
              </div>
              <div className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={summary.equityCurve}>
                    <XAxis dataKey="index" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#111827", border: "1px solid #334155", borderRadius: 8 }} />
                    <Line type="monotone" dataKey="equityR" stroke="#2dd4bf" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Skipped Signals</p>
                  <p className="mt-1 text-xs text-muted-foreground">Decision points filtered before outcome scoring.</p>
                </div>
                <Badge variant={summary.skippedSignals ? "warning" : "success"}>{summary.skippedSignals}</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {summary.skipReasons.length ? (
                  summary.skipReasons.map((item) => (
                    <div key={item.reason} className="flex items-start justify-between gap-3 rounded-md border border-border bg-card/45 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{item.reason}</span>
                      <span className="font-mono">{item.count}</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-border bg-card/45 px-3 py-2 text-sm text-muted-foreground">
                    No signals were skipped by the active config.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <TechnicalDetails
        title="View recent simulated records"
        description="Open for the latest simulated trade records generated by the saved run configuration."
      >
      <Card>
        <CardHeader>
          <CardTitle>Recent Simulated Records</CardTitle>
          <CardDescription>Latest trades from the active simulation candle source.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-3 pr-3">Decision</th>
                <th className="py-3 pr-3">Bias</th>
                <th className="py-3 pr-3">Confidence</th>
                <th className="py-3 pr-3">Outcome</th>
                <th className="py-3 pr-3">R</th>
                <th className="py-3 pr-3">Entry</th>
                <th className="py-3 pr-3">Invalidation</th>
                <th className="py-3 pr-3">Target</th>
              </tr>
            </thead>
            <tbody>
              {result.trades.slice(-10).reverse().map((trade) => (
                <tr key={trade.id} className="border-b border-border/70">
                  <td className="py-3 pr-3 font-mono">{trade.decisionIndex + 1}</td>
                  <td className="py-3 pr-3">
                    <Badge variant={biasVariant(trade.bias)}>{trade.bias}</Badge>
                  </td>
                  <td className="py-3 pr-3 font-mono">{formatPercent(trade.confidence)}</td>
                  <td className="py-3 pr-3">{trade.outcome.replace("_", " ")}</td>
                  <td className="py-3 pr-3 font-mono">{formatSigned(trade.rMultiple, 2)}R</td>
                  <td className="py-3 pr-3 font-mono">{trade.entryPrice.toFixed(2)}</td>
                  <td className="py-3 pr-3 font-mono">{trade.invalidation.toFixed(2)}</td>
                  <td className="py-3 pr-3 font-mono">{trade.target.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!result.trades.length ? (
            <div className="mt-3 rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              No simulated trades passed the current filters. Review skipped signal reasons above.
            </div>
          ) : null}
        </CardContent>
      </Card>
      </TechnicalDetails>

      <div className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
        <TimerReset className="mr-2 inline h-4 w-4 text-primary" aria-hidden="true" />
        Config changes are local-first and use only the selected simulation candle source; no live data, broker API,
        websocket, or order routing is present.
      </div>
    </div>
  );
}
