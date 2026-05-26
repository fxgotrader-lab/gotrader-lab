import { loadActiveCandleSource, type CandleDataSource } from "@/lib/marketData/historicalCandleImport";
import type { Candle, CandleSession, Timeframe } from "@/lib/types";

export type ResearchWindowMode = "latest" | "date_range";
export type ResearchTimeframe = Extract<Timeframe, "1m" | "5m" | "15m">;
export type ResearchSessionFilter = "all" | CandleSession;
export type ResearchPerformanceMode = "safe" | "advanced";

export interface CandleWindowSettings {
  windowMode: ResearchWindowMode;
  windowSize: number;
  targetTimeframe: ResearchTimeframe;
  sessionFilter: ResearchSessionFilter;
  startDate?: string;
  endDate?: string;
  advancedMode: boolean;
}

export interface PreparedCandleSource extends CandleDataSource {
  rawCandleCount: number;
  researchWindowCandles: number;
  processedCandleCount: number;
  estimatedProcessedCandles: number;
  appliedSettings: CandleWindowSettings;
  aggregationApplied: boolean;
  performanceMode: ResearchPerformanceMode;
  warnings: string[];
}

export const CANDLE_WINDOW_SETTINGS_UPDATED_EVENT = "gotrader-ai-lab-candle-window-settings-updated";
export const SAFE_CANDLE_WINDOW_LIMIT = 5000;
export const HARD_BROWSER_CANDLE_LIMIT = 10000;
export const DEFAULT_IMPORTED_WINDOW_SIZE = 2000;
export const DASHBOARD_IMPORTED_SAFE_WINDOW_SIZE = 500;
export const DASHBOARD_IMPORTED_STANDARD_WINDOW_SIZE = 2000;
export const DASHBOARD_IMPORTED_SAFE_PROCESSED_LIMIT = 500;
export const DASHBOARD_IMPORTED_RAW_WINDOW_LIMIT = 2000;
export const DASHBOARD_IMPORTED_CANDIDATE_LIMIT = 10;
export const safeWindowSizeOptions = [500, 1000, 2000, 5000];

const STORAGE_KEY = "gotrader-ai-lab-candle-window-settings";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const defaultCandleWindowSettings: CandleWindowSettings = {
  windowMode: "latest",
  windowSize: DEFAULT_IMPORTED_WINDOW_SIZE,
  targetTimeframe: "5m",
  sessionFilter: "all",
  advancedMode: false
};

export const dashboardImportedSafeCandleWindowSettings: CandleWindowSettings = {
  ...defaultCandleWindowSettings,
  windowSize: DASHBOARD_IMPORTED_SAFE_WINDOW_SIZE,
  targetTimeframe: "5m",
  advancedMode: false
};

export const importedDataPresetSettings = {
  safe: dashboardImportedSafeCandleWindowSettings,
  standard: {
    ...defaultCandleWindowSettings,
    windowSize: DASHBOARD_IMPORTED_STANDARD_WINDOW_SIZE,
    targetTimeframe: "5m",
    advancedMode: false
  },
  advanced: {
    ...defaultCandleWindowSettings,
    windowSize: DASHBOARD_IMPORTED_STANDARD_WINDOW_SIZE,
    targetTimeframe: "5m",
    advancedMode: true
  }
} satisfies Record<"safe" | "standard" | "advanced", CandleWindowSettings>;

const timeframeMinutes: Record<ResearchTimeframe, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15
};

const isResearchTimeframe = (value: unknown): value is ResearchTimeframe =>
  value === "1m" || value === "5m" || value === "15m";

const isSessionFilter = (value: unknown): value is ResearchSessionFilter =>
  value === "all" || value === "Asia" || value === "London" || value === "New York" || value === "Off hours";

const publishSettingsEvent = (settings: CandleWindowSettings) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CANDLE_WINDOW_SETTINGS_UPDATED_EVENT, { detail: settings }));
  }
};

export function sanitizeCandleWindowSettings(settings: Partial<CandleWindowSettings> = {}): CandleWindowSettings {
  const windowSize = Math.max(100, Math.min(50000, Math.round(Number(settings.windowSize) || DEFAULT_IMPORTED_WINDOW_SIZE)));
  return {
    windowMode: settings.windowMode === "date_range" ? "date_range" : "latest",
    windowSize,
    targetTimeframe: isResearchTimeframe(settings.targetTimeframe) ? settings.targetTimeframe : "5m",
    sessionFilter: isSessionFilter(settings.sessionFilter) ? settings.sessionFilter : "all",
    startDate: typeof settings.startDate === "string" && settings.startDate ? settings.startDate : undefined,
    endDate: typeof settings.endDate === "string" && settings.endDate ? settings.endDate : undefined,
    advancedMode: Boolean(settings.advancedMode)
  };
}

export function loadCandleWindowSettings(): CandleWindowSettings {
  if (!isBrowser()) {
    return defaultCandleWindowSettings;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultCandleWindowSettings;
  }
  try {
    return sanitizeCandleWindowSettings(JSON.parse(raw) as Partial<CandleWindowSettings>);
  } catch {
    return defaultCandleWindowSettings;
  }
}

export function saveCandleWindowSettings(settings: Partial<CandleWindowSettings>): CandleWindowSettings {
  const sanitized = sanitizeCandleWindowSettings(settings);
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    publishSettingsEvent(sanitized);
  }
  return sanitized;
}

export function resetCandleWindowSettings() {
  return saveCandleWindowSettings(defaultCandleWindowSettings);
}

const minutesFromTimestamp = (timestamp: string) => {
  const match = /T(\d{2}):(\d{2})/.exec(timestamp);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};

const isWithin = (minutes: number, start: number, end: number) =>
  start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;

const sessionFor = (timestamp: string): CandleSession => {
  const minutes = minutesFromTimestamp(timestamp);
  if (isWithin(minutes, 18 * 60, 3 * 60)) return "Asia";
  if (isWithin(minutes, 3 * 60, 8 * 60 + 30)) return "London";
  if (isWithin(minutes, 8 * 60 + 30, 17 * 60)) return "New York";
  return "Off hours";
};

const dateFilteredCandles = (candles: Candle[], settings: CandleWindowSettings) => {
  if (settings.windowMode !== "date_range") {
    return candles;
  }
  const start = settings.startDate ? Date.parse(settings.startDate) : Number.NEGATIVE_INFINITY;
  const end = settings.endDate ? Date.parse(settings.endDate) + 86400000 - 1 : Number.POSITIVE_INFINITY;
  return candles.filter((candle) => {
    const timestamp = Date.parse(candle.timestamp);
    return timestamp >= start && timestamp <= end;
  });
};

const sessionFilteredCandles = (candles: Candle[], settings: CandleWindowSettings) =>
  settings.sessionFilter === "all"
    ? candles
    : candles.filter((candle) => sessionFor(candle.timestamp) === settings.sessionFilter);

export function aggregateCandles(candles: Candle[], targetTimeframe: ResearchTimeframe): Candle[] {
  const targetMinutes = timeframeMinutes[targetTimeframe];
  if (targetMinutes <= 1 || !candles.length) {
    return candles.map((candle) => ({ ...candle, timeframe: targetTimeframe }));
  }

  const sorted = [...candles].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const groups = new Map<number, Candle[]>();
  for (const candle of sorted) {
    const timestamp = Date.parse(candle.timestamp);
    const bucket = Math.floor(timestamp / (targetMinutes * 60000)) * targetMinutes * 60000;
    const group = groups.get(bucket) ?? [];
    group.push(candle);
    groups.set(bucket, group);
  }

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, group]) => {
      const first = group[0];
      const last = group[group.length - 1];
      const volume = group.reduce((sum, candle) => sum + (candle.volume ?? 0), 0);
      return {
        id: `${first.symbol}_${targetTimeframe}_${new Date(bucket).toISOString()}`,
        symbol: first.symbol,
        timeframe: targetTimeframe,
        timestamp: new Date(bucket).toISOString(),
        open: first.open,
        high: Math.max(...group.map((candle) => candle.high)),
        low: Math.min(...group.map((candle) => candle.low)),
        close: last.close,
        volume: volume || undefined
      };
    });
}

export function prepareCandlesForResearch(
  candles: Candle[],
  settingsInput: Partial<CandleWindowSettings> = {},
  imported = false
) {
  const settings = sanitizeCandleWindowSettings(settingsInput);
  const warnings: string[] = [];
  const rawCandleCount = candles.length;
  const requestedWindowSize = settings.windowSize;
  const effectiveWindowSize =
    imported && !settings.advancedMode
      ? Math.min(requestedWindowSize, SAFE_CANDLE_WINDOW_LIMIT)
      : Math.min(requestedWindowSize, HARD_BROWSER_CANDLE_LIMIT);

  if (imported && requestedWindowSize > SAFE_CANDLE_WINDOW_LIMIT && !settings.advancedMode) {
    warnings.push(
      `Requested ${requestedWindowSize.toLocaleString()} candles; safe mode capped the research window at ${SAFE_CANDLE_WINDOW_LIMIT.toLocaleString()}. Enable Advanced mode only when you are intentionally stress-testing.`
    );
  }
  if (imported && settings.advancedMode && requestedWindowSize > HARD_BROWSER_CANDLE_LIMIT) {
    warnings.push(
      `Requested ${requestedWindowSize.toLocaleString()} candles; browser processing is hard-capped at ${HARD_BROWSER_CANDLE_LIMIT.toLocaleString()} to prevent page crashes.`
    );
  }

  const filtered = sessionFilteredCandles(dateFilteredCandles(candles, settings), settings);
  const windowed =
    settings.windowMode === "latest" || filtered.length > effectiveWindowSize
      ? filtered.slice(Math.max(0, filtered.length - effectiveWindowSize))
      : filtered;
  const aggregated = aggregateCandles(windowed, settings.targetTimeframe);

  return {
    candles: aggregated,
    rawCandleCount,
    researchWindowCandles: windowed.length,
    processedCandleCount: aggregated.length,
    estimatedProcessedCandles: aggregated.length,
    aggregationApplied: settings.targetTimeframe !== "1m",
    performanceMode: settings.advancedMode ? "advanced" as const : "safe" as const,
    appliedSettings: settings,
    warnings
  };
}

export function prepareCandleSourceForResearch(
  source: CandleDataSource,
  settingsInput: Partial<CandleWindowSettings> = loadCandleWindowSettings()
): PreparedCandleSource {
  if (source.mode !== "imported") {
    return {
      ...source,
      rawCandleCount: source.candles.length,
      researchWindowCandles: source.candles.length,
      processedCandleCount: source.candles.length,
      estimatedProcessedCandles: source.candles.length,
      appliedSettings: sanitizeCandleWindowSettings(settingsInput),
      aggregationApplied: false,
      performanceMode: "safe",
      warnings: []
    };
  }

  const prepared = prepareCandlesForResearch(source.candles, settingsInput, true);
  return {
    ...source,
    label: `${source.label} / latest ${prepared.researchWindowCandles.toLocaleString()} -> ${prepared.processedCandleCount.toLocaleString()} ${prepared.appliedSettings.targetTimeframe}`,
    candles: prepared.candles,
    rawCandleCount: prepared.rawCandleCount,
    researchWindowCandles: prepared.researchWindowCandles,
    processedCandleCount: prepared.processedCandleCount,
    estimatedProcessedCandles: prepared.estimatedProcessedCandles,
    appliedSettings: prepared.appliedSettings,
    aggregationApplied: prepared.aggregationApplied,
    performanceMode: prepared.performanceMode,
    warnings: prepared.warnings
  };
}

export async function loadPreparedCandleSource(settingsInput: Partial<CandleWindowSettings> = loadCandleWindowSettings()) {
  return prepareCandleSourceForResearch(await loadActiveCandleSource(), settingsInput);
}
