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
const COMMUNICATION_AUDIT_STATUS_KEY = "gotrader_ai_lab_communication_audit_status";
const DB_NAME = "gotrader-ai-lab-communications";
const DB_VERSION = 1;
const AUDIT_STORE = "communication_audit_events";
const LOCAL_STORAGE_MESSAGE_LIMIT = 40;
const INDEXED_DB_MESSAGE_LIMIT = 250;
const MAX_TITLE_LENGTH = 140;
const MAX_SUMMARY_LENGTH = 360;
const MAX_BODY_LENGTH = 1200;
const OVERSIZED_LOCAL_STORAGE_BYTES = 500_000;
let sessionCommunicationMessages: AgentMessageAuditEntry[] = [];

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const hasIndexedDb = () => typeof indexedDB !== "undefined";

export interface CommunicationAuditStorageStatus {
  backend: "indexeddb" | "compact_localStorage" | "session_fallback";
  eventCount: number;
  lastCleanupAt?: string;
  lastError?: string;
  localStorageBytes: number;
}

const truncate = (value: string | undefined, max: number) => {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
};

const compactMessage = (message: AgentMessageAuditEntry): AgentMessageAuditEntry => ({
  messageId: message.messageId,
  timestamp: message.timestamp,
  source: message.source,
  agentName: truncate(message.agentName, 96),
  category: message.category,
  severity: message.severity,
  title: truncate(message.title, MAX_TITLE_LENGTH),
  summary: truncate(message.summary, MAX_SUMMARY_LENGTH),
  body: truncate(message.body, MAX_BODY_LENGTH),
  relatedThesisId: message.relatedThesisId ? truncate(message.relatedThesisId, 128) : undefined,
  relatedProposalId: message.relatedProposalId ? truncate(message.relatedProposalId, 128) : undefined,
  relatedValidationId: message.relatedValidationId ? truncate(message.relatedValidationId, 128) : undefined,
  relatedReadinessGateId: message.relatedReadinessGateId ? truncate(message.relatedReadinessGateId, 128) : undefined,
  actionRequired: Boolean(message.actionRequired),
  requestedAction: message.requestedAction,
  userResponse: message.userResponse ?? "no_response",
  resolved: Boolean(message.resolved),
  safetyNotice: "Research communication only. No execution authority.",
});

const compactMessages = (messages: AgentMessageAuditEntry[], limit = LOCAL_STORAGE_MESSAGE_LIMIT) =>
  messages
    .filter((message) => message?.messageId && message?.timestamp)
    .map(compactMessage)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);

const mergeCommunicationMessages = (...messageGroups: AgentMessageAuditEntry[][]) => {
  const byId = new Map<string, AgentMessageAuditEntry>();
  messageGroups.flat().forEach((message) => {
    if (!message?.messageId) {
      return;
    }
    const current = byId.get(message.messageId);
    if (!current || new Date(message.timestamp).getTime() > new Date(current.timestamp).getTime()) {
      byId.set(message.messageId, compactMessage(message));
    }
  });
  return [...byId.values()].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
};

const publishCommunicationEvent = (messages: AgentMessageAuditEntry[]) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COMMUNICATION_AUDIT_UPDATED_EVENT, { detail: messages }));
  }
};

const getLocalStorageAuditBytes = () =>
  isBrowser() ? window.localStorage.getItem(COMMUNICATION_AUDIT_STORAGE_KEY)?.length ?? 0 : 0;

const saveStorageStatus = (status: CommunicationAuditStorageStatus) => {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(COMMUNICATION_AUDIT_STATUS_KEY, JSON.stringify(status));
  } catch {
    // Status persistence is non-essential.
  }
};

export function loadCommunicationAuditStorageStatus(): CommunicationAuditStorageStatus {
  if (!isBrowser()) {
    return {
      backend: "session_fallback",
      eventCount: 0,
      localStorageBytes: 0,
    };
  }
  const raw = window.localStorage.getItem(COMMUNICATION_AUDIT_STORAGE_KEY) ?? "";
  const statusRaw = window.localStorage.getItem(COMMUNICATION_AUDIT_STATUS_KEY);
  try {
    const parsed = statusRaw ? JSON.parse(statusRaw) as Partial<CommunicationAuditStorageStatus> : {};
    return {
      backend: parsed.backend ?? "compact_localStorage",
      eventCount: parsed.eventCount ?? 0,
      lastCleanupAt: parsed.lastCleanupAt,
      lastError: parsed.lastError,
      localStorageBytes: raw.length,
    };
  } catch {
    return {
      backend: "compact_localStorage",
      eventCount: 0,
      localStorageBytes: raw.length,
    };
  }
}

const openCommunicationDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!isBrowser() || !hasIndexedDb()) {
      reject(new Error("IndexedDB is unavailable for communication audit storage."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIT_STORE)) {
        db.createObjectStore(AUDIT_STORE, { keyPath: "messageId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open communication audit store."));
  });

const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Communication audit IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Communication audit IndexedDB transaction aborted."));
  });

const idbRequest = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Communication audit IndexedDB request failed."));
  });

async function persistCommunicationMessagesToIndexedDb(messages: AgentMessageAuditEntry[]) {
  const compact = compactMessages(messages, INDEXED_DB_MESSAGE_LIMIT);
  const db = await openCommunicationDb();
  const tx = db.transaction(AUDIT_STORE, "readwrite");
  const store = tx.objectStore(AUDIT_STORE);
  compact.forEach((message) => store.put(message));
  await txDone(tx);
  const readTx = db.transaction(AUDIT_STORE, "readonly");
  const rows = await idbRequest<AgentMessageAuditEntry[]>(readTx.objectStore(AUDIT_STORE).getAll());
  await txDone(readTx);
  db.close();
  const sorted = mergeCommunicationMessages(rows);
  const keep = sorted.slice(0, INDEXED_DB_MESSAGE_LIMIT);
  if (sorted.length > INDEXED_DB_MESSAGE_LIMIT) {
    await trimCommunicationIndexedDb(keep);
  }
  return keep;
}

async function trimCommunicationIndexedDb(keep: AgentMessageAuditEntry[]) {
  const keepIds = new Set(keep.map((message) => message.messageId));
  const db = await openCommunicationDb();
  const tx = db.transaction(AUDIT_STORE, "readwrite");
  const store = tx.objectStore(AUDIT_STORE);
  const rows = await idbRequest<AgentMessageAuditEntry[]>(store.getAll());
  rows.forEach((message) => {
    if (!keepIds.has(message.messageId)) {
      store.delete(message.messageId);
    }
  });
  await txDone(tx);
  db.close();
}

export async function hydrateCommunicationMessages(): Promise<AgentMessageAuditEntry[]> {
  if (!isBrowser() || !hasIndexedDb()) {
    return loadCommunicationMessages();
  }
  try {
    const db = await openCommunicationDb();
    const tx = db.transaction(AUDIT_STORE, "readonly");
    const rows = await idbRequest<AgentMessageAuditEntry[]>(tx.objectStore(AUDIT_STORE).getAll());
    await txDone(tx);
    db.close();
    const compactRows = compactMessages(rows, INDEXED_DB_MESSAGE_LIMIT);
    return mergeCommunicationMessages(compactRows, sessionCommunicationMessages, mockAgentMessages);
  } catch {
    return loadCommunicationMessages();
  }
}

export async function clearCommunicationAuditLog() {
  if (isBrowser()) {
    window.localStorage.removeItem(COMMUNICATION_AUDIT_STORAGE_KEY);
  }
  sessionCommunicationMessages = [];
  let clearError: string | undefined;
  if (isBrowser() && hasIndexedDb()) {
    try {
      const db = await openCommunicationDb();
      const tx = db.transaction(AUDIT_STORE, "readwrite");
      tx.objectStore(AUDIT_STORE).clear();
      await txDone(tx);
      db.close();
    } catch (error) {
      clearError = error instanceof Error ? error.message : "Unable to clear communication IndexedDB audit log.";
    }
  }
  saveStorageStatus({
    backend: clearError ? "session_fallback" : hasIndexedDb() ? "indexeddb" : "compact_localStorage",
    eventCount: 0,
    lastCleanupAt: new Date().toISOString(),
    lastError: clearError,
    localStorageBytes: 0,
  });
  publishCommunicationEvent([]);
}

function writeCompactMessagesToLocalStorage(
  messages: AgentMessageAuditEntry[],
  {
    backend = "compact_localStorage",
    lastCleanupAt,
    lastError,
  }: Partial<Pick<CommunicationAuditStorageStatus, "backend" | "lastCleanupAt" | "lastError">> = {}
) {
  const compact = compactMessages(messages, LOCAL_STORAGE_MESSAGE_LIMIT);
  sessionCommunicationMessages = compact;
  if (!isBrowser()) {
    publishCommunicationEvent(compact);
    return compact;
  }

  const persistCompact = (nextMessages: AgentMessageAuditEntry[]) => {
    const serialized = JSON.stringify(nextMessages);
    window.localStorage.setItem(COMMUNICATION_AUDIT_STORAGE_KEY, serialized);
    saveStorageStatus({
      backend,
      eventCount: nextMessages.length,
      lastCleanupAt,
      lastError,
      localStorageBytes: serialized.length,
    });
  };

  try {
    persistCompact(compact);
    publishCommunicationEvent(compact);
    return compact;
  } catch (error) {
    const firstError = error instanceof Error ? error.message : "Communication audit localStorage write failed.";
    try {
      window.localStorage.removeItem(COMMUNICATION_AUDIT_STORAGE_KEY);
      const emergencyCompact = compact.slice(0, 10);
      persistCompact(emergencyCompact);
      sessionCommunicationMessages = emergencyCompact;
      saveStorageStatus({
        backend: "compact_localStorage",
        eventCount: emergencyCompact.length,
        lastCleanupAt: new Date().toISOString(),
        lastError: firstError,
        localStorageBytes: getLocalStorageAuditBytes(),
      });
      publishCommunicationEvent(emergencyCompact);
      return emergencyCompact;
    } catch (fallbackError) {
      window.localStorage.removeItem(COMMUNICATION_AUDIT_STORAGE_KEY);
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : "Communication audit session fallback is active.";
      saveStorageStatus({
        backend: "session_fallback",
        eventCount: compact.length,
        lastCleanupAt: new Date().toISOString(),
        lastError: `${firstError} ${fallbackMessage}`,
        localStorageBytes: 0,
      });
      publishCommunicationEvent(compact);
      return compact;
    }
  }
}

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
    return sessionCommunicationMessages;
  }

  const raw = window.localStorage.getItem(COMMUNICATION_AUDIT_STORAGE_KEY);
  if (!raw) {
    return sessionCommunicationMessages;
  }

  try {
    const parsed = JSON.parse(raw) as AgentMessageAuditEntry[];
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(COMMUNICATION_AUDIT_STORAGE_KEY);
      saveStorageStatus({
        backend: hasIndexedDb() ? "indexeddb" : "compact_localStorage",
        eventCount: sessionCommunicationMessages.length,
        lastCleanupAt: new Date().toISOString(),
        lastError: "Removed malformed communication audit storage.",
        localStorageBytes: 0,
      });
      return sessionCommunicationMessages;
    }
    const compact = mergeCommunicationMessages(parsed, sessionCommunicationMessages).slice(0, LOCAL_STORAGE_MESSAGE_LIMIT);
    if (raw.length > OVERSIZED_LOCAL_STORAGE_BYTES) {
      writeCompactMessagesToLocalStorage(compact, {
        lastCleanupAt: new Date().toISOString(),
        lastError: "Legacy communication audit localStorage payload was compacted.",
      });
      if (hasIndexedDb()) {
        void persistCommunicationMessagesToIndexedDb(parsed).catch((error) => {
          saveStorageStatus({
            backend: "compact_localStorage",
            eventCount: compact.length,
            lastCleanupAt: new Date().toISOString(),
            lastError: error instanceof Error ? error.message : "Unable to migrate legacy communication audit payload.",
            localStorageBytes: getLocalStorageAuditBytes(),
          });
        });
      }
    }
    return compact;
  } catch {
    window.localStorage.removeItem(COMMUNICATION_AUDIT_STORAGE_KEY);
    saveStorageStatus({
      backend: hasIndexedDb() ? "indexeddb" : "session_fallback",
      eventCount: sessionCommunicationMessages.length,
      lastCleanupAt: new Date().toISOString(),
      lastError: "Removed unreadable communication audit storage.",
      localStorageBytes: 0,
    });
    return sessionCommunicationMessages;
  }
}

export function loadCommunicationMessages(): AgentMessageAuditEntry[] {
  return mergeCommunicationMessages(loadStoredCommunicationMessages(), mockAgentMessages);
}

export function saveCommunicationMessages(messages: AgentMessageAuditEntry[]) {
  if (!isBrowser()) {
    sessionCommunicationMessages = compactMessages(messages, LOCAL_STORAGE_MESSAGE_LIMIT);
    return sessionCommunicationMessages;
  }

  const compact = writeCompactMessagesToLocalStorage(messages);
  if (hasIndexedDb()) {
    void persistCommunicationMessagesToIndexedDb(messages)
      .then((persistedMessages) => {
        saveStorageStatus({
          backend: "indexeddb",
          eventCount: persistedMessages.length,
          localStorageBytes: getLocalStorageAuditBytes(),
        });
      })
      .catch((error) => {
        saveStorageStatus({
          backend: "compact_localStorage",
          eventCount: compact.length,
          lastError: error instanceof Error ? error.message : "Communication audit IndexedDB persistence failed.",
          localStorageBytes: getLocalStorageAuditBytes(),
        });
      });
  }
  return compact;
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
  return saveCommunicationMessages([compactMessage(entry), ...stored.filter((item) => item.messageId !== entry.messageId)]);
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
