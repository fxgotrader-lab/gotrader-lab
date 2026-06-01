export type LiveMarketDataProvider = "none" | "tradingview_mcp" | "mt5" | "tradovate" | "custom";
export type LiveMarketDataConnectionStatus = "disconnected" | "connecting" | "connected" | "degraded" | "error";
export type LiveMarketDataMode = "mock" | "imported_historical" | "replay" | "tradingview_mcp_chart" | "mt5_read_only" | "live_feed";

export interface LiveMarketDataStatus {
  provider: LiveMarketDataProvider;
  connectionStatus: LiveMarketDataConnectionStatus;
  dataMode: LiveMarketDataMode;
  liveFeedAvailable: boolean;
  liveFeedSourceLabel: string;
  lastQuoteTimestamp?: string;
  lastCandleTimestamp?: string;
  symbolsAvailable: string[];
  warnings: string[];
  executionAuthority: "none";
  brokerAuthority: "none";
}

export interface ReadOnlyMarketDataAdapterStatus {
  provider: Exclude<LiveMarketDataProvider, "none">;
  label: string;
  connectionStatus: LiveMarketDataConnectionStatus;
  readOnly: true;
  orderMethodsEnabled: false;
  executionAuthority: "none";
  brokerAuthority: "none";
  warnings: string[];
}
