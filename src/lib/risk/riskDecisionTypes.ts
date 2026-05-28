import {
  AGENT_BRIDGE_RISK_POLICY_VERSION,
  createAgentBridgeProvenance
} from "@/lib/agentBridge/marketScannerContracts";
import type { RiskDecision, StrategyCandidate } from "@/lib/agentBridge/agentBridgeTypes";
import type { MacroRiskFlag } from "@/lib/marketContext";

export const DEFAULT_RISK_MANAGER_MODE = "paper" as const;

export const createPlaceholderRiskDecision = (
  candidate: StrategyCandidate,
  riskDecisionId: string,
  rejectReasons: string[] = ["Risk Manager placeholder blocks execution until paper/live trading is explicitly implemented."],
  macroRiskFlags: MacroRiskFlag[] = candidate.macroRiskFlags ?? []
): RiskDecision => {
  const macroRejectReasons = macroRiskFlags
    .filter((flag) => flag.severity === "block")
    .map((flag) => `High-impact macro risk flag blocks execution window: ${flag.reason}`);
  return {
    ...createAgentBridgeProvenance({
      marketSnapshotId: candidate.marketSnapshotId,
      sentimentSnapshotId: candidate.sentimentSnapshotId,
      agentChain: [...candidate.agentChain, "risk_manager_placeholder"]
    }),
    riskDecisionId,
    signalId: candidate.signalId,
    approved: false,
    rejectReasons: [...macroRejectReasons, ...rejectReasons],
    mode: DEFAULT_RISK_MANAGER_MODE,
    maxLoss: null,
    executionAllowed: false,
    riskPolicyVersion: AGENT_BRIDGE_RISK_POLICY_VERSION,
    macroRiskFlags,
    generatedAt: new Date().toISOString()
  };
};
