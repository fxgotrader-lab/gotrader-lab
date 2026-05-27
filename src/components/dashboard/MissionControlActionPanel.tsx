import { AlertTriangle, PauseCircle, Play, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";

import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type MissionActionItem = {
  detail: string;
  href?: string;
  id: string;
  severity: "info" | "warning" | "critical" | "action_required";
  title: string;
};

type MissionControlActionPanelProps = {
  actionItems: MissionActionItem[];
  advancedFullResearchMode: boolean;
  autoApplyPolicyEnabled: boolean;
  busy: boolean;
  dataPresetLabel: string;
  maxIterations: string;
  noImprovementStop: string;
  onAdvancedFullResearchModeChange: (value: boolean) => void;
  onAutoApplyPolicyEnabledChange: (value: boolean) => void;
  onMaxIterationsChange: (value: string) => void;
  onNoImprovementStopChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  searchDepthLabel: string;
  selectedScenarioFamily: string;
};

const severityVariant = (severity: MissionActionItem["severity"]) =>
  severity === "critical"
    ? "danger"
    : severity === "action_required" || severity === "warning"
      ? "warning"
      : "secondary";

export function MissionControlActionPanel({
  actionItems,
  advancedFullResearchMode,
  autoApplyPolicyEnabled,
  busy,
  dataPresetLabel,
  maxIterations,
  noImprovementStop,
  onAdvancedFullResearchModeChange,
  onAutoApplyPolicyEnabledChange,
  onMaxIterationsChange,
  onNoImprovementStopChange,
  onStart,
  onStop,
  searchDepthLabel,
  selectedScenarioFamily
}: MissionControlActionPanelProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-xl border border-cyan-300/20 bg-cyan-950/30 p-4 shadow-[0_0_45px_rgba(8,145,178,0.1)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Primary controls</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-50">Supervisor Loop</h3>
            <p className="mt-2 text-sm text-cyan-100/75">Start or stop research automation only. Execution gates stay locked.</p>
          </div>
          <Badge variant={autoApplyPolicyEnabled ? "warning" : "secondary"}>
            {autoApplyPolicyEnabled ? "policy-gated auto-apply" : "proposal-only"}
          </Badge>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button onClick={onStart} disabled={busy} className="h-11 flex-1">
            <Play className="h-4 w-4" aria-hidden="true" />
            {busy ? "Loop running" : "Start Autonomous Research Loop"}
          </Button>
          <Button variant="destructive" onClick={onStop} disabled={!busy} className="h-11 sm:w-36">
            <PauseCircle className="h-4 w-4" aria-hidden="true" />
            Stop Loop
          </Button>
        </div>
        <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/55 p-3 text-xs text-slate-300">
          <div className="grid gap-2 sm:grid-cols-3">
            <Status label="Preset" value={dataPresetLabel} />
            <Status label="Search depth" value={searchDepthLabel} />
            <Status label="Scenario" value={selectedScenarioFamily} />
          </div>
        </div>
        <TechnicalDetails
          title="Secondary loop settings"
          description="Advanced research controls stay collapsed to keep mission control focused."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mission-max-iterations">Max iterations</Label>
              <Select
                id="mission-max-iterations"
                value={maxIterations}
                options={[1, 2, 3, 4, 5].map((value) => ({ label: String(value), value: String(value) }))}
                onChange={(event) => onMaxIterationsChange(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mission-no-improvement">No improvement stop</Label>
              <Select
                id="mission-no-improvement"
                value={noImprovementStop}
                options={[1, 2, 3].map((value) => ({ label: `${value} cycle${value === 1 ? "" : "s"}`, value: String(value) }))}
                onChange={(event) => onNoImprovementStopChange(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={autoApplyPolicyEnabled}
                onChange={(event) => onAutoApplyPolicyEnabledChange(event.target.checked)}
              />
              Enable policy-gated auto-apply
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={advancedFullResearchMode}
                onChange={(event) => onAdvancedFullResearchModeChange(event.target.checked)}
              />
              Advanced full research mode
            </label>
            <div className="rounded-lg border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-400">
              <SlidersHorizontal className="mb-2 h-4 w-4 text-slate-300" aria-hidden="true" />
              Scenario override and pause-after-next-cycle remain supervised settings. The default loop auto-selects scenario families from blockers.
            </div>
          </div>
        </TechnicalDetails>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-950/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Action required</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-50">Attention Queue</h3>
          </div>
          <Badge variant={actionItems.length ? "warning" : "success"}>{actionItems.length ? `${actionItems.length} open` : "clear"}</Badge>
        </div>
        <div className="mt-4 space-y-3">
          {actionItems.length ? (
            actionItems.map((item) => (
              <Link
                key={item.id}
                to={item.href ?? "/dashboard"}
                className="block rounded-lg border border-white/10 bg-white/[0.035] p-3 transition hover:border-amber-300/30 hover:bg-amber-300/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.detail}</p>
                    </div>
                  </div>
                  <Badge variant={severityVariant(item.severity)}>{item.severity.replace(/_/g, " ")}</Badge>
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-100">
              No immediate human action. Keep supervising the loop; broker execution remains disabled.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 truncate font-mono text-xs text-cyan-100">{value}</div>
    </div>
  );
}
