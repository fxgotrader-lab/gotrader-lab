import type { AgentBridgeCandle, AgentBridgeQuote } from "@/lib/agentBridge";
import { createReadOnlyAdapterStatus } from "@/lib/marketData";
import type { ReadOnlyMarketDataAdapterStatus } from "@/lib/marketData";

export interface Mt5ReadOnlyMarketDataAdapter {
  status: ReadOnlyMarketDataAdapterStatus;
  getQuote: (symbol: string) => Promise<{ quote: AgentBridgeQuote | null; status: ReadOnlyMarketDataAdapterStatus }>;
  getCandles: (
    symbol: string,
    timeframe: string,
    limit: number
  ) => Promise<{ candles: AgentBridgeCandle[]; status: ReadOnlyMarketDataAdapterStatus }>;
  subscribeCandles: () => never;
  executionAuthority: "none";
  brokerAuthority: "none";
}

export const createMt5MarketDataAdapter = (): Mt5ReadOnlyMarketDataAdapter => {
  const status = createReadOnlyAdapterStatus({
    provider: "mt5",
    warning: "MT5 read-only market data is not connected. No MCP/local bridge calls are made in Phase 1."
  });
  return {
    status,
    async getQuote() {
      return { quote: null, status };
    },
    async getCandles() {
      return { candles: [], status };
    },
    subscribeCandles() {
      throw new Error("MT5 candle subscription is a placeholder only. Live data is not connected.");
    },
    executionAuthority: "none",
    brokerAuthority: "none"
  };
};
