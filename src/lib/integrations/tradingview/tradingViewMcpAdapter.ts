import type {
  RawTradingViewMcpEvidence,
  TradingViewEvidence
} from "@/lib/integrations/tradingview/tradingViewMcpTypes";
import { tradingViewMcpAdapterPlan } from "@/lib/integrations/tradingview/tradingViewAuthorityPolicy";
import {
  createUnavailableTradingViewEvidence,
  normalizeTradingViewEvidence
} from "@/lib/integrations/tradingview/tradingViewEvidenceNormalizer";

export interface TradingViewEvidenceRequest {
  requestId: string;
  symbol: string;
  timeframe: string;
  requestedEvidence: Array<"chart_state" | "ohlcv_summary" | "indicator_values" | "levels" | "screenshot">;
  mode: "research";
  executionAuthority: "none";
  brokerAuthority: "none";
}

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const createTradingViewEvidenceRequest = ({
  symbol,
  timeframe
}: {
  symbol: string;
  timeframe: string;
}): TradingViewEvidenceRequest => ({
  requestId: createId("tradingview_request"),
  symbol,
  timeframe,
  requestedEvidence: ["chart_state", "ohlcv_summary", "indicator_values", "levels", "screenshot"],
  mode: "research",
  executionAuthority: "none",
  brokerAuthority: "none"
});

export const getTradingViewMcpAdapterStatus = () => tradingViewMcpAdapterPlan;

export const createTradingViewEvidenceFromMcpPayload = (
  payload: RawTradingViewMcpEvidence,
  fallback: { symbol: string; timeframe: string }
): TradingViewEvidence => normalizeTradingViewEvidence(payload, fallback);

export const getUnavailableTradingViewEvidence = ({
  symbol,
  timeframe
}: {
  symbol: string;
  timeframe: string;
}): TradingViewEvidence => createUnavailableTradingViewEvidence({ symbol, timeframe });
