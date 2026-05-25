import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bot,
  CheckCircle2,
  Filter,
  Lock,
  MessageSquareText,
  Send,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  COMMUNICATION_AUDIT_UPDATED_EVENT,
  getCommunicationSummary,
  inAppCommunicationSpec,
  loadCommunicationMessages,
} from "@/lib/communications/communicationSpec";
import type {
  AgentMessageAuditEntry,
  CommunicationSeverity,
} from "@/lib/communications/communicationTypes";
import { cn } from "@/lib/utils";

const categoryOptions = [
  { label: "All categories", value: "all" },
  ...inAppCommunicationSpec.supportedMessageCategories.map((category) => ({
    label: formatToken(category),
    value: category,
  })),
];

const severityOptions = [
  { label: "All priorities", value: "all" },
  ...inAppCommunicationSpec.notificationPriorities.map((severity) => ({
    label: formatToken(severity),
    value: severity,
  })),
];

const requestOptions = inAppCommunicationSpec.supportedUserRequests.map((request) => ({
  label: formatToken(request),
  value: request,
}));

export function AICommunicationsView() {
  const [messages, setMessages] = useState(() => loadCommunicationMessages());
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(() => loadCommunicationMessages()[0]?.messageId ?? "");
  const [draftRequest, setDraftRequest] = useState("");

  useEffect(() => {
    const refreshMessages = () => {
      const nextMessages = loadCommunicationMessages();
      setMessages(nextMessages);
      setSelectedId((current) => current || (nextMessages[0]?.messageId ?? ""));
    };

    window.addEventListener(COMMUNICATION_AUDIT_UPDATED_EVENT, refreshMessages);
    window.addEventListener("storage", refreshMessages);
    return () => {
      window.removeEventListener(COMMUNICATION_AUDIT_UPDATED_EVENT, refreshMessages);
      window.removeEventListener("storage", refreshMessages);
    };
  }, []);

  const filteredMessages = useMemo(
    () =>
      messages.filter((message) => {
        const categoryMatch = categoryFilter === "all" || message.category === categoryFilter;
        const severityMatch = severityFilter === "all" || message.severity === severityFilter;
        return categoryMatch && severityMatch;
      }),
    [categoryFilter, messages, severityFilter]
  );
  const selectedMessage =
    filteredMessages.find((message) => message.messageId === selectedId) ??
    filteredMessages[0] ??
    messages[0];
  const summary = getCommunicationSummary(messages);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase text-primary">In-app communications</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">AI Communications</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            GoTrader AI Lab is the primary place to review agent messages, receive research alerts, and record
            approvals. External chat tools are optional notification routes only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">Planning shell</Badge>
          <Badge variant="danger">No execution authority</Badge>
        </div>
      </div>

      <Card className="border-amber-300/25 bg-amber-300/10">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <span>In-app agent communication is for research and approval workflows only. It cannot execute trades.</span>
          </div>
          <Badge variant="warning">Broker control none</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Unread messages" value={String(summary.unreadMessages)} icon={Bell} />
        <SummaryCard label="Action required" value={String(summary.actionRequiredCount)} icon={MessageSquareText} />
        <SummaryCard label="Primary channel" value={formatToken(inAppCommunicationSpec.primaryChannel)} icon={Bot} />
        <SummaryCard label="Public chat" value={formatToken(inAppCommunicationSpec.publicChatDefault)} icon={Lock} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-primary" aria-hidden="true" />
                  <CardTitle>Agent Inbox</CardTitle>
                </div>
                <CardDescription>Stored research messages, alerts, and audit trail entries.</CardDescription>
              </div>
              <Badge variant="secondary">{filteredMessages.length} shown</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                  Category
                </div>
                <Select options={categoryOptions} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                  Priority
                </div>
                <Select options={severityOptions} value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} />
              </div>
            </div>

            <div className="max-h-[640px] space-y-2 overflow-auto pr-1">
              {filteredMessages.map((message) => (
                <button
                  key={message.messageId}
                  type="button"
                  onClick={() => setSelectedId(message.messageId)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition hover:border-primary/35 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selectedMessage?.messageId === message.messageId
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-background/45"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{message.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{message.agentName}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={severityVariant(message.severity)}>{formatToken(message.severity)}</Badge>
                      {message.actionRequired ? <Badge variant="warning">action</Badge> : null}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{message.summary}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          {selectedMessage ? <MessageDetail message={selectedMessage} /> : null}

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle>Ask Research Agent</CardTitle>
              </div>
              <CardDescription>
                User-to-agent requests are planned for in-app review. Input is disabled until the provider bridge is
                intentionally implemented.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select options={requestOptions} disabled defaultValue="review_this_thesis" />
              <Textarea
                disabled
                value={draftRequest}
                onChange={(event) => setDraftRequest(event.target.value)}
                placeholder="Planning mode: future user requests will be recorded inside the app audit trail."
              />
              <Button disabled className="w-full">
                Send research request
              </Button>
              <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                Planning mode only. No agent request can execute trades, change broker settings, or override readiness.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <SpecCard title="Supported User Requests" items={inAppCommunicationSpec.supportedUserRequests.map(formatToken)} />
        <SpecCard title="Approval Prompts" items={inAppCommunicationSpec.supportedApprovalPrompts.map(formatToken)} />
        <SpecCard title="Safety Constraints" items={inAppCommunicationSpec.safetyConstraints} tone="warning" />
      </div>
    </div>
  );
}

function MessageDetail({ message }: { message: AgentMessageAuditEntry }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle>{message.title}</CardTitle>
            </div>
            <CardDescription>
              {message.agentName} • {new Date(message.timestamp).toLocaleString()}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={severityVariant(message.severity)}>{formatToken(message.severity)}</Badge>
            <Badge variant={message.resolved ? "success" : "warning"}>{message.resolved ? "resolved" : "open"}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-background/45 p-4 text-sm text-muted-foreground">
          {message.body}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <DetailLine label="Message ID" value={message.messageId} />
          <DetailLine label="Source" value={formatToken(message.source)} />
          <DetailLine label="Category" value={formatToken(message.category)} />
          <DetailLine label="Requested action" value={message.requestedAction ? formatToken(message.requestedAction) : "none"} />
          <DetailLine label="User response" value={formatToken(message.userResponse)} />
          <DetailLine label="Safety notice" value={message.safetyNotice} />
        </div>
        {message.actionRequired ? (
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            This is an approval or review prompt. Future responses must be stored in-app as part of the audit trail.
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Informational message only.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-lg font-semibold">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      </CardContent>
    </Card>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/45 p-3">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function SpecCard({ title, items, tone = "default" }: { title: string; items: string[]; tone?: "default" | "warning" }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div
            key={item}
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              tone === "warning"
                ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                : "border-border bg-background/45"
            )}
          >
            {item}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function severityVariant(severity: CommunicationSeverity) {
  if (severity === "critical") {
    return "danger";
  }
  if (severity === "warning" || severity === "action_required") {
    return "warning";
  }
  return "secondary";
}

function formatToken(value: string) {
  return value.replace(/_/g, " ");
}
