import type { GoTraderHandoffAuditEntry } from "@/lib/types";

export type BridgeVerificationKey =
  | "handoffExportCreated"
  | "readerConversionTested"
  | "schedulerOneCycleTested"
  | "brokerExecutionSkipped"
  | "zeroTradesExecuted";

export type BridgeVerificationState = Record<BridgeVerificationKey, boolean>;

export interface BridgeStatusSnapshot {
  mode: "Simulation only";
  latestHandoffExportTimestamp: string;
  totalHandoffExports: number;
  recommendedHandoffPath: string;
  readerCommand: string;
  schedulerCommand: string;
  warning: string;
}

export const bridgeVerificationItems: Array<{ key: BridgeVerificationKey; label: string }> = [
  { key: "handoffExportCreated", label: "Handoff export created" },
  { key: "readerConversionTested", label: "Reader conversion tested" },
  { key: "schedulerOneCycleTested", label: "Scheduler one-cycle tested" },
  { key: "brokerExecutionSkipped", label: "Broker execution skipped" },
  { key: "zeroTradesExecuted", label: "0 trades executed" }
];

export const defaultBridgeVerificationState: BridgeVerificationState = {
  handoffExportCreated: false,
  readerConversionTested: false,
  schedulerOneCycleTested: false,
  brokerExecutionSkipped: false,
  zeroTradesExecuted: false
};

const BRIDGE_VERIFICATION_STORAGE_KEY = "gotrader-ai-lab-bridge-verification";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const recommendedHandoffPath =
  "C:/Users/andre/OneDrive/Documents/gotrader/exports/latest-gotrader-handoff.json";

export const goTraderReaderCommand =
  "python shared_scripts/check_ict_ai_lab.py --handoff-file ../gotrader/exports/latest-gotrader-handoff.json";

export const goTraderSchedulerCommand =
  '$env:GOTRADER_PYTHON = "C:\\Python314\\python.exe"\ngo run . -config ../docs/ai-lab-scheduler-simulation.config.json -once';

export function getBridgeStatusSnapshot(handoffExports: GoTraderHandoffAuditEntry[] = []): BridgeStatusSnapshot {
  const latest = handoffExports.reduce<GoTraderHandoffAuditEntry | undefined>((current, entry) => {
    if (!current) {
      return entry;
    }
    return new Date(entry.exportedAt).getTime() > new Date(current.exportedAt).getTime() ? entry : current;
  }, undefined);

  return {
    mode: "Simulation only",
    latestHandoffExportTimestamp: latest?.exportedAt ?? "No handoff exports yet",
    totalHandoffExports: handoffExports.length,
    recommendedHandoffPath,
    readerCommand: goTraderReaderCommand,
    schedulerCommand: goTraderSchedulerCommand,
    warning: "Simulation bridge only. No broker connection. No real trades."
  };
}

export function loadBridgeVerificationState(): BridgeVerificationState {
  if (!isBrowser()) {
    return defaultBridgeVerificationState;
  }

  try {
    const raw = window.localStorage.getItem(BRIDGE_VERIFICATION_STORAGE_KEY);
    if (!raw) {
      return defaultBridgeVerificationState;
    }
    const parsed = JSON.parse(raw) as Partial<BridgeVerificationState>;
    return {
      ...defaultBridgeVerificationState,
      ...parsed
    };
  } catch {
    return defaultBridgeVerificationState;
  }
}

export function saveBridgeVerificationState(state: BridgeVerificationState) {
  if (isBrowser()) {
    window.localStorage.setItem(BRIDGE_VERIFICATION_STORAGE_KEY, JSON.stringify(state));
  }
}
