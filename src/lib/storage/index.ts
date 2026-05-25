import { createInitialLabState } from "@/lib/mockData";
import type { AdvisoryPacketAuditEntry, GoTraderHandoffAuditEntry, LabState } from "@/lib/types";
import { uid } from "@/lib/utils";

export interface LabStorageAdapter {
  load(): LabState;
  save(state: LabState): void;
  reset(): LabState;
}

const STORAGE_KEY = "gotrader-ai-lab-state";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const normalizeLabState = (state: Partial<LabState>): LabState => {
  const seeded = createInitialLabState();
  return {
    ...seeded,
    ...state,
    agents: state.agents ?? seeded.agents,
    promptVersions: state.promptVersions ?? seeded.promptVersions,
    recommendations: state.recommendations ?? seeded.recommendations,
    outcomes: state.outcomes ?? seeded.outcomes,
    performanceScores: state.performanceScores ?? seeded.performanceScores,
    promptMutations: state.promptMutations ?? seeded.promptMutations,
    debateSessions: state.debateSessions ?? seeded.debateSessions,
    tradeTheses: state.tradeTheses ?? seeded.tradeTheses,
    handoffExports: state.handoffExports ?? [],
    advisoryPackets: state.advisoryPackets ?? [],
    userApprovals: state.userApprovals ?? seeded.userApprovals
  };
};

export class LocalStorageLabAdapter implements LabStorageAdapter {
  load(): LabState {
    if (!isBrowser()) {
      return createInitialLabState();
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = createInitialLabState();
      this.save(seeded);
      return seeded;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<LabState>;
      const normalized = normalizeLabState(parsed);
      if (!parsed.handoffExports || !parsed.advisoryPackets) {
        this.save(normalized);
      }
      return normalized;
    } catch {
      const seeded = createInitialLabState();
      this.save(seeded);
      return seeded;
    }
  }

  save(state: LabState) {
    if (isBrowser()) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }

  reset(): LabState {
    const seeded = createInitialLabState();
    this.save(seeded);
    return seeded;
  }
}

export const labStorage = new LocalStorageLabAdapter();

export function approveMutation(state: LabState, mutationId: string): LabState {
  const mutation = state.promptMutations.find((item) => item.id === mutationId);
  if (!mutation) {
    return state;
  }

  const candidate = state.promptVersions.find((prompt) => prompt.id === mutation.candidatePromptVersionId);
  if (!candidate) {
    return state;
  }

  const updatedPromptVersions = state.promptVersions.map((prompt) => {
    if (prompt.agentId === candidate.agentId && prompt.status === "active") {
      return { ...prompt, status: "accepted" as const };
    }
    if (prompt.id === candidate.id) {
      return {
        ...prompt,
        status: "active" as const,
        approvedByUser: true,
        activatedAt: new Date().toISOString()
      };
    }
    return prompt;
  });

  const updatedAgents = state.agents.map((agent) =>
    agent.id === candidate.agentId
      ? {
          ...agent,
          currentPromptVersionId: candidate.id,
          currentSystemPrompt: candidate.prompt,
          confidenceCalibration: Math.min(0.96, agent.confidenceCalibration + 0.04),
          sharpeLike: Number((agent.sharpeLike + 0.08).toFixed(2))
        }
      : agent
  );

  return {
    ...state,
    agents: updatedAgents,
    promptVersions: updatedPromptVersions,
    promptMutations: state.promptMutations.map((item) =>
      item.id === mutationId
        ? {
            ...item,
            status: "accepted",
            userDecisionAt: new Date().toISOString(),
            candidatePerformance: item.candidatePerformance ?? {
              hitRate: Math.min(0.9, item.oldPerformance.hitRate + 0.05),
              drawdown: Math.max(0.02, item.oldPerformance.drawdown - 0.03),
              sharpeLike: Number((item.oldPerformance.sharpeLike + 0.28).toFixed(2)),
              confidenceCalibration: Math.min(0.94, item.oldPerformance.confidenceCalibration + 0.08),
              sampleSize: item.oldPerformance.sampleSize + 8
            }
          }
        : item
    ),
    userApprovals: [
      ...state.userApprovals,
      {
        id: uid("approval"),
        createdAt: new Date().toISOString(),
        entityType: "prompt_mutation",
        entityId: mutationId,
        decision: "approved"
      }
    ]
  };
}

export function rejectMutation(state: LabState, mutationId: string): LabState {
  return {
    ...state,
    promptVersions: state.promptVersions.map((prompt) => {
      const mutation = state.promptMutations.find((item) => item.id === mutationId);
      return mutation?.candidatePromptVersionId === prompt.id
        ? { ...prompt, status: "rejected" as const, approvedByUser: false }
        : prompt;
    }),
    promptMutations: state.promptMutations.map((item) =>
      item.id === mutationId
        ? {
            ...item,
            status: "rejected",
            userDecisionAt: new Date().toISOString(),
            candidatePerformance: item.candidatePerformance ?? {
              hitRate: Math.max(0.3, item.oldPerformance.hitRate - 0.04),
              drawdown: Math.min(0.22, item.oldPerformance.drawdown + 0.03),
              sharpeLike: Number((item.oldPerformance.sharpeLike - 0.18).toFixed(2)),
              confidenceCalibration: Math.max(0.35, item.oldPerformance.confidenceCalibration - 0.06),
              sampleSize: item.oldPerformance.sampleSize + 6
            }
          }
        : item
    ),
    userApprovals: [
      ...state.userApprovals,
      {
        id: uid("approval"),
        createdAt: new Date().toISOString(),
        entityType: "prompt_mutation",
        entityId: mutationId,
        decision: "rejected"
      }
    ]
  };
}

export function recordSignalExportDecision(
  state: LabState,
  thesisId: string,
  decision: "approved" | "rejected"
): LabState {
  return {
    ...state,
    userApprovals: [
      ...state.userApprovals,
      {
        id: uid("approval"),
        createdAt: new Date().toISOString(),
        entityType: "signal_export",
        entityId: thesisId,
        decision
      }
    ]
  };
}

export function recordHandoffExport(
  state: LabState,
  entry: Omit<GoTraderHandoffAuditEntry, "id">
): LabState {
  return {
    ...state,
    handoffExports: [
      {
        id: uid("handoff_export"),
        ...entry
      },
      ...(state.handoffExports ?? [])
    ]
  };
}

export function recordAdvisoryPacket(
  state: LabState,
  entry: Omit<AdvisoryPacketAuditEntry, "id">
): LabState {
  return {
    ...state,
    advisoryPackets: [
      {
        id: uid("advisory_packet_audit"),
        ...entry
      },
      ...(state.advisoryPackets ?? [])
    ]
  };
}

export function rollbackPromptVersion(state: LabState, promptVersionId: string): LabState {
  const target = state.promptVersions.find((prompt) => prompt.id === promptVersionId);
  if (!target) {
    return state;
  }

  return {
    ...state,
    agents: state.agents.map((agent) =>
      agent.id === target.agentId
        ? {
            ...agent,
            currentPromptVersionId: target.id,
            currentSystemPrompt: target.prompt
          }
        : agent
    ),
    promptVersions: state.promptVersions.map((prompt) => {
      if (prompt.agentId !== target.agentId) {
        return prompt;
      }
      if (prompt.id === target.id) {
        return {
          ...prompt,
          status: "active" as const,
          approvedByUser: true,
          activatedAt: new Date().toISOString()
        };
      }
      if (prompt.status === "active") {
        return { ...prompt, status: "rolled_back" as const };
      }
      return prompt;
    })
  };
}
