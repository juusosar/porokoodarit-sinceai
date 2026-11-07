import { useFit } from "@/lib/fit-store";
import { cn } from "@/lib/utils";
import { EVIDENCE_LABEL, PARTS } from "@/lib/parts";
import type { EvidenceSource, FitState } from "@/types/fit-state";

// Live fit card: every part, its confidence, and where the evidence came from (POR-18 trust pattern).
export function EvidenceTag({ source }: { source: EvidenceSource }) {
  return (
    <span
      className={cn(
        "border px-1 text-[10px] uppercase leading-4",
        source === "measured" && "border-evidence-measured text-evidence-measured",
        source === "asked" && "border-evidence-asked text-evidence-asked",
        source === "estimated" && "border-evidence-estimated text-evidence-estimated",
        source === "default" && "border-muted-foreground text-muted-foreground",
      )}
    >
      {EVIDENCE_LABEL[source]}
    </span>
  );
}

export function FitCardView({ state, className }: { state: FitState | null; className?: string }) {
  const changed = new Set((state?.changes ?? []).filter((c) => c.before !== c.after).map((c) => c.part));
  return (
    <section aria-label="Your fit so far" className={cn("border border-border bg-card p-3", className)}>
      <h2 className="mb-2 text-base text-muted-foreground">Your fit so far</h2>
      <dl className="grid grid-cols-4 gap-x-3 gap-y-2 text-sm">
        {PARTS.map(([key, name]) => {
          const p = state?.parts[key];
          const best = p?.evidence?.[0];
          return (
            <div
              key={`${key}-${p?.label}`}
              className={cn("min-w-0", changed.has(key) && "animate-part-pulse")}
              data-testid={`part-${key}`}
            >
              <dt className="truncate text-xs uppercase text-muted-foreground">{name}</dt>
              <dd className="truncate font-medium">
                {p?.label ?? "—"}
                {p?.close_call && (
                  <span className="text-primary" title={`Close call: ${p.close_call.alternative}`}>
                    {" "}
                    ≈
                  </span>
                )}
              </dd>
              <div className="mt-1 h-1 bg-muted" aria-hidden>
                <div
                  className="h-1 bg-primary transition-all"
                  style={{
                    width: `${Math.round((p?.confidence ?? 0) * 100)}%`,
                  }}
                />
              </div>
              {best && (
                <div className="mt-1">
                  <EvidenceTag source={best} />
                </div>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export function FitCard({ className }: { className?: string }) {
  const { state } = useFit();
  return <FitCardView state={state} className={className} />;
}
