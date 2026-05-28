export type PaperclipIntegrationStatus = "planned_evaluation";
export type PaperclipConnectionStatus = "not_connected";
export type PaperclipAuthorityValue = "none" | "task_orchestration_only";

export interface PaperclipAuthorityBlock {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
  goTraderHandoffAuthority: "none";
  credentialAuthority: "none";
  safetyOverrideAuthority: "none";
}

export interface PaperclipUseCase {
  id: string;
  label: string;
  description: string;
}

export interface PaperclipTaskPolicy {
  taskType: string;
  label: string;
  allowed: boolean;
  reason: string;
}

export interface PaperclipAgentOperationsPolicy {
  status: PaperclipIntegrationStatus;
  statusLabel: string;
  role: string;
  roleLabel: string;
  authority: PaperclipAuthorityValue;
  authorityLabel: string;
  liveIntegration: PaperclipConnectionStatus;
  sourceOfTruth: "gotrader_ai_lab";
  allowedFutureUses: PaperclipUseCase[];
  forbiddenUses: PaperclipUseCase[];
  allowedTaskTypes: PaperclipTaskPolicy[];
  forbiddenTaskTypes: PaperclipTaskPolicy[];
  authorityBlock: PaperclipAuthorityBlock;
  safetyNotice: string;
}
