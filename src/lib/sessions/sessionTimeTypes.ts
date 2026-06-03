import type { Candle } from "@/lib/types";

export type SessionTimingZone = "America/New_York" | "literal_timestamp";
export type SourceTimestampZone = "UTC" | "broker_server_time" | "literal_timestamp" | "unknown";
export type SessionModel = "index_cfd_proxy" | "exchange_local_literal";

export interface SessionTimeMappingInput {
  provider?: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  symbol?: string;
  candles?: Candle[];
}

export interface SessionTimeMapping {
  provider: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  timingZone: SessionTimingZone;
  sourceTimestampZone: SourceTimestampZone;
  sessionModel: SessionModel;
  equityIndexSession: boolean;
  warnings: string[];
}

export interface SessionTimestampParts {
  timestamp: string;
  valid: boolean;
  timingZone: SessionTimingZone;
  sourceTimestampZone: SourceTimestampZone;
  localDate?: string;
  localTime?: string;
  localTimestampLabel?: string;
  hour?: number;
  minute?: number;
  second?: number;
  minutesOfDay?: number;
  dayOfWeek?: number;
  warning?: string;
}
