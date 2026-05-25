import { useMemo, useState } from "react";
import { ClipboardCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { importAdvisoryResponse } from "@/lib/integrations/importAdvisoryResponse";
import type {
  AdvisoryResponse,
  AdvisoryResponseValidationResult
} from "@/lib/integrations/openclawHermesTypes";
import type { AdvisoryResponseAuditEntry } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

interface AdvisoryResponseReviewProps {
  latestPacketId?: string;
  importedResponses: AdvisoryResponseAuditEntry[];
  onImport(entry: Omit<AdvisoryResponseAuditEntry, "id">): void;
}

const sampleHint = `{
  "responseId": "advisory_response_001",
  "packetId": "paste_packet_id_here",
  "timestamp": "2026-05-25T00:00:00.000Z",
  "advisoryAgent": "OpenClaw",
  "mode": "advisory_only",
  "executionAuthority": "none",
  "brokerAuthority": "none",
  "readinessOverrideAuthority": "none",
  "agreeWithThesis": false,
  "advisoryConfidence": 0.72,
  "riskWarnings": ["Conservative validation is not yet stable."],
  "missingEvidence": ["Repeat NY AM validation under conservative thresholds."],
  "recommendedCalibration": ["Raise minimum confluence by 0.05 and rerun validation."],
  "proceedRecommendation": "rerun_validation",
  "notes": "Research review only. No execution authority requested or granted."
}`;

const recommendationVariant = (recommendation?: string) => {
  if (recommendation === "paper_demo_candidate_review") {
    return "warning" as const;
  }
  if (recommendation === "rerun_validation") {
    return "danger" as const;
  }
  return "success" as const;
};

export function AdvisoryResponseReview({
  latestPacketId,
  importedResponses,
  onImport
}: AdvisoryResponseReviewProps) {
  const [rawJson, setRawJson] = useState(sampleHint);
  const [response, setResponse] = useState<AdvisoryResponse>();
  const [validation, setValidation] = useState<AdvisoryResponseValidationResult>();
  const latestResponse = importedResponses[0];
  const importedPacketMatch = useMemo(
    () => response?.packetId && latestPacketId && response.packetId === latestPacketId,
    [latestPacketId, response?.packetId]
  );

  const validate = () => {
    const result = importAdvisoryResponse(rawJson);
    setResponse(result.response);
    setValidation(result.validation);
  };

  const importResponse = () => {
    const result = importAdvisoryResponse(rawJson);
    setResponse(result.response);
    setValidation(result.validation);

    if (!result.response || !result.validation.valid) {
      return;
    }

    onImport({
      responseId: result.response.responseId,
      packetId: result.response.packetId,
      importedAt: new Date().toISOString(),
      advisoryAgent: result.response.advisoryAgent,
      proceedRecommendation: result.response.proceedRecommendation,
      validationStatus: "valid",
      warningCount: result.validation.warnings.length,
      mode: "advisory_only"
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>Advisory Response Review</CardTitle>
            </div>
            <CardDescription>
              Paste a future OpenClaw/Hermes response, validate authority locks, and import it as research feedback.
            </CardDescription>
          </div>
          <Badge variant="warning">review only</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
          <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
          Advisory responses cannot execute trades, approve trades, or override readiness gates.
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-xs text-muted-foreground">Latest packet</p>
            <p className="mt-1 break-all font-mono text-xs">{latestPacketId ?? "none"}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-xs text-muted-foreground">Imported responses</p>
            <p className="mt-1 font-mono text-sm">{importedResponses.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-xs text-muted-foreground">Latest recommendation</p>
            <p className="mt-1 break-all font-mono text-xs">{latestResponse?.proceedRecommendation ?? "none"}</p>
          </div>
        </div>

        <Textarea
          value={rawJson}
          onChange={(event) => setRawJson(event.target.value)}
          className="min-h-[280px] font-mono text-xs"
          aria-label="Advisory response JSON"
        />

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={validate}>
            Validate response
          </Button>
          <Button onClick={importResponse}>
            Import response locally
          </Button>
        </div>

        {validation ? (
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Response Validation</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mode and authority fields must remain advisory-only before import.
                </p>
              </div>
              <Badge variant={validation.valid ? "success" : "danger"}>{validation.valid ? "valid" : "invalid"}</Badge>
            </div>
            {validation.errors.length ? (
              <div className="mt-3 space-y-1">
                {validation.errors.map((error) => (
                  <div key={error} className="rounded-md border border-rose-400/20 bg-rose-400/5 px-2 py-1 text-xs text-rose-100">
                    {error}
                  </div>
                ))}
              </div>
            ) : null}
            {validation.warnings.length ? (
              <div className="mt-3 space-y-1">
                {validation.warnings.map((warning) => (
                  <div key={warning} className="rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {response ? (
          <div className="space-y-4 rounded-lg border border-border bg-background/45 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Advisory Review Summary</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {response.advisoryAgent} response for packet {response.packetId}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={recommendationVariant(response.proceedRecommendation)}>
                  {response.proceedRecommendation.replace(/_/g, " ")}
                </Badge>
                <Badge variant="secondary">{formatPercent(response.advisoryConfidence)}</Badge>
                <Badge variant={importedPacketMatch ? "success" : "warning"}>
                  {importedPacketMatch ? "matches latest packet" : "packet match not confirmed"}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border bg-card/45 p-3">
                <p className="text-xs uppercase text-muted-foreground">Thesis agreement</p>
                <p className="mt-2 font-mono text-sm">
                  {response.agreeWithThesis === null ? "unclear" : response.agreeWithThesis ? "agree" : "disagree"}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card/45 p-3">
                <p className="text-xs uppercase text-muted-foreground">Mode</p>
                <p className="mt-2 font-mono text-sm">{response.mode}</p>
              </div>
              <div className="rounded-md border border-border bg-card/45 p-3">
                <p className="text-xs uppercase text-muted-foreground">Authorities</p>
                <p className="mt-2 font-mono text-sm">
                  {response.executionAuthority}/{response.brokerAuthority}/{response.readinessOverrideAuthority}
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {(
                [
                ["Risk warnings", response.riskWarnings],
                ["Missing evidence", response.missingEvidence],
                ["Recommended calibration", response.recommendedCalibration]
                ] as Array<[string, string[]]>
              ).map(([label, items]) => (
                <div key={label} className="rounded-md border border-border bg-card/45 p-3">
                  <p className="text-sm font-semibold">{label}</p>
                  <div className="mt-2 space-y-2">
                    {items.length ? (
                      items.map((item) => (
                        <div key={item} className="rounded-md border border-border bg-background/45 px-2 py-1 text-xs text-muted-foreground">
                          {item}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-border bg-background/45 px-2 py-1 text-xs text-muted-foreground">
                        None provided.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-border bg-card/45 p-3">
              <p className="text-sm font-semibold">Notes</p>
              <p className="mt-2 text-sm text-muted-foreground">{response.notes}</p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
