import type { Timeframe } from "@/lib/types";

export type Mt5ReadOnlyAssetClass = "index" | "forex" | "metal" | "crypto" | "stock_cfd" | "unknown";

export interface Mt5ReadOnlySymbolMapping {
  requestedSymbol: string;
  brokerSymbol: string;
  displayLabel: string;
  assetClass: Mt5ReadOnlyAssetClass;
  cfdProxy: boolean;
}

export interface Mt5HigherTimeframeSourceSummary {
  provider: "mt5_read_only";
  requestedSymbol: string;
  brokerSymbol?: string;
  timeframe: Timeframe;
  candleCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  lastClose?: number;
  fingerprint?: string;
  eligibilityState: string;
  storageBackend?: string;
  fetchedAt?: string;
  warning?: string;
}

export const mt5ReadOnlyPrimaryTimeframes = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
export const mt5ReadOnlyDefaultHigherTimeframes = ["15m", "1h"] as const;

export const mt5ReadOnlyTimeframeOptions = mt5ReadOnlyPrimaryTimeframes.map((value) => ({
  label: value,
  value
}));

export const mt5ReadOnlyHigherTimeframeOptions = mt5ReadOnlyPrimaryTimeframes
  .filter((value) => value !== "1m")
  .map((value) => ({ label: value, value }));

export const mt5ReadOnlyDefaultSymbolMappings: Mt5ReadOnlySymbolMapping[] = [
  {
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    displayLabel: "MNQ via USTECH",
    assetClass: "index",
    cfdProxy: true
  },
  {
    requestedSymbol: "NQ",
    brokerSymbol: "USTECH",
    displayLabel: "NQ via USTECH",
    assetClass: "index",
    cfdProxy: true
  },
  {
    requestedSymbol: "ES",
    brokerSymbol: "US500",
    displayLabel: "ES via US500",
    assetClass: "index",
    cfdProxy: true
  },
  {
    requestedSymbol: "YM",
    brokerSymbol: "US30",
    displayLabel: "YM via US30",
    assetClass: "index",
    cfdProxy: true
  },
  {
    requestedSymbol: "XAUUSD",
    brokerSymbol: "XAUUSD",
    displayLabel: "XAUUSD spot/CFD",
    assetClass: "metal",
    cfdProxy: true
  },
  {
    requestedSymbol: "EURUSD",
    brokerSymbol: "EURUSD.pro",
    displayLabel: "EURUSD via EURUSD.pro",
    assetClass: "forex",
    cfdProxy: false
  },
  {
    requestedSymbol: "BTCUSD",
    brokerSymbol: "BTCUSD",
    displayLabel: "BTCUSD via MT5",
    assetClass: "crypto",
    cfdProxy: true
  }
];

export const mt5ReadOnlySymbolOptions = mt5ReadOnlyDefaultSymbolMappings.map((mapping) => ({
  label: mapping.displayLabel,
  value: mapping.requestedSymbol
}));

const canonical = (value?: string) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

export const sanitizeMt5ReadOnlyTimeframe = (value?: string): Timeframe =>
  mt5ReadOnlyPrimaryTimeframes.includes(value as Timeframe) ? (value as Timeframe) : "5m";

export const sanitizeMt5HigherTimeframes = (values?: unknown): Timeframe[] => {
  const list = Array.isArray(values) ? values : mt5ReadOnlyDefaultHigherTimeframes;
  const sanitized = list
    .map((value) => sanitizeMt5ReadOnlyTimeframe(String(value)))
    .filter((value) => value !== "1m")
    .filter((value, index, all) => all.indexOf(value) === index);
  return sanitized.length ? sanitized : [...mt5ReadOnlyDefaultHigherTimeframes];
};

export const findDefaultMt5SymbolMapping = (requestedSymbol?: string) => {
  const normalized = canonical(requestedSymbol || "MNQ");
  return (
    mt5ReadOnlyDefaultSymbolMappings.find((mapping) => canonical(mapping.requestedSymbol) === normalized) ??
    mt5ReadOnlyDefaultSymbolMappings[0]
  );
};

export const resolveDefaultMt5BrokerSymbol = (requestedSymbol?: string, availableSymbols: string[] = []) => {
  const mapping = findDefaultMt5SymbolMapping(requestedSymbol);
  const available = new Set(availableSymbols.map(canonical));
  if (!available.size || available.has(canonical(mapping.brokerSymbol))) {
    return mapping.brokerSymbol;
  }
  if (canonical(requestedSymbol) === "EURUSD") {
    const eurusd = availableSymbols.find((symbol) => canonical(symbol) === "EURUSD");
    if (eurusd) {
      return eurusd;
    }
  }
  return mapping.brokerSymbol;
};

export const categorizeMt5BrokerSymbol = (brokerSymbol?: string): Mt5ReadOnlyAssetClass => {
  const normalized = canonical(brokerSymbol);
  if (/^(USTECH|NAS100|US100|USTEC|US500|SPX500|US30|DJ30)$/.test(normalized)) {
    return "index";
  }
  if (/^(XAUUSD|GOLD|XAGUSD|SILVER)$/.test(normalized)) {
    return "metal";
  }
  if (/^(BTCUSD|ETHUSD|CRYPTO)/.test(normalized)) {
    return "crypto";
  }
  if (/^[A-Z]{6}(PRO)?$/.test(normalized)) {
    return "forex";
  }
  return "unknown";
};

export const displayLabelForMt5Mapping = ({
  brokerSymbol,
  displayLabel,
  requestedSymbol
}: {
  brokerSymbol?: string;
  displayLabel?: string;
  requestedSymbol?: string;
}) =>
  displayLabel?.trim() ||
  findDefaultMt5SymbolMapping(requestedSymbol).displayLabel ||
  `${brokerSymbol || "MT5 broker symbol"} for ${requestedSymbol || "GoTrader symbol"}`;

export const mt5CfdProxyWarning = (brokerSymbol?: string, requestedSymbol?: string) =>
  `${brokerSymbol || "Selected MT5 broker symbol"} is MT5 read-only ${
    categorizeMt5BrokerSymbol(brokerSymbol) === "forex" ? "broker market data" : "CFD/proxy data"
  } for ${requestedSymbol || "the requested GoTrader symbol"} research. It is not CME futures broker truth and has no execution authority.`;
