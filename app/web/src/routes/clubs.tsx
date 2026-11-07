import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFitting } from '@/hooks/use-fitting';
import { useEnrichment } from '@/hooks/use-enrichment';
import { useFitState } from '@/hooks/use-fit-state';
import { HEADS } from '@/lib/head-catalog';
import { headIdSchema, type HeadId, type HeadSelection, type SelectionSpecs } from '@/lib/head-selection-schema';
import { readHeadSelection, saveHeadSelection } from '@/lib/head-selection.functions';
import { getFittingToken } from '@/lib/fitting-session';
import { readSwing } from '@/lib/swing-store';
import { renderReason } from '@/lib/reasons';
import { confidenceView } from '@/lib/parts';
import { clearAllLocal } from '@/lib/local-store';
import { HeadSelectionOverlay } from '@/components/HeadSelectionOverlay';
import { FittingData } from '@/components/FittingData';
import { ClubReveal } from '@/components/ClubReveal';
import { HearItButton, lineOf, useSpeakLine, VoiceToggle } from '@/features/voice';
import type { FitState, Reason } from '@/types/fit-state';

export const Route = createFileRoute('/clubs')({ head: () => ({ meta: [
  { title: 'Your Iron Fit | Takomo Golf' }, { name: 'description', content: 'Your Takomo iron fit: head, shaft, length, lie and grip, with the reasons behind each.' },
] }), component: Clubs });

function specsOf(state: FitState): SelectionSpecs {
  const label = (k: string) => state.parts[k]?.label ?? null;
  return { shaft: label('shaft'), length: label('length'), lie: label('lie'), grip: label('grip'), purchase: label('purchase') };
}

function Clubs() {
  const fitting = useFitting();
  const confirmed = fitting.snapshot?.confirmed === true;
  const extras = useEnrichment(confirmed);
  const swing = useMemo(() => (confirmed ? readSwing(getFittingToken()) : null), [confirmed]);
  const fit = useFitState(confirmed && (extras.ready || extras.error), fitting.snapshot?.profile ?? null, extras.data, swing);
  const [selection, setSelection] = useState<HeadSelection | null>(null);
  const [overlay, setOverlay] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(false);
  const busy = useRef(false);
  useSpeakLine(lineOf(fit.explanation));
  useEffect(() => {
    if (!confirmed) return;
    void readHeadSelection({ data: { token: getFittingToken() } }).then(setSelection).catch(() => setError(true));
  }, [confirmed]);
  async function choose(head: HeadId) {
    if (busy.current || !fit.state) return;
    busy.current = true; setSaving(true); setError(false);
    try { const value = await saveHeadSelection({ data: { token: getFittingToken(), head, specs: specsOf(fit.state) } }); setSelection(value); setOverlay(true); }
    catch { setError(true); }
    finally { busy.current = false; setSaving(false); }
  }
  const state = fit.state;
  const headPart = state?.parts['head'];
  const order = (state?.head_options ?? []).map(o => headIdSchema.safeParse(o.head)).flatMap(r => (r.success ? [r.data] : []));
  const primaryId = headIdSchema.safeParse(headPart?.value).data ?? order[0] ?? '101-mkii';
  const secondaryId = order.find(h => h !== primaryId) ?? (primaryId === '101-mkii' ? '201-mkii' : '101-mkii');
  const primary = HEADS[primaryId], secondary = HEADS[secondaryId];
  const why = (fit.explanation?.source === 'llm' ? fit.explanation.parts['head'] : undefined) || headWhy(headPart?.reasons ?? []);
  const close = headPart?.close_call;
  const loading = fitting.loading || (confirmed && (extras.loading || fit.loading || (!state && !fit.error)));
  return <main className="enrichment-theme min-h-screen bg-background font-sans text-foreground"><header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-background px-5 py-4 md:px-8"><span className="font-display text-2xl font-bold italic">TAKOMO</span><span className="flex items-center gap-4 text-xs uppercase tracking-widest text-muted-foreground"><VoiceToggle /><span>Find my fit · <span className="text-primary">Step 4 / 4</span></span></span></header><section className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-10">
    <div className="flex items-center gap-4 border-b border-border pb-6"><img src="/images/grant-avatar.png" alt="Grant" className="size-20 shrink-0 border border-primary object-cover" /><div><p className="text-xs uppercase tracking-widest text-primary">Grant · AI-assisted fitter</p><p className="mt-2 max-w-xl text-base leading-relaxed" aria-live="polite">{fit.explanation?.caption ?? 'Here’s your fit, and why. Every number comes from the fitting engine, not from me.'}</p>{fit.explanation && <HearItButton line={lineOf(fit.explanation)!} className="mt-1 text-xs text-primary underline" />}</div></div>
    {fitting.error ? <div role="alert" className="py-8"><p>Could not load your fitting. Your saved data is safe.</p><Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Try again</Button></div> : !fitting.loading && !confirmed ? <p className="py-8">Confirm your profile with Grant first. <Link to="/" className="text-primary underline">Back to chat</Link></p> : fit.error ? <div role="alert" className="py-8"><p>The fitting engine didn’t answer. Your answers are saved on this device.</p><Button variant="outline" className="mt-4" onClick={fit.retry}>Try again</Button></div> : loading || !state ? <p className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Calculating your fit…</p> : <>
      <div className="mt-8 flex flex-wrap items-center gap-3"><p className="text-xs font-medium uppercase tracking-widest text-primary">01 · Your head</p><span className="ml-auto text-xs text-muted-foreground">{confidenceView(headPart?.confidence).word} · {confidenceView(headPart?.confidence).pct}%{close ? ` · close call with ${close.alternative}` : ''}</span></div>
      <div className="mt-6 text-center"><h1 className="font-display text-6xl font-bold uppercase italic leading-none md:text-7xl">{primary.name} IRONS</h1><p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">{primary.set}</p></div>
      <ClubReveal image={primary.image} name={primary.name} />
      <div className="mx-auto mt-6 max-w-2xl text-center"><h2 className="font-display text-2xl font-bold uppercase italic text-primary">Why these for you?</h2><p className="mt-3 text-lg leading-relaxed">{why || primary.description}</p><p className="mt-3 text-xs text-muted-foreground">From your answers{swing?.tempo ? ', your swing video timing' : ''}{extras.data && !extras.data.skipped && extras.data.speed !== null ? ' and your launch monitor speed' : ''}. Close calls are shown, not hidden.</p></div>
      <div data-scroll-reveal className="grid gap-7 border-b border-border py-7 md:grid-cols-2"><div><h2 className="font-display text-xl font-bold uppercase italic">The head, in brief</h2><p className="mt-4 text-sm leading-relaxed text-muted-foreground">{primary.description}</p><ul className="mt-4 space-y-3">{(headPart?.reasons ?? []).map(r => renderReason(r)).map(reason => <li key={reason} className="flex gap-3 text-sm text-muted-foreground"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{reason}</li>)}</ul></div><div><h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase italic"><Scale className="size-5 text-primary" />Known trade-offs</h2><p className="mt-4 text-sm leading-relaxed text-muted-foreground">{primary.tradeoff}</p></div></div>
      <Button disabled={saving} className="mt-6 h-auto min-h-14 w-full whitespace-normal font-display text-2xl font-bold uppercase italic" onClick={() => void choose(primaryId)}>{saving ? 'Saving your selection…' : 'Love it! Let’s review the order'}<ArrowRight /></Button><p className="mt-3 text-center text-xs text-muted-foreground">Saves your selection on this device. No purchase or assembly booking yet.</p>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">Could not load or save your selection. Your fitting is safe; try selecting the head again.</p>}{selection && <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Check className="size-4 text-primary" />Saved selection: {HEADS[selection.head].name}<Button variant="link" className="h-auto px-1" onClick={() => setOverlay(true)}>Review</Button></p>}
      <section data-scroll-reveal className="mt-16 border-t border-border pt-7"><p className="text-xs uppercase tracking-widest text-muted-foreground">02 · A different trade-off</p><div className="mt-5 grid items-center gap-5 sm:grid-cols-[160px_1fr]"><ClubReveal image={secondary.image} name={secondary.name} compact /><div><h2 className="font-display text-3xl font-bold uppercase italic">{secondary.name} irons</h2><p className="mt-2 text-xs uppercase text-muted-foreground">{secondary.set}</p><p className="mt-3 max-w-xl text-sm text-muted-foreground">{secondary.tradeoff}</p><Button variant="outline" disabled={saving} className="mt-4 h-auto whitespace-normal" onClick={() => void choose(secondaryId)}>Select {secondary.name} with my specs <ArrowRight /></Button></div></div></section>
      <FittingData state={state} explanation={fit.explanation} profile={fitting.snapshot?.profile ?? {}} extras={extras.data} swing={swing} />
      <p className="mt-8 border-l-2 border-primary pl-4 text-xs leading-relaxed text-muted-foreground">Check the final configuration and return conditions on Takomo before purchasing. Custom builds are not returnable; eligible stock sets have 30-day returns.</p>
      <DeleteMyData />
    </>}
    <Button asChild variant="link" className="mt-8 px-0 text-muted-foreground"><Link to="/enrichment"><ArrowLeft />Review extra data</Link></Button>
  </section>{overlay && selection && <HeadSelectionOverlay selection={selection} onClose={() => setOverlay(false)} />}</main>;
}

/** Privacy: one tap removes every Takomo record in this browser (POR-35). Two steps, since it can't be undone. */
function DeleteMyData() {
  const [ask, setAsk] = useState(false);
  return <div className="mt-6 text-xs text-muted-foreground">{ask
    ? <p className="flex flex-wrap items-center gap-2">Delete your answers, swing timing and saved fit from this device?<Button variant="destructive" size="sm" onClick={() => { clearAllLocal(); window.location.assign('/'); }}>Delete</Button><Button variant="ghost" size="sm" onClick={() => setAsk(false)}>Cancel</Button></p>
    : <Button variant="link" className="h-auto px-0 text-xs text-muted-foreground" onClick={() => setAsk(true)}>Delete my data from this device</Button>}</div>;
}

/** Template "why": the golfer's own priorities first (strong or where the rival is better), then skill/speed. */
const HEAD_WHY_FIRST = ['HEAD_PRIORITY', 'HEAD_ALT_STRONGER'];
function headWhy(reasons: Reason[]): string {
  const first = reasons.filter(r => HEAD_WHY_FIRST.includes(r.code));
  const rest = reasons.filter(r => !HEAD_WHY_FIRST.includes(r.code));
  return [...first, ...rest].slice(0, 2).map(renderReason).join(' ');
}
