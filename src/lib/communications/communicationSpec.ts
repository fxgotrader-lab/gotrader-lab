import type {
  AgentMessageAuditEntry,
  CommunicationSeverity,
  InAppCommunicationSpec,
} from "@/lib/communications/communicationTypes";
import type { ReadinessState } from "@/lib/readiness";
import type { ResearchCycleStatus } from "@/lib/researchCycle";
import { uid } from "@/lib/utils";

const now = new Date();
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
export const COMMUNICATION_AUDIT_STORAGE_KEY = "gotrader_ai_lab_communication_audit";
export const COMMUNICATION_AUDIT_UPDATED_EVENT = "gotrader-ai-lab-communication-audit-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const mockAgentMessages: AgentMessageAuditEntry[] = [
  {
    messageId: "msg_openclaw_memory_planned",
    timestamp: minutesAgo(5),
    source: "openclaw_memory",
    agentName: "OpenClaw Advisory Memory",
    category: "openclaw_memory_note",
    severity: "info",
    title: "OpenClaw memory hook planned",
    summary: "Future memory packets can preserve blocker diagnosis, scenario reasoning, and proposal review context.",
    body:
      "OpenClaw memory hooks are advisory-memory only. They can store failure analysis and scenario recommendations later, but they cannot execute trades, approve readiness, change broker settings, or send go-trader handoffs.",
    actionRequired: false,
    userResponse: "acknowledged",
    resolved: true,
    safetyNotice: "Research communication only. No execution authority.",
  },
  {
    messageId: "msg_hermes_notifications_planned",
    timestamp: minutesAgo(6),
    source: "hermes_notification_router",
    agentName: "Hermes Notification Router",
    category: "hermes_notification",
    severity: "info",
    title: "Hermes notification hook planned",
    summary: "Hermes may later route notifications for loop events, but the app remains the approval source of truth.",
    body:
      "Hermes notification payloads are route-only messages with authority set to none. They may point the user back to GoTrader AI Lab, but cannot accept approvals or execute any research, broker, or readiness action.",
    actionRequired: false,
    userResponse: "acknowledged",
    resolved: true,
    safetyNotice: "Research communication only. No execution authority.",
  },
  {
    messageId: "msg_readiness_llm_required",
    timestamp: minutesAgo(8),
    source: "readiness_gate",
    agentName: "Readiness Gate",
    category: "readiness_warning",
    severity: "action_required",
    title: "LLM advisory review still required",
    summary: "Paper-Demo Candidate remains blocked until a configured LLM advisory review passes.",
    body:
      "The readiness gate can support Research Ready with deterministic evidence, but Paper-Demo Candidate requires the secure LLM advisory layer to pass. Start the local bridge, run GPT Advisory Review, then rerun readiness.",
    relatedReadinessGateId: "readiness_gate_latest",
    actionRequired: true,
    requestedAction: "explain_readiness_failure",
    userResponse: "no_response",
    resolved: false,
    safetyNotice: "Research communication only. No execution authority.",
  },
  {
    messageId: "msg_validation_drawdown_watch",
    timestamp: minutesAgo(32),
    source: "validation_engine",
    agentName: "Validation Engine",
    category: "validation_alert",
    severity: "warning",
    title: "Drawdown cluster needs review",
    summary: "Conservative settings should be checked before accepting any aggressive candidate.",
    body:
      "Latest validation evidence should be compared against conservative thresholds. If drawdown remains elevated, increase confluence or confidence thresholds and compare NY AM against London before changing multiple variables.",
    relatedValidationId: "validation_latest",
    actionRequired: true,
    requestedAction: "rerun_validation",
    userResponse: "deferred",
    resolved: false,
    safetyNotice: "Research communication only. No execution authority.",
  },
  {
    messageId: "msg_self_improvement_candidate",
    timestamp: minutesAgo(65),
    source: "self_improvement",
    agentName: "Self-Improvement Supervisor",
    category: "self_improvement_proposal_alert",
    severity: "action_required",
    title: "Calibration proposal awaiting review",
    summary: "A proposal can be tested and approved only inside the app.",
    body:
      "Review the before/after metrics and confirm the change improves stability, not just profit. The proposal cannot change broker settings, enable paper/live mode, or override readiness gates.",
    relatedProposalId: "proposal_latest",
    actionRequired: true,
    requestedAction: "approve_calibration_proposal",
    userResponse: "no_response",
    resolved: false,
    safetyNotice: "Research communication only. No execution authority.",
  },
  {
    messageId: "msg_bridge_safe_cycle",
    timestamp: minutesAgo(90),
    source: "simulation_bridge",
    agentName: "Simulation Bridge Monitor",
    category: "simulation_bridge_status",
    severity: "info",
    title: "Scheduler one-cycle verification available",
    summary: "The expected bridge check is broker execution skipped, positions 0, trades 0.",
    body:
      "Record the scheduler one-cycle result in the simulation runbook after verifying the log shows the AI Lab handoff signal and explicitly reports broker execution skipped.",
    actionRequired: false,
    userResponse: "acknowledged",
    resolved: true,
    safetyNotice: "Research communication only. No execution authority.",
  },
  {
    messageId: "msg_risk_no_external_chat",
    timestamp: minutesAgo(140),
    source: "risk_monitor",
    agentName: "Risk Monitor",
    category: "risk_warning",
    severity: "critical",
    title: "Keep approvals inside AI Lab",
    summary: "Discord, Telegram, and Hermes should be notification layers only.",
    body:
      "Approval prompts should remain inside GoTrader AI Lab so every response can be stored with the research audit trail. External public chat should not contain API keys, broker commands, or trade execution language.",
    actionRequired: true,
    requestedAction: "acknowledge_readiness_blocker",
    userResponse: "no_response",
    resolved: false,
    safetyNotice: "Research communication only. No execution authority.",
  },
];

export const inAppCommunicationSpec: InAppCommunicationSpec = {
  primaryChannel: "gotrader_ai_lab",
  externalChannels: [
    "discord_optional_notifications",
    "telegram_optional_notifications",
    "hermes_optional_routing",
  ],
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none",
  publicChatDefault: "disabled",
  supportedMessageCategories: [
    "llm_advisor_message",
    "openclaw_supervisor_message",
    "openclaw_memory_note",
    "hermes_notification",
    "validation_alert",
    "self_improvement_proposal_alert",
    "readiness_warning",
    "simulation_bridge_status",
    "risk_warning",
    "approval_prompt",
    "research_note",
  ],
  supportedUserRequests: [
    "review_this_thesis",
    "explain_readiness_failure",
    "find_weak_configuration",
    "propose_one_calibration",
    "summarize_validation",
    "prepare_pre_session_review",
    "prepare_post_session_review",
  ],
  supportedApprovalPrompts: [
    "approve_calibration_proposal",
    "reject_calibration_proposal",
    "rerun_validation",
    "mark_research_note_reviewed",
    "acknowledge_readiness_blocker",
  ],
  notificationPriorities: ["info", "warning", "critical", "action_required"],
  safetyConstraints: [
    "No trade execution commands.",
    "No broker control.",
    "No readiness override.",
    "No API key display.",
    "No external public chat by default.",
    "Approvals must be recorded inside the app audit trail.",
  ],
  sampleMessages: mockAgentMessages,
};

export function loadStoredCommunicationMessages(): AgentMessageAuditEntry[] {
  if (!isBrowser()) {
    return [];
  }

  const raw = window.localStorage.getItem(COMMUNICATION_AUDIT_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as AgentMessageAuditEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadCommunicationMessages(): AgentMessageAuditEntry[] {
  return [...loadStoredCommunicationMessages(), ...mockAgentMessages].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function saveCommunicationMessages(messages: AgentMessageAuditEntry[]) {
  if (!isBrowser()) {
    return messages;
  }

  window.localStorage.setItem(COMMUNICATION_AUDIT_STORAGE_KEY, JSON.stringify(messages.slice(0, 80)));
  window.dispatchEvent(new CustomEvent(COMMUNICATION_AUDIT_UPDATED_EVENT, { detail: messages }));
  return messages;
}

export function recordCommunicationMessage(
  message: Omit<AgentMessageAuditEntry, "messageId" | "timestamp" | "safetyNotice" | "userResponse" | "resolved"> &
    Partial<Pick<AgentMessageAuditEntry, "messageId" | "timestamp" | "userResponse" | "resolved">>
) {
  const entry: AgentMessageAuditEntry = {
    ...message,
    messageId: message.messageId ?? uid("msg"),
    timestamp: message.timestamp ?? new Date().toISOString(),
    userResponse: message.userResponse ?? "no_response",
    resolved: message.resolved ?? false,
    safetyNotice: "Research communication only. No execution authority.",
  };
  const stored = loadStoredCommunicationMessages();
  return saveCommunicationMessages([entry, ...stored.filter((item) => item.messageId !== entry.messageId)]);
}

export function recordResearchCycleCommunication({
  actionRequired,
  cycleId,
  proposalId,
  readinessState,
  status,
  summary,
  validationId,
}: {
  actionRequired: boolean;
  cycleId: string;
  proposalId?: string;
  readinessState?: ReadinessState;
  status: ResearchCycleStatus;
  summary: string;
  validationId?: string;
}) {
  const severity: CommunicationSeverity =
    status === "failed" ? "critical" : actionRequired ? "action_required" : "info";
  const title =
    status === "failed"
      ? "AI research cycle failed"
      : actionRequired
        ? "AI research cycle completed with required review"
        : "AI research cycle completed";

  return recordCommunicationMessage({
    source: "openclaw_research_supervisor",
    agentName: "AI Research Cycle Supervisor",
    category: "openclaw_supervisor_message",
    severity,
    title,
    summary,
    body: [
      `Cycle ${cycleId} completed with status ${status}.`,
      `Readiness: ${readinessState ?? "not evaluated"}.`,
      proposalId
        ? `A self-improvement proposal was created (${proposalId}) and still requires user approval.`
        : "No active settings were changed.",
      "Broker execution, live trading, order placement, and readiness override remained disabled."
    ].join(" "),
    relatedProposalId: proposalId,
    relatedValidationId: validationId,
    relatedReadinessGateId: readinessState ? "readiness_gate_latest" : undefined,
    actionRequired,
    requestedAction: proposalId ? "approve_calibration_proposal" : actionRequired ? "acknowledge_readiness_blocker" : undefined,
  });
}

export function getCommunicationSummary(messages = loadCommunicationMessages()) {
  const unreadMessages = messages.filter((message) => !message.resolved).length;
  const actionRequiredCount = messages.filter((message) => message.actionRequired && !message.resolved).length;
  const latestAgentMessage = messages[0];
  const latestCriticalWarning = messages.find((message) => message.severity === "critical");

  return {
    unreadMessages,
    actionRequiredCount,
    latestAgentMessage,
    latestCriticalWarning,
  };
}
