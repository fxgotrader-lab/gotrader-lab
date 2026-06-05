import type { IctAdvisorSignal } from "./ictAdvisorTypes";
import type { IctApprovedSetupDecision } from "./ictApprovedSetupProfileTypes";
import type {
  IctEconomicEventRisk,
  IctNewsRiskLevel,
  IctNewsSessionEconomicEventInput,
  IctNewsSessionMacroRiskFlagInput,
  IctNewsSessionRiskContextInput,
  IctNewsSessionRiskDecision,
  IctNewsSessionRiskJournalEvent,
  IctRiskGovernorAction,
  IctSessionName,
  IctSessionRiskContext,
  IctSessionRiskState
} from "./ictNewsSessionRiskTypes";

const NEWS_SESSION_RISK_JOURNAL_STORAGE_KEY = "gotrader.ict-news-session-risk-summary.journal.v1";
const MAX_NEWS_SESSION_RISK_JOURNAL_EVENTS = 200;
export const DEFAULT_ICT_NEWS_SESSION_TIMING_ZONE = "America/New_York";

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safety = {
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));

const riskRank: Record<IctNewsRiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  blocked: 4,
  unknown: -1
};

const maxRisk = (levels: IctNewsRiskLevel[]): IctNewsRiskLevel =>
  levels.length
    ? levels.slice().sort((left, right) => riskRank[right] - riskRank[left])[0]
    : "none";

const normalizeImpact = (impact?: string): IctEconomicEventRisk["impact"] => {
  const normalized = String(impact ?? "unknown").toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") return normalized;
  return "unknown";
};

const eventTitle = (event: IctNewsSessionEconomicEventInput) =>
  String(event.title ?? event.eventName ?? event.name ?? event.reason ?? "Economic event").trim();

const eventTime = (event: IctNewsSessionEconomicEventInput) =>
  event.scheduledAt ?? event.datetime ?? event.date;

const minutesBetween = (candidateTime: string, scheduledAt?: string) => {
  if (!scheduledAt || Number.isNaN(Date.parse(candidateTime)) || Number.isNaN(Date.parse(scheduledAt))) {
    return undefined;
  }
  return Math.round((Date.parse(candidateTime) - Date.parse(scheduledAt)) / 60_000);
};

const inWindow = (minutesFromEvent: number | undefined, beforeMinutes: number, afterMinutes: number) =>
  minutesFromEvent !== undefined && minutesFromEvent >= -beforeMinutes && minutesFromEvent <= afterMinutes;

const eventRuleFor = (title: string, impact: IctEconomicEventRisk["impact"]) => {
  const text = title.toLowerCase();
  if (/fomc|federal open market|fed rate|rate decision|powell|fed chair|federal reserve/.test(text)) {
    return {
      id: "fomc_fed_window",
      beforeMinutes: 60,
      afterMinutes: 45,
      blockingLevel: "blocked" as const,
      cautionLevel: "medium" as const,
      reason: "FOMC/Fed event window."
    };
  }
  if (/nonfarm|nfp|payroll|unemployment|jobless|cpi|consumer price|ppi|producer price|inflation/.test(text)) {
    return {
      id: "major_labor_inflation_window",
      beforeMinutes: 45,
      afterMinutes: 30,
      blockingLevel: "blocked" as const,
      cautionLevel: "medium" as const,
      reason: "Major labor or inflation release window."
    };
  }
  if (/gdp|pmi|ism|retail sales|consumer confidence|pce|durable goods/.test(text)) {
    return {
      id: "macro_growth_window",
      beforeMinutes: 30,
      afterMinutes: 20,
      blockingLevel: impact === "high" ? ("high" as const) : ("medium" as const),
      cautionLevel: "medium" as const,
      reason: "Macro growth/activity release window."
    };
  }
  return {
    id: "impact_event_window",
    beforeMinutes: impact === "high" ? 30 : impact === "medium" ? 15 : 10,
    afterMinutes: impact === "high" ? 15 : impact === "medium" ? 10 : 5,
    blockingLevel: impact === "high" ? ("high" as const) : ("medium" as const),
    cautionLevel: impact === "medium" ? ("medium" as const) : ("low" as const),
    reason: `${impact} impact event window.`
  };
};

export const classifyIctEconomicEventRisk = (
  event: IctNewsSessionEconomicEventInput,
  candidateTime: string
): IctEconomicEventRisk => {
  const title = eventTitle(event);
  const impact = normalizeImpact(event.impact);
  const scheduledAt = eventTime(event);
  const minutesFromEvent = minutesBetween(candidateTime, scheduledAt);
  const rule = eventRuleFor(title, impact);
  let riskLevel: IctNewsRiskLevel = "none";
  if (inWindow(minutesFromEvent, rule.beforeMinutes, rule.afterMinutes)) {
    riskLevel = impact === "high" ? rule.blockingLevel : impact === "medium" ? rule.cautionLevel : "low";
  } else if (minutesFromEvent !== undefined && Math.abs(minutesFromEvent) <= Math.max(120, rule.beforeMinutes * 2)) {
    riskLevel = impact === "high" ? "medium" : impact === "medium" ? "low" : "none";
  }
  return {
    eventId: event.eventId ?? `event_${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 32) || "unknown"}`,
    title,
    country: event.country,
    currency: event.currency,
    impact,
    scheduledAt,
    minutesFromEvent,
    riskLevel,
    matchedRule: rule.id,
    reason:
      riskLevel === "none"
        ? `${title} is outside the active ${rule.id.replace(/_/g, " ")}.`
        : `${rule.reason} ${minutesFromEvent === undefined ? "Event time unavailable." : `${Math.abs(minutesFromEvent)} minute(s) ${minutesFromEvent < 0 ? "before" : "after"} release.`}`
  };
};

const flagAppliesToCandidateTime = (flag: IctNewsSessionMacroRiskFlagInput, candidateTime: string) => {
  const candidateMs = Date.parse(candidateTime);
  if (Number.isNaN(candidateMs)) return false;
  if (flag.windowStart && candidateMs < Date.parse(flag.windowStart)) return false;
  if (flag.windowEnd && candidateMs > Date.parse(flag.windowEnd)) return false;
  return Boolean(flag.windowStart || flag.windowEnd);
};

export const macroRiskFlagToEventRisk = (
  flag: IctNewsSessionMacroRiskFlagInput,
  candidateTime: string
): IctEconomicEventRisk | undefined => {
  if (!flagAppliesToCandidateTime(flag, candidateTime)) return undefined;
  const severity = String(flag.severity ?? "monitor").toLowerCase();
  const riskLevel: IctNewsRiskLevel =
    severity === "block" || severity === "high"
      ? "blocked"
      : severity === "reduce_risk" || severity === "medium"
        ? "medium"
        : "low";
  return {
    eventId: flag.eventId ?? flag.flagId ?? "macro_risk_flag",
    title: flag.reason ?? "Macro risk flag",
    impact: riskLevel === "blocked" ? "high" : riskLevel === "medium" ? "medium" : "low",
    riskLevel,
    matchedRule: "macro_risk_flag_window",
    reason: flag.reason ?? "Macro risk flag is active for this candidate window.",
    windowStart: flag.windowStart,
    windowEnd: flag.windowEnd
  };
};

const localPartsFor = (timestamp: string, timingZone: string) => {
  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timingZone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const hourRaw = Number(get("hour"));
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const minute = Number(get("minute"));
  return {
    day: get("day"),
    hour,
    localDate: `${get("year")}-${get("month")}-${get("day")}`,
    localTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    minute,
    month: get("month"),
    weekday: get("weekday"),
    year: get("year")
  };
};

export const classifyIctSession = (timestamp: string, timingZone = DEFAULT_ICT_NEWS_SESSION_TIMING_ZONE): IctSessionName => {
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) return "unknown";
  const { hour, minute } = localPartsFor(timestamp, timingZone);
  const totalMinutes = hour * 60 + minute;
  if (totalMinutes >= 2 * 60 && totalMinutes < 7 * 60) return "london";
  if (totalMinutes >= 9 * 60 + 30 && totalMinutes < 11 * 60 + 30) return "new_york_am";
  if (totalMinutes >= 11 * 60 + 30 && totalMinutes < 13 * 60 + 30) return "new_york_lunch";
  if (totalMinutes >= 13 * 60 + 30 && totalMinutes < 16 * 60) return "new_york_pm";
  if (totalMinutes >= 19 * 60 || totalMinutes < 2 * 60) return "asia";
  return "after_hours";
};

export const classifyIctSessionRisk = (
  sessionName: IctSessionName,
  timestamp: string,
  timingZone = DEFAULT_ICT_NEWS_SESSION_TIMING_ZONE
): Pick<IctSessionRiskContext, "reason" | "sessionRiskState"> => {
  if (sessionName === "unknown") {
    return { sessionRiskState: "unknown", reason: "Candidate timestamp is unavailable or invalid." };
  }
  const { hour, minute, weekday } = localPartsFor(timestamp, timingZone);
  const totalMinutes = hour * 60 + minute;
  if (sessionName === "new_york_am") {
    if (totalMinutes < 9 * 60 + 40) {
      return { sessionRiskState: "caution", reason: "First ten minutes after New York cash open can be volatile." };
    }
    return { sessionRiskState: "preferred", reason: "New York AM is a preferred index research window after opening volatility cools." };
  }
  if (sessionName === "london") {
    if (totalMinutes < 2 * 60 + 10) {
      return { sessionRiskState: "caution", reason: "London session open can be jumpy; wait for confirmation." };
    }
    return { sessionRiskState: "acceptable", reason: "London context is acceptable for ICT research but not preferred for US index CFDs." };
  }
  if (sessionName === "new_york_lunch") {
    return { sessionRiskState: "caution", reason: "New York lunch can produce chop and lower-quality displacement." };
  }
  if (sessionName === "new_york_pm") {
    if (weekday === "Fri" || totalMinutes >= 15 * 60 + 30) {
      return { sessionRiskState: "caution", reason: "Late-day or Friday PM volatility can distort ICT confirmation." };
    }
    return { sessionRiskState: "acceptable", reason: "New York PM is acceptable with extra confirmation." };
  }
  if (sessionName === "asia") {
    return { sessionRiskState: "caution", reason: "Asia/overnight index CFD liquidity can be thin." };
  }
  return { sessionRiskState: "avoid", reason: "After-hours/dead-zone liquidity is not suitable for active ICT candidate approval." };
};

const timestampForCandidate = (candidate: Partial<IctAdvisorSignal> & { tradePath?: { signalTime?: string }; timestamp?: string }) =>
  candidate.displacement?.candleTime ??
  candidate.fairValueGap?.createdAt ??
  candidate.tradePath?.signalTime ??
  candidate.timestamp ??
  candidate.provenance?.generatedAt ??
  new Date().toISOString();

const sessionContextFor = (timestamp: string, timingZone: string): IctSessionRiskContext => {
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    return {
      timingZone,
      sourceTimestampZone: "unknown",
      timestamp,
      localDate: "unknown",
      localTime: "unknown",
      sessionName: "unknown",
      sessionRiskState: "unknown",
      reason: "Candidate timestamp is invalid."
    };
  }
  const sessionName = classifyIctSession(timestamp, timingZone);
  const risk = classifyIctSessionRisk(sessionName, timestamp, timingZone);
  const local = localPartsFor(timestamp, timingZone);
  return {
    timingZone,
    sourceTimestampZone: timestamp.endsWith("Z") ? "UTC" : "unknown",
    timestamp,
    localDate: local.localDate,
    localTime: local.localTime,
    sessionName,
    sessionRiskState: risk.sessionRiskState,
    reason: risk.reason
  };
};

const actionFor = ({
  blockingEvents,
  cautionEvents,
  context,
  newsRiskLevel
}: {
  blockingEvents: IctEconomicEventRisk[];
  cautionEvents: IctEconomicEventRisk[];
  context: IctSessionRiskContext;
  newsRiskLevel: IctNewsRiskLevel;
}): IctRiskGovernorAction => {
  if (blockingEvents.length || newsRiskLevel === "blocked" || newsRiskLevel === "high") return "reject_candidate";
  if (context.sessionRiskState === "avoid") return "no_trade";
  if (cautionEvents.length || newsRiskLevel === "medium" || context.sessionRiskState === "caution" || context.sessionRiskState === "unknown") {
    return "downgrade_to_watchlist";
  }
  return "allow";
};

const confidenceAdjustmentFor = ({
  action,
  newsRiskLevel,
  sessionRiskState
}: {
  action: IctRiskGovernorAction;
  newsRiskLevel: IctNewsRiskLevel;
  sessionRiskState: IctSessionRiskState;
}) => {
  if (action === "reject_candidate") return -0.18;
  if (action === "no_trade") return -0.12;
  if (newsRiskLevel === "medium") return -0.07;
  if (sessionRiskState === "caution" || action === "downgrade_to_watchlist") return -0.04;
  if (newsRiskLevel === "low") return -0.02;
  return 0;
};

const compactEventRisk = (event: IctEconomicEventRisk) => ({
  eventId: event.eventId,
  impact: event.impact,
  matchedRule: event.matchedRule,
  minutesFromEvent: event.minutesFromEvent,
  riskLevel: event.riskLevel,
  title: event.title
});

export const evaluateNewsSessionRisk = (
  candidate: Partial<IctAdvisorSignal> & { tradePath?: { signalTime?: string }; timestamp?: string },
  context: IctNewsSessionRiskContextInput = {}
): IctNewsSessionRiskDecision => {
  const timingZone = context.timingZone ?? DEFAULT_ICT_NEWS_SESSION_TIMING_ZONE;
  const candidateTime = timestampForCandidate(candidate);
  const session = sessionContextFor(candidateTime, timingZone);
  const economicEvents = (context.economicEvents ?? []).map((event) => classifyIctEconomicEventRisk(event, candidateTime));
  const macroEvents = (context.macroRiskFlags ?? [])
    .map((flag) => macroRiskFlagToEventRisk(flag, candidateTime))
    .filter((event): event is IctEconomicEventRisk => Boolean(event));
  const allEvents = [...economicEvents, ...macroEvents];
  const blockingEvents = allEvents.filter((event) => event.riskLevel === "blocked" || event.riskLevel === "high");
  const cautionEvents = allEvents.filter((event) => event.riskLevel === "medium" || event.riskLevel === "low");
  const newsRiskLevel = context.syntheticNoRisk
    ? "none"
    : maxRisk(allEvents.map((event) => event.riskLevel).filter((level) => level !== "unknown"));
  const action = actionFor({ blockingEvents, cautionEvents, context: session, newsRiskLevel });
  const confidenceAdjustment = confidenceAdjustmentFor({
    action,
    newsRiskLevel,
    sessionRiskState: session.sessionRiskState
  });
  const extraNotes = [
    context.syntheticNoRisk ? "Synthetic no-news-risk context is active; use this only for historical replay when a calendar is unavailable." : "",
    !context.syntheticNoRisk && !allEvents.length ? "No economic calendar or macro-risk window was supplied; governor used session risk only." : "",
    context.spreadState === "extreme" ? "Extreme spread state supplied; candidate should be blocked by downstream risk review." : "",
    context.volatilityState === "extreme" ? "Extreme volatility state supplied; candidate should be blocked by downstream risk review." : ""
  ].filter(Boolean);
  const spreadOrVolAction =
    context.spreadState === "extreme" || context.volatilityState === "extreme" ? "reject_candidate" : action;
  return {
    researchOnly: true,
    newsRiskLevel: context.spreadState === "extreme" || context.volatilityState === "extreme" ? "high" : newsRiskLevel,
    sessionRiskState: session.sessionRiskState,
    riskGovernorAction: spreadOrVolAction,
    riskGovernorConfidenceAdjustment:
      spreadOrVolAction === action ? confidenceAdjustment : Math.min(confidenceAdjustment, -0.15),
    blockingEventsCount: blockingEvents.length,
    cautionEventsCount: cautionEvents.length,
    blockingEvents: blockingEvents.slice(0, 5),
    cautionEvents: cautionEvents.slice(0, 5),
    session,
    newsSessionRiskNotes: Array.from(
      new Set([
        `Session ${session.sessionName.replace(/_/g, " ")} is ${session.sessionRiskState}: ${session.reason}`,
        blockingEvents.length ? `${blockingEvents.length} blocking macro/news event(s) overlap this candidate.` : "",
        cautionEvents.length ? `${cautionEvents.length} caution macro/news event(s) are near this candidate.` : "",
        action === "allow" ? "Risk governor allows this candidate to proceed through normal ICT gates." : "",
        action === "downgrade_to_watchlist" ? "Risk governor downgrades this candidate to watchlist review only." : "",
        action === "reject_candidate" ? "Risk governor rejects this candidate for the current window." : "",
        action === "no_trade" ? "Risk governor marks this candidate no-trade for the current session window." : "",
        ...extraNotes,
        "Research-only governor. No execution authority, broker authority, or readiness override."
      ].filter(Boolean))
    ).slice(0, 8),
    provider: context.provider,
    generatedAt: new Date().toISOString(),
    authority,
    safety
  };
};

export const applyNewsSessionRiskToSignal = (
  signal: IctAdvisorSignal,
  decision: IctNewsSessionRiskDecision
): IctAdvisorSignal => {
  const blocked = decision.riskGovernorAction === "reject_candidate" || decision.riskGovernorAction === "no_trade";
  return {
    ...signal,
    side: blocked ? "flat" : signal.side,
    decision: blocked ? "no_trade" : signal.decision,
    confidence: clamp(signal.confidence + decision.riskGovernorConfidenceAdjustment),
    noTradeReasons: blocked
      ? Array.from(new Set([...signal.noTradeReasons, ...decision.newsSessionRiskNotes.slice(0, 3)]))
      : signal.noTradeReasons,
    riskNotes: Array.from(new Set([...signal.riskNotes, ...decision.newsSessionRiskNotes])),
    newsSessionRisk: decision
  };
};

export const applyNewsSessionRiskToApprovedDecision = (
  approvedDecision: IctApprovedSetupDecision,
  decision?: IctNewsSessionRiskDecision
): IctApprovedSetupDecision => {
  if (!decision) return approvedDecision;
  if (
    approvedDecision.riskGovernorAction === decision.riskGovernorAction &&
    approvedDecision.newsRiskLevel === decision.newsRiskLevel &&
    approvedDecision.sessionRiskState === decision.sessionRiskState
  ) {
    return approvedDecision;
  }
  const status =
    decision.riskGovernorAction === "reject_candidate"
      ? "rejected_candidate"
      : decision.riskGovernorAction === "no_trade"
        ? "no_trade"
        : decision.riskGovernorAction === "downgrade_to_watchlist" && approvedDecision.status === "approved_research_candidate"
          ? "watchlist_candidate"
          : approvedDecision.status;
  const rejectionReasons =
    decision.riskGovernorAction === "reject_candidate" || decision.riskGovernorAction === "no_trade"
      ? Array.from(new Set([...approvedDecision.rejectionReasons, ...decision.newsSessionRiskNotes.slice(0, 3)]))
      : approvedDecision.rejectionReasons;
  const watchlistReasons =
    decision.riskGovernorAction === "downgrade_to_watchlist"
      ? Array.from(new Set([...approvedDecision.watchlistReasons, ...decision.newsSessionRiskNotes.slice(0, 3)]))
      : approvedDecision.watchlistReasons;
  return {
    ...approvedDecision,
    status,
    newsRiskLevel: decision.newsRiskLevel,
    sessionRiskState: decision.sessionRiskState,
    riskGovernorAction: decision.riskGovernorAction,
    riskGovernorConfidenceAdjustment: decision.riskGovernorConfidenceAdjustment,
    blockingEventsCount: decision.blockingEventsCount,
    cautionEventsCount: decision.cautionEventsCount,
    newsSessionRiskNotes: decision.newsSessionRiskNotes,
    approvalScore: Math.max(0, Math.round(approvedDecision.approvalScore + decision.riskGovernorConfidenceAdjustment * 100)),
    rejectionReasons: rejectionReasons.slice(0, 8),
    watchlistReasons: watchlistReasons.slice(0, 8)
  };
};

export const buildIctNewsSessionRiskJournalEvent = (
  decision: IctNewsSessionRiskDecision,
  signal: Pick<IctAdvisorSignal, "brokerSymbol" | "htfTimeframes" | "primaryTimeframe" | "requestedSymbol" | "strategyId" | "symbol">
): IctNewsSessionRiskJournalEvent => ({
  eventType: "ict_news_session_risk_summary",
  journalEventId: createId("ict_news_session_risk_journal"),
  generatedAt: decision.generatedAt,
  strategyId: signal.strategyId,
  symbol: signal.symbol,
  requestedSymbol: signal.requestedSymbol,
  brokerSymbol: signal.brokerSymbol,
  primaryTimeframe: signal.primaryTimeframe,
  htfTimeframes: signal.htfTimeframes,
  newsRiskLevel: decision.newsRiskLevel,
  sessionRiskState: decision.sessionRiskState,
  riskGovernorAction: decision.riskGovernorAction,
  riskGovernorConfidenceAdjustment: decision.riskGovernorConfidenceAdjustment,
  blockingEventsCount: decision.blockingEventsCount,
  cautionEventsCount: decision.cautionEventsCount,
  compactBlockingEvents: decision.blockingEvents.map(compactEventRisk),
  compactCautionEvents: decision.cautionEvents.map(compactEventRisk),
  sessionName: decision.session.sessionName,
  timingZone: decision.session.timingZone,
  localDate: decision.session.localDate,
  localTime: decision.session.localTime,
  newsSessionRiskNotes: decision.newsSessionRiskNotes,
  researchOnly: true,
  authority,
  safety
});

export const readIctNewsSessionRiskJournalEvents = (): IctNewsSessionRiskJournalEvent[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(NEWS_SESSION_RISK_JOURNAL_STORAGE_KEY) ?? "[]") as IctNewsSessionRiskJournalEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((event) => event.eventType === "ict_news_session_risk_summary" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const appendIctNewsSessionRiskJournalEvents = (events: IctNewsSessionRiskJournalEvent[]) => {
  const sanitized = events.map((event) => ({ ...event, researchOnly: true as const, authority, safety }));
  if (!isBrowser()) {
    return { ok: true, storage: "memory_unavailable" as const, events: sanitized };
  }
  const current = readIctNewsSessionRiskJournalEvents();
  const next = [...current, ...sanitized].slice(-MAX_NEWS_SESSION_RISK_JOURNAL_EVENTS);
  window.localStorage.setItem(NEWS_SESSION_RISK_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, events: sanitized, totalEvents: next.length };
};

export const assertIctNewsSessionRiskOutputIsCompact = (value: unknown) => {
  const serialized = JSON.stringify(value);
  return {
    ok:
      !/"candles"\s*:/i.test(serialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};

export const summarizeNewsSessionRisk = (decision?: IctNewsSessionRiskDecision) =>
  decision
    ? `${decision.newsRiskLevel} news / ${decision.session.sessionName.replace(/_/g, " ")} ${decision.sessionRiskState} / ${decision.riskGovernorAction.replace(/_/g, " ")}`
    : "Risk governor pending";

export const riskGovernorBadgeVariant = (decision?: Pick<IctNewsSessionRiskDecision, "riskGovernorAction" | "sessionRiskState">) =>
  decision?.riskGovernorAction === "reject_candidate" || decision?.riskGovernorAction === "no_trade" || decision?.sessionRiskState === "avoid"
    ? "blocked"
    : decision?.riskGovernorAction === "downgrade_to_watchlist" || decision?.sessionRiskState === "caution"
      ? "caution"
      : "clear";

export const adjustConfidenceByNewsSessionRisk = (confidence: number, decision?: IctNewsSessionRiskDecision) =>
  decision ? round(clamp(confidence + decision.riskGovernorConfidenceAdjustment)) : round(clamp(confidence));
