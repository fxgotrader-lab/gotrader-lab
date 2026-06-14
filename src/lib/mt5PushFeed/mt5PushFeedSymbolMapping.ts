import type { FuturesSymbol, Timeframe } from "@/lib/types";
import type { Mt5PushFeedSymbolMapping } from "./mt5PushFeedTypes";

const canonical = (value?: string) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, "");

export const defaultMt5PushFeedSymbolMappings: Mt5PushFeedSymbolMapping[] = [
  { requestedSymbol: "MNQ", brokerSymbol: "USTECH", aliases: ["NQ", "NAS100", "US100", "USTEC", "USTECH"], enabled: true },
  { requestedSymbol: "NQ", brokerSymbol: "USTECH", aliases: ["MNQ", "NAS100", "US100", "USTEC", "USTECH"], enabled: true },
  { requestedSymbol: "ES", brokerSymbol: "US500", aliases: ["SPX500", "SP500", "S&P500"], enabled: true },
  { requestedSymbol: "YM", brokerSymbol: "US30", aliases: ["DJ30", "DOW", "DOW30"], enabled: true },
  { requestedSymbol: "XAUUSD", brokerSymbol: "XAUUSD", aliases: ["GOLD", "XAU/USD"], enabled: true },
  { requestedSymbol: "EURUSD", brokerSymbol: "EURUSD.pro", aliases: ["EUR/USD", "EURUSDPRO"], enabled: true },
  { requestedSymbol: "BTCUSD", brokerSymbol: "BTCUSD", aliases: ["BTC/USD"], enabled: true }
];

const futuresSymbols = new Set<FuturesSymbol>(["ES", "NQ", "MES", "MNQ", "YM", "XAUUSD", "EURUSD", "BTCUSD"]);
const timeframeMap: Record<string, Timeframe> = {
  "1": "1m",
  M1: "1m",
  "1M": "1m",
  "1MIN": "1m",
  "1MINUTE": "1m",
  "1m": "1m",
  "5": "5m",
  M5: "5m",
  "5M": "5m",
  "5MIN": "5m",
  "5MINUTE": "5m",
  "5m": "5m",
  "15": "15m",
  M15: "15m",
  "15M": "15m",
  "15MIN": "15m",
  "15MINUTE": "15m",
  "15m": "15m",
  "30": "30m",
  M30: "30m",
  "30M": "30m",
  "30MIN": "30m",
  "30m": "30m",
  "60": "1h",
  H1: "1h",
  "1H": "1h",
  "60M": "1h",
  "1h": "1h",
  "240": "4h",
  H4: "4h",
  "4H": "4h",
  "240M": "4h",
  "4h": "4h",
  D1: "1d",
  "1D": "1d",
  "1d": "1d"
};

export function normalizeMt5PushFeedSymbol(value?: string): FuturesSymbol {
  const normalized = canonical(value);
  if (futuresSymbols.has(normalized as FuturesSymbol)) {
    return normalized as FuturesSymbol;
  }
  const mapping = defaultMt5PushFeedSymbolMappings.find((item) => {
    const candidates = [item.requestedSymbol, item.brokerSymbol, ...item.aliases].map(canonical);
    return candidates.includes(normalized);
  });
  return (mapping?.requestedSymbol as FuturesSymbol | undefined) ?? "MNQ";
}

export function normalizeMt5PushFeedTimeframe(value?: string): Timeframe {
  const raw = String(value ?? "5m").trim();
  return timeframeMap[raw] ?? timeframeMap[raw.toUpperCase()] ?? "5m";
}

export function resolveMt5PushFeedSymbolMapping({
  brokerSymbol,
  mappings = defaultMt5PushFeedSymbolMappings,
  requestedSymbol
}: {
  brokerSymbol?: string;
  mappings?: Mt5PushFeedSymbolMapping[];
  requestedSymbol?: string;
}) {
  const requestedCanonical = canonical(requestedSymbol);
  const brokerCanonical = canonical(brokerSymbol);
  const enabled = mappings.filter((item) => item.enabled);

  const byRequested = requestedCanonical
    ? enabled.find((item) => canonical(item.requestedSymbol) === requestedCanonical)
    : undefined;
  const byBroker = brokerCanonical
    ? enabled.find((item) => [item.brokerSymbol, ...item.aliases].map(canonical).includes(brokerCanonical))
    : undefined;
  const mapping = byRequested ?? byBroker;
  const normalizedSymbol = normalizeMt5PushFeedSymbol(requestedSymbol ?? mapping?.requestedSymbol ?? brokerSymbol);

  return {
    requestedSymbol: normalizedSymbol,
    normalizedSymbol,
    brokerSymbol: brokerSymbol ?? mapping?.brokerSymbol ?? String(normalizedSymbol),
    mappingMatched: Boolean(mapping),
    mapping
  };
}
