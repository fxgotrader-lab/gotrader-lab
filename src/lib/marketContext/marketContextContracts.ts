import type {
  BoundedMarketContextEvidence,
  EconomicCalendarEvent,
  MacroRiskFlag,
  MarketContextSnapshot,
  MarketNewsItem,
  NewsSentimentSummary,
  OpenClawMarketContextAdvisoryPacket
} from "@/lib/marketContext/marketContextTypes";

export const MARKET_CONTEXT_CONTRACT_VERSION = "gotrader_market_context_v1" as const;
export const MARKET_CONTEXT_SENTIMENT_POLICY_VERSION = "market_context_context_only_v1" as const;
export const MARKET_CONTEXT_MAX_NEWS_ITEMS = 5;
export const MARKET_CONTEXT_MAX_ECONOMIC_EVENTS = 10;
export const OPENCLAW_MAX_MACRO_FLAGS = 3;

export const defaultMacroRiskWindows = {
  highImpact: {
    minutesBefore: 60,
    minutesAfter: 30,
    severity: "block" as const
  },
  mediumImpact: {
    minutesBefore: 30,
    minutesAfter: 15,
    severity: "reduce_risk" as const
  },
  lowImpact: {
    minutesBefore: 0,
    minutesAfter: 0,
    severity: "monitor" as const
  },
  unknownImpact: {
    minutesBefore: 0,
    minutesAfter: 0,
    severity: "monitor" as const
  }
};

export const createBoundedMarketContextEvidence = (
  economicEvents: EconomicCalendarEvent[],
  newsItems: MarketNewsItem[],
  macroRiskFlags: MacroRiskFlag[]
): BoundedMarketContextEvidence => ({
  economicEvents: economicEvents.slice(0, MARKET_CONTEXT_MAX_ECONOMIC_EVENTS).map((event) => ({
    eventId: event.eventId,
    currency: event.currency,
    eventName: event.eventName,
    impact: event.impact,
    scheduledAt: event.scheduledAt
  })),
  newsItems: newsItems.slice(0, MARKET_CONTEXT_MAX_NEWS_ITEMS).map((item) => ({
    newsId: item.newsId,
    category: item.category,
    symbols: item.symbols,
    headline: item.headline,
    publishedAt: item.publishedAt,
    source: item.source
  })),
  macroRiskFlags: macroRiskFlags.slice(0, OPENCLAW_MAX_MACRO_FLAGS)
});

export const createContextOnlySentimentSummary = ({
  generatedAt,
  reason = "Market news context is advisory only. It cannot create trade direction or execution permission."
}: {
  generatedAt: string;
  reason?: string;
}): NewsSentimentSummary => ({
  bias: "unknown",
  confidence: 0,
  reason,
  generatedAt
});

export const createOpenClawMarketContextPacket = ({
  packetId,
  snapshot
}: {
  packetId: string;
  snapshot: MarketContextSnapshot;
}): OpenClawMarketContextAdvisoryPacket => {
  const blocksExecutionWindow = snapshot.macroRiskFlags.some((flag) => flag.severity === "block");
  const reduceRiskWindow = snapshot.macroRiskFlags.some((flag) => flag.severity === "reduce_risk");
  return {
    packetId,
    source: "gotrader_market_context_service",
    mode: "advisory_only",
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    generatedAt: new Date().toISOString(),
    symbol: snapshot.symbol,
    sentimentSnapshotId: snapshot.sentimentSnapshotId,
    topMacroRiskFlags: snapshot.macroRiskFlags.slice(0, OPENCLAW_MAX_MACRO_FLAGS),
    boundedNewsSummaries: snapshot.boundedEvidence.newsItems,
    newsSentiment: snapshot.newsSentiment,
    sourceFingerprint: snapshot.sourceFingerprint,
    riskSummary: {
      blocksExecutionWindow,
      reduceRiskWindow,
      monitorOnly: !blocksExecutionWindow && !reduceRiskWindow,
      reason: blocksExecutionWindow
        ? "High-impact macro event is inside the blocking window."
        : reduceRiskWindow
          ? "Medium-impact macro event is inside the risk-reduction window."
          : "No blocking macro event is active."
    },
    safetyLocks: {
      apiKeysIncluded: false,
      brokerCredentialsIncluded: false,
      rawProviderPayloadIncluded: false,
      executionPermissionGranted: false,
      riskManagerBypassIncluded: false
    }
  };
};
