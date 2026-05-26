import type { MarketContext, MarketDataAdapter } from "@/lib/marketData/marketDataTypes";
import { createMockMarketContext } from "@/lib/marketData/mockMarketContext";
export { marketDataProviderRoadmap, plannedMarketDataAgents } from "@/lib/marketData/marketDataRoadmap";

export const mockMarketDataAdapter: MarketDataAdapter<MarketContext> = {
  adapterId: "mock-market-context-adapter",
  label: "Mock Market Context Adapter",
  mode: "mock",
  status: "mock_only",
  requiredSecrets: [],
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none",
  loadContext({ symbol, timeframe }) {
    return createMockMarketContext(symbol, timeframe);
  }
};
