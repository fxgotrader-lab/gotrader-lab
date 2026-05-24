import { useCallback, useMemo, useState } from "react";
import {
  approveMutation,
  labStorage,
  recordSignalExportDecision,
  rejectMutation,
  rollbackPromptVersion
} from "@/lib/storage";
import { applySimulatedOutcome, generateThesis } from "@/lib/simulation";
import type { LabState, ThesisInput } from "@/lib/types";

export function useLabState() {
  const [state, setState] = useState<LabState>(() => labStorage.load());

  const commit = useCallback((updater: (current: LabState) => LabState) => {
    setState((current) => {
      const next = updater(current);
      labStorage.save(next);
      return next;
    });
  }, []);

  const actions = useMemo(
    () => ({
      reset() {
        setState(labStorage.reset());
      },
      saveThesis(input: ThesisInput) {
        const generated = generateThesis(input, state);
        commit((current) => {
          return {
            ...current,
            debateSessions: [generated.debateSession, ...current.debateSessions],
            tradeTheses: [generated.thesis, ...current.tradeTheses],
            recommendations: [...generated.recommendations, ...current.recommendations]
          };
        });
        return generated;
      },
      approveMutation(mutationId: string) {
        commit((current) => approveMutation(current, mutationId));
      },
      rejectMutation(mutationId: string) {
        commit((current) => rejectMutation(current, mutationId));
      },
      recordSignalExport(thesisId: string, decision: "approved" | "rejected") {
        commit((current) => recordSignalExportDecision(current, thesisId, decision));
      },
      scoreThesis(thesisId: string) {
        commit((current) => {
          const thesis = current.tradeTheses.find((item) => item.id === thesisId);
          return thesis ? applySimulatedOutcome(current, thesis) : current;
        });
      },
      rollbackPrompt(promptVersionId: string) {
        commit((current) => rollbackPromptVersion(current, promptVersionId));
      }
    }),
    [commit, state]
  );

  return { state, actions };
}
