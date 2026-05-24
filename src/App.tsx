import { Navigate, Route, Routes } from "react-router-dom";
import { AgentDetail } from "@/components/agents/AgentDetail";
import { AgentRoster } from "@/components/agents/AgentRoster";
import { AppShell } from "@/components/AppShell";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { PerformanceView } from "@/components/performance/PerformanceView";
import { PromptLab } from "@/components/prompt-lab/PromptLab";
import { ResearchWorkbench } from "@/components/research/ResearchWorkbench";
import { SettingsView } from "@/components/settings/SettingsView";
import { useLabState } from "@/lib/storage/useLabState";

export default function App() {
  const { state, actions } = useLabState();

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardOverview state={state} />} />
        <Route path="/agents" element={<AgentRoster state={state} />} />
        <Route path="/agents/:id" element={<AgentDetail state={state} />} />
        <Route path="/research" element={<ResearchWorkbench state={state} actions={actions} />} />
        <Route path="/performance" element={<PerformanceView state={state} />} />
        <Route path="/prompt-lab" element={<PromptLab state={state} actions={actions} />} />
        <Route path="/settings" element={<SettingsView state={state} onReset={actions.reset} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}
