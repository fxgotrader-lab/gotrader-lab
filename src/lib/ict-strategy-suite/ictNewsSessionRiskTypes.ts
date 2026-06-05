export type IctNewsRiskLevel = "none" | "low" | "medium" | "high" | "blocked" | "unknown";
export type IctSessionName =
  | "asia"
  | "london"
  | "new_york_am"
  | "new_york_lunch"
  | "new_york_pm"
  | "after_hours"
  | "unknown";
export type IctSessionRiskState = "preferred" | "acceptable" | "caution" | "avoid" | "unknown";
export type IctRiskGovernorAction = "allow" | "downgrade_to_watchlist" | "reject_candidate" | "no_trade";

export interface IctNewsSessionEconomicEventInput {
  eventId?: string;
  title?: string;
  eventName?: string;
  name?: string;
  reason?: string;
  country?: string;
  currency?: string;
  impact?: "low" | "medium" | "high" | "unknown" | string;
  scheduledAt?: string;
  date?: string;
  datetime?: string;
}

export interface IctNewsSessionMacroRiskFlagInput {
  flagId?: string;
  severity?: "block" | "reduce_risk" | "monitor" | "high" | "medium" | "low" | string;
  reason?: string;
  eventId?: string;
  windowStart?: string;
  windowEnd?: string;
  generatedAt?: string;
}

export interface IctNewsSessionRiskContextInput {
  provider?: string;
  generatedAt?: string;
  timingZone?: string;
  syntheticNoRisk?: boolean;
  economicEvents?: IctNewsSessionEconomicEventInput[];
  macroRiskFlags?: IctNewsSessionMacroRiskFlagInput[];
  spreadState?: "normal" | "elevated" | "extreme" | "unknown";
  volatilityState?: "normal" | "elevated" | "extreme" | "unknown";
}

export interface IctEconomicEventRisk {
  eventId: string;
  title: string;
  country?: string;
  currency?: string;
  impact: "low" | "medium" | "high" | "unknown";
  scheduledAt?: string;
  minutesFromEvent?: number;
  riskLevel: IctNewsRiskLevel;
  matchedRule: string;
  reason: string;
  windowStart?: string;
  windowEnd?: string;
}

export interface IctSessionRiskContext {
  timingZone: string;
  sourceTimestampZone: "UTC" | "unknown";
  timestamp: string;
  localDate: string;
  localTime: string;
  sessionName: IctSessionName;
  sessionRiskState: IctSessionRiskState;
  reason: string;
}

export interface IctNewsSessionRiskDecision {
  researchOnly: true;
  newsRiskLevel: IctNewsRiskLevel;
  sessionRiskState: IctSessionRiskState;
  riskGovernorAction: IctRiskGovernorAction;
  riskGovernorConfidenceAdjustment: number;
  blockingEventsCount: number;
  cautionEventsCount: number;
  blockingEvents: IctEconomicEventRisk[];
  cautionEvents: IctEconomicEventRisk[];
  session: IctSessionRiskContext;
  newsSessionRiskNotes: string[];
  provider?: string;
  generatedAt: string;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}

export interface IctNewsSessionRiskJournalEvent {
  eventType: "ict_news_session_risk_summary";
  journalEventId: string;
  generatedAt: string;
  strategyId?: string;
  symbol: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  newsRiskLevel: IctNewsRiskLevel;
  sessionRiskState: IctSessionRiskState;
  riskGovernorAction: IctRiskGovernorAction;
  riskGovernorConfidenceAdjustment: number;
  blockingEventsCount: number;
  cautionEventsCount: number;
  compactBlockingEvents: Array<Pick<IctEconomicEventRisk, "eventId" | "impact" | "matchedRule" | "minutesFromEvent" | "riskLevel" | "title">>;
  compactCautionEvents: Array<Pick<IctEconomicEventRisk, "eventId" | "impact" | "matchedRule" | "minutesFromEvent" | "riskLevel" | "title">>;
  sessionName: IctSessionName;
  timingZone: string;
  localDate: string;
  localTime: string;
  newsSessionRiskNotes: string[];
  researchOnly: true;
  authority: IctNewsSessionRiskDecision["authority"];
  safety: IctNewsSessionRiskDecision["safety"];
}
