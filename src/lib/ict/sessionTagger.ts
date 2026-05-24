import type { Candle, CandleSession, ICTKillZone, SessionContext } from "@/lib/types";

const minutesFromTimestamp = (timestamp: string) => {
  const match = /T(\d{2}):(\d{2})/.exec(timestamp);
  if (!match) {
    return 0;
  }
  return Number(match[1]) * 60 + Number(match[2]);
};

const isWithin = (minutes: number, start: number, end: number) => {
  if (start <= end) {
    return minutes >= start && minutes < end;
  }
  return minutes >= start || minutes < end;
};

const minutesSince = (minutes: number, start: number) => (minutes >= start ? minutes - start : 24 * 60 - start + minutes);

const sessionFor = (minutes: number): CandleSession => {
  if (isWithin(minutes, 18 * 60, 3 * 60)) {
    return "Asia";
  }
  if (isWithin(minutes, 3 * 60, 8 * 60 + 30)) {
    return "London";
  }
  if (isWithin(minutes, 8 * 60 + 30, 17 * 60)) {
    return "New York";
  }
  return "Off hours";
};

const killZoneFor = (minutes: number): ICTKillZone => {
  if (isWithin(minutes, 20 * 60, 24 * 60)) {
    return "Asia range";
  }
  if (isWithin(minutes, 2 * 60, 5 * 60)) {
    return "London open";
  }
  if (isWithin(minutes, 8 * 60 + 30, 11 * 60)) {
    return "NY AM";
  }
  if (isWithin(minutes, 11 * 60, 13 * 60 + 30)) {
    return "NY Lunch";
  }
  if (isWithin(minutes, 13 * 60 + 30, 16 * 60)) {
    return "NY PM";
  }
  return "none";
};

const sessionOpenFor = (session: CandleSession) => {
  if (session === "Asia") {
    return 18 * 60;
  }
  if (session === "London") {
    return 3 * 60;
  }
  if (session === "New York") {
    return 8 * 60 + 30;
  }
  return 17 * 60;
};

export function tagSession(candle: Candle): SessionContext {
  const minutes = minutesFromTimestamp(candle.timestamp);
  const session = sessionFor(minutes);
  const killZone = killZoneFor(minutes);

  // Assumption: mock candles store exchange-local timestamps with an offset, so
  // tagging reads the literal clock time rather than requesting timezone data.
  return {
    candleId: candle.id,
    timestamp: candle.timestamp,
    session,
    killZone,
    minutesFromSessionOpen: minutesSince(minutes, sessionOpenFor(session)),
    label: killZone === "none" ? session : `${session} / ${killZone}`
  };
}

export function tagSessions(candles: Candle[]): SessionContext[] {
  return candles.map(tagSession);
}
