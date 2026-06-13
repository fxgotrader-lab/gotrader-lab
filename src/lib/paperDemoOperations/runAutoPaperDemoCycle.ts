import {
  applyValidationChainEvidenceUpdate,
  applyValidationChainReplayResult,
  applyValidationChainWalkForwardResult,
  markValidationChainReplayRunning,
  markValidationChainWalkForwardRunning,
  queueValidationChainEntry
} from "../validationChain/buildValidationChain";
import { saveValidationChainEntry } from "../validationChain/validationChainStore";
import type {
  ValidationChainEntry,
  ValidationChainEvidenceSummary,
  ValidationChainRecognitionType,
  ValidationChainReplaySummary,
  ValidationChainWalkForwardSummary
} from "../validationChain/validationChainTypes";
import type { SourceStatusSnapshot } from "../sourceStatus/sourceStatusTypes";
import { buildPaperDemoDailyReport } from "./buildPaperDemoDailyReport";
import { buildPaperDemoCandidateFromContext, buildPaperDemoEligibility, toPaperDemoWatchlistStatus } from "./paperDemoEligibility";
import { buildPaperDemoReport } from "./paperDemoReport";
import {
  latestPaperDemoDailyChecklist,
  loadPaperDemoOperationsState,
  savePaperDemoOperationsState,
  upsertPaperDemoCandidate
} from "./paperDemoStore";
import {
  PAPER_DEMO_AUTHORITY,
  type PaperDemoCandidate,
  type PaperDemoOperationsState
} from "./paperDemoTypes";
import type {
  AutoPaperDemoCycleConfig,
  AutoPaperDemoCycleEvent,
  AutoPaperDemoCycleRecognitionSummary,
  AutoPaperDemoCycleResult,
  AutoPaperDemoCycleSourceSummary,
  AutoPaperDemoCycleState,
  AutoPaperDemoCycleStatus
} from "./autoPaperDemoCycleTypes";

export const AUTO_PAPER_DEMO_CYCLE_STORAGE_KEY = "gotrader.auto-paper-demo-cycle.v1";
export const AUTO_PAPER_DEMO_CYCLE_UPDATED_EVENT = "gotrader:auto-paper-demo-cycle-updated";

const MAX_HISTORY = 12;
const unsafePersistencePattern =
  /"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:|"snapshot"\s*:|"apiKey"\s*:|"secret"\s*:|"password"\s*:|"token"\s*:|"mt5(Login|Password|Credentials)"\s*:|"account(Data|Number|Id)?"\s*:|"order(Data|Id|Route|Status)?"\s*:|"position(Data|Id|Status)?"\s*:|"execution"\s*:/i;

const safety = {
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const,
  executionIntentCreated: false as const,
  brokerMutation: false as const
};

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const nowIso = () => new Date().toISOString();
const makeId = (prefix: string, at = nowIso()) => `${prefix}_${at.replace(/[^0-9a-z]/gi, "")}`;
const sourceToSummary = (source: SourceStatusSnapshot): AutoPaperDemoCycleSourceSummary => ({
  sourceProvider: source.sourceProvider,
  sourceStatus: source.sourceStatus,
  requestedSymbol: source.requestedSymbol,
  brokerSymbol: source.brokerSymbol,
  primaryTimeframe: source.primaryTimeframe,
  candleCount: source.candleCount,
  sourceFingerprint: source.sourceFingerprint,
  proxyWarning: source.warningLabel
});

const eventFor = (
  events: AutoPaperDemoCycleEvent[],
  status: AutoPaperDemoCycleStatus,
  title: string,
  detail: string,
  severity: AutoPaperDemoCycleEvent["severity"] = "info",
  timestamp = nowIso()
) => {
  events.push({
    id: `${status}_${events.length}_${timestamp.replace(/[^0-9a-z]/gi, "")}`,
    timestamp,
    status,
    title,
    detail,
    severity
  });
};

const emptyCycleState = (): AutoPaperDemoCycleState => ({
  updatedAt: nowIso(),
  history: [],
  authority: PAPER_DEMO_AUTHORITY
});

export const autoPaperDemoCycleStateIsCompact = (state: AutoPaperDemoCycleState): boolean =>
  !unsafePersistencePattern.test(JSON.stringify(state));

export function loadAutoPaperDemoCycleState(): AutoPaperDemoCycleState {
  if (!isBrowser()) return emptyCycleState();
  try {
    const raw = window.localStorage.getItem(AUTO_PAPER_DEMO_CYCLE_STORAGE_KEY);
    if (!raw) return emptyCycleState();
    const parsed = JSON.parse(raw) as Partial<AutoPaperDemoCycleState>;
    const state: AutoPaperDemoCycleState = {
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
      latestCycle: parsed.latestCycle as AutoPaperDemoCycleResult | undefined,
      history: Array.isArray(parsed.history) ? (parsed.history as AutoPaperDemoCycleResult[]).slice(0, MAX_HISTORY) : [],
      authority: PAPER_DEMO_AUTHORITY
    };
    return autoPaperDemoCycleStateIsCompact(state) ? state : emptyCycleState();
  } catch {
    return emptyCycleState();
  }
}

export function saveAutoPaperDemoCycleResult(result: AutoPaperDemoCycleResult): AutoPaperDemoCycleState {
  const current = loadAutoPaperDemoCycleState();
  const state: AutoPaperDemoCycleState = {
    updatedAt: nowIso(),
    latestCycle: { ...result, authority: PAPER_DEMO_AUTHORITY, safety },
    history: [result, ...current.history.filter((item) => item.cycleId !== result.cycleId)].slice(0, MAX_HISTORY),
    authority: PAPER_DEMO_AUTHORITY
  };
  if (!autoPaperDemoCycleStateIsCompact(state)) {
    throw new Error("Auto Paper-Demo cycle storage rejected unsafe raw payload fields.");
  }
  if (isBrowser()) {
    window.localStorage.setItem(AUTO_PAPER_DEMO_CYCLE_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event(AUTO_PAPER_DEMO_CYCLE_UPDATED_EVENT));
  }
  return state;
}

export function stopAutoPaperDemoCycle(reason = "Stopped by operator."): AutoPaperDemoCycleState {
  const current = loadAutoPaperDemoCycleState();
  const at = nowIso();
  const latest = current.latestCycle
    ? {
        ...current.latestCycle,
        status: "stopped" as const,
        currentStage: "stopped" as const,
        completedAt: at,
        nextAction: reason,
        events: [
          ...current.latestCycle.events,
          {
            id: `stopped_${at.replace(/[^0-9a-z]/gi, "")}`,
            timestamp: at,
            status: "stopped" as const,
            title: "Auto cycle stopped",
            detail: reason,
            severity: "warning" as const
          }
        ],
        authority: PAPER_DEMO_AUTHORITY,
        safety
      }
    : {
        cycleId: makeId("auto_paper_demo_stopped", at),
        startedAt: at,
        completedAt: at,
        status: "stopped" as const,
        currentStage: "stopped" as const,
        decisions: [],
        events: [
          {
            id: `stopped_${at.replace(/[^0-9a-z]/gi, "")}`,
            timestamp: at,
            status: "stopped" as const,
            title: "Auto cycle stopped",
            detail: reason,
            severity: "warning" as const
          }
        ],
        blockers: [],
        nextAction: reason,
        authority: PAPER_DEMO_AUTHORITY,
        safety
      };
  return saveAutoPaperDemoCycleResult(latest);
}

const sourceIsBlocked = (source: SourceStatusSnapshot | AutoPaperDemoCycleConfig["sourceSnapshot"]) =>
  !source ||
  source.sourceStatus === "unavailable" ||
  source.sourceStatus === "mock_sample" ||
  source.isMockOrSample === true ||
  !source.isResearchActive ||
  !source.sourceFingerprint ||
  source.sourceFingerprint === "no fingerprint";

const recognitionTypeFor = (input?: AutoPaperDemoCycleConfig["recognition"]): ValidationChainRecognitionType =>
  input?.recognitionType ?? "unknown_structured_opportunity";

const summarizeRecognition = (
  entry: ValidationChainEntry,
  laneRecommendation?: string
): AutoPaperDemoCycleRecognitionSummary => ({
  recognitionId: entry.recognitionId,
  recognitionType: entry.recognitionType,
  setupLabel: entry.setupLabel,
  candidateFamily: entry.candidateFamily,
  laneRecommendation,
  sourceFingerprint: entry.sourceFingerprint
});

const replayFromConfigOrRunner = async (config: AutoPaperDemoCycleConfig): Promise<ValidationChainReplaySummary | undefined> =>
  config.replaySummary ?? (config.deterministicReplayRunner ? await config.deterministicReplayRunner() : undefined);

const walkForwardFromConfigOrRunner = async (
  config: AutoPaperDemoCycleConfig
): Promise<ValidationChainWalkForwardSummary | undefined> =>
  config.walkForwardSummary ?? (config.deterministicWalkForwardRunner ? await config.deterministicWalkForwardRunner() : undefined);

const evidenceFromConfigOrRunner = async (
  config: AutoPaperDemoCycleConfig
): Promise<ValidationChainEvidenceSummary | undefined> =>
  config.evidenceSummary ?? (config.deterministicEvidenceRunner ? await config.deterministicEvidenceRunner() : undefined);

export async function runAutoPaperDemoCycle(config: AutoPaperDemoCycleConfig = {}): Promise<AutoPaperDemoCycleResult> {
  const startedAt = config.now ?? nowIso();
  const cycleId = makeId("auto_paper_demo_cycle", startedAt);
  const events: AutoPaperDemoCycleEvent[] = [];
  const decisions: AutoPaperDemoCycleResult["decisions"] = [];
  const blockers: string[] = [];
  let status: AutoPaperDemoCycleStatus = "scanning";
  let validationEntry: ValidationChainEntry | undefined;
  let replaySummary: ValidationChainReplaySummary | undefined;
  let walkForwardSummary: ValidationChainWalkForwardSummary | undefined;
  let evidenceSummary: ValidationChainEvidenceSummary | undefined;
  let paperDemoState: PaperDemoOperationsState = loadPaperDemoOperationsState();
  let watchlistCandidate: PaperDemoCandidate | undefined;

  eventFor(events, "scanning", "Auto Paper-Demo cycle started", "Resolving active source and compact recognition context.", "info", startedAt);

  const resolvedSource =
    config.sourceSnapshot ??
    (await import("../sourceStatus/resolveSourceStatusSnapshot").then((module) => module.resolveSourceStatusSnapshot()));
  const sourceSummary: AutoPaperDemoCycleSourceSummary = sourceToSummary(resolvedSource as SourceStatusSnapshot);

  if (sourceIsBlocked(resolvedSource)) {
    status = "source_required";
    blockers.push("Active source is unavailable, mock/sample, not research-active, or missing a fingerprint.");
    decisions.push({
      stage: status,
      status: "blocked",
      reason: blockers[0],
      nextAction: "Activate MT5 research mode before running the autonomous Paper-Demo cycle."
    });
    eventFor(events, status, "Source blocked", blockers[0], "warning");
  } else {
    const recognitionId = config.recognition?.recognitionId ?? makeId("auto_recognition", startedAt);
    const queue = queueValidationChainEntry({
      recognitionId,
      recognitionType: recognitionTypeFor(config.recognition),
      setupLabel: config.recognition?.setupLabel ?? "Active research source scan",
      symbol: sourceSummary.requestedSymbol,
      brokerSymbol: sourceSummary.brokerSymbol,
      timeframe: sourceSummary.primaryTimeframe,
      htfContext: [],
      sourceFingerprint: sourceSummary.sourceFingerprint,
      sourceStatus: {
        sourceProvider: sourceSummary.sourceProvider,
        isMockOrSample: false,
        isResearchActive: true,
        statusLabel: sourceSummary.sourceStatus
      },
      generatedAt: startedAt
    });

    if (!queue.ok) {
      status = "paper_demo_blocked";
      blockers.push(queue.reason);
      validationEntry = queue.entry;
      eventFor(events, "paper_demo_blocked", "Recognition blocked", queue.reason, "warning");
    } else {
      validationEntry = queue.entry;
      status = "validation_queued";
      eventFor(events, "recognition_found", "Recognition found", validationEntry.setupLabel, "success");
      eventFor(events, "validation_queued", "Validation queued", validationEntry.nextAction, "info");
      if (config.persist) saveValidationChainEntry(validationEntry);
    }
  }

  if (validationEntry && !blockers.length) {
    const replay = await replayFromConfigOrRunner(config);
    if (!replay) {
      blockers.push("deterministic replay runner not wired");
      decisions.push({
        stage: "validation_queued",
        status: "queued",
        reason: "Replay validation is queued, but no safe deterministic runner was provided.",
        nextAction: "Open Replay or wire a deterministic replay runner before progressing."
      });
    } else {
      status = "replay_running";
      validationEntry = markValidationChainReplayRunning(validationEntry, replay.generatedAt);
      eventFor(events, "replay_running", "Replay running", "Consuming deterministic replay summary.", "info", replay.generatedAt);
      replaySummary = replay;
      validationEntry = applyValidationChainReplayResult(validationEntry, replay);
      status = replay.verdict === "passed" ? "replay_passed" : replay.verdict === "failed" ? "replay_failed" : "validation_queued";
      eventFor(events, status, `Replay ${replay.verdict}`, replay.reason, replay.verdict === "passed" ? "success" : "warning", replay.generatedAt);
      if (config.persist) saveValidationChainEntry(validationEntry);
      if (replay.verdict === "failed") blockers.push(`Replay failed: ${replay.reason}`);
    }
  }

  if (validationEntry && replaySummary?.verdict === "passed" && !blockers.length) {
    const walkForward = await walkForwardFromConfigOrRunner(config);
    if (!walkForward) {
      blockers.push("deterministic walk-forward runner not wired");
      decisions.push({
        stage: "replay_passed",
        status: "queued",
        reason: "Replay passed, but no safe deterministic walk-forward runner was provided.",
        nextAction: "Run Walk-Forward/OOS validation before Paper-Demo evaluation."
      });
    } else {
      status = "walk_forward_running";
      validationEntry = markValidationChainWalkForwardRunning(validationEntry, walkForward.generatedAt);
      eventFor(events, "walk_forward_running", "Walk-forward running", "Consuming deterministic OOS summary.", "info", walkForward.generatedAt);
      walkForwardSummary = walkForward;
      validationEntry = applyValidationChainWalkForwardResult(validationEntry, walkForward);
      status =
        walkForward.verdict === "passed"
          ? "walk_forward_passed"
          : walkForward.verdict === "failed"
            ? "walk_forward_failed"
            : "paper_demo_blocked";
      eventFor(
        events,
        status,
        `Walk-forward ${walkForward.verdict}`,
        walkForward.reason,
        walkForward.verdict === "passed" ? "success" : "warning",
        walkForward.generatedAt
      );
      if (config.persist) saveValidationChainEntry(validationEntry);
      if (walkForward.verdict === "failed") blockers.push(`Walk-forward failed: ${walkForward.reason}`);
      if (walkForward.verdict === "needs_more_data") blockers.push(`Walk-forward needs more data: ${walkForward.reason}`);
    }
  }

  if (validationEntry && walkForwardSummary?.verdict === "passed" && !blockers.length) {
    const evidence = await evidenceFromConfigOrRunner(config);
    if (!evidence) {
      blockers.push("deterministic evidence/maturity updater not wired");
      decisions.push({
        stage: "walk_forward_passed",
        status: "queued",
        reason: "Walk-forward passed, but evidence/maturity summaries were not supplied.",
        nextAction: "Update evidence and maturity summaries before Paper-Demo eligibility."
      });
    } else {
      evidenceSummary = evidence;
      validationEntry = applyValidationChainEvidenceUpdate(validationEntry, evidence);
      status = "evidence_updated";
      eventFor(events, "evidence_updated", "Evidence/maturity updated", evidence.detail, "success", evidence.generatedAt);
      if (config.persist) saveValidationChainEntry(validationEntry);
    }
  }

  const checklist = config.checklistSummary;
  const candidate = validationEntry
    ? buildPaperDemoCandidateFromContext({
        checklist,
        cmdIndependentDateEvidence: config.cmdIndependentDateEvidence,
        source: resolvedSource as SourceStatusSnapshot,
        timestamp: nowIso(),
        validationChain: validationEntry
      })
    : undefined;
  const eligibility = candidate ? buildPaperDemoEligibility(candidate) : undefined;

  if (candidate && eligibility?.eligible && config.createWatchlistCandidate !== false) {
    watchlistCandidate = toPaperDemoWatchlistStatus(candidate);
    if (config.persist) {
      paperDemoState = upsertPaperDemoCandidate(watchlistCandidate);
    } else {
      paperDemoState = {
        ...paperDemoState,
        candidates: [watchlistCandidate, ...paperDemoState.candidates.filter((item) => item.id !== watchlistCandidate?.id)]
      };
    }
    status = "paper_demo_candidate_created";
    eventFor(events, status, "Paper-Demo watchlist updated", watchlistCandidate.nextAction, "success");
  } else if (candidate && eligibility && !eligibility.eligible) {
    status = blockers.length ? status : "paper_demo_blocked";
    blockers.push(...eligibility.blockers);
    if (candidate.cmdIndependentDateGate && !candidate.cmdIndependentDateGate.paperDemoEligible) {
      decisions.push({
        stage: "paper_demo_blocked",
        status: "blocked",
        reason: candidate.cmdIndependentDateGate.blockerReason ?? "CMD independent-date gate blocked Paper-Demo eligibility.",
        nextAction: candidate.cmdIndependentDateGate.nextAction
      });
    }
    eventFor(events, "paper_demo_blocked", "Paper-Demo blocked", eligibility.nextAction, "warning");
  }

  const completedAt = nowIso();
  const provisional: AutoPaperDemoCycleResult = {
    cycleId,
    startedAt,
    completedAt,
    status,
    currentStage: status,
    sourceStatus: sourceSummary,
    recognitionSummary: validationEntry ? summarizeRecognition(validationEntry, config.recognition?.laneRecommendation) : undefined,
    validationChainId: validationEntry?.recognitionId,
    replaySummary,
    walkForwardSummary,
    evidenceMaturitySummary: evidenceSummary,
    paperDemoEligibility: eligibility,
    watchlistCandidateId: watchlistCandidate?.id,
    decisions,
    events,
    blockers: [...new Set(blockers)].slice(0, 12),
    nextAction:
      blockers[0] ??
      watchlistCandidate?.nextAction ??
      validationEntry?.nextAction ??
      "Daily report created. Continue manual research operations.",
    authority: PAPER_DEMO_AUTHORITY,
    safety
  };

  const dailyReport = buildPaperDemoDailyReport({ cycle: provisional, state: paperDemoState });
  const finalStatus: AutoPaperDemoCycleStatus =
    provisional.status === "paper_demo_candidate_created" || provisional.status === "paper_demo_blocked" || provisional.blockers.length
      ? provisional.status
      : "daily_report_created";
  const result: AutoPaperDemoCycleResult = {
    ...provisional,
    status: finalStatus,
    currentStage: finalStatus,
    dailyReport,
    paperDemoReport: buildPaperDemoReport(paperDemoState)
  };
  eventFor(result.events, "daily_report_created", "Daily report created", dailyReport.nextRecommendedResearchAction, "success", completedAt);

  if (config.persist) saveAutoPaperDemoCycleResult(result);
  return result;
}
