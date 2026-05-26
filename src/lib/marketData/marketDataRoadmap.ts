import type { MarketDataProviderRoadmapEntry, PlannedMarketDataAgent } from "@/lib/marketData/marketDataTypes";

export const marketDataProviderRoadmap: MarketDataProviderRoadmapEntry[] = [
  {
    category: "candles",
    futureProviders: ["broker feed", "Polygon", "Twelve Data", "Alpaca", "Tradovate later", "CSV import"],
    firstSafeStep: "Add CSV import and offline replay before any authenticated feed.",
    status: "planned",
    notes: "Candles feed ICT context and backtests; no order routing is implied."
  },
  {
    category: "economic calendar",
    futureProviders: ["Trading Economics", "ForexFactory manual/CSV", "FRED macro series"],
    firstSafeStep: "Manual calendar CSV import with event tagging.",
    status: "planned",
    notes: "Calendar data informs risk windows and session filters."
  },
  {
    category: "VIX/DXY/yields",
    futureProviders: ["FRED", "Stooq", "Yahoo-style adapter later"],
    firstSafeStep: "Daily macro series cache with no intraday dependency.",
    status: "planned",
    notes: "Macro adapters help volatility and intermarket agents contextualize futures theses."
  },
  {
    category: "COT",
    futureProviders: ["CFTC weekly CSV"],
    firstSafeStep: "Weekly CSV import and delayed positioning bias labels.",
    status: "planned",
    notes: "COT is slow-moving positioning evidence, not an execution trigger."
  },
  {
    category: "gamma",
    futureProviders: ["manual import", "paid provider later"],
    firstSafeStep: "Manual gamma level upload with source/date metadata.",
    status: "planned",
    notes: "Gamma levels become optional risk/context evidence."
  },
  {
    category: "order flow",
    futureProviders: ["Bookmap export", "Sierra Chart export", "Quantower export later"],
    firstSafeStep: "Offline file import only; no live DOM or websocket feed.",
    status: "planned",
    notes: "Order flow is later/advanced and remains research-only."
  }
];

export const plannedMarketDataAgents: PlannedMarketDataAgent[] = [
  {
    agentId: "session-levels-agent",
    name: "Session Levels Agent",
    purpose: "Compare current price to prior day/week/month, overnight, and Globex levels.",
    inputData: ["prior high/low/close", "overnight high/low", "Globex range"],
    output: "Level proximity bias and invalidation context.",
    whyItMatters: "Futures often react around prior session liquidity and range extremes.",
    status: "planned",
    executionAuthority: "none"
  },
  {
    agentId: "auction-volume-profile-agent",
    name: "Auction/Volume Profile Agent",
    purpose: "Review VWAP, anchored VWAP, VPOC, VAH, VAL, and value migration.",
    inputData: ["VWAP", "anchored VWAP", "volume profile", "VPOC", "VAH", "VAL"],
    output: "Auction location and acceptance/rejection notes.",
    whyItMatters: "Auction context helps separate fair value rotation from displacement.",
    status: "planned",
    executionAuthority: "none"
  },
  {
    agentId: "macro-event-risk-agent",
    name: "Macro Event Risk Agent",
    purpose: "Tag event risk from FOMC, CPI, NFP, PPI, retail sales, DXY, VIX, and yields.",
    inputData: ["economic calendar", "Fed Funds path", "DXY", "VIX", "2Y yield", "10Y yield"],
    output: "Event-risk warning and volatility posture.",
    whyItMatters: "Macro events can invalidate otherwise clean ICT signals.",
    status: "planned",
    executionAuthority: "none"
  },
  {
    agentId: "intermarket-confirmation-agent",
    name: "Intermarket Confirmation Agent",
    purpose: "Check whether related markets confirm or fight the thesis.",
    inputData: ["ES/NQ ratio", "YM/ES divergence", "bond futures", "crude/gold", "DXY/NQ", "VIX/equity"],
    output: "Confirmation, divergence, or neutral intermarket context.",
    whyItMatters: "Intermarket disagreement can reduce thesis confidence.",
    status: "planned",
    executionAuthority: "none"
  },
  {
    agentId: "positioning-gamma-agent",
    name: "Positioning/Gamma Agent",
    purpose: "Summarize COT, put/call, gamma levels, dealer gamma flip, and net positioning.",
    inputData: ["COT", "put/call ratio", "gamma levels", "dealer gamma flip"],
    output: "Positioning bias and key level warnings.",
    whyItMatters: "Crowding and gamma can shape volatility and magnet levels.",
    status: "planned",
    executionAuthority: "none"
  },
  {
    agentId: "order-flow-agent",
    name: "Order Flow Agent",
    purpose: "Later-stage review of DOM, footprint, delta, cumulative delta, and large prints.",
    inputData: ["DOM placeholder", "footprint placeholder", "delta", "cumulative delta", "large prints"],
    output: "Order-flow confirmation or caution.",
    whyItMatters: "Order flow can confirm or reject price-action interpretation, but it is advanced/later only.",
    status: "planned",
    executionAuthority: "none"
  }
];
