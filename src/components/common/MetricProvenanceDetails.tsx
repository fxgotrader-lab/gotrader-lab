import {
  selectRuntimeProvenanceRows,
  selectRuntimeProvenanceWarnings,
  type MetricSourceType,
  type ResearchRuntimeSnapshot
} from "@/lib/runtime";

type MetricProvenanceDetailsProps = {
  snapshot?: ResearchRuntimeSnapshot;
  source?: MetricSourceType;
  title?: string;
};

export function MetricProvenanceDetails({
  snapshot,
  source = "latest_cycle",
  title = "Full metric provenance"
}: MetricProvenanceDetailsProps) {
  const rows = selectRuntimeProvenanceRows(snapshot, source);
  const warnings = selectRuntimeProvenanceWarnings(snapshot, source);

  return (
    <div className="rounded-lg border border-border bg-background/45 p-3 text-xs text-muted-foreground">
      <div className="font-medium text-foreground">{title}</div>
      {rows.length ? (
        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((item) => (
            <div key={item.label} className="min-w-0 rounded-md border border-border/70 bg-card/45 p-2">
              <div className="uppercase tracking-[0.14em] text-muted-foreground">{item.label}</div>
              <div className="mt-1 break-all font-mono text-[11px] text-foreground">{item.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2">Metric provenance is not available yet.</p>
      )}
      {warnings.length ? (
        <div className="mt-3 rounded-md border border-amber-300/25 bg-amber-300/10 p-2 text-amber-100">
          {warnings.join(" ")}
        </div>
      ) : null}
    </div>
  );
}
