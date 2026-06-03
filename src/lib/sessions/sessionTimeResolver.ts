import type { Candle } from "@/lib/types";
import type { SessionTimeMapping, SessionTimeMappingInput, SessionTimestampParts } from "@/lib/sessions/sessionTimeTypes";

const MT5_INDEX_CFD_SYMBOLS = new Set(["USTECH", "USTEC", "US100", "NAS100", "NQ", "US500", "SPX500", "US30", "DJ30"]);
const REQUESTED_INDEX_SYMBOLS = new Set(["MNQ", "NQ", "MES", "ES", "YM"]);

const pad = (value: number) => String(value).padStart(2, "0");

const normalizeSymbol = (value?: string) => (value ?? "").trim().toUpperCase();

const timestampLooksUtc = (timestamp?: string) => Boolean(timestamp?.endsWith("Z"));

const literalPartsFor = (timestamp: string, mapping: SessionTimeMapping): SessionTimestampParts => {
  const match = /(?:T|\s)(\d{2}):(\d{2})(?::(\d{2}))?/.exec(timestamp);
  const date = timestamp.slice(0, 10);
  const parsed = Date.parse(timestamp);
  if (!match) {
    return {
      timestamp,
      valid: false,
      timingZone: mapping.timingZone,
      sourceTimestampZone: mapping.sourceTimestampZone,
      warning: "Timestamp does not include a parseable literal clock."
    };
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  return {
    timestamp,
    valid: true,
    timingZone: mapping.timingZone,
    sourceTimestampZone: mapping.sourceTimestampZone,
    localDate: date,
    localTime: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
    localTimestampLabel: `${date} ${pad(hour)}:${pad(minute)} ${mapping.timingZone}`,
    hour,
    minute,
    second,
    minutesOfDay: hour * 60 + minute,
    dayOfWeek: Number.isFinite(parsed) ? new Date(parsed).getDay() : undefined
  };
};

const partsForTimeZone = (timestamp: string, mapping: SessionTimeMapping): SessionTimestampParts => {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return literalPartsFor(timestamp, mapping);
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: mapping.timingZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(parsed)).map((part) => [part.type, part.value]));
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    const second = Number(parts.second);
    const localDate = `${year}-${pad(month)}-${pad(day)}`;
    const localTime = `${pad(hour)}:${pad(minute)}:${pad(second)}`;
    return {
      timestamp,
      valid: true,
      timingZone: mapping.timingZone,
      sourceTimestampZone: mapping.sourceTimestampZone,
      localDate,
      localTime,
      localTimestampLabel: `${localDate} ${pad(hour)}:${pad(minute)} ${mapping.timingZone}`,
      hour,
      minute,
      second,
      minutesOfDay: hour * 60 + minute,
      dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    };
  } catch {
    return literalPartsFor(timestamp, {
      ...mapping,
      timingZone: "literal_timestamp"
    });
  }
};

export function resolveSessionTimeMapping(input: SessionTimeMappingInput = {}): SessionTimeMapping {
  const candles = input.candles ?? [];
  const firstCandle = candles[0];
  const brokerSymbol = normalizeSymbol(input.brokerSymbol ?? firstCandle?.symbol);
  const requestedSymbol = normalizeSymbol(input.requestedSymbol ?? input.symbol);
  const provider = input.provider ?? (brokerSymbol && MT5_INDEX_CFD_SYMBOLS.has(brokerSymbol) ? "mt5_read_only" : "unknown");
  const utcTimestamps = candles.some((candle) => timestampLooksUtc(candle.timestamp));
  const mt5IndexProxy =
    provider === "mt5_read_only" ||
    MT5_INDEX_CFD_SYMBOLS.has(brokerSymbol) ||
    (REQUESTED_INDEX_SYMBOLS.has(requestedSymbol) && MT5_INDEX_CFD_SYMBOLS.has(brokerSymbol));

  if (mt5IndexProxy) {
    return {
      provider,
      requestedSymbol: requestedSymbol || undefined,
      brokerSymbol: brokerSymbol || undefined,
      timingZone: "America/New_York",
      sourceTimestampZone: utcTimestamps ? "UTC" : "broker_server_time",
      sessionModel: "index_cfd_proxy",
      equityIndexSession: true,
      warnings: [
        "MT5 index CFD/proxy candles are interpreted with New York ICT timing; source candle timestamps are not rewritten.",
        utcTimestamps
          ? "Source timestamps end in Z and are treated as UTC before converting to New York timing."
          : "Source timestamps do not end in Z; treating them as broker/server time for diagnostics."
      ]
    };
  }

  return {
    provider,
    requestedSymbol: requestedSymbol || undefined,
    brokerSymbol: brokerSymbol || undefined,
    timingZone: "literal_timestamp",
    sourceTimestampZone: utcTimestamps ? "UTC" : "literal_timestamp",
    sessionModel: "exchange_local_literal",
    equityIndexSession: false,
    warnings: ["Using literal candle timestamp clock for session timing."]
  };
}

export function resolveSessionTimestampParts(timestamp: string, mapping: SessionTimeMapping = resolveSessionTimeMapping()): SessionTimestampParts {
  return mapping.timingZone === "literal_timestamp" ? literalPartsFor(timestamp, mapping) : partsForTimeZone(timestamp, mapping);
}

export const getTimingClockMinutes = (timestamp: string, mapping?: SessionTimeMapping) =>
  resolveSessionTimestampParts(timestamp, mapping).minutesOfDay;

export const getTimingDateKey = (timestamp: string, mapping?: SessionTimeMapping) =>
  resolveSessionTimestampParts(timestamp, mapping).localDate ?? timestamp.slice(0, 10);

export const getTimingDayOfWeek = (timestamp: string, mapping?: SessionTimeMapping) =>
  resolveSessionTimestampParts(timestamp, mapping).dayOfWeek;

export const getCandleTimingParts = (candle: Candle, mapping?: SessionTimeMapping) =>
  resolveSessionTimestampParts(candle.timestamp, mapping ?? resolveSessionTimeMapping({ candles: [candle] }));
