import { PerformanceView } from "@/components/performance/PerformanceView";
import type { LabState } from "@/lib/types";

export function SimulationResultsDashboard({ state }: { state: LabState }) {
  return <PerformanceView state={state} />;
}
