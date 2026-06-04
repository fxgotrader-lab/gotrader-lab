import type { ResearchDecisionAuthority } from "@/lib/researchDecisionLog";

export type PaperDemoChecklistItemStatus = "pass" | "fail" | "warning" | "not_applicable";

export type PaperDemoChecklistItemId =
  | "source_quality_valid"
  | "source_provider_labeled"
  | "minimum_trade_sample"
  | "walk_forward_oos_trade_count"
  | "walk_forward_pass_rate"
  | "evidence_score_threshold"
  | "maturity_score_threshold"
  | "regime_evidence_sufficient"
  | "grinch_ict_profile_evidence"
  | "conservative_scenario_stable"
  | "simulation_runbook_complete"
  | "false_positive_rate_acceptable"
  | "risk_policy_complete"
  | "advisory_reviewed"
  | "no_authority_violations";

export interface PaperDemoChecklistItem {
  id: PaperDemoChecklistItemId;
  label: string;
  status: PaperDemoChecklistItemStatus;
  currentValue: string;
  requiredValue: string;
  blockerReason: string;
  nextAction: string;
  proposalEligible: boolean;
}

export interface PaperDemoChecklistSummary {
  checklistId: string;
  generatedAt: string;
  researchReady: boolean;
  paperDemoCandidate: boolean;
  passCount: number;
  failCount: number;
  warningCount: number;
  notApplicableCount: number;
  primaryBlocker: string;
  nextAction: string;
  sourceContext: {
    provider: string;
    requestedSymbol: string;
    brokerSymbol?: string;
    timeframe?: string;
    candleCount: number;
    sourceFingerprint?: string;
    sourceLabel: string;
    proxyWarning?: string;
  };
  items: PaperDemoChecklistItem[];
  proposalEligibleBlockers: PaperDemoChecklistItem[];
  authority: ResearchDecisionAuthority;
  safetyNotice: "Checklist is reporting-only. It cannot promote readiness, place orders, or override authority.";
}
