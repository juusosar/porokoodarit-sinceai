import { cn } from "@/lib/utils";

// Placeholder live fit card. Real data arrives from the engine in M3/M6 (POR-15, POR-18).
const PARTS = [
  ["head", "Head"],
  ["shaft", "Shaft"],
  ["length", "Length"],
  ["lie", "Lie"],
  ["grip", "Grip"],
  ["hand", "Hand"],
  ["purchase", "Stock/custom"],
] as const;

export type FitCardValue = { label: string; confidence: number };

export function FitCard({ values = {}, className }: { values?: Partial<Record<string, FitCardValue>>; className?: string }) {
  return (
    <section aria-label="Your fit so far" className={cn("border border-border bg-card p-3", className)}>
      <h2 className="mb-2 text-base text-muted-foreground">Your fit so far</h2>
      <dl className="grid grid-cols-4 gap-x-3 gap-y-2 text-sm">
        {PARTS.map(([key, name]) => {
          const v = values[key];
          return (
            <div key={key} className="min-w-0">
              <dt className="text-xs uppercase text-muted-foreground">{name}</dt>
              <dd className="truncate font-medium">{v?.label ?? "—"}</dd>
              <div className="mt-1 h-1 bg-muted" aria-hidden>
                <div className="h-1 bg-primary transition-all" style={{ width: `${Math.round((v?.confidence ?? 0) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
