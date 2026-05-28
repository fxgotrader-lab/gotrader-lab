import type { PaperclipAgentOperationsPolicy, PaperclipTaskPolicy } from "@/lib/integrations/paperclipTypes";

export const paperclipAllowedTaskTypes: PaperclipTaskPolicy[] = [
  {
    taskType: "schedule_research_routine",
    label: "Schedule research routines",
    allowed: true,
    reason: "Research-only schedules can create review work without changing trading state."
  },
  {
    taskType: "create_work_ticket",
    label: "Create work tickets",
    allowed: true,
    reason: "Tickets can ask Codex, OpenClaw, or Hermes to review or document research issues."
  },
  {
    taskType: "track_budget",
    label: "Track budgets",
    allowed: true,
    reason: "Budget and cost ceilings help prevent runaway agent work."
  },
  {
    taskType: "store_research_report",
    label: "Store research reports",
    allowed: true,
    reason: "Reports are work products and should link back to AI Lab runtime fingerprints."
  },
  {
    taskType: "monitor_agent_heartbeat",
    label: "Monitor agent heartbeats",
    allowed: true,
    reason: "Heartbeats are operations telemetry and do not alter readiness or strategy state."
  },
  {
    taskType: "request_agent_work",
    label: "Request OpenClaw/Hermes/Codex work",
    allowed: true,
    reason: "External agent work is allowed when it remains advisory or implementation-review oriented."
  }
];

export const paperclipForbiddenTaskTypes: PaperclipTaskPolicy[] = [
  {
    taskType: "trade_execution",
    label: "Trade execution",
    allowed: false,
    reason: "Paperclip has no order authority."
  },
  {
    taskType: "readiness_approval",
    label: "Readiness approval",
    allowed: false,
    reason: "AI Lab readiness gates and human review remain authoritative."
  },
  {
    taskType: "go_trader_handoff",
    label: "go-trader handoff",
    allowed: false,
    reason: "Paperclip cannot send or approve execution handoffs."
  },
  {
    taskType: "broker_connection",
    label: "Broker connection",
    allowed: false,
    reason: "Broker connectivity is outside the Paperclip operations boundary."
  },
  {
    taskType: "api_key_change",
    label: "API key changes",
    allowed: false,
    reason: "Credentials must never be changed from a planning/control-plane card."
  },
  {
    taskType: "safety_override",
    label: "Safety override",
    allowed: false,
    reason: "Safety locks cannot be disabled by Paperclip."
  }
];

export const paperclipAgentOperationsPolicy: PaperclipAgentOperationsPolicy = {
  status: "planned_evaluation",
  statusLabel: "planned / evaluation",
  role: "external_task_orchestration_and_agent_governance",
  roleLabel: "external task orchestration and agent governance",
  authority: "task_orchestration_only",
  authorityLabel: "task orchestration only",
  liveIntegration: "not_connected",
  sourceOfTruth: "gotrader_ai_lab",
  allowedFutureUses: paperclipAllowedTaskTypes.map(({ label, reason, taskType }) => ({
    id: taskType,
    label,
    description: reason
  })),
  forbiddenUses: paperclipForbiddenTaskTypes.map(({ label, reason, taskType }) => ({
    id: taskType,
    label,
    description: reason
  })),
  allowedTaskTypes: paperclipAllowedTaskTypes,
  forbiddenTaskTypes: paperclipForbiddenTaskTypes,
  authorityBlock: {
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    goTraderHandoffAuthority: "none",
    credentialAuthority: "none",
    safetyOverrideAuthority: "none"
  },
  safetyNotice:
    "Paperclip is planned as an external agent-operations layer only. AI Lab remains the source of truth for metrics, readiness, proposals, and safety gates."
};

export function isPaperclipTaskAllowed(taskType: string) {
  if (paperclipAllowedTaskTypes.some((task) => task.taskType === taskType)) {
    return true;
  }
  return false;
}
