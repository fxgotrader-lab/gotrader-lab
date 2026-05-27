export type CommunicationSource =
  | "llm_advisor"
  | "openclaw_research_supervisor"
  | "openclaw_memory"
  | "hermes_notification_router"
  | "validation_engine"
  | "self_improvement"
  | "readiness_gate"
  | "simulation_bridge"
  | "risk_monitor"
  | "user";

export type CommunicationCategory =
  | "llm_advisor_message"
  | "openclaw_supervisor_message"
  | "openclaw_memory_note"
  | "hermes_notification"
  | "validation_alert"
  | "self_improvement_proposal_alert"
  | "readiness_warning"
  | "simulation_bridge_status"
  | "risk_warning"
  | "approval_prompt"
  | "research_note";

export type CommunicationSeverity = "info" | "warning" | "critical" | "action_required";

export type UserAgentRequestType =
  | "review_this_thesis"
  | "explain_readiness_failure"
  | "find_weak_configuration"
  | "propose_one_calibration"
  | "summarize_validation"
  | "prepare_pre_session_review"
  | "prepare_post_session_review";

export type ApprovalPromptType =
  | "approve_calibration_proposal"
  | "reject_calibration_proposal"
  | "rerun_validation"
  | "mark_research_note_reviewed"
  | "acknowledge_readiness_blocker";

export type CommunicationUserResponse =
  | "approved"
  | "rejected"
  | "acknowledged"
  | "deferred"
  | "no_response";

export interface AgentMessageAuditEntry {
  messageId: string;
  timestamp: string;
  source: CommunicationSource;
  agentName: string;
  category: CommunicationCategory;
  severity: CommunicationSeverity;
  title: string;
  summary: string;
  body: string;
  relatedThesisId?: string;
  relatedProposalId?: string;
  relatedValidationId?: string;
  relatedReadinessGateId?: string;
  actionRequired: boolean;
  requestedAction?: ApprovalPromptType | UserAgentRequestType;
  userResponse: CommunicationUserResponse;
  resolved: boolean;
  safetyNotice: "Research communication only. No execution authority.";
}

export interface InAppCommunicationSpec {
  primaryChannel: "gotrader_ai_lab";
  externalChannels: Array<"discord_optional_notifications" | "telegram_optional_notifications" | "hermes_optional_routing">;
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
  publicChatDefault: "disabled";
  supportedMessageCategories: CommunicationCategory[];
  supportedUserRequests: UserAgentRequestType[];
  supportedApprovalPrompts: ApprovalPromptType[];
  notificationPriorities: CommunicationSeverity[];
  safetyConstraints: string[];
  sampleMessages: AgentMessageAuditEntry[];
}
