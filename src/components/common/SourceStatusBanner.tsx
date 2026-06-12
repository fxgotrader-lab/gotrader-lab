import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  MT5_READ_ONLY_UPDATED_EVENT
} from "@/lib/integrations/mt5";
import { MT5_HIGHER_TIMEFRAME_SOURCES_UPDATED_EVENT } from "@/lib/integrations/mt5/mt5MultiTimeframe";
import { TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT } from "@/lib/integrations/tradingview";
import {
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  MARKET_DATA_IMPORT_UPDATED_EVENT
} from "@/lib/marketData";
import {
  resolveSourceStatusSnapshot,
  sourceStatusLabel,
  type SourceStatusSnapshot
} from "@/lib/sourceStatus";
import { WORKSPACE_CARD } from "@/components/common/workspaceStyles";

const REFRESH_EVENTS = [
  MT5_READ_ONLY_UPDATED_EVENT,
  MT5_HIGHER_TIMEFRAME_SOURCES_UPDATED_EVENT,
  TRADINGVIEW_MCP_CHART_FEED_UPDATED_EVENT,
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  MARKET_DATA_IMPORT_UPDATED_EVENT,
  "storage"
];

export function useSourceStatusSnapshot(): SourceStatusSnapshot | undefined {
  const [snapshot, setSnapshot] = useState<SourceStatusSnapshot>();

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void resolveSourceStatusSnapshot()
        .then((next) => {
          if (mounted) {
            setSnapshot(next);
          }
        })
        .catch(() => undefined);
    };
    refresh();
    for (const eventName of REFRESH_EVENTS) {
      window.addEventListener(eventName, refresh);
    }
    return () => {
      mounted = false;
      for (const eventName of REFRESH_EVENTS) {
        window.removeEventListener(eventName, refresh);
      }
    };
  }, []);

  return snapshot;
}

const compactFingerprint = (value: string) =>
  value.length > 30 ? `${value.slice(0, 16)}...${value.slice(-8)}` : value;

const statusVariant = (snapshot: SourceStatusSnapshot) =>
  snapshot.isMockOrSample
    ? ("danger" as const)
    : snapshot.isResearchActive
      ? ("success" as const)
      : ("warning" as const);

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[0.65rem] uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <span className="font-mono text-xs text-slate-200">{value}</span>
    </span>
  );
}

/**
 * Compact one-row source readout for the global app shell top bar. Reads the
 * same snapshot as the full banner so every page shares one source of truth.
 */
export function GlobalSourceBar({ className = "" }: { className?: string }) {
  const snapshot = useSourceStatusSnapshot();

  if (!snapshot) {
    return (
      <div
        data-testid="global-source-bar"
        className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 ${className}`}
      >
        <Badge variant="secondary">Resolving source...</Badge>
        <Badge variant="muted">Authority: none</Badge>
      </div>
    );
  }

  return (
    <div
      data-testid="global-source-bar"
      className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs ${className}`}
    >
      <Badge variant={statusVariant(snapshot)} data-testid="global-source-status-level">
        {sourceStatusLabel(snapshot.sourceStatus)}
      </Badge>
      <Field label="" value={`${snapshot.requestedSymbol} <- ${snapshot.brokerSymbol ?? "n/a"}`} />
      <Field label="TF" value={snapshot.primaryTimeframe} />
      <span className="hidden sm:inline-flex">
        <Field
          label="HTF"
          value={snapshot.higherTimeframes.length ? snapshot.higherTimeframes.join(", ") : "none"}
        />
      </span>
      <span className="hidden md:inline-flex">
        <Field label="Candles" value={snapshot.candleCount.toLocaleString()} />
      </span>
      {snapshot.isProxyInstrument ? <Badge variant="warning">CFD proxy</Badge> : null}
      {snapshot.isMockOrSample ? <Badge variant="danger">Not research evidence</Badge> : null}
      <Badge variant="muted">Authority: none</Badge>
    </div>
  );
}

/**
 * Shared source context bar. Drop this under any page header so the page
 * states which candle source it reads: provider status, requested vs broker
 * symbol, primary timeframe, HTF context, candle count, fingerprint,
 * proxy/CFD warning, and authority none.
 */
export function SourceStatusBanner({ className = "" }: { className?: string }) {
  const snapshot = useSourceStatusSnapshot();

  if (!snapshot) {
    return (
      <section
        data-testid="source-status-banner"
        className={`${WORKSPACE_CARD} px-4 py-3 text-xs text-slate-400 ${className}`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Badge variant="secondary">Resolving source status...</Badge>
          <Badge variant="muted">Authority: none</Badge>
        </div>
      </section>
    );
  }

  const borderClass = snapshot.isMockOrSample
      ? "border-rose-400/35 bg-rose-500/10"
    : snapshot.isResearchActive
      ? "border-emerald-300/25 bg-emerald-300/[0.055]"
      : "border-amber-300/25 bg-amber-300/[0.06]";

  return (
    <section
      data-testid="source-status-banner"
      className={`premium-surface-soft rounded-2xl border px-4 py-3 ${borderClass} ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge variant={statusVariant(snapshot)} data-testid="source-status-level">
          {sourceStatusLabel(snapshot.sourceStatus)}
        </Badge>
        <Field label="Requested" value={snapshot.requestedSymbol} />
        <Field label="Broker" value={snapshot.brokerSymbol ?? "n/a"} />
        <Field label="TF" value={snapshot.primaryTimeframe} />
        <Field
          label="HTF"
          value={snapshot.higherTimeframes.length ? snapshot.higherTimeframes.join(", ") : "none"}
        />
        <Field label="Candles" value={snapshot.candleCount.toLocaleString()} />
        <Field label="Fingerprint" value={compactFingerprint(snapshot.sourceFingerprint)} />
        <Badge variant="muted">Authority: none</Badge>
      </div>
      {snapshot.warningLabel ? (
        <p
          className={`mt-2 flex items-start gap-2 text-xs leading-5 ${snapshot.isMockOrSample ? "text-rose-100/90" : "text-amber-100/90"}`}
          data-testid="source-status-warning"
        >
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {snapshot.warningLabel}
            {snapshot.isMockOrSample ? (
              <>
                {" "}
                <Link to="/advisor" className="font-medium underline underline-offset-2">
                  Activate MT5 Research Mode
                </Link>{" "}
                or{" "}
                <Link to="/market-data" className="font-medium underline underline-offset-2">
                  import historical data
                </Link>
                .
              </>
            ) : null}
          </span>
        </p>
      ) : null}
    </section>
  );
}
