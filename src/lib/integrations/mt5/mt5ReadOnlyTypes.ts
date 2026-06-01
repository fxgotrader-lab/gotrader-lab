import type { AgentBridgeCandle, AgentBridgeQuote } from "@/lib/agentBridge";
import type { CanonicalCandleSource } from "@/lib/candleSources";

export type Mt5ReadOnlyConnectionStatus = "disconnected" | "planned" | "connected" | "error";

export interface Mt5ReadOnlyAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface Mt5ReadOnlyStatus extends Mt5ReadOnlyAuthority {
  provider: "mt5_read_only";
  connectionStatus: Mt5ReadOnlyConnectionStatus;
  endpoint?: string;
  message: string;
  warnings: string[];
  lastCheckedAt?: string;
}

export interface Mt5ReadOnlySymbolInfo extends Mt5ReadOnlyAuthority {
  symbol: string;
  normalizedSymbol: string;
  digits?: number;
  point?: number;
  tradeMode?: "read_only" | "unknown";
  missingEvidence: string[];
}

export interface Mt5ReadOnlyQuoteResult extends Mt5ReadOnlyAuthority {
  quote: AgentBridgeQuote | null;
  status: Mt5ReadOnlyStatus;
}

export interface Mt5ReadOnlyCandlesResult extends Mt5ReadOnlyAuthority {
  candles: AgentBridgeCandle[];
  canonicalSource?: CanonicalCandleSource;
  status: Mt5ReadOnlyStatus;
}

export interface Mt5ReadOnlyAdapter {
  getStatus: () => Promise<Mt5ReadOnlyStatus>;
  getQuote: (symbol: string) => Promise<Mt5ReadOnlyQuoteResult>;
  getCandles: (symbol: string, timeframe: string, limit: number) => Promise<Mt5ReadOnlyCandlesResult>;
  getSymbolInfo: (symbol: string) => Promise<Mt5ReadOnlySymbolInfo>;
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}
