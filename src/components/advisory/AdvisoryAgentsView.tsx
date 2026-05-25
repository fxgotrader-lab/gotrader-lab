import { Bot, FileJson, ShieldAlert, Unplug, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { openClawHermesAdvisorySpec } from "@/lib/integrations/openclawHermesSpec";

const formatValue = (value: string) => value.replace(/_/g, " ");

export function AdvisoryAgentsView() {
  const requestJson = JSON.stringify(openClawHermesAdvisorySpec.exampleRequest, null, 2);
  const responseJson = JSON.stringify(openClawHermesAdvisorySpec.exampleResponse, null, 2);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">Advisory agents</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">OpenClaw / Hermes Planning</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Planning-only layer for future research review of ICT context, agent debate, CIO thesis, validation,
            research quality, readiness status, and risk notes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">Planning only</Badge>
          <Badge variant="muted">Not connected</Badge>
        </div>
      </div>

      <Card className="border-amber-300/25 bg-amber-300/10">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <span>Advisory agents cannot execute trades or override readiness gates.</span>
          </div>
          <Badge variant="warning">No broker authority</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Advisory Status</CardTitle>
            </div>
            <CardDescription>Future reviewers only. No API wiring exists yet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ["Status", openClawHermesAdvisorySpec.status],
              ["OpenClaw", openClawHermesAdvisorySpec.openClawConnection],
              ["Hermes", openClawHermesAdvisorySpec.hermesConnection],
              ["Role", openClawHermesAdvisorySpec.role],
              ["Broker authority", openClawHermesAdvisorySpec.brokerAuthority],
              ["Execution authority", openClawHermesAdvisorySpec.executionAuthority],
              ["Readiness override", openClawHermesAdvisorySpec.readinessOverrideAuthority]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/45 px-3 py-2">
                <span className="text-muted-foreground">{label}</span>
                <Badge variant={value === "none" || value === "not_connected" ? "danger" : "warning"}>
                  {formatValue(value)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Allowed Review Inputs</CardTitle>
            </div>
            <CardDescription>What a future advisory request may include.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {openClawHermesAdvisorySpec.allowedReviewInputs.map((input) => (
              <div key={input} className="rounded-md border border-border bg-background/45 px-3 py-2 text-sm">
                {input}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-200" aria-hidden="true" />
              <CardTitle>Prohibited Actions</CardTitle>
            </div>
            <CardDescription>Advisory agents cannot control execution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {openClawHermesAdvisorySpec.prohibitedActions.map((action) => (
              <div key={action} className="rounded-md border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
                {action}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Example Advisory Request JSON</CardTitle>
            <CardDescription>Simulation context that could be reviewed in the future.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[560px] overflow-auto rounded-lg border border-border bg-background/75 p-4 font-mono text-xs leading-5 text-slate-200">
              {requestJson}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Example Advisory Response JSON</CardTitle>
            <CardDescription>Review output with no execution or override authority.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[560px] overflow-auto rounded-lg border border-border bg-background/75 p-4 font-mono text-xs leading-5 text-slate-200">
              {responseJson}
            </pre>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Unplug className="h-4 w-4 text-amber-200" aria-hidden="true" />
            <CardTitle>Integration Boundary</CardTitle>
          </div>
          <CardDescription>What must remain true until a separate future implementation is explicitly built.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {[
            "No OpenClaw API call exists.",
            "No Hermes execution exists.",
            "No broker, go-trader, or readiness control exists."
          ].map((item) => (
            <div key={item} className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
