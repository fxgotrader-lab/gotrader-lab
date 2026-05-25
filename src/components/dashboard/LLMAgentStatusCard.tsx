import { BrainCircuit, ExternalLink, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LLMAdvisoryRun, LLMProviderStatus, LLMResearchState } from "@/lib/llm";

import { formatDateTime } from "./dashboardFormatters";

type LLMAgentStatusCardProps = {
  latestRun?: LLMAdvisoryRun;
  providerStatus: LLMProviderStatus;
  state: LLMResearchState;
};

export function LLMAgentStatusCard({ latestRun, providerStatus, state }: LLMAgentStatusCardProps) {
  const advisoryPassed = latestRun?.advisoryPassed ?? false;
  const providerReady = providerStatus.configured;

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <BrainCircuit className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            LLM Agent Status
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Required for real research mode, advisory only.</p>
        </div>
        <Badge variant={advisoryPassed ? "success" : providerReady ? "warning" : "danger"}>
          {advisoryPassed ? "Review passed" : providerReady ? "Ready to run" : "Provider needed"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Provider" value={providerStatus.providerMode} />
          <StatusLine label="Mode" value={state.researchMode} />
          <StatusLine label="Latest run" value={formatDateTime(latestRun?.timestamp)} />
          <StatusLine label="Unsafe rejections" value={String(state.unsafeResponseRejections)} />
        </div>
        <div className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs text-cyan-100">
          <ShieldAlert className="mr-2 inline h-3.5 w-3.5" aria-hidden="true" />
          Advisory-only status: execution authority none, broker authority none, readiness override none.
        </div>
        <Link to="/llm-agents">
          <Button variant="secondary" className="w-full justify-between">
            Open LLM agents
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 truncate font-medium text-slate-200">{value}</div>
    </div>
  );
}
