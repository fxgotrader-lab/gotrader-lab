import { AlertTriangle, BookOpen, CalendarDays, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const validationSteps = [
  "Start with default parameters",
  "Run a baseline backtest",
  "Record baseline results",
  "Run conservative and aggressive scenarios",
  "Compare NY AM and London sessions",
  "Compare long-only and short-only results",
  "Test latest swing, fixed ticks, and FVG invalidation stops",
  "Run the validation suite",
  "Run research quality review",
  "Change only one variable, rerun, and stop if results destabilize"
];

const bestPractices = [
  "Do not chase the highest profit number",
  "Prefer stable average R over one big win",
  "Watch drawdown, skipped signals, false positives, and confidence calibration",
  "Compare sessions and long/short direction separately",
  "Keep conservative settings as the main benchmark"
];

const routeLinks = [
  { label: "Backtest Lab", href: "/backtest-lab" },
  { label: "Validation", href: "/validation" },
  { label: "Research Quality", href: "/research-quality" },
  { label: "Simulation Runbook", href: "/simulation-runbook" }
];

export function ValidationGuideCard({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Card className={cn("border-primary/20", className)}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>How To Run Validation Cycles</CardTitle>
            </div>
            <CardDescription>
              Beginner-friendly workflow for testing ICT assumptions without overfitting or advancing too early.
            </CardDescription>
          </div>
          <Badge variant="warning">Simulation only</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
          <AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden="true" />
          Simulation validation only. Do not connect broker execution until the system repeatedly reaches
          Paper-Demo Candidate under conservative settings.
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              Numbered Workflow
            </div>
            <div className={cn("grid gap-2", !compact && "md:grid-cols-2")}>
              {(compact ? validationSteps.slice(0, 6) : validationSteps).map((step, index) => (
                <div key={step} className="flex items-start gap-3 rounded-md border border-border bg-card/45 px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="mb-3 text-sm font-semibold">Overfitting Guardrails</div>
              <div className="space-y-2">
                {bestPractices.map((practice) => (
                  <div key={practice} className="rounded-md border border-border bg-card/45 px-3 py-2 text-sm text-muted-foreground">
                    {practice}
                  </div>
                ))}
              </div>
            </div>

            {!compact ? (
              <div className="rounded-lg border border-border bg-background/45 p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
                  Weekly Routine
                </div>
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <span>Day 1: baseline + conservative test</span>
                  <span>Day 2: session comparison</span>
                  <span>Day 3: long/short comparison</span>
                  <span>Day 4: stop-model comparison</span>
                  <span>Day 5: research quality review</span>
                  <span>Day 6: parameter adjustment</span>
                  <span>Day 7: no changes; review notes only</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {routeLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background/60 px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
