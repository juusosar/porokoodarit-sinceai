import { useState } from 'react';
import { Check, ChevronDown, Circle, Lightbulb, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Explanation } from '@/lib/api';
import type { Profile } from '@/lib/fitting-schema';
import type { Enrichment } from '@/lib/enrichment-schema';
import type { SwingRecord } from '@/lib/swing-store';
import { renderReason } from '@/lib/reasons';
import { swingProfileValue, swingSummaryLine } from '@/lib/swing-data';
import { SwingDataList } from '@/components/swing/SwingData';
import { EVIDENCE_LABEL, confidenceView } from '@/lib/parts';
import type { FitState, PartState, StockAdvice } from '@/types/fit-state';

const SPEC_PARTS = [['shaft', 'Shaft & flex'], ['length', 'Club length'], ['lie', 'Lie angle'], ['grip', 'Grip size'], ['hand', 'Hand'], ['purchase', 'Stock or custom']] as const;

/** Engine spec per part, with confidence, evidence and the reasons behind it (POR-18 trust pattern). */
export function FittingData({ state, explanation, profile, extras, swing }: { state: FitState; explanation: Explanation | null; profile: Profile; extras: Enrichment | null; swing: SwingRecord | null }) {
  const [expanded, setExpanded] = useState(true);
  const lm = !!extras && !extras.skipped && extras.speed !== null && extras.club === '7-iron';
  const geometry = ['height', 'wrist'].every(key => profile[key]?.status === 'sure' && /\d/.test(profile[key]?.value ?? ''));
  const advice = state.stock_advice;
  return <section data-scroll-reveal className="mt-8 border-y border-border py-6">
    <h2><Button variant="ghost" aria-expanded={expanded} aria-controls="fitting-data" onClick={() => setExpanded(value => !value)} className="h-auto w-full justify-between gap-4 px-0 font-display text-2xl font-bold uppercase italic"><span>My fit, under the hood</span><ChevronDown className={`size-5 shrink-0 text-primary transition-transform ${expanded ? 'rotate-180' : ''}`} /></Button></h2>
    <div id="fitting-data" hidden={!expanded} className="pt-5">
      <div className="border-y border-primary/40 bg-primary/5 px-4 py-5"><p className="flex items-center gap-2 font-display text-xl font-bold uppercase italic"><ShieldCheck className="size-5 text-primary" />Evidence, not guesswork.</p><ul className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground">{([[swing?.tempo ? 'Swing tempo · measured from video' : 'Swing video not analysed', !!swing?.tempo], [lm ? 'Club speed · launch monitor' : swing?.speed ? 'Club speed · estimated from swing video' : 'Club speed · estimated from carry', lm || !!swing?.speed], [geometry ? 'Height & wrist · user entered' : 'Geometry incomplete', geometry]] as const).map(([label, present]) => <li key={label} className="flex items-center gap-2">{present ? <Check className="size-4 text-primary" /> : <Circle className="size-3" />}{label}</li>)}</ul></div>
      <NextSteps state={state} />
      {SPEC_PARTS.map(([key, title], i) => { const part = state.parts[key]; return part ? <PartRow key={key} number={String(i + 1).padStart(2, '0')} title={title} part={part} note={explanation?.source === 'llm' ? explanation.parts[key] : undefined} advice={advice} /> : null; })}
      {advice && advice.blockers && advice.blockers.length > 0 && <div data-scroll-reveal className="border-b border-border py-6"><h3 className="text-xs font-medium uppercase tracking-widest">Why custom</h3><ul className="mt-3 space-y-2 text-sm text-muted-foreground">{advice.blockers.map(b => <li key={b.part}>{b.part}: {b.custom_value} (stock {b.stock_value}). {renderReason({ code: b.impact_code, params: b.params ?? {} })}</li>)}</ul>{advice.one_tweak_from_stock && <p className="mt-3 text-sm">One tweak away from stock: faster delivery and 30-day returns if you accept it.</p>}</div>}
      {state.warnings && state.warnings.length > 0 && <ul className="mt-6 space-y-2 border-l-2 border-primary pl-4 text-sm">{state.warnings.map(w => <li key={w.code}>{renderReason(w)}</li>)}</ul>}
      <details data-scroll-reveal className="mt-8 border-y border-border py-5"><summary className="cursor-pointer font-display text-xl font-bold uppercase italic">Your profile & source data</summary><dl className="mt-5 grid gap-4 sm:grid-cols-2">{Object.entries(profile).map(([key, answer]) => <div key={key}><dt className="text-xs uppercase text-muted-foreground">{key === 'development' ? 'Future outlook' : key}</dt><dd className="mt-1 break-words">{swingProfileValue(key, answer, swing) ?? `${answer.value}${answer.status === 'guess' ? ' · Estimate' : ''}`}</dd></div>)}</dl>
        {swing?.tempo && <><h3 className="mt-6 font-medium">Swing video</h3><p className="mt-2 text-sm text-muted-foreground">{swingSummaryLine(swing)}. {swing.source === 'server' ? 'Read from body keypoints by our server' : 'Measured on this device'}; the video was not uploaded. Values marked “to fit” go into the fitting engine.</p><SwingDataList record={swing} className="mt-4" /></>}
        <h3 className="mt-6 font-medium">Extra data</h3>{extras && !extras.skipped ? <><p className="mt-2 text-sm text-muted-foreground">{extras.club} · Self-reported session numbers</p><dl className="mt-3 grid gap-4 sm:grid-cols-2">{([['Clubhead speed', extras.speed, 'mph'], ['Carry distance', extras.carry, extras.unit], ['Launch angle', extras.launch, '°'], ['Spin rate', extras.spin, 'rpm'], ['Landing angle', extras.landing ?? null, '°']] as const).map(([label, value, unit]) => value !== null && <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd>{Number(value.toFixed(2))} {unit}</dd></div>)}</dl>{extras.impactEnabled && extras.impact && <p className="mt-4">Strike observation: {extras.impact} · No automatic lie change</p>}{(extras.ballLine ?? []).length > 0 && <p className="mt-4">Ball-line test: {extras.ballLine.length} shot{extras.ballLine.length > 1 ? 's' : ''}, average {(extras.ballLine.reduce((a, b) => a + b, 0) / extras.ballLine.length).toFixed(1)}° (+ = toward the toe). Photos stayed on this device.</p>}</> : <p className="mt-2 text-muted-foreground">{extras?.skipped ? 'Optional extra data skipped.' : 'No extra data has been saved yet.'}</p>}</details>
      <p className="mt-7 flex items-start gap-3 text-sm text-muted-foreground"><ShieldCheck className="size-5 shrink-0 text-primary" />Specs come from Takomo’s fitting rules applied to your evidence. Saved only on this device.</p>
    </div>
  </section>;
}

/** Stock-or-custom is advice, not a probability: say what it means instead of a % (POR-32). */
function purchaseVerdict(advice: StockAdvice | null | undefined): string {
  const n = advice?.blockers?.length ?? 0;
  return n === 0 ? 'Stock fits you' : advice?.one_tweak_from_stock ? 'One tweak from stock' : 'Custom recommended';
}

function PartRow({ number, title, part, note, advice }: { number: string; title: string; part: PartState; note: string | undefined; advice: StockAdvice | null | undefined }) {
  const { pct, word } = confidenceView(part.confidence);
  const reasons = (part.reasons ?? []).map(renderReason);
  return <div data-scroll-reveal className="border-b border-border py-7">
    <div className="flex flex-wrap items-center gap-3"><span className="font-display text-2xl italic text-primary">{number}</span><h3 className="text-xs font-medium uppercase tracking-widest">{title}</h3><span className="ml-auto flex flex-wrap gap-1.5 text-xs text-muted-foreground">{(part.evidence ?? []).map(e => <span key={e} className="border border-border px-2 py-0.5">{EVIDENCE_LABEL[e]}</span>)}</span></div>
    <p className="mt-4 font-display text-3xl font-bold uppercase italic">{part.label}</p>
    {part.part === 'purchase' ? <p className="mt-3 text-sm text-primary">{purchaseVerdict(advice)}</p> : <div className="mt-3 flex items-center gap-3" aria-label={`${word}, ${pct}%`}><div className="h-1 w-40 bg-muted" aria-hidden="true"><div className="h-1 bg-primary" style={{ width: `${pct}%` }} /></div><span className="text-xs text-muted-foreground">{word} · {pct}%</span></div>}
    {part.close_call && <p className="mt-3 text-sm">Close call: {part.close_call.alternative} is nearly as good a fit.</p>}
    {note && <p className="mt-3 max-w-2xl text-sm">{note}</p>}
    {reasons.length > 0 && <ul className="mt-3 max-w-2xl list-disc space-y-1 pl-5 text-sm text-muted-foreground">{reasons.map(r => <li key={r}>{r}</li>)}</ul>}
    <WhyDrawer part={part} />
  </div>;
}

/** Evidence chain behind one part: each input, where it came from and how much it counted. */
export function WhyDrawer({ part }: { part: PartState }) {
  const inputs = part.inputs ?? [];
  if (!inputs.length) return null;
  return <details className="mt-3 max-w-2xl text-sm" data-testid={`why-${part.part}`}>
    <summary className="cursor-pointer text-primary">Why? What this is based on</summary>
    <ul className="mt-3 space-y-2">{inputs.map((i, n) => {
      const pct = Math.round(i.weight * 100);
      return <li key={n} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
        <span>{i.label} <span className="text-muted-foreground">· {i.value}</span> <span className="border border-border px-1.5 py-px text-[10px] uppercase text-muted-foreground">{EVIDENCE_LABEL[i.source]}</span></span>
        <span className="text-xs tabular-nums text-muted-foreground">{i.weight >= 1 ? 'used' : `${pct}%`}</span>
        <span className="col-span-2 h-1 bg-muted" aria-hidden><span className="block h-1 bg-primary" style={{ width: `${pct}%` }} /></span>
      </li>;
    })}</ul>
    <p className="mt-2 text-xs text-muted-foreground">Percent = share of the estimate. Sources that agree and are more precise count more.</p>
  </details>;
}

const PART_NAME: Record<string, string> = { head: 'head', shaft: 'shaft', length: 'length', lie: 'lie', grip: 'grip', purchase: 'stock or custom' };

/** "Do this next": the missing inputs that would raise confidence most (engine-ranked). */
export function NextSteps({ state, limit = 2 }: { state: FitState; limit?: number }) {
  const steps = (state.next_steps ?? []).slice(0, limit);
  if (!steps.length) return null;
  return <div className="mb-2 border-b border-border py-5" data-testid="next-steps">
    <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest"><Lightbulb className="size-4 text-primary" />Want a surer fit?</h3>
    <ul className="mt-3 space-y-2 text-sm">{steps.map(n => <li key={n.input}>{renderReason({ code: n.code, params: {} })}{n.parts?.length ? <span className="text-muted-foreground"> Firms up: {n.parts.map(p => PART_NAME[p] ?? p).join(', ')}.</span> : null}</li>)}</ul>
  </div>;
}
