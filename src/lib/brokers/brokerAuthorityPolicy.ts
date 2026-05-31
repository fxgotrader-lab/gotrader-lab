import type {
  BrokerAccountMode,
  BrokerJournalEvent,
  BrokerRiskControls,
  BrokerRiskDecision,
  BrokerRoute,
  BrokerStrategyCandidate,
  ExecutionIntent,
  ExecutionResult
} from "@/lib/brokers/brokerTypes";

export const MULTI_BROKER_AUTHORITY_POLICY_VERSION = "multi_broker_authority_research_only_v1" as const;

export const defaultBrokerRiskControls: BrokerRiskControls = {
  maxDailyLoss: 0,
  maxTradesPerDay: 0,
  maxRiskPerTrade: 0,
  positionSizing: "disabled",
  spreadCheckRequired: true,
  slippageCheckRequired: true,
  sessionFilterRequired: true,
  newsFilterRequired: true,
  duplicatePositionCheckRequired: true,
  cooldownCheckRequired: true,
  accountModeCheckRequired: true,
  brokerRouteCheckRequired: true,
  readinessGateRequired: true
};

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const createBlockedResearchRiskDecision = ({
  candidate,
  reason = "Phase 1 broker architecture is research-only. Risk Manager blocks execution."
}: {
  candidate: BrokerStrategyCandidate;
  reason?: string;
}): BrokerRiskDecision => ({
  decisionId: createId("broker_risk_decision"),
  candidateId: candidate.candidateId,
  status: candidate.direction === "no_trade" || candidate.direction === "flat" ? "no_trade" : "rejected",
  reason,
  maxRisk: null,
  positionSize: null,
  maxDailyLossRemaining: null,
  spreadCheck: "not_checked",
  slippageCheck: "not_checked",
  sessionCheck: "not_checked",
  newsCheck: "not_checked",
  correlationCheck: "not_checked",
  rejectionReasons: [
    reason,
    "TradingView evidence cannot approve execution.",
    "Broker adapters are locked until explicit dry-run/paper/live phases."
  ],
  timestamp: new Date().toISOString()
});

export const canCreateExecutionIntent = ({
  accountMode,
  riskDecision,
  route
}: {
  accountMode: BrokerAccountMode;
  riskDecision: BrokerRiskDecision;
  route: BrokerRoute;
}): boolean =>
  accountMode !== "research" &&
  route.broker !== "none" &&
  route.executionAuthority !== "none" &&
  riskDecision.status === "approved" &&
  !riskDecision.rejectionReasons.length;

export const createBlockedExecutionIntent = ({
  candidate,
  reason = "Execution intent blocked in research mode.",
  riskDecision,
  route
}: {
  candidate: BrokerStrategyCandidate;
  reason?: string;
  riskDecision: BrokerRiskDecision;
  route: BrokerRoute;
}): ExecutionIntent => ({
  intentId: createId("execution_intent"),
  candidateId: candidate.candidateId,
  brokerRouteId: route.routeId,
  symbol: route.symbol,
  direction: candidate.direction,
  orderType: "none",
  entry: null,
  stop: candidate.invalidation,
  targets: candidate.targets,
  positionSize: null,
  accountMode: route.accountMode,
  status: "blocked",
  riskDecisionRef: riskDecision.decisionId,
  journalRefs: [],
  createdAt: new Date().toISOString(),
  executionAuthority: "none"
});

export const createBlockedExecutionResult = ({
  broker,
  intent,
  reason = "Execution blocked. No broker call was made."
}: {
  broker: BrokerRoute["broker"];
  intent: ExecutionIntent;
  reason?: string;
}): ExecutionResult => ({
  resultId: createId("execution_result"),
  intentId: intent.intentId,
  broker,
  mode: intent.accountMode,
  status: "blocked",
  rejectionReason: reason,
  timestamp: new Date().toISOString()
});

export const createBrokerJournalEvent = ({
  candidate,
  evaluatorDecision = "no_trade",
  executionIntent,
  executionResult,
  rejectionReason,
  riskDecision,
  route,
  runtimeFingerprint,
  sourceRefs = []
}: {
  candidate: BrokerStrategyCandidate;
  evaluatorDecision?: BrokerJournalEvent["evaluatorDecision"];
  executionIntent: ExecutionIntent;
  executionResult?: ExecutionResult;
  rejectionReason?: string;
  riskDecision: BrokerRiskDecision;
  route: BrokerRoute;
  runtimeFingerprint?: string;
  sourceRefs?: string[];
}): BrokerJournalEvent => ({
  eventId: createId("broker_journal_event"),
  type: executionResult ? "execution_result_blocked" : "execution_intent_blocked",
  timestamp: new Date().toISOString(),
  symbol: route.symbol,
  strategyId: candidate.strategyId,
  sourceRefs,
  evaluatorDecision,
  riskDecision,
  brokerRoute: route,
  executionIntent,
  executionResult,
  rejectionReason: rejectionReason ?? riskDecision.rejectionReasons[0] ?? "Broker authority blocked.",
  provenance: {
    decisionVersion: MULTI_BROKER_AUTHORITY_POLICY_VERSION,
    strategyVersion: candidate.strategyId,
    riskPolicyVersion: MULTI_BROKER_AUTHORITY_POLICY_VERSION,
    runtimeFingerprint,
    sourceRefs,
    generatedAt: new Date().toISOString()
  },
  runtimeFingerprint
});
