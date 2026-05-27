import { useEffect, useMemo, useState } from "react";
import { ArrowRight, MessagesSquare, ShieldAlert, Swords } from "lucide-react";
import { Link } from "react-router-dom";

import { SafetyLockBanner } from "@/components/common/SafetyLockBanner";
import { TechnicalDetails } from "@/components/common/TechnicalDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { evidenceSourceLabel, evidenceSourceVariant } from "@/lib/evidence";
import {
  AGENT_DEBATE_UPDATED_EVENT,
  clearAgentDebateHistory,
  latestAgentDebateSession,
  loadAgentDebateState,
  runAgentDebateSession,
  saveAgentDebateSession,
  summarizeAgentDebate
} from "@/lib/agentDebate";
import type { AgentDebateSession, DebatePosition } from "@/lib/agentDebate";
import { LAB_STORAGE_UPDATED_EVENT, labStorage } from "@/lib/storage";
import { resolveResearchRuntimeSnapshot, type ResearchRuntimeSnapshot } from "@/lib/runtime";
import type { LabState, MarketBias } from "@/lib/types";
import { formatPercent, safeArray } from "@/lib/utils";

const positionVariant = (position: DebatePosition) => {
  if (position === "long") {
    return "success" as const;
  }
  if (position === "short") {
    return "danger" as const;
  }
  return "warning" as const;
};

const biasVariant = (bias: MarketBias | "no_opinion") => {
  if (bias === "bullish") {
    return "success" as const;
  }
  if (bias === "bearish") {
    return "danger" as const;
  }
  return "warning" as const;
};

function debateForLatestThesis(state: LabState): AgentDebateSession | undefined {
  const thesis = state.tradeTheses[0];
  if (!thesis) {
    return undefined;
  }

  const sourceDebate = state.debateSessions.find((debate) => debate.cioThesisId === thesis.id);
  if (!sourceDebate) {
    return undefined;
  }

  const session = runAgentDebateSession({
    thesis,
    sourceDebate,
    mode: "deterministic_fallback",
    roundCount: 2,
    consensusThreshold: 3
  });
  saveAgentDebateSession(session);
  return session;
}

export function AgentDebateView() {
  const [labState, setLabState] = useState(() => labStorage.load());
  const [debateState, setDebateState] = useState(() => loadAgentDebateState());
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(
    () => latestAgentDebateSession(debateState)?.sessionId
  );
  const [statusMessage, setStatusMessage] = useState("");
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ResearchRuntimeSnapshot>();

  useEffect(() => {
    const refresh = () => {
      setLabState(labStorage.load());
      const next = loadAgentDebateState();
      setDebateState(next);
      setSelectedSessionId((current) => current ?? latestAgentDebateSession(next)?.sessionId);
      void resolveResearchRuntimeSnapshot().then(setRuntimeSnapshot).catch(() => undefined);
    };
    window.addEventListener(LAB_STORAGE_UPDATED_EVENT, refresh);
    window.addEventListener(AGENT_DEBATE_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(LAB_STORAGE_UPDATED_EVENT, refresh);
      window.removeEventListener(AGENT_DEBATE_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const summary = useMemo(() => summarizeAgentDebate(debateState), [debateState]);
  const selectedSession = useMemo(
    () =>
      safeArray(debateState.sessions).find((session) => session.sessionId === selectedSessionId) ??
      latestAgentDebateSession(debateState),
    [debateState, selectedSessionId]
  );
  const latestThesis = labState.tradeTheses[0];
  const debateEvidenceSource =
    runtimeSnapshot?.evidence.evidenceLedgerSummary.entries.find((item) => item.category === "ICT structure")?.sourceType ?? "unavailable";

  const runDebate = () => {
    const session = debateForLatestThesis(labState);
    if (!session) {
      setStatusMessage("Generate a research thesis first so the debate layer has deterministic facts and agent opinions.");
      return;
    }
    setDebateState(loadAgentDebateState());
    setSelectedSessionId(session.sessionId);
    setStatusMessage(
      session.moderatorOutput.consensusReached
        ? `Consensus produced: ${session.moderatorOutput.position} at ${formatPercent(session.moderatorOutput.probability)}.`
        : "No consensus produced; moderator kept the research position flat."
    );
  };

  const clearHistory = () => {
    const next = clearAgentDebateHistory();
    setDebateState(next);
    setSelectedSessionId(undefined);
    setStatusMessage("Agent debate history cleared. No research settings changed.");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">LLM agent debate layer</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">Agent Debate Consensus</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Agents analyze independently, challenge or support each other, update confidence, and let the moderator
            declare consensus or flat/no thesis. Deterministic facts remain immutable.
          </p>
        </div>
        <Badge variant="warning">Advisory only</Badge>
      </div>

      <SafetyLockBanner message="Agent debate is research-only. It cannot execute trades, approve trades, or override readiness gates." />

      <Card className="border-cyan-400/20 bg-cyan-400/5">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-cyan-50 md:flex-row md:items-center md:justify-between">
          <div>
            Debate arguments are labeled with the current evidence class so mock/planned evidence is not treated as real confirmation.
          </div>
          <Badge variant={evidenceSourceVariant(debateEvidenceSource)}>
            ICT facts: {evidenceSourceLabel(debateEvidenceSource)}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Swords className="h-4 w-4 text-cyan-300" aria-hidden="true" />
              Debate Control
            </CardTitle>
            <CardDescription>
              Runs a bounded deterministic debate now; future local-command LLM debate can replace the round writer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button onClick={runDebate}>
                <MessagesSquare className="h-4 w-4" aria-hidden="true" />
                Run debate for latest thesis
              </Button>
              <Button variant="secondary" onClick={clearHistory}>
                Clear debate history
              </Button>
            </div>
            {statusMessage ? (
              <div className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3 text-sm text-cyan-100">
                {statusMessage}
              </div>
            ) : null}
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <StatusTile label="Latest thesis" value={latestThesis ? `${latestThesis.symbol} ${latestThesis.timeframe}` : "Generate thesis first"} />
              <StatusTile label="Stored sessions" value={String(safeArray(debateState.sessions).length)} />
              <StatusTile label="Latest consensus" value={summary.consensusReached ? "yes" : "no"} />
              <StatusTile label="Latest position" value={summary.position} />
            </div>
            <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">
              <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />
              No consensus means flat/no thesis. Debate cannot change broker, readiness, or execution settings.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Moderator Output</CardTitle>
              <CardDescription>
                Consensus, minority view, invalidation, and desk reasoning from the latest debate.
              </CardDescription>
            </div>
            <Badge variant={positionVariant(summary.position)}>{summary.position}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedSession ? (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <StatusTile label="Consensus" value={selectedSession.moderatorOutput.consensusReached ? "Reached" : "No consensus"} />
                  <StatusTile label="Probability" value={formatPercent(selectedSession.moderatorOutput.probability)} />
                  <StatusTile label="Aligned agents" value={`${selectedSession.moderatorOutput.alignedAgentCount}/${selectedSession.moderatorOutput.alignmentThreshold}`} />
                  <StatusTile label="Mode" value={selectedSession.mode.replace(/_/g, " ")} />
                </div>
                <Progress value={selectedSession.moderatorOutput.probability * 100} />
                <div className="rounded-lg border border-border bg-background/45 p-3">
                  <p className="text-xs uppercase text-muted-foreground">Desk reasoning</p>
                  <p className="mt-2 text-sm text-muted-foreground">{selectedSession.moderatorOutput.deskReasoning}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoBox title="Invalidation" body={selectedSession.moderatorOutput.invalidation} />
                  <InfoBox title="Minority view" body={selectedSession.moderatorOutput.minorityView} />
                </div>
                {!selectedSession.moderatorOutput.consensusReached && selectedSession.moderatorOutput.noConsensusReason ? (
                  <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                    {selectedSession.moderatorOutput.noConsensusReason}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-lg border border-border bg-background/45 p-4 text-sm text-muted-foreground">
                No structured debate session yet. Generate a thesis on Research, then run the debate here.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedSession ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Opening Statements</CardTitle>
              <CardDescription>Independent agent analysis before debate rounds.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {selectedSession.openingStatements.map((statement) => (
                <div key={statement.agentId} className="rounded-lg border border-border bg-background/45 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{statement.agentName}</p>
                      <p className="text-xs text-muted-foreground">{statement.layer}</p>
                    </div>
                    <Badge variant={biasVariant(statement.initialBias)}>{statement.initialBias}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Initial probability</span>
                    <span className="font-mono text-foreground">{formatPercent(statement.initialProbability)}</span>
                  </div>
                  <Progress value={statement.initialProbability * 100} className="mt-2" />
                  <div className="mt-3 space-y-2">
                    {statement.evidence.slice(0, 3).map((item) => (
                      <div key={item} className="rounded-md border border-emerald-400/20 bg-emerald-400/5 px-2 py-1 text-xs text-muted-foreground">
                        <span>{item}</span>
                        <Badge className="ml-2" variant={evidenceSourceVariant(debateEvidenceSource)}>
                          {evidenceSourceLabel(debateEvidenceSource)}
                        </Badge>
                      </div>
                    ))}
                    {statement.evidence.length === 0 ? (
                      <div className="rounded-md border border-border bg-card/45 px-2 py-1 text-xs text-muted-foreground">
                        No explicit evidence attached.
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Debate Rounds</CardTitle>
              <CardDescription>Agents challenge, support, concede, qualify, or add context without changing facts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedSession.rounds.map((round) => (
                <div key={round.round} className="rounded-lg border border-border bg-background/35 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold">Round {round.round}</h3>
                    <Badge variant="secondary">{round.messages.length} messages</Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {round.messages.map((message) => (
                      <div key={message.messageId} className="rounded-md border border-white/10 bg-card/50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{message.fromAgentName}</p>
                            <p className="text-xs text-muted-foreground">{message.messageType.replace(/_/g, " ")}</p>
                          </div>
                          <Badge variant={message.convictionChange === "higher" ? "success" : message.convictionChange === "lower" ? "warning" : "secondary"}>
                            {message.convictionChange}
                          </Badge>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">{message.content}</p>
                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Updated probability</span>
                          <span className="font-mono text-foreground">{formatPercent(message.updatedProbability)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <TechnicalDetails
            title="Advanced debate details"
            description="Open for immutable facts, agreement points, disagreements, and safety constraints."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <DetailList title="Immutable facts" items={selectedSession.immutableFacts} />
              <DetailList title="Agreement points" items={selectedSession.moderatorOutput.agreementPoints} />
              <DetailList title="Disagreements" items={selectedSession.moderatorOutput.disagreements} />
              <DetailList title="Safety notes" items={selectedSession.moderatorOutput.safetyNotes} />
            </div>
          </TechnicalDetails>

          <div className="flex justify-end">
            <Link to="/agent-audit">
              <Button variant="secondary">
                Review audit trail
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/45 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium text-foreground">{value}</p>
    </div>
  );
}

function InfoBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/45 p-3">
      <p className="text-xs uppercase text-muted-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-background/45 p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item) => (
            <div key={item} className="rounded-md border border-border bg-card/45 px-2 py-1 text-xs text-muted-foreground">
              {item}
            </div>
          ))
        ) : (
          <div className="rounded-md border border-border bg-card/45 px-2 py-1 text-xs text-muted-foreground">
            None recorded.
          </div>
        )}
      </div>
    </div>
  );
}
