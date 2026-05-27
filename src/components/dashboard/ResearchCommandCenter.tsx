import { useState } from "react";

import { MissionControlShell } from "@/components/dashboard/MissionControlShell";
import { SimulationResultsDashboard } from "@/components/dashboard/SimulationResultsDashboard";
import { Button } from "@/components/ui/button";
import type { LabState } from "@/lib/types";

type ResearchCommandCenterProps = {
  state: LabState;
};

export function ResearchCommandCenter({ state }: ResearchCommandCenterProps) {
  const [activeTab, setActiveTab] = useState<"mission" | "results">("mission");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-950/80 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Dashboard mode</p>
          <p className="mt-1 text-sm text-slate-400">
            Mission Control supervises the loop. Results shows simulated performance and research-cycle outcomes.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/25 p-1">
          <Button
            variant={activeTab === "mission" ? "default" : "ghost"}
            className="justify-center"
            onClick={() => setActiveTab("mission")}
          >
            Mission Control
          </Button>
          <Button
            variant={activeTab === "results" ? "default" : "ghost"}
            className="justify-center"
            onClick={() => setActiveTab("results")}
          >
            Results
          </Button>
        </div>
      </div>

      {activeTab === "mission" ? <MissionControlShell state={state} /> : <SimulationResultsDashboard state={state} />}
    </div>
  );
}
