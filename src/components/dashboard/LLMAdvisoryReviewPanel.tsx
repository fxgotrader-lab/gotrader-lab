import { useMemo, useState } from "react";
import { Bot, MessageSquareText, ShieldCheck } from "lucide-react";

import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  checkLocalBridgeHealth,
  getLocalBridgeStatusSnapshot,
  LLM_LOCAL_BRIDGE_ADVISORY_TIMEOUT_MS,
  LLM_LOCAL_BRIDGE_BASE_URL,
  resetLocalBridgeCircuitBreaker,
  runLocalBridgeAdvisory,
  type LLMAgentResponse,
  type LLMResearchContextPacket,
  type LocalBridgeAdvisoryCapabilityStatus,
  type LocalBridgeCircuitBreakerStatus,
  type LocalBridgeProcessStatus,
  type LocalBridgeUnavailableReason
} from "@/lib/llm";
import type { ResearchRuntimeSnapshot } from "@/lib/runtime";
import { safeArray, safeTopN, uid } from "@/lib/utils";

import { formatDateTime } from "./dashboardFormatters";
import type { MissionFeedItem } from "./MissionControlDataFeed";

type AdvisoryStatus = "unknown" | "online" | "offline" | "unavailable" | "skipped" | "error" | "checking" | "running";
type PanelBridgeProcessStatus = LocalBridgeProcessStatus | "checking";
type PanelAdvisoryCapabilityStatus = LocalBridgeAdvisoryCapabilityStatus | "unknown" | "running" | "skipped";
type PanelCircuitBreakerStatus = LocalBridgeCircuitBreakerStatus;

type AdvisoryMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
};

type LastAdvisoryPayload = {
  packetId?: string;
  status: AdvisoryStatus;
  bridgeProcessStatus?: PanelBridgeProcessStatus;
  advisoryCapabilityStatus?: PanelAdvisoryCapabilityStatus;
  circuitBreakerStatus?: PanelCircuitBreakerStatus;
  question?: string;
  reason?: LocalBridgeUnavailableReason | "unsafe_request" | "validation";
  responses?: LLMAgentResponse[];
  warnings?: string[];
  checkedAt: string;
  lastHealthCheckAt?: string;
  lastAdvisoryRequestAt?: string;
  lastError?: string;
  cooldownRemainingMs?: number;
};

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
} as const;

const promptButtons = [
  "Explain this cycle",
  "Why is this blocked?",
  "What should I test next?",
  "Why is Grinch profile not present?"
];

const unsafeRequestPattern =
  /\b(place|send|submit|execute|buy|sell|open|close|modify|cancel|route|enable)\b.*\b(trade|order|position|live|broker|market)\b/i;

const shortStatus = (status: string) => status.replace(/_/g, " ");

const processBadgeVariant = (status: PanelBridgeProcessStatus) =>
  status === "online" ? "success" : status === "offline" ? "warning" : "secondary";

const advisoryBadgeVariant = (status: PanelAdvisoryCapabilityStatus) =>
  status === "ready"
    ? "success"
    : status === "config_missing" || status === "timeout" || status === "cooldown" || status === "error" || status === "unavailable"
      ? "warning"
      : "secondary";

const circuitBadgeVariant = (status: PanelCircuitBreakerStatus) =>
  status === "closed" ? "success" : "warning";

const advisoryMessageForUnavailable = (
  reason: LocalBridgeUnavailableReason,
  warnings: string[],
  bridgeProcessStatus: PanelBridgeProcessStatus
) => {
  const detail = warnings.filter(Boolean).join(" ");
  if (reason === "bridge_offline") {
    return "LLM advisory bridge offline. Start npm.cmd run llm:bridge. Deterministic research remains available.";
  }
  if (reason === "circuit_open") {
    return detail || `LLM bridge ${bridgeProcessStatus === "online" ? "online, but " : ""}advisory retry paused after a recent failure.`;
  }
  if (reason === "timeout") {
    return (
      detail ||
      `LLM advisory timed out after ${Math.round(LLM_LOCAL_BRIDGE_ADVISORY_TIMEOUT_MS / 1000)} seconds. Deterministic research remains available.`
    );
  }
  if (reason === "config_missing") {
    return detail || "LLM bridge online, but advisory provider/model is not configured.";
  }
  return detail || `${bridgeProcessStatus === "online" ? "Bridge online, advisory request failed" : "LLM advisory unavailable"}.`;
};

const capabilityFromUnavailableReason = (reason: LocalBridgeUnavailableReason): PanelAdvisoryCapabilityStatus => {
  if (reason === "timeout") {
    return "timeout";
  }
  if (reason === "circuit_open") {
    return "cooldown";
  }
  if (reason === "config_missing") {
    return "config_missing";
  }
  if (reason === "bridge_offline") {
    return "unavailable";
  }
  return "error";
};

const summarizeReviewerResponses = (responses: LLMAgentResponse[]) => {
  const cio = responses.find((response) => response.agentId === "llm-cio-synthesis-reviewer") ?? responses[0];
  const topBlockers = safeTopN(
    responses.flatMap((response) => [...safeArray(response.riskWarnings), ...safeArray(response.missingEvidence)]),
    5
  );
  const nextActions = safeTopN(
    responses.flatMap((response) => safeArray(response.suggestedCalibration)),
    4
  );
  const caveats = safeTopN(
    responses.flatMap((response) => safeArray(response.safetyNotes)),
    4
  );

  return {
    summary: cio?.reasoningSummary ?? "The advisory bridge responded without a CIO synthesis summary.",
    topBlockers,
    nextAction: nextActions[0] ?? "Continue deterministic research and collect more evidence before changing readiness expectations.",
    caveats
  };
};

const sourceLabelFor = (snapshot?: ResearchRuntimeSnapshot) => {
  if (!snapshot) {
    return "Runtime snapshot loading";
  }
  const source = snapshot.marketData.activeResearchSource;
  const brokerSymbol =
    snapshot.mt5ReadOnly.brokerSymbol ??
    source.provenance.providerSymbol ??
    undefined;
  return [
    snapshot.marketData.activeResearchSourceLabel,
    source.provider === "mt5_read_only" && brokerSymbol ? `broker ${brokerSymbol}` : undefined,
    `${source.candleCount.toLocaleString()} candles`
  ].filter(Boolean).join(" / ");
};

const blockersFor = (snapshot?: ResearchRuntimeSnapshot) =>
  safeTopN(
    [
      ...safeArray(snapshot?.readiness.actualBlockers),
      ...safeArray(snapshot?.regime.warnings),
      ...safeArray(snapshot?.latestResearchCycle.activeGrinchProfileSummary?.hardGateReason
        ? [snapshot.latestResearchCycle.activeGrinchProfileSummary.hardGateReason]
        : []),
      ...(!snapshot?.llm.advisoryPassed ? ["LLM advisory missing"] : [])
    ],
    5
  );

const buildAdvisoryPacket = (snapshot: ResearchRuntimeSnapshot, question: string): LLMResearchContextPacket & {
  dashboardAdvisoryRequest: {
    question: string;
    status: "plain_language_review";
  };
} => {
  const latestRun = snapshot.latestResearchCycle.latestRun;
  const grinch = snapshot.latestResearchCycle.activeGrinchProfileSummary;
  const source = snapshot.marketData.activeResearchSource;
  const blockers = blockersFor(snapshot);

  return {
    packetId: uid("dashboard_advisory"),
    timestamp: new Date().toISOString(),
    source: "gotrader_ai_lab",
    mode: "advisory_only",
    researchMode: "llm_required",
    providerMode: "local_command",
    ...authority,
    symbol: snapshot.marketData.symbol,
    timeframe: snapshot.marketData.timeframe,
    regimeSummary: {
      stableLabel: snapshot.regime.label,
      instantaneousLabel: snapshot.regime.instantaneousLabel,
      transitionPending: snapshot.regime.transitionPending,
      confidence: snapshot.regime.confidence,
      dataQuality: snapshot.regime.dataQuality,
      supportingFactors: safeTopN(snapshot.regime.supportingFactors, 6),
      warnings: safeTopN(snapshot.regime.warnings, 6),
      recommendedBehavior: snapshot.regime.recommendedBehavior
    },
    evidenceQualitySummary: snapshot.evidence.evidenceLedgerSummary,
    deterministicICTFacts: [
      `Dashboard question: ${question}`,
      `Active research source: ${snapshot.marketData.activeResearchSourceLabel}`,
      `Provider: ${source.provider}`,
      `Requested symbol: ${snapshot.marketData.symbol}`,
      `Broker/provider symbol: ${snapshot.mt5ReadOnly.brokerSymbol ?? source.provenance.providerSymbol ?? "n/a"}`,
      `Candle count: ${source.candleCount}`,
      `Source eligibility reasons: ${safeArray(source.eligibilityReasons).join("; ") || "none"}`,
      `Regime: ${snapshot.regime.label} / ${Math.round(snapshot.regime.confidence * 100)}% / ${snapshot.regime.dataQuality}`,
      `Grinch profile: ${grinch ? `${grinch.profile}/${grinch.state}/${grinch.hardGateReason ?? "no hard gate"}` : "not available"}`,
      `Readiness: ${snapshot.readiness.readinessState}`,
      `Evidence score: ${snapshot.evidence.evidenceQualityScore}`,
      `Maturity score: ${snapshot.maturity.maturityScore}`,
      `Latest cycle: ${latestRun?.cycleId ?? "none"} / ${latestRun?.status ?? "not run"}`,
      `Latest backtest: trades ${latestRun?.backtestSummary?.totalTrades ?? 0}; average R ${latestRun?.backtestSummary?.averageR ?? "n/a"}; drawdown ${latestRun?.backtestSummary?.maxDrawdown ?? "n/a"}`,
      `Current blockers: ${blockers.join("; ") || "none"}`
    ],
    internalBaselineAgentDebate: [],
    cioThesis: latestRun?.thesisSummary
      ? {
          thesisId: latestRun.thesisSummary.thesisId,
          bias: latestRun.thesisSummary.bias,
          confidence: latestRun.thesisSummary.confidence,
          summary: latestRun.thesisSummary.summary,
          reasoningSummary: `Dashboard advisory review for ${question}`
        }
      : undefined,
    validationSummary: latestRun?.validationSummary,
    researchQualityGrade: latestRun?.researchQualitySummary
      ? {
          reviewId: latestRun.researchQualitySummary.reviewId,
          generatedAt: latestRun.researchQualitySummary.generatedAt,
          readinessGrade: latestRun.researchQualitySummary.readinessGrade,
          topWeaknesses: latestRun.researchQualitySummary.topWeaknesses,
          falsePositiveCount: safeArray(latestRun.researchQualityReview?.falsePositivePatterns).reduce(
            (sum, pattern) => sum + pattern.estimatedFalsePositives,
            0
          )
        }
      : undefined,
    readinessState: {
      state: snapshot.readiness.readinessState,
      failedRequirements: snapshot.readiness.actualBlockers,
      brokerExecutionDisabled: true
    },
    riskNotes: "Dashboard LLM Advisory Review is explanatory only. It cannot control execution or readiness.",
    safetyConstraints: [
      "LLM advisory panel is explanation-only.",
      "No broker execution.",
      "No order placement.",
      "No account, order, or position mutation.",
      "No readiness override.",
      "If the user asks for a trade or order, refuse and explain execution is disabled."
    ],
    dashboardAdvisoryRequest: {
      question,
      status: "plain_language_review"
    }
  };
};

export function LLMAdvisoryReviewPanel({
  snapshot,
  onAdvisoryEvent
}: {
  snapshot?: ResearchRuntimeSnapshot;
  onAdvisoryEvent?: (
    title: string,
    detail: string,
    severity: MissionFeedItem["severity"],
    sourceFingerprint?: string
  ) => void;
}) {
  const bridgeSnapshot = useMemo(() => getLocalBridgeStatusSnapshot(), [snapshot?.generatedAt]);
  const initialStatus: AdvisoryStatus =
    snapshot?.llm.advisoryPassed || bridgeSnapshot.advisoryCapabilityStatus === "ready"
      ? "online"
      : bridgeSnapshot.status === "offline"
        ? "offline"
        : "unknown";
  const initialBridgeProcessStatus: PanelBridgeProcessStatus =
    bridgeSnapshot.bridgeProcessStatus === "online" || snapshot?.llm.bridgeStatus === "running"
      ? "online"
      : bridgeSnapshot.bridgeProcessStatus === "offline"
        ? "offline"
        : "unknown";
  const initialAdvisoryCapabilityStatus: PanelAdvisoryCapabilityStatus =
    bridgeSnapshot.advisoryCapabilityStatus === "unknown" && snapshot?.llm.advisoryPassed
      ? "ready"
      : bridgeSnapshot.advisoryCapabilityStatus;
  const [status, setStatus] = useState<AdvisoryStatus>(initialStatus);
  const [bridgeProcessStatus, setBridgeProcessStatus] = useState<PanelBridgeProcessStatus>(initialBridgeProcessStatus);
  const [advisoryCapabilityStatus, setAdvisoryCapabilityStatus] = useState<PanelAdvisoryCapabilityStatus>(initialAdvisoryCapabilityStatus);
  const [circuitBreakerStatus, setCircuitBreakerStatus] = useState<PanelCircuitBreakerStatus>(bridgeSnapshot.circuitBreakerStatus);
  const [input, setInput] = useState("Explain this cycle");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<AdvisoryMessage[]>([
    {
      id: uid("advisory_message"),
      role: "system",
      text: snapshot?.llm.advisoryPassed
        ? "Latest advisory review passed. Ask for a plain-language explanation of the current deterministic research state."
        : "LLM advisory bridge offline or not yet checked. Deterministic research remains available.",
      timestamp: new Date().toISOString()
    }
  ]);
  const [lastPayload, setLastPayload] = useState<LastAdvisoryPayload>({
    status: initialStatus,
    bridgeProcessStatus: initialBridgeProcessStatus,
    advisoryCapabilityStatus: initialAdvisoryCapabilityStatus,
    circuitBreakerStatus: bridgeSnapshot.circuitBreakerStatus,
    checkedAt: new Date().toISOString(),
    reason: bridgeSnapshot.reason,
    cooldownRemainingMs: bridgeSnapshot.cooldownRemainingMs
  });

  const latestRun = snapshot?.latestResearchCycle.latestRun;
  const blockers = blockersFor(snapshot);
  const grinch = snapshot?.latestResearchCycle.activeGrinchProfileSummary;
  const sourceContext = sourceLabelFor(snapshot);
  const latestSummary =
    latestRun?.resultSummary ??
    snapshot?.llm.latestLLMRun?.readinessImpact ??
    "No completed research cycle is available yet.";
  const nextSuggestedAction =
    latestRun?.nextRecommendedAction ??
    snapshot?.readiness.nextAction ??
    "Run an AI Research Cycle after MT5 read-only candles are loaded.";

  const appendMessage = (role: AdvisoryMessage["role"], text: string) => {
    setMessages((current) =>
      safeTopN(
        [
          ...current,
          {
            id: uid("advisory_message"),
            role,
            text,
            timestamp: new Date().toISOString()
          }
        ],
        8
      )
    );
  };

  const checkBridge = async () => {
    setBusy(true);
    setStatus("checking");
    setBridgeProcessStatus("checking");
    try {
      const health = await checkLocalBridgeHealth(undefined, { bypassCircuitBreaker: true });
      const nextStatus = health.advisoryCapabilityStatus === "ready" ? "online" : "unavailable";
      setStatus(nextStatus);
      setBridgeProcessStatus("online");
      setAdvisoryCapabilityStatus(health.advisoryCapabilityStatus);
      setCircuitBreakerStatus(health.advisoryCapabilityStatus === "ready" ? "closed" : getLocalBridgeStatusSnapshot().circuitBreakerStatus);
      setLastPayload({
        status: nextStatus,
        bridgeProcessStatus: "online",
        advisoryCapabilityStatus: health.advisoryCapabilityStatus,
        circuitBreakerStatus: health.advisoryCapabilityStatus === "ready" ? "closed" : getLocalBridgeStatusSnapshot().circuitBreakerStatus,
        checkedAt: new Date().toISOString(),
        lastHealthCheckAt: health.healthCheckedAt,
        warnings: [`${health.service} ${health.mode}`, health.statusMessage ?? ""].filter(Boolean)
      });
      const message =
        health.advisoryCapabilityStatus === "ready"
          ? "LLM advisory bridge ready. Advisory review remains explanation-only."
          : health.statusMessage ?? "LLM bridge process is online, but advisory readiness is unavailable.";
      appendMessage("system", message);
      onAdvisoryEvent?.(
        health.advisoryCapabilityStatus === "ready" ? "LLM advisory ready" : "LLM advisory unavailable",
        message,
        health.advisoryCapabilityStatus === "ready" ? "success" : "warning"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM advisory bridge is offline.";
      setStatus("offline");
      setBridgeProcessStatus("offline");
      setAdvisoryCapabilityStatus("unavailable");
      setCircuitBreakerStatus(getLocalBridgeStatusSnapshot().circuitBreakerStatus);
      setLastPayload({
        status: "offline",
        bridgeProcessStatus: "offline",
        advisoryCapabilityStatus: "unavailable",
        circuitBreakerStatus: getLocalBridgeStatusSnapshot().circuitBreakerStatus,
        checkedAt: new Date().toISOString(),
        reason: "bridge_offline",
        warnings: [message],
        lastError: message,
        cooldownRemainingMs: getLocalBridgeStatusSnapshot().cooldownRemainingMs
      });
      appendMessage("system", "LLM advisory bridge offline. Deterministic research remains available.");
      onAdvisoryEvent?.("LLM advisory bridge offline", message, "warning");
    } finally {
      setBusy(false);
    }
  };

  const askAdvisor = async (question = input, options: { bypassCooldown?: boolean } = {}) => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      return;
    }
    appendMessage("user", trimmedQuestion);

    if (unsafeRequestPattern.test(trimmedQuestion)) {
      const refusal = "Execution is disabled. This advisor can explain research, blockers, and next tests only; it cannot place trades or control readiness.";
      setStatus("skipped");
      setAdvisoryCapabilityStatus("skipped");
      setLastPayload({
        status: "skipped",
        bridgeProcessStatus,
        advisoryCapabilityStatus: "skipped",
        circuitBreakerStatus,
        checkedAt: new Date().toISOString(),
        question: trimmedQuestion,
        reason: "unsafe_request",
        warnings: [refusal]
      });
      appendMessage("assistant", refusal);
      onAdvisoryEvent?.("LLM advisory request refused", "User request looked like an execution/order command. Advisory panel refused locally.", "locked");
      return;
    }

    if (!snapshot) {
      appendMessage("assistant", "Runtime snapshot is still loading, so advisory context is not ready yet.");
      setStatus("skipped");
      return;
    }

    setBusy(true);
    setStatus("running");
    setAdvisoryCapabilityStatus("running");
    appendMessage("system", "Advisory review running...");
    try {
      const packet = buildAdvisoryPacket(snapshot, trimmedQuestion);
      const result = await runLocalBridgeAdvisory(packet, undefined, { bypassCircuitBreaker: options.bypassCooldown });
      if (result.advisoryStatus === "unavailable") {
        const warning = result.warnings.join(" ");
        const detail = safeArray(result.details).join(" ");
        const statusSnapshot = getLocalBridgeStatusSnapshot();
        const nextBridgeProcessStatus: PanelBridgeProcessStatus =
          result.reason === "bridge_offline" ? "offline" : statusSnapshot.bridgeProcessStatus === "offline" ? "offline" : "online";
        const nextAdvisoryCapabilityStatus = capabilityFromUnavailableReason(result.reason);
        setStatus(result.reason === "bridge_offline" ? "offline" : "unavailable");
        setBridgeProcessStatus(nextBridgeProcessStatus);
        setAdvisoryCapabilityStatus(nextAdvisoryCapabilityStatus);
        setCircuitBreakerStatus(statusSnapshot.circuitBreakerStatus);
        setLastPayload({
          packetId: packet.packetId,
          status: "unavailable",
          bridgeProcessStatus: nextBridgeProcessStatus,
          advisoryCapabilityStatus: nextAdvisoryCapabilityStatus,
          circuitBreakerStatus: statusSnapshot.circuitBreakerStatus,
          checkedAt: new Date().toISOString(),
          lastAdvisoryRequestAt: new Date().toISOString(),
          question: trimmedQuestion,
          reason: result.reason,
          warnings: result.warnings,
          lastError: detail || warning,
          cooldownRemainingMs: statusSnapshot.cooldownRemainingMs
        });
        const message = advisoryMessageForUnavailable(result.reason, result.warnings, nextBridgeProcessStatus);
        appendMessage("assistant", message);
        onAdvisoryEvent?.(
          result.reason === "bridge_offline" ? "LLM advisory bridge offline" : "LLM advisory unavailable",
          message,
          "warning",
          result.offlineUntil
        );
        return;
      }

      const summary = summarizeReviewerResponses(result.responses);
      setStatus("online");
      setBridgeProcessStatus("online");
      setAdvisoryCapabilityStatus("ready");
      setCircuitBreakerStatus("closed");
      setLastPayload({
        packetId: packet.packetId,
        status: "online",
        bridgeProcessStatus: "online",
        advisoryCapabilityStatus: "ready",
        circuitBreakerStatus: "closed",
        checkedAt: new Date().toISOString(),
        lastAdvisoryRequestAt: new Date().toISOString(),
        question: trimmedQuestion,
        responses: result.responses,
        warnings: summary.topBlockers
      });
      appendMessage(
        "assistant",
        [
          summary.summary,
          summary.topBlockers.length ? `Top blockers: ${summary.topBlockers.join(" ")}` : "Top blockers: none reported by the advisory reviewers.",
          `Next suggested action: ${summary.nextAction}`,
          summary.caveats.length ? `Caveats: ${summary.caveats.join(" ")}` : "Caveat: advisory only; deterministic gates still decide readiness."
        ].join("\n\n")
      );
      onAdvisoryEvent?.("LLM advisory reviewed", "Bridge returned advisory-only reviewer responses for the dashboard panel.", "success", packet.packetId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM advisory request failed.";
      setStatus("error");
      setAdvisoryCapabilityStatus("error");
      setLastPayload({
        status: "error",
        bridgeProcessStatus,
        advisoryCapabilityStatus: "error",
        circuitBreakerStatus: getLocalBridgeStatusSnapshot().circuitBreakerStatus,
        checkedAt: new Date().toISOString(),
        question: trimmedQuestion,
        reason: "request_failed",
        warnings: [message],
        lastError: message
      });
      appendMessage("assistant", `Bridge ${bridgeProcessStatus === "online" ? "online, but " : ""}advisory request failed: ${message}`);
      onAdvisoryEvent?.("LLM advisory unavailable", message, "warning");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-cyan-300/15 bg-slate-950/85 p-4 shadow-[0_0_45px_rgba(8,145,178,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">LLM Advisory Review</p>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-50">
            <Bot className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            Research Advisor
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Plain-language review only. Deterministic agents, gates, and readiness stay in control.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={processBadgeVariant(bridgeProcessStatus)}>Bridge {shortStatus(bridgeProcessStatus)}</Badge>
          <Badge variant={advisoryBadgeVariant(advisoryCapabilityStatus)}>Advisory {shortStatus(advisoryCapabilityStatus)}</Badge>
          <Badge variant={circuitBadgeVariant(circuitBreakerStatus)}>Circuit {shortStatus(circuitBreakerStatus)}</Badge>
          <Badge variant="danger">execution none</Badge>
          <Badge variant="secondary">readiness override none</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <MiniAdvisoryReadout label="Bridge process" value={bridgeProcessStatus.replace(/_/g, " ")} />
        <MiniAdvisoryReadout label="Advisory capability" value={advisoryCapabilityStatus.replace(/_/g, " ")} />
        <MiniAdvisoryReadout label="Circuit breaker" value={circuitBreakerStatus.replace(/_/g, " ")} />
        <MiniAdvisoryReadout label="Source context" value={sourceContext} />
        <MiniAdvisoryReadout
          label="Regime / profile"
          value={
            snapshot
              ? `${snapshot.regime.label.replace(/_/g, " ")} ${Math.round(snapshot.regime.confidence * 100)}% / ${grinch?.profile.replace(/_/g, " ") ?? "profile pending"}`
              : "loading"
          }
        />
        <MiniAdvisoryReadout label="Readiness" value={snapshot?.readiness.readinessState ?? "loading"} />
        <MiniAdvisoryReadout label="Next action" value={nextSuggestedAction} />
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Latest advisory summary</p>
        <p className="mt-2 text-sm leading-5 text-slate-300">{latestSummary}</p>
        {blockers.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {blockers.map((blocker) => (
              <Badge key={blocker} variant="warning">
                {blocker.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto pr-1">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-lg border p-3 ${
              message.role === "user"
                ? "ml-8 border-cyan-300/20 bg-cyan-300/10 text-cyan-50"
                : message.role === "assistant"
                  ? "mr-8 border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
                  : "border-white/10 bg-white/[0.035] text-slate-300"
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                {message.role === "user" ? "You" : message.role === "assistant" ? "Advisor" : "Status"}
              </span>
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-slate-500">{formatDateTime(message.timestamp)}</span>
            </div>
            <p className="whitespace-pre-line text-sm leading-5">{message.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {promptButtons.map((prompt) => (
          <Button key={prompt} variant="secondary" size="sm" onClick={() => void askAdvisor(prompt)} disabled={busy}>
            {prompt}
          </Button>
        ))}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={2}
          className="min-h-12 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-300/20"
          placeholder="Ask the advisor to explain blockers, regime, Grinch profile state, or next tests."
        />
        <Button onClick={() => void askAdvisor()} disabled={busy || !input.trim()} className="h-full justify-center">
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          {busy ? "Reviewing..." : "Ask"}
        </Button>
        <Button variant="outline" onClick={() => void checkBridge()} disabled={busy} className="h-full justify-center">
          Check bridge
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void askAdvisor(input || "Explain this cycle", { bypassCooldown: true })}
          disabled={busy || !input.trim()}
          title="Reset the local advisory cooldown and attempt one advisory request."
        >
          Retry advisory
        </Button>
        <span className="self-center text-xs text-slate-500">
          Retry bypasses cooldown once; it still cannot change readiness or execution state.
        </span>
      </div>

      {status === "offline" || status === "unavailable" || advisoryCapabilityStatus !== "ready" ? (
        <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
          {bridgeProcessStatus === "offline"
            ? "LLM advisory bridge offline. Start npm.cmd run llm:bridge. Deterministic research remains available."
            : advisoryCapabilityStatus === "config_missing"
              ? "LLM bridge online, but advisory provider/model is not configured. Deterministic research remains available."
              : advisoryCapabilityStatus === "cooldown"
                ? "LLM bridge online, advisory retry paused after a recent failure. Use Retry advisory for one explicit attempt."
                : advisoryCapabilityStatus === "timeout"
                  ? `Bridge online, advisory timed out after ${Math.round(LLM_LOCAL_BRIDGE_ADVISORY_TIMEOUT_MS / 1000)} seconds. Deterministic research remains available.`
                  : advisoryCapabilityStatus === "error" || advisoryCapabilityStatus === "unavailable"
                    ? "LLM bridge process may be online, but advisory is unavailable. Deterministic research remains available."
                    : "LLM advisory status is not ready yet. Deterministic research remains available."}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <AuthorityLine label="Execution authority" value={authority.executionAuthority} />
        <AuthorityLine label="Broker authority" value={authority.brokerAuthority} />
        <AuthorityLine label="Readiness override" value={authority.readinessOverrideAuthority} />
      </div>

      <TechnicalDetails
        title="Advisory payload and status"
        description="Last dashboard advisory request metadata. No secrets or broker controls are included."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <MiniAdvisoryReadout label="Last checked" value={formatDateTime(lastPayload.checkedAt)} />
          <MiniAdvisoryReadout label="Bridge URL" value={LLM_LOCAL_BRIDGE_BASE_URL} />
          <MiniAdvisoryReadout label="Timeout" value={`${LLM_LOCAL_BRIDGE_ADVISORY_TIMEOUT_MS}ms`} />
          <MiniAdvisoryReadout label="Last health" value={lastPayload.lastHealthCheckAt ? formatDateTime(lastPayload.lastHealthCheckAt) : "none"} />
          <MiniAdvisoryReadout label="Last advisory request" value={lastPayload.lastAdvisoryRequestAt ? formatDateTime(lastPayload.lastAdvisoryRequestAt) : "none"} />
          <MiniAdvisoryReadout label="Bridge process" value={lastPayload.bridgeProcessStatus?.replace(/_/g, " ") ?? bridgeProcessStatus} />
          <MiniAdvisoryReadout label="Advisory capability" value={lastPayload.advisoryCapabilityStatus?.replace(/_/g, " ") ?? advisoryCapabilityStatus} />
          <MiniAdvisoryReadout label="Circuit breaker" value={lastPayload.circuitBreakerStatus?.replace(/_/g, " ") ?? circuitBreakerStatus} />
          <MiniAdvisoryReadout label="Cooldown remaining" value={`${Math.ceil((lastPayload.cooldownRemainingMs ?? 0) / 1000)}s`} />
          <MiniAdvisoryReadout label="Packet" value={lastPayload.packetId ?? "none"} />
          <MiniAdvisoryReadout label="Question" value={lastPayload.question ?? "none"} />
          <MiniAdvisoryReadout label="Reason" value={lastPayload.reason?.replace(/_/g, " ") ?? "none"} />
          <MiniAdvisoryReadout label="Last error" value={lastPayload.lastError ?? "none"} />
          <MiniAdvisoryReadout label="Responses" value={String(lastPayload.responses?.length ?? 0)} />
          <MiniAdvisoryReadout label="Warnings" value={safeArray(lastPayload.warnings).join(" / ") || "none"} />
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-300/15 bg-emerald-300/5 p-3 text-xs text-emerald-100/80">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          Advisory output is never used to place orders, mutate accounts, or override readiness gates.
        </div>
      </TechnicalDetails>
    </section>
  );
}

function MiniAdvisoryReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 line-clamp-3 break-words text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}

function AuthorityLine({ label, value }: { label: string; value: "none" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-300/15 bg-rose-300/5 px-3 py-2 text-xs">
      <span className="uppercase tracking-[0.14em] text-rose-100/70">{label}</span>
      <span className="font-mono font-semibold text-rose-100">{value}</span>
    </div>
  );
}
