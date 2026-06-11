import { useMemo, useState } from "react";
import { Radio, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  advisorProviderStatusInfo,
  checkOpenClawBridgeHealth,
  classifyLocalLlmCapability,
  getLocalBridgeStatusSnapshot,
  loadAdvisoryProviderSettings,
  OPENCLAW_STUB_SETUP_STEPS,
  openClawEndpointHostLabel,
  type AdvisorProviderStatusLevel,
  type GoTraderAdvisoryProviderMode,
  type OpenClawBridgeHealthResult
} from "@/lib/llm";

const providerModeLabel = (mode: GoTraderAdvisoryProviderMode) =>
  mode === "openclaw" ? "OpenClaw Research Advisor" : mode === "disabled" ? "Advisory disabled" : "LLM Advisory (local bridge)";

const toneVariant = (tone: "success" | "warning" | "danger" | "muted") =>
  tone === "success" ? ("success" as const) : tone === "warning" ? ("warning" as const) : tone === "danger" ? ("danger" as const) : ("muted" as const);

const formatChecked = (value?: string) => (value ? new Date(value).toLocaleTimeString() : "not checked yet");

/**
 * Instructions for promoting the phone bridge from stub to full
 * skill-routed OpenClaw advisory. Shown only when stub mode is detected.
 */
export function OpenClawStubSetupHelper({ testId = "openclaw-stub-helper" }: { testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100"
    >
      <p className="font-semibold">How to get full routed OpenClaw</p>
      <p className="mt-1 text-amber-200/85">
        The phone bridge is answering in stub mode because the OpenClaw advisory skill endpoint is not wired. Run both
        services on the phone:
      </p>
      {OPENCLAW_STUB_SETUP_STEPS.map((step) => (
        <div key={step.title} className="mt-2">
          <p className="font-medium text-amber-100">{step.title}</p>
          <pre className="mt-1 overflow-x-auto rounded-md bg-black/40 p-2 font-mono text-[0.7rem] leading-5 text-amber-100">
            {step.command}
          </pre>
        </div>
      ))}
      <p className="mt-2 text-amber-200/80">
        Routing stays advisory/proposal-only. Authority remains none; auto-apply remains disabled.
      </p>
    </div>
  );
}

/**
 * Advisor provider status header. Distinguishes deterministic local chat,
 * the local LLM bridge, OpenClaw stub, skill-routed OpenClaw, offline,
 * timeout, and not-configured states so a stub or offline provider is never
 * shown as ordinary success.
 */
export function AdvisorProviderStatusHeader({ testId = "advisor-provider-status" }: { testId?: string }) {
  const settings = useMemo(() => loadAdvisoryProviderSettings(), []);
  const [health, setHealth] = useState<OpenClawBridgeHealthResult | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | undefined>(undefined);

  const localBridgeSnapshot = useMemo(() => getLocalBridgeStatusSnapshot(), []);

  const providerStatus: AdvisorProviderStatusLevel = useMemo(() => {
    if (settings.providerMode === "disabled") {
      return "disabled";
    }
    if (settings.providerMode === "openclaw") {
      if (!settings.openClawAdvisoryUrl.trim()) {
        return "openclaw_not_configured";
      }
      return health?.providerStatus ?? "openclaw_not_configured";
    }
    if (localBridgeSnapshot.advisoryCapabilityStatus === "unknown") {
      return "local_llm_config_missing";
    }
    return classifyLocalLlmCapability(localBridgeSnapshot.advisoryCapabilityStatus);
  }, [settings, health, localBridgeSnapshot]);

  const statusInfo = advisorProviderStatusInfo(providerStatus);
  const openClawSelected = settings.providerMode === "openclaw";
  const notCheckedYet = openClawSelected && !health;
  const skillRoutedLabel = !openClawSelected
    ? "n/a"
    : health
      ? health.providerStatus === "openclaw_skill_routed"
        ? "yes"
        : "no"
      : "unknown (not checked)";

  const checkBridge = async () => {
    setChecking(true);
    try {
      const result = await checkOpenClawBridgeHealth(settings.openClawAdvisoryUrl);
      setHealth(result);
      setLastCheckedAt(result.checkedAt);
    } finally {
      setChecking(false);
    }
  };

  return (
    <section
      data-testid={testId}
      className="rounded-xl border border-white/10 bg-slate-950/55 px-4 py-3 text-xs text-slate-300"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Radio className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Advisor provider</span>
        <Badge variant="secondary" data-testid="advisor-provider-mode">
          {providerModeLabel(settings.providerMode)}
        </Badge>
        <Badge variant={toneVariant(statusInfo.tone)} data-testid="advisor-provider-status-chip">
          {notCheckedYet ? "OpenClaw configured - not checked yet" : statusInfo.label}
        </Badge>
        <Badge variant="muted" data-testid="advisor-provider-authority">
          <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
          Authority: none
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>
          <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Chat on this page</span>{" "}
          Deterministic Research Helper (local deterministic guidance)
        </span>
        {openClawSelected ? (
          <>
            <span data-testid="advisor-openclaw-bridge-url">
              <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Bridge</span>{" "}
              {openClawEndpointHostLabel(settings.openClawAdvisoryUrl)}
            </span>
            <span data-testid="advisor-openclaw-skill-routed">
              <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Skill routed</span>{" "}
              {skillRoutedLabel}
            </span>
          </>
        ) : null}
        <span data-testid="advisor-provider-last-checked">
          <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">Last checked</span>{" "}
          {formatChecked(lastCheckedAt)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">{statusInfo.detail}</p>
      {openClawSelected ? (
        <div className="mt-2">
          <Button size="sm" variant="outline" onClick={() => void checkBridge()} disabled={checking}>
            {checking ? "Checking bridge..." : "Check OpenClaw bridge"}
          </Button>
        </div>
      ) : null}
      {providerStatus === "openclaw_bridge_stub" ? <OpenClawStubSetupHelper /> : null}
    </section>
  );
}
