import type { Time } from "lightweight-charts";

import type { Candle, FuturesSymbol, MarketBias, Timeframe } from "@/lib/types";

export type ChartDataSourceType =
  | "mock"
  | "imported"
  | "replay"
  | "tradingview_mcp_chart"
  | "live_feed"
  | "live_placeholder";

export type ChartMarkerType = "MSS" | "BOS" | "sweep" | "entry" | "invalidation" | "target" | "current";

export type ChartLineOverlayType =
  | "vwap"
  | "anchored_vwap"
  | "liquidity_level"
  | "session_high"
  | "session_low"
  | "prior_day_high"
  | "prior_day_low"
  | "entry"
  | "invalidation"
  | "target";

export type ChartZoneOverlayType = "fvg" | "premium" | "discount";

export interface TradingChartCandle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  sourceCandle?: Candle;
}

export interface TradingChartLinePoint {
  time: Time;
  value: number;
}

export interface TradingChartLineOverlay {
  id: string;
  type: ChartLineOverlayType;
  label: string;
  data: TradingChartLinePoint[];
  color?: string;
  visibleByDefault?: boolean;
  lineStyle?: "solid" | "dashed";
  lineWidth?: 1 | 2 | 3 | 4;
}

export interface TradingChartZoneOverlay {
  id: string;
  type: ChartZoneOverlayType;
  label: string;
  top: TradingChartLineOverlay;
  bottom: TradingChartLineOverlay;
  visibleByDefault?: boolean;
}

export interface TradingChartMarker {
  id: string;
  type: ChartMarkerType;
  time: Time;
  price?: number;
  label: string;
  direction?: MarketBias;
}

export interface TradingChartSourceMeta {
  sourceType: ChartDataSourceType;
  sourceLabel: string;
  symbol: FuturesSymbol | string;
  timeframe: Timeframe | string;
  candleCount: number;
  dataFingerprint?: string;
  firstClose?: number;
  firstTimestamp?: string;
  lastClose?: number;
  lastTimestamp?: string;
  sourceKey?: string;
  isLive: boolean;
  isMock: boolean;
  isImported: boolean;
  isReplay: boolean;
}

export interface TradingChartPropsData {
  candles: TradingChartCandle[];
  source: TradingChartSourceMeta;
  lineOverlays?: TradingChartLineOverlay[];
  zoneOverlays?: TradingChartZoneOverlay[];
  markers?: TradingChartMarker[];
  bias?: MarketBias;
  stateLabel?: string;
}

export interface FutureLiveFeedAdapter {
  type: "live_placeholder";
  status: "future_live_not_connected";
  label: string;
  connect: () => never;
}

export interface TradovateLiveFeedAdapter extends FutureLiveFeedAdapter {
  provider: "tradovate";
  requiresBackendBridge: true;
}
