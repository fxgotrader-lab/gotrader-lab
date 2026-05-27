import { MissionControlShell } from "@/components/dashboard/MissionControlShell";
import type { LabState } from "@/lib/types";

type ResearchCommandCenterProps = {
  state: LabState;
};

export function ResearchCommandCenter({ state }: ResearchCommandCenterProps) {
  return <MissionControlShell state={state} />;
}
