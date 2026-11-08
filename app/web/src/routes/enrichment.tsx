import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, SlidersHorizontal, Activity, Loader2, ShieldCheck, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuestionInfo } from '@/components/QuestionInfo';
import { BallLineTest } from '@/components/BallLineTest';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useFitting } from '@/hooks/use-fitting';
import { useEnrichment } from '@/hooks/use-enrichment';
import { HearItButton, VoiceToggle, hostParagraphs, useHostLine, useSpeakLine } from '@/features/voice';
import { saveEnrichment } from '@/lib/enrichment.functions';
import { getFittingToken } from '@/lib/fitting-session';
import { carryLimit, convertCarry, emptyEnrichment, enrichmentSchema, type Enrichment } from '@/lib/enrichment-schema';
import { HostMark, TakomoLogo } from '@/components/HostMark';

export const Route = createFileRoute('/enrichment')({ head: () => ({ meta: [
  { title: 'Extra Fitting Data | Takomo Golf' }, { name: 'description', content: 'Add optional launch monitor numbers and strike observations to your Takomo fitting.' },
  { property: 'og:title', content: 'Extra Fitting Data | Takomo Golf' }, { property: 'og:description', content: 'Your numbers, your fitting. Optional extra data without the guesswork.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
] }), component: EnrichmentPage });

const metrics = [{ key: 'speed', label: 'Clubhead speed', unit: 'mph', max: 200 }, { key: 'carry', label: 'Carry distance', unit: '', max: 500 }, { key: 'launch', label: 'Launch angle', unit: '°', max: 90 }, { key: 'spin', label: 'Spin rate', unit: 'rpm', max: 20000 }, { key: 'landing', label: 'Landing angle', unit: '°', max: 65 }] as const;
function EnrichmentPage() {
  const hostLine = useHostLine('enrichment_intro');
  useSpeakLine(hostLine);
  const [hostMain, hostMore] = hostParagraphs('enrichment_intro');
  const fitting = useFitting();
  const confirmed = fitting.snapshot?.confirmed === true;
  const stored = useEnrichment(confirmed);
  const save = saveEnrichment;
  const navigate = useNavigate();
  const [form, setForm] = useState<Enrichment>(emptyEnrichment);
  const [values, setValues] = useState<Record<string, string>>({});
  const [manual, setManual] = useState(false);
  const [trackmanOpen, setTrackmanOpen] = useState(false);
  const [ballLineOpen, setBallLineOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  useEffect(() => { if (stored.data) { setForm(stored.data); setValues(Object.fromEntries(metrics.map(m => [m.key, stored.data?.[m.key]?.toString() ?? '']))); setManual(!stored.data.skipped); } }, [stored.data]);
  const blocked = !confirmed || fitting.loading || stored.loading || stored.error || fitting.error;
  const locked = busy || blocked || !stored.ready;
  async function proceed(skipped: boolean) {
    if (submitting.current || !confirmed || fitting.loading || fitting.error || (!skipped && locked)) return;
    setError('');
    const payload = { ...form, skipped, ...Object.fromEntries(metrics.map(m => [m.key, values[m.key]?.trim() ? Number(values[m.key]) : null])) };
    const parsed = enrichmentSchema.safeParse(skipped ? { ...emptyEnrichment, skipped: true } : payload);
    if (!parsed.success) { const issue = parsed.error.issues[0]; const metric = metrics.find(m => m.key === issue?.path[0]); setError(`Please check ${metric?.label.toLowerCase() ?? 'your numbers'}. Use a valid number within the field limits.`); return; }
    submitting.current = true;
    setBusy(true);
    try { await save({ data: { token: getFittingToken(), payload: parsed.data } }); await navigate({ to: '/clubs' }); }
    catch { setError('Your extra data could not be saved. Please try again.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  function changeUnit(unit: 'm' | 'yd') {
    const carry = Number(values['carry']);
    if (values['carry'] && Number.isFinite(carry)) setValues(v => ({ ...v, carry: convertCarry(carry, form.unit, unit).toString() }));
    setForm(v => ({ ...v, unit }));
  }
  return <main className="enrichment-theme min-h-screen bg-background font-sans text-foreground">
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-6 py-4"><TakomoLogo className="h-6 shrink-0" /><span className="flex items-center gap-4 text-xs uppercase tracking-widest text-muted-foreground"><VoiceToggle /><span>Find my fit · <span className="text-primary">Step 3 / 4</span></span></span></header>
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8 md:py-12">
      <div className="flex items-center gap-5"><HostMark className="size-20 shrink-0 border border-primary" /><div><p className="mb-2 text-xs uppercase tracking-widest text-primary">Gront · AI-assisted fitting</p><p className="text-lg leading-relaxed">{hostMain}</p><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{hostMore}</p><HearItButton line={hostLine} className="mt-1 text-xs text-primary underline" /></div></div>
      <div className="mb-8 mt-9"><p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">A little extra, never required</p><h1 className="font-display text-5xl font-bold uppercase italic leading-none md:text-6xl">Your numbers.<br /><span className="text-primary">Less guesswork.</span></h1></div>
      {fitting.loading || stored.loading ? <p className="mb-6 flex gap-2"><Loader2 className="size-4 animate-spin" />Loading your fitting…</p> : fitting.error || stored.error ? <p role="alert" className="mb-6 text-destructive">Could not load your fitting. Refresh to try again.</p> : !confirmed ? <p className="mb-6 border-l-2 border-primary pl-4 text-muted-foreground">Confirm your profile with Gront before saving extra data. <Link to="/" className="text-primary underline">Back to chat</Link></p> : null}
      {stored.error && <Button variant="outline" className="mb-4" onClick={stored.retry}>Try loading extra data again</Button>}
      <fieldset disabled={locked} className="min-w-0 border-0 p-0">
      <section data-scroll-reveal className="border-y border-border py-7">
        <h2><Button type="button" variant="ghost" aria-expanded={trackmanOpen} aria-controls="trackman-details" onClick={() => setTrackmanOpen(open => !open)} className="h-auto w-full justify-between px-0 py-0 font-display text-2xl font-bold uppercase italic"><span className="flex items-center gap-3"><Activity className="size-5 text-primary" />TrackMan data</span><ChevronDown className={`size-5 text-primary transition-transform ${trackmanOpen ? 'rotate-180' : ''}`} /></Button></h2>
        <p className="mt-3 text-sm text-muted-foreground">Got TrackMan data? Add it here! Your session numbers give Gront more to go on than estimates alone.</p>
        <div id="trackman-details" hidden={!trackmanOpen}>
        <p className="mt-3 text-muted-foreground">Have a session report? Type in your normal 7-iron numbers.</p>
        <Button variant="ghost" className="mt-5 w-full justify-between px-0" aria-expanded={manual} onClick={() => setManual(!manual)}>Enter data manually <ChevronDown className={manual ? 'rotate-180' : ''} /></Button>
        {manual && <div data-scroll-reveal className="mt-4">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><label htmlFor="data-club" className="mb-2 block text-sm">Club used</label><select id="data-club" value={form.club} onChange={e => setForm(v => ({ ...v, club: e.target.value === '7-iron' ? '7-iron' : 'other' }))} className="h-10 border border-input bg-background px-3"><option value="7-iron">7-iron</option><option value="other">Another club</option></select><QuestionInfo field="club" label="Club used" /></div><div><p className="mb-2 text-sm">Carry unit</p><div className="flex gap-1">{(['yd', 'm'] as const).map(unit => <Button key={unit} variant={form.unit === unit ? 'default' : 'outline'} aria-pressed={form.unit === unit} onClick={() => changeUnit(unit)}>{unit === 'yd' ? 'Yards' : 'Metres'}</Button>)}</div></div></div>
          {form.club === 'other' && <p className="mb-4 text-sm text-primary">We’ll keep these separate from your 7-iron profile.</p>}
          <div className="grid gap-5 sm:grid-cols-2">{metrics.map(metric => <div key={metric.key}><label htmlFor={metric.key} className="mb-2 flex justify-between text-sm"><span>{metric.label}</span><span className="text-muted-foreground">{metric.key === 'carry' ? form.unit : metric.unit}</span></label><Input id={metric.key} type="number" inputMode="decimal" min={metric.key === 'launch' ? 0 : 0.01} max={metric.key === 'carry' ? carryLimit(form.unit) : metric.max} step="any" value={values[metric.key] ?? ''} onChange={e => setValues(v => ({ ...v, [metric.key]: e.target.value }))} placeholder="Optional" className="h-12" /><QuestionInfo field={metric.key} label={metric.label} /></div>)}</div>
          <p className="mt-4 text-xs text-muted-foreground">Self-reported from your session · leave anything you don’t know blank. Speed and carry set your swing speed; landing angle (or launch + spin) sets the ball flight your shaft should give.</p>
          <Button variant="link" className="mt-2 px-0" onClick={() => setValues({})}>Clear measurements</Button>
        </div>}
        </div>
      </section>
      <section data-scroll-reveal className="border-b border-border py-7">
        <h2><Button type="button" variant="ghost" aria-expanded={ballLineOpen} aria-controls="ball-line-details" onClick={() => setBallLineOpen(open => !open)} className="h-auto w-full justify-between px-0 py-0 font-display text-2xl font-bold uppercase italic"><span className="flex items-center gap-3"><Ruler className="size-5 text-primary" />Ball-line lie test <span className="font-sans text-xs font-normal not-italic text-muted-foreground">Optional</span></span><ChevronDown className={`size-5 text-primary transition-transform ${ballLineOpen ? 'rotate-180' : ''}`} /></Button></h2>
        <p className="mt-3 text-sm text-muted-foreground">The best way to check your lie angle at home: a marker line on the ball leaves a mark on the face that shows how the club sat at impact.{form.ballLine.length ? ` ${form.ballLine.length} shot${form.ballLine.length > 1 ? 's' : ''} saved.` : ''}</p>
        <div id="ball-line-details" hidden={!ballLineOpen}><BallLineTest shots={form.ballLine} onChange={ballLine => setForm(v => ({ ...v, ballLine }))} disabled={locked} /></div>
      </section>
      <section data-scroll-reveal className="border-b border-border py-7"><div className="flex items-center justify-between gap-4"><h2 className="flex items-center gap-3 font-display text-2xl font-bold uppercase italic"><SlidersHorizontal className="size-5 text-primary" />Face impact <span className="font-sans text-xs font-normal not-italic text-muted-foreground">Optional</span></h2><Switch aria-label="Enable face impact" checked={form.impactEnabled} onCheckedChange={impactEnabled => setForm(v => ({ ...v, impactEnabled, impact: impactEnabled ? v.impact : null }))} /></div><p className="mt-3 text-muted-foreground">No need to overdo it. If you know your usual strike location, add it here.</p>
        <QuestionInfo field="impact" label="Face impact" />
        {form.impactEnabled && <div className="mt-6"><div className="grid grid-cols-3 gap-3">{(['heel', 'center', 'toe'] as const).map(impact => <Button key={impact} className="h-14 font-display text-xl uppercase" variant={form.impact === impact ? 'default' : 'outline'} aria-pressed={form.impact === impact} onClick={() => setForm(v => ({ ...v, impact: v.impact === impact ? null : impact }))}>{impact}</Button>)}</div><p className="mt-4 text-sm text-muted-foreground">Kept with your notes. Strike location alone doesn’t tell us your lie angle, so it doesn’t change the spec.</p></div>}
      </section>
      </fieldset>
      <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" />Saved privately with your fitting. Your original profile stays intact.</p>
      {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
      <Button disabled={locked} className="mt-7 h-14 w-full whitespace-normal font-display text-xl font-bold uppercase italic" onClick={() => void proceed(false)}>{busy ? <Loader2 className="animate-spin" /> : <>Continue to fitting results <ArrowRight /></>}</Button>
      <Button variant="link" disabled={!confirmed || fitting.loading || fitting.error || busy || stored.loading} className="mt-2 w-full text-muted-foreground" onClick={() => void proceed(true)}>Skip this step</Button>
      <Button asChild variant="link" className="mt-6 px-0 text-muted-foreground" onClick={e => { if (submitting.current) e.preventDefault(); }} aria-disabled={busy}><Link to="/swing"><ArrowLeft />Back to swing</Link></Button>
    </div>
  </main>;
}