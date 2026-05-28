export type MarketContextProvider = "fmp";
export type MarketContextNewsCategory = "general" | "stock" | "forex" | "crypto";
export type EconomicEventImpact = "low" | "medium" | "high" | "unknown";
export type MacroRiskSeverity = "block" | "reduce_risk" | "monitor";
export type NewsSentimentBias = "bullish" | "bearish" | "neutral" | "mixed" | "unknown";

export interface MarketContextProvenance {
  decisionVersion: string;
  sentimentPolicyVersion: string;
  sentimentSnapshotId: string;
  sourceFingerprint: string;
  generatedAt: string;
  provider: MarketContextProvider;
}

export interface EconomicCalendarEvent {
  eventId: string;
  provider: MarketContextProvider;
  country: string;
  currency: string;
  eventName: string;
  category: string;
  impact: EconomicEventImpact;
  scheduledAt: string;
  actual: number | string | null;
  forecast: number | string | null;
  previous: number | string | null;
  sourceUrl?: string;
  sourceFingerprint: string;
  generatedAt: string;
}

export interface MarketNewsItem {
  newsId: string;
  provider: MarketContextProvider;
  category: MarketContextNewsCategory;
  symbols: string[];
  headline: string;
  summary: string;
  publishedAt: string;
  url?: string;
  source: string;
  sourceFingerprint: string;
  generatedAt: string;
}

export interface MacroRiskFlag {
  flagId: string;
  severity: MacroRiskSeverity;
  reason: string;
  eventId: string;
  appliesToSymbols: string[];
  windowStart?: string;
  windowEnd?: string;
  generatedAt: string;
}

export interface NewsSentimentSummary {
  bias: NewsSentimentBias;
  confidence: number;
  reason: string;
  generatedAt: string;
}

export interface BoundedMarketContextEvidence {
  economicEvents: Array<Pick<EconomicCalendarEvent, "eventId" | "currency" | "eventName" | "impact" | "scheduledAt">>;
  newsItems: Array<Pick<MarketNewsItem, "newsId" | "category" | "symbols" | "headline" | "publishedAt" | "source">>;
  macroRiskFlags: MacroRiskFlag[];
}

export interface MarketContextSnapshot extends MarketContextProvenance {
  symbol: string;
  economicEvents: EconomicCalendarEvent[];
  newsItems: MarketNewsItem[];
  macroRiskFlags: MacroRiskFlag[];
  newsSentiment: NewsSentimentSummary;
  boundedEvidence: BoundedMarketContextEvidence;
  providerPayloadIncluded: false;
}

export interface OpenClawMarketContextAdvisoryPacket {
  packetId: string;
  source: "gotrader_market_context_service";
  mode: "advisory_only";
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
  generatedAt: string;
  symbol: string;
  sentimentSnapshotId: string;
  topMacroRiskFlags: MacroRiskFlag[];
  boundedNewsSummaries: BoundedMarketContextEvidence["newsItems"];
  newsSentiment: NewsSentimentSummary;
  sourceFingerprint: string;
  riskSummary: {
    blocksExecutionWindow: boolean;
    reduceRiskWindow: boolean;
    monitorOnly: boolean;
    reason: string;
  };
  safetyLocks: {
    apiKeysIncluded: false;
    brokerCredentialsIncluded: false;
    rawProviderPayloadIncluded: false;
    executionPermissionGranted: false;
    riskManagerBypassIncluded: false;
  };
}
