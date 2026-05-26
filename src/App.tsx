import { Navigate, Route, Routes } from "react-router-dom";
import { AgentDetail } from "@/components/agents/AgentDetail";
import { AgentRoster } from "@/components/agents/AgentRoster";
import { AgentAuditView } from "@/components/agent-audit/AgentAuditView";
import { AdvisoryAgentsView } from "@/components/advisory/AdvisoryAgentsView";
import { AppShell } from "@/components/AppShell";
import { AutoResearchView } from "@/components/auto-research/AutoResearchView";
import { BacktestLab } from "@/components/backtest-lab/BacktestLab";
import { AICommunicationsView } from "@/components/communications/AICommunicationsView";
import { ResearchCommandCenter } from "@/components/dashboard/ResearchCommandCenter";
import { ICTLab } from "@/components/ict-lab/ICTLab";
import { LLMAgentsView } from "@/components/llm-agents/LLMAgentsView";
import { PerformanceView } from "@/components/performance/PerformanceView";
import { PromptLab } from "@/components/prompt-lab/PromptLab";
import { ReadinessGateView } from "@/components/readiness/ReadinessGateView";
import { ResearchWorkbench } from "@/components/research/ResearchWorkbench";
import { ResearchQualityView } from "@/components/research-quality/ResearchQualityView";
import { ReplayView } from "@/components/replay/ReplayView";
import { SettingsView } from "@/components/settings/SettingsView";
import { SelfImprovementView } from "@/components/self-improvement/SelfImprovementView";
import { SimulationRunbookView } from "@/components/simulation-runbook/SimulationRunbookView";
import { StrategyValidationView } from "@/components/validation/StrategyValidationView";
import { useLabState } from "@/lib/storage/useLabState";

export default function App() {
  const { state, actions } = useLabState();

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ResearchCommandCenter state={state} />} />
        <Route path="/communications" element={<AICommunicationsView />} />
        <Route path="/agent-audit" element={<AgentAuditView />} />
        <Route path="/agents" element={<AgentRoster state={state} />} />
        <Route path="/agents/:id" element={<AgentDetail state={state} />} />
        <Route path="/research" element={<ResearchWorkbench state={state} actions={actions} />} />
        <Route path="/ict-lab" element={<ICTLab />} />
        <Route path="/replay" element={<ReplayView />} />
        <Route path="/backtest-lab" element={<BacktestLab />} />
        <Route path="/validation" element={<StrategyValidationView />} />
        <Route path="/research-quality" element={<ResearchQualityView />} />
        <Route path="/simulation-runbook" element={<SimulationRunbookView />} />
        <Route path="/readiness-gate" element={<ReadinessGateView />} />
        <Route path="/llm-agents" element={<LLMAgentsView state={state} />} />
        <Route path="/auto-research" element={<AutoResearchView />} />
        <Route path="/advisory-agents" element={<AdvisoryAgentsView state={state} actions={actions} />} />
        <Route path="/self-improvement" element={<SelfImprovementView />} />
        <Route path="/performance" element={<PerformanceView state={state} />} />
        <Route path="/prompt-lab" element={<PromptLab state={state} actions={actions} />} />
        <Route path="/settings" element={<SettingsView state={state} onReset={actions.reset} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}
