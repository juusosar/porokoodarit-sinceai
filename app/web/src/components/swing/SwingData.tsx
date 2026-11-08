import { swingDataSteps } from '@/lib/swing-data';
import type { SwingRecord } from '@/lib/swing-store';

/** Every data point read from the video, step by step; "to fit" marks what the fitting engine uses. */
export function SwingDataList({ record, className = '' }: { record: SwingRecord | null; className?: string }) {
  const steps = swingDataSteps(record);
  if (!steps.length) return null;
  return <ol className={`space-y-4 ${className}`} data-testid="swing-data">{steps.map((s, i) => <li key={s.title}>
    <h4 className="text-xs font-medium uppercase tracking-widest"><span className="mr-2 text-primary">{String(i + 1).padStart(2, '0')}</span>{s.title}</h4>
    <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{s.points.map(p => <div key={p.label + p.value} className="flex justify-between gap-3 border-b border-border/60 py-1">{p.label && <dt className="text-muted-foreground">{p.label}</dt>}<dd className="text-right tabular-nums">{p.value}{p.engine && <span className="ml-2 border border-primary px-1 py-px text-[10px] uppercase text-primary">to fit</span>}</dd></div>)}</dl>
  </li>)}</ol>;
}
