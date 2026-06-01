import type { AgentBridgeCandle } from "@/lib/agentBridge";
import { createCanonicalCandleSource } from "@/lib/candleSources";
import type {
  Mt5ReadOnlyAdapter,
  Mt5ReadOnlyCandlesResult,
  Mt5ReadOnlyQuoteResult,
  Mt5ReadOnlyStatus,
  Mt5ReadOnlySymbolInfo
} from "@/lib/integrations/mt5/mt5ReadOnlyTypes";
import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

export const createPlannedMt5ReadOnlyStatus = (message = "MT5 read-only feed is planned but not connected."): Mt5ReadOnlyStatus => ({
  provider: "mt5_read_only",
  connectionStatus: "planned",
  message,
  warnings: [
    "No MT5 order, position, account, or execution methods are exposed in this phase.",
    "Add a local read-only MT5 bridge before using MT5 candles for charting or research."
  ],
  lastCheckedAt: new Date().toISOString(),
  ...authority
});

const toFuturesSymbolFallback = (symbol: string): FuturesSymbol => {
  const normalized = symbol.toUpperCase();
  if (normalized === "ES" || normalized === "NQ" || normalized === "MES" || normalized === "MNQ") {
    return normalized;
  }
  return "MNQ";
};

const toTimeframeFallback = (timeframe: string): Timeframe => {
  if (timeframe === "1m" || timeframe === "5m" || timeframe === "15m" || timeframe === "1h" || timeframe === "4h" || timeframe === "1d") {
    return timeframe;
  }
  return "5m";
};

export const normalizeMt5ReadOnlyCandles = (symbol: string, timeframe: string, candles: AgentBridgeCandle[]): Candle[] =>
  candles.map((candle, index) => ({
    id: `mt5_read_only_${symbol}_${timeframe}_${candle.datetime}_${index}`,
    symbol: toFuturesSymbolFallback(symbol),
    timeframe: toTimeframeFallback(timeframe),
    timestamp: candle.datetime,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume || undefined
  }));

export const createMt5ReadOnlyAdapter = (): Mt5ReadOnlyAdapter => ({
  ...authority,
  async getStatus() {
    return createPlannedMt5ReadOnlyStatus();
  },
  async getQuote(symbol: string): Promise<Mt5ReadOnlyQuoteResult> {
    return {
      quote: null,
      status: createPlannedMt5ReadOnlyStatus(`MT5 read-only quote for ${symbol} is not connected.`),
      ...authority
    };
  },
  async getCandles(symbol: string, timeframe: string, limit: number): Promise<Mt5ReadOnlyCandlesResult> {
    const status = createPlannedMt5ReadOnlyStatus(
      `MT5 read-only candles for ${symbol} ${timeframe} are planned. Requested ${Math.max(1, limit)} candles; no local read-only endpoint is configured.`
    );
    const canonicalSource = createCanonicalCandleSource({
      candles: [],
      provider: "mt5_read_only",
      sourceId: `mt5_read_only:${symbol}:${timeframe}:planned`,
      sourceLabel: status.message,
      storageBackend: "memory",
      symbol,
      timeframe,
      warnings: status.warnings
    });
    return {
      candles: [],
      canonicalSource,
      status,
      ...authority
    };
  },
  async getSymbolInfo(symbol: string): Promise<Mt5ReadOnlySymbolInfo> {
    return {
      symbol,
      normalizedSymbol: symbol.trim().toUpperCase(),
      tradeMode: "read_only",
      missingEvidence: ["No local read-only MT5 symbol-info endpoint is configured."],
      ...authority
    };
  }
});
