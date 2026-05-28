import type { AgentBridgeJournalStatus, JournalEvent, RiskDecision, StrategyCandidate } from "@/lib/agentBridge";

export const TRADE_JOURNAL_EVENT_VERSION = "trade_journal_event_v1" as const;

export const journalStatusForRiskDecision = (riskDecision: RiskDecision): AgentBridgeJournalStatus =>
  riskDecision.approved ? "approved" : "rejected";

export const createTradeJournalEvent = ({
  candidate,
  journalEntryId,
  reason,
  riskDecision,
  status = journalStatusForRiskDecision(riskDecision)
}: {
  candidate: StrategyCandidate;
  journalEntryId: string;
  reason?: string;
  riskDecision: RiskDecision;
  status?: AgentBridgeJournalStatus;
}): JournalEvent => ({
  journalEntryId,
  signalId: candidate.signalId,
  riskDecisionId: riskDecision.riskDecisionId,
  status,
  reason: reason ?? riskDecision.rejectReasons[0] ?? "Risk decision recorded.",
  timestamp: new Date().toISOString(),
  decisionVersion: candidate.decisionVersion,
  strategyVersion: candidate.strategyVersion,
  marketSnapshotId: candidate.marketSnapshotId,
  sentimentSnapshotId: candidate.sentimentSnapshotId,
  riskPolicyVersion: riskDecision.riskPolicyVersion,
  macroRiskFlags: riskDecision.macroRiskFlags ?? candidate.macroRiskFlags ?? [],
  agentChain: [...candidate.agentChain, "trade_journal_event_builder"]
});
