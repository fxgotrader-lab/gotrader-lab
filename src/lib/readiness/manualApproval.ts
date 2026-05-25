import type { ResearchQualityReview } from "@/lib/researchQuality";
import type { SimulationRunbookState } from "@/lib/simulationRunbook";
import type { ValidationSuiteReport } from "@/lib/validation";
import type {
  ManualApprovalAction,
  ManualApprovalAuditEntry,
  ManualApprovalRecord,
  ReadinessGateSnapshot
} from "@/lib/readiness/readinessTypes";

export const READINESS_APPROVAL_STORAGE_KEY = "gotrader_ai_lab_readiness_manual_approval";
export const READINESS_APPROVAL_UPDATED_EVENT = "gotrader-ai-lab-readiness-approval-updated";

export const defaultManualApprovalRecord: ManualApprovalRecord = {
  status: "none",
  reviewerName: "",
  approvalNotes: "",
  rejectionNotes: "",
  auditTrail: []
};

const auditEntry = (
  action: ManualApprovalAction,
  gate: ReadinessGateSnapshot,
  reviewerName: string,
  notes: string
): ManualApprovalAuditEntry => ({
  id: `readiness_audit_${Date.now()}`,
  action,
  timestamp: new Date().toISOString(),
  reviewerName: reviewerName.trim() || "local user",
  notes: notes.trim(),
  readinessState: gate.state
});

const save = (record: ManualApprovalRecord) => {
  if (typeof window === "undefined") {
    return record;
  }
  window.localStorage.setItem(READINESS_APPROVAL_STORAGE_KEY, JSON.stringify(record));
  window.dispatchEvent(new CustomEvent(READINESS_APPROVAL_UPDATED_EVENT, { detail: record }));
  return record;
};

export function loadManualApprovalRecord(): ManualApprovalRecord {
  if (typeof window === "undefined") {
    return defaultManualApprovalRecord;
  }
  const raw = window.localStorage.getItem(READINESS_APPROVAL_STORAGE_KEY);
  if (!raw) {
    return defaultManualApprovalRecord;
  }
  try {
    return {
      ...defaultManualApprovalRecord,
      ...(JSON.parse(raw) as ManualApprovalRecord)
    };
  } catch {
    return defaultManualApprovalRecord;
  }
}

export function approveDemoCandidate({
  gate,
  reviewerName,
  notes,
  validation,
  quality,
  runbook
}: {
  gate: ReadinessGateSnapshot;
  reviewerName: string;
  notes: string;
  validation?: ValidationSuiteReport;
  quality?: ResearchQualityReview;
  runbook?: SimulationRunbookState;
}) {
  const current = loadManualApprovalRecord();
  const entry = auditEntry("approved", gate, reviewerName, notes);
  return save({
    ...current,
    status: "approved",
    reviewerName: entry.reviewerName,
    approvalNotes: entry.notes,
    approvedAt: entry.timestamp,
    latestGate: gate,
    latestValidationSnapshot: validation,
    latestResearchQualitySnapshot: quality,
    latestRunbookSnapshot: runbook,
    auditTrail: [entry, ...current.auditTrail]
  });
}

export function rejectDemoCandidate(gate: ReadinessGateSnapshot, reviewerName: string, notes: string) {
  const current = loadManualApprovalRecord();
  const entry = auditEntry("rejected", gate, reviewerName, notes);
  return save({
    ...current,
    status: "rejected",
    reviewerName: entry.reviewerName,
    rejectionNotes: entry.notes,
    rejectedAt: entry.timestamp,
    latestGate: gate,
    auditTrail: [entry, ...current.auditTrail]
  });
}

export function pauseReadiness(gate: ReadinessGateSnapshot, reviewerName: string, notes: string) {
  const current = loadManualApprovalRecord();
  const entry = auditEntry("paused", gate, reviewerName, notes);
  return save({
    ...current,
    status: "paused",
    reviewerName: entry.reviewerName,
    pausedAt: entry.timestamp,
    latestGate: gate,
    auditTrail: [entry, ...current.auditTrail]
  });
}

export function resetReadinessApproval(gate: ReadinessGateSnapshot, reviewerName = "local user", notes = "Manual readiness reset.") {
  const current = loadManualApprovalRecord();
  const entry = auditEntry("reset", gate, reviewerName, notes);
  return save({
    ...defaultManualApprovalRecord,
    resetAt: entry.timestamp,
    latestGate: gate,
    auditTrail: [entry, ...current.auditTrail]
  });
}

export function latestApprovalTimestamp(record: ManualApprovalRecord) {
  return record.approvedAt ?? record.rejectedAt ?? record.pausedAt ?? record.resetAt;
}
