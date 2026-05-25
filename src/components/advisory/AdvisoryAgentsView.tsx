import { useMemo, useState } from "react";
import { Bot, Download, FileJson, PackageCheck, ShieldAlert, Unplug, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdvisoryRequestPacket } from "@/lib/integrations/createAdvisoryRequestPacket";
import { openClawHermesAdvisorySpec } from "@/lib/integrations/openclawHermesSpec";
import type {
  AdvisoryPacketAuditEntry,
  LabState
} from "@/lib/types";
import type {
  AdvisoryRequestPacket,
  AdvisoryRequestPacketValidationResult
} from "@/lib/integrations/openclawHermesTypes";
import { validateAdvisoryRequestPacket } from "@/lib/integrations/validateAdvisoryRequestPacket";
import { evaluateReadinessGate } from "@/lib/readiness";
import { loadLatestResearchQualityReview } from "@/lib/researchQuality";
import { loadSimulationRunbookState } from "@/lib/simulationRunbook";
import { loadLatestValidationReport } from "@/lib/validation";

interface AdvisoryActions {
  recordAdvisoryPacket(entry: Omit<AdvisoryPacketAuditEntry, "id">): void;
}

const formatValue = (value: string) => value.replace(/_/g, " ");

export function AdvisoryAgentsView({ state, actions }: { state: LabState; actions: AdvisoryActions }) {
  const [packet, setPacket] = useState<AdvisoryRequestPacket>();
  const [packetJson, setPacketJson] = useState("");
  const [packetValidation, setPacketValidation] = useState<AdvisoryRequestPacketValidationResult>();
  const requestJson = JSON.stringify(openClawHermesAdvisorySpec.exampleRequest, null, 2);
  const responseJson = JSON.stringify(openClawHermesAdvisorySpec.exampleResponse, null, 2);
  const latestValidationReport = loadLatestValidationReport();
  const latestQualityReview = loadLatestResearchQualityReview();
  const latestRunbookState = loadSimulationRunbookState();
  const readinessSnapshot = evaluateReadinessGate({
    validation: latestValidationReport,
    quality: latestQualityReview,
    runbook: latestRunbookState
  });
  const activeThesis = state.tradeTheses[0];
  const activeDebate = useMemo(
    () => state.debateSessions.find((debate) => debate.cioThesisId === activeThesis?.id),
    [activeThesis?.id, state.debateSessions]
  );
  const latestPacketAudit = state.advisoryPackets?.[0];

  const generatePacket = () => {
    if (!activeThesis) {
      window.alert("Generate a research thesis before creating an advisory packet.");
      return;
    }

    const nextPacket = createAdvisoryRequestPacket(activeThesis, {
      debateSession: activeDebate,
      validationReport: latestValidationReport,
      researchQualityReview: latestQualityReview,
      readinessSnapshot
    });
    const validation = validateAdvisoryRequestPacket(nextPacket);
    const json = JSON.stringify(nextPacket, null, 2);

    setPacket(nextPacket);
    setPacketJson(json);
    setPacketValidation(validation);
    actions.recordAdvisoryPacket({
      packetId: nextPacket.packetId,
      thesisId: nextPacket.thesisId,
      generatedAt: nextPacket.timestamp,
      validationStatus: validation.valid ? "valid" : "invalid",
      warningCount: validation.warnings.length,
      mode: "advisory_only"
    });
  };

  const downloadPacket = () => {
    if (!packet || !packetJson) {
      return;
    }

    const blob = new Blob([packetJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `openclaw-hermes-advisory-${packet.packetId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

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
            <span>This packet is advisory only. It cannot execute trades or override readiness gates.</span>
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

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle>Advisory Request Packet Generator</CardTitle>
              </div>
              <CardDescription>
                Packages the current AI Lab thesis context into advisory-only JSON for future OpenClaw/Hermes review.
              </CardDescription>
            </div>
            <Badge variant="warning">advisory_only</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Current thesis</p>
              <p className="mt-1 truncate font-mono text-sm">{activeThesis?.id ?? "none"}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Validation</p>
              <p className="mt-1 font-mono text-sm">{latestValidationReport?.generatedAt ?? "missing"}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Research quality</p>
              <p className="mt-1 font-mono text-sm">{latestQualityReview?.readinessGrade ?? "missing"}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <p className="text-xs text-muted-foreground">Generated packets</p>
              <p className="mt-1 font-mono text-sm">{state.advisoryPackets?.length ?? 0}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={generatePacket}>
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              Generate Advisory Request Packet
            </Button>
            <Button variant="secondary" onClick={downloadPacket} disabled={!packetJson}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download advisory packet JSON
            </Button>
          </div>

          {latestPacketAudit ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border bg-background/45 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Latest packet timestamp</p>
                <p className="mt-1 break-all font-mono text-xs">{latestPacketAudit.generatedAt}</p>
              </div>
              <div className="rounded-md border border-border bg-background/45 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Latest packet ID</p>
                <p className="mt-1 break-all font-mono text-xs">{latestPacketAudit.packetId}</p>
              </div>
              <div className="rounded-md border border-border bg-background/45 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Warnings</p>
                <p className="mt-1 font-mono text-xs">{latestPacketAudit.warningCount}</p>
              </div>
            </div>
          ) : null}

          {packetValidation ? (
            <div className="rounded-lg border border-border bg-background/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Validation Status</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mode and authority fields are locked to advisory-only values.
                  </p>
                </div>
                <Badge variant={packetValidation.valid ? "success" : "danger"}>
                  {packetValidation.valid ? "valid" : "invalid"}
                </Badge>
              </div>
              {packetValidation.errors.length ? (
                <div className="mt-3 space-y-1">
                  {packetValidation.errors.map((error) => (
                    <div key={error} className="rounded-md border border-rose-400/20 bg-rose-400/5 px-2 py-1 text-xs text-rose-100">
                      {error}
                    </div>
                  ))}
                </div>
              ) : null}
              {packetValidation.warnings.length ? (
                <div className="mt-3 space-y-1">
                  {packetValidation.warnings.map((warning) => (
                    <div key={warning} className="rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
                      {warning}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  No advisory packet warnings. Validation, research quality, and readiness context are present.
                </p>
              )}
            </div>
          ) : null}

          {packetJson ? (
            <pre className="max-h-[560px] overflow-auto rounded-lg border border-border bg-background/75 p-4 font-mono text-xs leading-5 text-slate-200">
              {packetJson}
            </pre>
          ) : null}
        </CardContent>
      </Card>

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
