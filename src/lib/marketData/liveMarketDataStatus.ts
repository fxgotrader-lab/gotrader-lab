import type {
  LiveMarketDataMode,
  LiveMarketDataStatus,
  ReadOnlyMarketDataAdapterStatus
} from "@/lib/marketData/liveMarketDataTypes";

export const LIVE_MARKET_DATA_STATUS_VERSION = "live_market_data_status_v1" as const;

export const createDisconnectedLiveMarketDataStatus = ({
  dataMode,
  lastCandleTimestamp,
  sourceLabel
}: {
  dataMode: LiveMarketDataMode;
  lastCandleTimestamp?: string;
  sourceLabel: string;
}): LiveMarketDataStatus => ({
  provider: "none",
  connectionStatus: "disconnected",
  dataMode,
  liveFeedAvailable: false,
  liveFeedSourceLabel: "Live feed not connected",
  lastCandleTimestamp,
  symbolsAvailable: [],
  warnings: [
    `Live feed not connected. Charts are using ${sourceLabel}.`,
    "TradingView MCP is analysis-only unless a read-only live feed adapter is explicitly connected.",
    "MT5 broker adapter remains locked; read-only market data is not connected."
  ],
  executionAuthority: "none",
  brokerAuthority: "none"
});

export const isLiveFeedConnected = (status: LiveMarketDataStatus) =>
  status.liveFeedAvailable && status.connectionStatus === "connected" && status.dataMode === "live_feed";

export const liveStatusLabel = (status: LiveMarketDataStatus) =>
  isLiveFeedConnected(status) ? status.liveFeedSourceLabel : "Live feed not connected";

export const createReadOnlyAdapterStatus = ({
  provider,
  warning
}: {
  provider: ReadOnlyMarketDataAdapterStatus["provider"];
  warning: string;
}): ReadOnlyMarketDataAdapterStatus => ({
  provider,
  label: provider === "tradingview_mcp" ? "TradingView MCP analysis adapter" : provider === "mt5" ? "MT5 read-only market-data adapter" : `${provider} read-only adapter`,
  connectionStatus: "disconnected",
  readOnly: true,
  orderMethodsEnabled: false,
  executionAuthority: "none",
  brokerAuthority: "none",
  warnings: [warning]
});
