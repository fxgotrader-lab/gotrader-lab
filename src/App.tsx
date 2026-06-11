import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useLabState } from "@/lib/storage/useLabState";

// Route-level code splitting: each view loads on demand so the initial
// bundle stays small. Views are named exports, so map them to default.
const AgentDetail = lazy(() => import("@/components/agents/AgentDetail").then((m) => ({ default: m.AgentDetail })));
const AgentRoster = lazy(() => import("@/components/agents/AgentRoster").then((m) => ({ default: m.AgentRoster })));
const AgentAuditView = lazy(() => import("@/components/agent-audit/AgentAuditView").then((m) => ({ default: m.AgentAuditView })));
const AgentDebateView = lazy(() => import("@/components/agent-debate/AgentDebateView").then((m) => ({ default: m.AgentDebateView })));
const AdvisoryAgentsView = lazy(() => import("@/components/advisory/AdvisoryAgentsView").then((m) => ({ default: m.AdvisoryAgentsView })));
const ResearchAdvisorView = lazy(() => import("@/components/advisor/ResearchAdvisorView").then((m) => ({ default: m.ResearchAdvisorView })));
const AutoResearchView = lazy(() => import("@/components/auto-research/AutoResearchView").then((m) => ({ default: m.AutoResearchView })));
const AutonomousResearchView = lazy(() => import("@/components/autonomous-research/AutonomousResearchView").then((m) => ({ default: m.AutonomousResearchView })));
const BacktestLab = lazy(() => import("@/components/backtest-lab/BacktestLab").then((m) => ({ default: m.BacktestLab })));
const AICommunicationsView = lazy(() => import("@/components/communications/AICommunicationsView").then((m) => ({ default: m.AICommunicationsView })));
const ResearchCommandCenter = lazy(() => import("@/components/dashboard/ResearchCommandCenter").then((m) => ({ default: m.ResearchCommandCenter })));
const EvidenceQualityView = lazy(() => import("@/components/evidence/EvidenceQualityView").then((m) => ({ default: m.EvidenceQualityView })));
const ICTLab = lazy(() => import("@/components/ict-lab/ICTLab").then((m) => ({ default: m.ICTLab })));
const LLMAgentsView = lazy(() => import("@/components/llm-agents/LLMAgentsView").then((m) => ({ default: m.LLMAgentsView })));
const MarketDataView = lazy(() => import("@/components/market-data/MarketDataView").then((m) => ({ default: m.MarketDataView })));
const ResearchMaturityView = lazy(() => import("@/components/maturity/ResearchMaturityView").then((m) => ({ default: m.ResearchMaturityView })));
const PerformanceView = lazy(() => import("@/components/performance/PerformanceView").then((m) => ({ default: m.PerformanceView })));
const PromptLab = lazy(() => import("@/components/prompt-lab/PromptLab").then((m) => ({ default: m.PromptLab })));
const ReadinessGateView = lazy(() => import("@/components/readiness/ReadinessGateView").then((m) => ({ default: m.ReadinessGateView })));
const ResearchWorkbench = lazy(() => import("@/components/research/ResearchWorkbench").then((m) => ({ default: m.ResearchWorkbench })));
const ResearchQualityView = lazy(() => import("@/components/research-quality/ResearchQualityView").then((m) => ({ default: m.ResearchQualityView })));
const ReplayView = lazy(() => import("@/components/replay/ReplayView").then((m) => ({ default: m.ReplayView })));
const SettingsView = lazy(() => import("@/components/settings/SettingsView").then((m) => ({ default: m.SettingsView })));
const SelfImprovementView = lazy(() => import("@/components/self-improvement/SelfImprovementView").then((m) => ({ default: m.SelfImprovementView })));
const SimulationRunbookView = lazy(() => import("@/components/simulation-runbook/SimulationRunbookView").then((m) => ({ default: m.SimulationRunbookView })));
const StrategyValidationView = lazy(() => import("@/components/validation/StrategyValidationView").then((m) => ({ default: m.StrategyValidationView })));
const WalkForwardView = lazy(() => import("@/components/walk-forward/WalkForwardView").then((m) => ({ default: m.WalkForwardView })));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground" role="status">
      Loading workspace…
    </div>
  );
}

export default function App() {
  const { state, actions } = useLabState();

  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<ResearchCommandCenter state={state} />} />
          <Route path="/advisor" element={<ResearchAdvisorView />} />
          <Route path="/research-advisor" element={<ResearchAdvisorView />} />
          <Route path="/communications" element={<AICommunicationsView />} />
          <Route path="/agent-audit" element={<AgentAuditView />} />
          <Route path="/agent-debate" element={<AgentDebateView />} />
          <Route path="/evidence-quality" element={<EvidenceQualityView />} />
          <Route path="/research-maturity" element={<ResearchMaturityView />} />
          <Route path="/agents" element={<AgentRoster state={state} />} />
          <Route path="/agents/:id" element={<AgentDetail state={state} />} />
          <Route path="/research" element={<ResearchWorkbench state={state} actions={actions} />} />
          <Route path="/ict-lab" element={<ICTLab />} />
          <Route path="/market-data" element={<MarketDataView />} />
          <Route path="/replay" element={<ReplayView />} />
          <Route path="/backtest-lab" element={<BacktestLab />} />
          <Route path="/validation" element={<StrategyValidationView />} />
          <Route path="/walk-forward" element={<WalkForwardView />} />
          <Route path="/research-quality" element={<ResearchQualityView />} />
          <Route path="/simulation-runbook" element={<SimulationRunbookView />} />
          <Route path="/readiness-gate" element={<ReadinessGateView />} />
          <Route path="/llm-agents" element={<LLMAgentsView state={state} />} />
          <Route path="/auto-research" element={<AutoResearchView />} />
          <Route path="/autonomous-research" element={<AutonomousResearchView state={state} />} />
          <Route path="/advisory-agents" element={<AdvisoryAgentsView state={state} actions={actions} />} />
          <Route path="/self-improvement" element={<SelfImprovementView />} />
          <Route path="/performance" element={<PerformanceView state={state} />} />
          <Route path="/prompt-lab" element={<PromptLab state={state} actions={actions} />} />
          <Route path="/settings" element={<SettingsView state={state} onReset={actions.reset} />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
