import { marketDataProviderRoadmap, plannedMarketDataAgents } from "@/lib/marketData/marketDataRoadmap";
import type { MarketContext } from "@/lib/marketData/marketDataTypes";
import { mockCandles } from "@/lib/mockData/mockCandles";
import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";
import { uid } from "@/lib/utils";

const latestCloseFor = (symbol: FuturesSymbol, candles = mockCandles as Candle[]) =>
  [...candles].reverse().find((candle) => candle.symbol === symbol)?.close ?? candles[candles.length - 1]?.close ?? (symbol.includes("NQ") ? 18880 : 5265);

export function createMockMarketContext(
  symbol: FuturesSymbol = "NQ",
  timeframe: Timeframe = "5m",
  candlesInput?: Candle[],
  mode: MarketContext["mode"] = "mock"
): MarketContext {
  const matchingCandles = (candlesInput?.length ? candlesInput : mockCandles).filter(
    (candle) => candle.symbol === symbol && candle.timeframe === timeframe
  );
  const candles = matchingCandles.length ? matchingCandles : candlesInput?.length ? candlesInput : mockCandles.filter((candle) => candle.symbol === symbol && candle.timeframe === timeframe);
  const current = latestCloseFor(symbol, candles);
  const unit = symbol.includes("NQ") ? 40 : 12;
  const imported = mode === "imported";

  return {
    contextId: uid("market_context"),
    timestamp: new Date().toISOString(),
    mode,
    symbol,
    timeframe,
    priceVolume: {
      ohlcv: {
        symbol,
        timeframe,
        candles,
        source: imported ? "historical_import" : "mock",
        updatedAt: new Date().toISOString()
      },
      tickDataStatus: "planned",
      volumeProfile: {
        vwap: Number((current - unit * 0.15).toFixed(2)),
        anchoredVwap: Number((current - unit * 0.4).toFixed(2)),
        vpoc: Number((current - unit * 0.25).toFixed(2)),
        vah: Number((current + unit * 1.1).toFixed(2)),
        val: Number((current - unit * 1.2).toFixed(2)),
        volumeProfileStatus: "available_mock",
        notes: ["Mock VWAP/profile values are placeholders for UI and agent contract testing."]
      },
      priorDay: {
        high: Number((current + unit * 1.4).toFixed(2)),
        low: Number((current - unit * 1.8).toFixed(2)),
        close: Number((current - unit * 0.2).toFixed(2))
      },
      priorWeek: {
        high: Number((current + unit * 3.2).toFixed(2)),
        low: Number((current - unit * 3.8).toFixed(2)),
        close: Number((current - unit * 0.7).toFixed(2))
      },
      priorMonth: {
        high: Number((current + unit * 6).toFixed(2)),
        low: Number((current - unit * 7).toFixed(2)),
        close: Number((current + unit * 1.1).toFixed(2))
      },
      overnight: {
        high: Number((current + unit * 0.9).toFixed(2)),
        low: Number((current - unit * 1.1).toFixed(2))
      },
      globexRange: {
        high: Number((current + unit * 1.2).toFixed(2)),
        low: Number((current - unit * 1.4).toFixed(2))
      },
      levels: [
        { label: "Prior day high", value: Number((current + unit * 1.4).toFixed(2)), source: "mock", timeframe: "day" },
        { label: "Prior day low", value: Number((current - unit * 1.8).toFixed(2)), source: "mock", timeframe: "day" },
        { label: "Overnight high", value: Number((current + unit * 0.9).toFixed(2)), source: "mock", timeframe: "overnight" },
        { label: "Overnight low", value: Number((current - unit * 1.1).toFixed(2)), source: "mock", timeframe: "overnight" },
        { label: "Globex high", value: Number((current + unit * 1.2).toFixed(2)), source: "mock", timeframe: "globex" },
        { label: "Globex low", value: Number((current - unit * 1.4).toFixed(2)), source: "mock", timeframe: "globex" }
      ]
    },
    orderFlow: {
      domStatus: "later_advanced",
      footprintStatus: "later_advanced",
      delta: 0,
      cumulativeDelta: 0,
      largePrints: [],
      notes: ["DOM, footprint, delta, cumulative delta, and large print detection are future offline/file-import modules."]
    },
    positioning: {
      putCallRatio: 1.02,
      gammaLevels: [
        { label: "Mock positive gamma shelf", price: Number((current + unit * 2).toFixed(2)), strength: "medium" },
        { label: "Mock dealer gamma flip", price: Number((current - unit * 0.8).toFixed(2)), strength: "high" }
      ],
      dealerGammaFlip: Number((current - unit * 0.8).toFixed(2)),
      netPositioningBias: "neutral",
      status: "planned"
    },
    macro: {
      economicCalendar: [
        {
          id: "mock-cpi",
          name: "CPI",
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          impact: "high",
          status: "mock"
        },
        {
          id: "mock-fomc",
          name: "FOMC",
          scheduledAt: new Date(Date.now() + 604800000).toISOString(),
          impact: "high",
          status: "mock"
        }
      ],
      fedFundsImpliedPath: "Mock path: one cut priced over the next two meetings.",
      dxy: 104.2,
      vix: 16.8,
      twoYearYield: 4.72,
      tenYearYield: 4.39,
      macroRiskBias: "neutral",
      status: "planned"
    },
    intermarket: {
      esNqRatio: 0.279,
      ymEsDivergence: "unknown",
      bondFuturesContext: "Mock neutral bond futures context.",
      crudeGoldRiskContext: "Mock commodity context is neutral.",
      dxyNqRelationship: "neutral",
      vixEquityRelationship: "neutral",
      status: "planned"
    },
    availableModules: [
      {
        id: "mock-ohlcv",
        name: imported ? "Imported historical OHLCV candles" : "Mock OHLCV candles",
        status: "available_mock",
        summary: `${candles.length} ${imported ? "imported historical" : "mock"} candle(s) available for ${symbol} ${timeframe}.`
      },
      {
        id: "mock-session-levels",
        name: "Mock session levels",
        status: "available_mock",
        summary: "Prior day, overnight, and Globex levels are mocked for adapter contract testing."
      },
      {
        id: "mock-volume-profile",
        name: "Mock VWAP/volume profile",
        status: "available_mock",
        summary: "VWAP, anchored VWAP, VPOC, VAH, and VAL are placeholder research inputs."
      }
    ],
    missingModules: [
      {
        id: "tick-data",
        name: "Tick data",
        status: "planned",
        summary: "Requires future CSV/provider adapter."
      },
      {
        id: "order-flow",
        name: "Order flow",
        status: "later_advanced",
        summary: "DOM, footprint, delta, cumulative delta, and large prints are later/advanced offline imports."
      },
      {
        id: "real-macro",
        name: "Real macro calendar and series",
        status: "planned",
        summary: "Requires future calendar/FRED-style adapter with no frontend secrets."
      },
      {
        id: "positioning-gamma",
        name: "Positioning and gamma",
        status: "planned",
        summary: "Requires CFTC CSV/manual gamma import or a paid provider later."
      }
    ],
    plannedAgents: plannedMarketDataAgents,
    providerRoadmap: marketDataProviderRoadmap,
    safetyNotice: "Market data adapters are research inputs only. No broker execution or live trading."
  };
}

export const mockMarketContext = createMockMarketContext();
