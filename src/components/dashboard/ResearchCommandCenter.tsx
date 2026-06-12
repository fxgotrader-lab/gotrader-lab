import { useState } from "react";

import { MissionControlShell } from "@/components/dashboard/MissionControlShell";
import { SimulationResultsDashboard } from "@/components/dashboard/SimulationResultsDashboard";
import { Button } from "@/components/ui/button";
import type { LabState } from "@/lib/types";
import { WORKSPACE_PAGE, WORKSPACE_SECTION_LABEL } from "@/components/common/workspaceStyles";

type ResearchCommandCenterProps = {
  state: LabState;
};

export function ResearchCommandCenter({ state }: ResearchCommandCenterProps) {
  const [activeTab, setActiveTab] = useState<"mission" | "results">("mission");

  return (
    <div className={WORKSPACE_PAGE}>
      <div className="premium-surface flex flex-col gap-4 rounded-[24px] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={WORKSPACE_SECTION_LABEL}>Dashboard mode</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">Command Center</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Supervise source status, validation progress, Paper-Demo operations, and research results from one clean workspace.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/25 p-1">
          <Button
            variant={activeTab === "mission" ? "default" : "ghost"}
            className="justify-center"
            onClick={() => setActiveTab("mission")}
          >
            Command
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
