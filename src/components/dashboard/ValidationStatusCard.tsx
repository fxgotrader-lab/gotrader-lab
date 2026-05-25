import { BarChart3, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResearchQualityReview } from "@/lib/researchQuality";
import type { ValidationSuiteReport } from "@/lib/validation";

import { formatDateTime, formatPercent, formatR } from "./dashboardFormatters";

type ValidationStatusCardProps = {
  report?: ValidationSuiteReport;
  qualityReview?: ResearchQualityReview;
};

export function ValidationStatusCard({ report, qualityReview }: ValidationStatusCardProps) {
  const strongest = report?.calibration.strongestScenario;
  const weakest = report?.calibration.weakestScenario;
  const primaryScenario = report?.scenarios.find((scenario) => scenario.name === strongest) ?? report?.scenarios[0];
  const readinessGrade = qualityReview?.readinessGrade ?? "Not Ready";

  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <BarChart3 className="h-4 w-4 text-sky-300" aria-hidden="true" />
            Validation Status
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">Backtests, scenario checks, and quality review.</p>
        </div>
        <Badge variant={report ? "success" : "secondary"}>{report ? "Run found" : "Not run"}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusLine label="Latest validation" value={formatDateTime(report?.generatedAt)} />
          <StatusLine label="Strongest scenario" value={strongest ?? "Unknown"} />
          <StatusLine label="Weakest scenario" value={weakest ?? "Unknown"} />
          <StatusLine label="Quality grade" value={readinessGrade} />
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <Metric label="Win rate" value={formatPercent(primaryScenario?.winRate)} />
          <Metric label="Average R" value={formatR(primaryScenario?.averageR)} />
          <Metric label="Max drawdown" value={formatR(primaryScenario?.maxDrawdown)} />
        </div>
        <div className="rounded-md border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100">
          Top weakness: {qualityReview?.topWeaknesses[0]?.title ?? "Run research quality review to identify it."}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link to="/validation">
            <Button variant="secondary" className="w-full justify-between">
              Open validation
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
          <Link to="/research-quality">
            <Button variant="outline" className="w-full justify-between">
              Open research quality
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-100">{value}</div>
    </div>
  );
}
