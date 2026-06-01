import type { Candle } from "@/lib/types";

const compactNumber = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(5)) : undefined;

export const normalizeCandleSourceSymbol = (symbol: string) =>
  symbol
    .trim()
    .toUpperCase()
    .replace(/^CME_MINI_DL:/, "")
    .replace(/^CME_MINI:/, "")
    .replace(/^CBOT_MINI:/, "")
    .replace(/^FOREXCOM:/, "")
    .replace(/^OANDA:/, "")
    .replace(/^FX:/, "")
    .replace(/[^A-Z0-9/!]/g, "");

export const createCandleSourceFingerprint = ({
  candles,
  provider,
  sourceId,
  symbol,
  timeframe
}: {
  candles: Candle[];
  provider: string;
  sourceId: string;
  symbol: string;
  timeframe: string;
}) => {
  const first = candles[0];
  const last = candles[candles.length - 1];
  return [
    provider,
    sourceId,
    normalizeCandleSourceSymbol(symbol),
    timeframe,
    candles.length,
    first?.timestamp ?? "no-first",
    compactNumber(first?.close) ?? "no-first-close",
    last?.timestamp ?? "no-last",
    compactNumber(last?.close) ?? "no-last-close"
  ].join("|");
};

export const candleSourceFirstLast = (candles: Candle[]) => {
  const first = candles[0];
  const last = candles[candles.length - 1];
  return {
    firstTimestamp: first?.timestamp,
    lastTimestamp: last?.timestamp,
    firstClose: compactNumber(first?.close),
    lastClose: compactNumber(last?.close)
  };
};
