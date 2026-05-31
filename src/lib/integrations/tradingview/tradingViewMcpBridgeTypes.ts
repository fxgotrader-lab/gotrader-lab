import type {
  RawTradingViewMcpEvidence,
  TradingViewEvidence,
  TradingViewMcpConnectionStatus
} from "@/lib/integrations/tradingview/tradingViewMcpTypes";

export const DEFAULT_TRADINGVIEW_MCP_BRIDGE_URL = "http://127.0.0.1:7331" as const;
export const TRADINGVIEW_MCP_BRIDGE_SETTINGS_VERSION = "tradingview_mcp_readonly_bridge_v1" as const;

export interface TradingViewMcpBridgeSettings {
  bridgeUrl: string;
  enabled: boolean;
  updatedAt: string;
  settingsVersion: typeof TRADINGVIEW_MCP_BRIDGE_SETTINGS_VERSION;
}

export interface TradingViewMcpStatusCheck {
  checkedAt: string;
  bridgeUrl: string;
  connectionStatus: TradingViewMcpConnectionStatus;
  analysisAvailable: boolean;
  evidenceAvailable: boolean;
  wrapperRunning?: boolean;
  tradingViewDesktopCdpConnected?: boolean;
  chartSymbol?: string;
  chartResolution?: string;
  message: string;
  warnings: string[];
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface TradingViewMcpBridgeRequest {
  symbol: string;
  timeframe: string;
  requestedEvidence: Array<"chart_state" | "ohlcv_summary" | "indicator_values" | "levels" | "patterns" | "screenshot">;
  mode: "research";
  executionAuthority: "none";
  brokerAuthority: "none";
}

export interface TradingViewMcpBridgeEvidenceResponse {
  status?: string;
  message?: string;
  evidence?: RawTradingViewMcpEvidence;
  data?: RawTradingViewMcpEvidence;
  chart?: RawTradingViewMcpEvidence;
  warnings?: string[];
}

export interface TradingViewEvidenceServiceResult {
  status: TradingViewMcpStatusCheck;
  evidence?: TradingViewEvidence;
}
