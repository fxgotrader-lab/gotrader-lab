import { Navigate, Route, Routes } from "react-router-dom";
import { AgentDetail } from "@/components/agents/AgentDetail";
import { AgentRoster } from "@/components/agents/AgentRoster";
import { AppShell } from "@/components/AppShell";
import { BacktestLab } from "@/components/backtest-lab/BacktestLab";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { ICTLab } from "@/components/ict-lab/ICTLab";
import { PerformanceView } from "@/components/performance/PerformanceView";
import { PromptLab } from "@/components/prompt-lab/PromptLab";
import { ResearchWorkbench } from "@/components/research/ResearchWorkbench";
import { ReplayView } from "@/components/replay/ReplayView";
import { SettingsView } from "@/components/settings/SettingsView";
import { StrategyValidationView } from "@/components/validation/StrategyValidationView";
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
        <Route path="/ict-lab" element={<ICTLab />} />
        <Route path="/replay" element={<ReplayView />} />
        <Route path="/backtest-lab" element={<BacktestLab />} />
        <Route path="/validation" element={<StrategyValidationView />} />
        <Route path="/performance" element={<PerformanceView state={state} />} />
        <Route path="/prompt-lab" element={<PromptLab state={state} actions={actions} />} />
        <Route path="/settings" element={<SettingsView state={state} onReset={actions.reset} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}
