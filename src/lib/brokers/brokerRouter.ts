import type { BrokerAccountMode, BrokerName, BrokerRoute, InstrumentType } from "@/lib/brokers/brokerTypes";

export const BROKER_ROUTER_POLICY_VERSION = "multi_broker_router_research_locked_v1" as const;

const futuresRoots = new Set(["MNQ", "MES", "NQ", "ES", "YM", "MYM", "M2K"]);
const mt5ForexCfdSymbols = new Set([
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "XAUUSD",
  "US30",
  "NAS100",
  "NASDAQ",
  "SPX500",
  "SPX"
]);
const cryptoSymbols = new Set(["BTCUSD", "ETHUSD", "BTC", "ETH"]);

const createId = (prefix: string, symbol: string, mode: BrokerAccountMode) =>
  `${prefix}_${symbol.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}_${mode}`;

export const normalizeBrokerSymbol = (symbol: string): string =>
  symbol.trim().toUpperCase().replace(/\s+/g, "").replace("/", "").replace("!", "");

const futureRootFromSymbol = (normalizedSymbol: string): string => {
  const root = normalizedSymbol.match(/^[A-Z]+/)?.[0] ?? normalizedSymbol;
  if (root.startsWith("MNQ")) return "MNQ";
  if (root.startsWith("MES")) return "MES";
  if (root.startsWith("MYM")) return "MYM";
  if (root.startsWith("M2K")) return "M2K";
  if (root.startsWith("NQ")) return "NQ";
  if (root.startsWith("ES")) return "ES";
  if (root.startsWith("YM")) return "YM";
  return root;
};

export const inferInstrumentType = (symbol: string): InstrumentType => {
  const normalized = normalizeBrokerSymbol(symbol);
  const futureRoot = futureRootFromSymbol(normalized);
  if (futuresRoots.has(futureRoot)) return "futures";
  if (["EURUSD", "GBPUSD", "USDJPY"].includes(normalized)) return "forex";
  if (["XAUUSD", "US30", "NAS100", "NASDAQ", "SPX500", "SPX"].includes(normalized)) return "cfd";
  if (cryptoSymbols.has(normalized)) return "crypto";
  return "unknown";
};

export const routeBrokerForSymbol = ({
  accountMode = "research",
  symbol
}: {
  accountMode?: BrokerAccountMode;
  symbol: string;
}): BrokerRoute => {
  const normalizedSymbol = normalizeBrokerSymbol(symbol);
  const futureRoot = futureRootFromSymbol(normalizedSymbol);
  const assetClass = inferInstrumentType(symbol);
  let broker: BrokerName = "none";
  let reason = "Unsupported or unknown symbol. No broker route is available.";
  const routingWarnings: string[] = [];

  if (assetClass === "futures" && futuresRoots.has(futureRoot)) {
    broker = "tradovate";
    reason = "Futures symbols route to the planned Tradovate execution adapter.";
  } else if (mt5ForexCfdSymbols.has(normalizedSymbol)) {
    broker = "mt5";
    reason = "Forex and CFD symbols route to the planned MT5 execution adapter.";
  } else if (assetClass === "crypto") {
    broker = "none";
    reason = "Crypto market data is supported for research, but no broker execution adapter is approved.";
    routingWarnings.push("Crypto execution is unsupported in this architecture phase.");
  }

  if (accountMode === "research") {
    routingWarnings.push("Research mode blocks all execution intents.");
  }
  if (broker === "none") {
    routingWarnings.push("No broker adapter may execute this symbol.");
  }

  return {
    routeId: createId("broker_route", normalizedSymbol || "unknown", accountMode),
    symbol,
    normalizedSymbol,
    broker,
    assetClass,
    accountMode,
    reason,
    routingWarnings,
    executionAuthority:
      accountMode === "research"
        ? "none"
        : accountMode === "dry_run"
          ? "simulated_only"
          : accountMode === "paper"
            ? "paper_gate_required"
            : "live_gate_required",
    brokerAuthority: broker === "none" || accountMode === "research" ? "none" : "route_only"
  };
};

export const isBrokerRouteExecutable = (route: BrokerRoute): boolean =>
  route.accountMode !== "research" && route.broker !== "none" && route.executionAuthority !== "none";
