import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Check, ChevronDown, Circle, Pencil, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFitting } from '@/hooks/use-fitting';
import { useEnrichment } from '@/hooks/use-enrichment';
import { useBlueprint } from '@/hooks/use-blueprint';
import { saveBlueprint } from '@/lib/blueprint.functions';
import { getFittingToken } from '@/lib/fitting-session';
import { effectiveSpecs, formatLength, formatLie, initialBlueprint, type Blueprint, type Specs, type SpecOverrides } from '@/lib/blueprint-schema';
import { BlueprintEditor, WeightControl } from '@/components/BlueprintEditor';

export function FittingData() {
  const [expanded, setExpanded] = useState(false);
  const fitting = useFitting();
  const confirmed = fitting.snapshot?.confirmed === true;
  const extras = useEnrichment(confirmed);
  const stored = useBlueprint(confirmed);
  const save = useServerFn(saveBlueprint);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [draftWeight, setDraftWeight] = useState<number | null>(null);
  const guard = useRef(false);
  useEffect(() => {
    if (stored.data && extras.ready && fitting.snapshot) setBlueprint(stored.data.blueprint ?? initialBlueprint(fitting.snapshot.profile, extras.data));
  }, [stored.data, extras.ready, fitting.snapshot]);
  const specs = blueprint ? effectiveSpecs(blueprint) : null;
  async function persist(overrides: SpecOverrides) {
    if (guard.current) return;
    guard.current = true; setSaving(true); setSaveError(false);
    try {
      const value = await save({ data: { token: getFittingToken(), overrides } });
      setBlueprint(value); setDraftWeight(null); setOpen(false);
    } catch { setSaveError(true); }
    finally { guard.current = false; setSaving(false); }
  }
  const profile = fitting.snapshot?.profile ?? {};
  const known = (key: string) => profile[key]?.value ?? 'Not provided';
  const geometryProvided = ['height', 'wrist'].every(key => profile[key]?.status === 'sure' && /\d/.test(profile[key]?.value ?? ''));
  const manual = (keys: (keyof Specs)[]) => keys.some(key => blueprint?.overrides[key] !== undefined && blueprint.overrides[key] !== null);
  const loading = fitting.loading || (confirmed && (extras.loading || stored.loading));
  const error = fitting.error || extras.error || stored.error;
  const weight = draftWeight ?? specs?.weight ?? null;
  return <section data-scroll-reveal className="mt-8 border-y border-border py-6">
    <h2><Button variant="ghost" aria-expanded={expanded} aria-controls="fitting-data" onClick={() => setExpanded(value => !value)} className="h-auto w-full justify-between gap-4 px-0 font-display text-2xl font-bold uppercase italic"><span>My fit, under the hood</span><ChevronDown className={`size-5 shrink-0 text-primary transition-transform ${expanded ? 'rotate-180' : ''}`} /></Button></h2>
    <div id="fitting-data" hidden={!expanded} className="pt-5">
      {loading ? <p className="py-8 text-muted-foreground">Loading your fitting…</p> : error ? <div role="alert" className="py-8"><p>Your fitting could not be loaded. Your saved data is safe.</p><Button variant="outline" className="mt-4" onClick={() => { if (fitting.error) { window.location.reload(); return; } stored.retry(); extras.retry(); }}>Try loading again</Button></div> : !confirmed ? <p className="py-8">Confirm your profile with Grant first.</p> : blueprint && specs ? <>
        <div className="border-y border-primary/40 bg-primary/5 px-4 py-5"><p className="flex items-center gap-2 font-display text-xl font-bold uppercase italic"><ShieldCheck className="size-5 text-primary" />Evidence, not guesswork.</p><div className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground">{[[stored.data?.videoSaved ? 'Video saved · analysis pending' : 'Video not submitted', false], [extras.data?.skipped ? 'Report data skipped' : extras.data?.speed !== null && extras.data?.speed !== undefined ? 'Report speed · manually entered' : 'Report speed not provided', !!extras.data && !extras.data.skipped && extras.data.speed !== null], [geometryProvided ? 'Geometry · self-reported' : 'Geometry incomplete', geometryProvided]].map(([label, present]) => <span key={String(label)} className="flex items-center gap-2">{present ? <Check className="size-4 text-primary" /> : <Circle className="size-3" />}{label}</span>)}</div></div>
        <div data-scroll-reveal className="border-b border-border py-8"><SpecHeading number="01" title="Shaft flex & weight" manual={manual(['material','flex','weight'])} /><h3 className="mt-4 font-display text-3xl font-bold uppercase italic">{[specs.material, specs.flex, specs.weight === null ? null : `${specs.weight}g`].filter(Boolean).join(' · ') || 'Not determined yet'}</h3><p className="mt-3 max-w-2xl text-sm text-muted-foreground">{extras.data && !extras.data.skipped && extras.data.speed !== null ? `Reported speed: ${extras.data.speed} mph (${extras.data.club}). ` : `7-iron carry: ${known('carry')}. `}Tempo: {known('tempo')}. A validated shaft match is still needed.</p><div className="mt-6 max-w-2xl border-y border-border py-5"><WeightControl weight={weight} onChange={n => { setDraftWeight(n); setSaveError(false); }} /><p className="mt-4 text-xs text-muted-foreground">{weight === null ? 'No recommended weight yet. Selecting a weight makes it your manual choice.' : 'User-selected weight · not a verified shaft recommendation.'}</p>{draftWeight !== null && <div className="mt-4 flex flex-wrap gap-2"><Button disabled={saving} onClick={() => void persist({ ...blueprint.overrides, weight: draftWeight })}>{saving ? 'Saving…' : 'Save weight'}</Button><Button variant="ghost" disabled={saving} onClick={() => { setDraftWeight(null); setSaveError(false); }}>Cancel weight change</Button></div>}</div></div>
        <div className="grid border-b border-border md:grid-cols-2"><div data-scroll-reveal className="py-8 md:border-r md:border-border md:pr-8"><SpecHeading number="02" title="Club length" manual={manual(['length'])} /><h3 className="mt-4 font-display text-3xl font-bold uppercase italic">{formatLength(specs.length)}</h3><p className="mt-3 text-sm text-muted-foreground">Height: {known('height')} · Wrist to floor: {known('wrist')}. Self-reported geometry; the length mapping still needs validation.</p></div><div data-scroll-reveal className="border-t border-border py-8 md:border-t-0 md:pl-8"><SpecHeading number="03" title="Lie angle" manual={manual(['lie'])} /><h3 className="mt-4 font-display text-3xl font-bold uppercase italic">{formatLie(specs.lie)}</h3><p className="mt-3 text-sm text-muted-foreground">A rear-view swing or strike location alone doesn’t establish dynamic lie. No automatic upright or flat adjustment.</p></div></div>
        <div data-scroll-reveal className="border-b border-border py-8"><SpecHeading number="04" title="Grip sizing" manual={manual(['grip'])} /><h3 className="mt-4 font-display text-3xl font-bold uppercase italic">{specs.grip ?? 'Not determined yet'}</h3><p className="mt-3 text-sm text-muted-foreground">Glove size: {known('glove')}. Hand length has not been measured; grip sizing needs an approved fitting rule.</p></div>
        {saveError && !open && <p role="alert" className="mt-4 text-sm text-destructive">Could not save your adjustment. Your selection is still here; try again.</p>}
        <Button variant="outline" className="mt-6 h-11" disabled={saving} onClick={() => { setSaveError(false); setOpen(true); }}><Pencil className="size-4" />Edit / override specs manually</Button>
        <details data-scroll-reveal className="mt-8 border-y border-border py-5"><summary className="cursor-pointer font-display text-xl font-bold uppercase italic">Your profile & source data</summary><dl className="mt-5 grid gap-4 sm:grid-cols-2">{Object.entries(profile).map(([key, answer]) => <div key={key}><dt className="text-xs uppercase text-muted-foreground">{key === 'development' ? 'Future outlook' : key}</dt><dd className="mt-1 break-words">{answer.value}{answer.status === 'guess' ? ' · Estimate' : ''}</dd></div>)}</dl><h3 className="mt-6 font-medium">Extra data</h3>{extras.data && !extras.data.skipped ? <><p className="mt-2 text-sm text-muted-foreground">{extras.data.club} · Self-reported session numbers</p><dl className="mt-3 grid gap-4 sm:grid-cols-2">{[['Clubhead speed', extras.data.speed, 'mph'], ['Carry distance', extras.data.carry, extras.data.unit], ['Launch angle', extras.data.launch, '°'], ['Spin rate', extras.data.spin, 'rpm']].map(([label, value, unit]) => value !== null && <div key={String(label)}><dt className="text-xs text-muted-foreground">{label}</dt><dd>{typeof value === 'number' ? Number(value.toFixed(2)) : value} {unit}</dd></div>)}</dl>{extras.data.impactEnabled && extras.data.impact && <p className="mt-4">Strike observation: {extras.data.impact} · No automatic lie change</p>}</> : <p className="mt-2 text-muted-foreground">{extras.data?.skipped ? 'Optional extra data skipped.' : 'No extra data has been saved yet.'}</p>}</details>
        <p className="mt-7 flex items-start gap-3 text-sm text-muted-foreground"><ShieldCheck className="size-5 shrink-0 text-primary" />Your inputs are saved. Calculated specs await validated fitting rules; no master-fitter certification has been issued.</p>
        {open && <BlueprintEditor blueprint={blueprint} open={open} saving={saving} error={saveError} onClose={() => { setOpen(false); setSaveError(false); }} onSave={overrides => void persist(overrides)} />}
      </> : null}
    </div>
  </section>;
}
function SpecHeading({ number, title, manual }: { number: string; title: string; manual: boolean }) {
  return <div className="flex flex-wrap items-center gap-3"><span className="font-display text-2xl italic text-primary">{number}</span><h2 className="text-xs font-medium uppercase tracking-widest">{title}</h2><span className="ml-auto text-xs text-muted-foreground">{manual ? 'User-selected' : 'Awaiting fitting rule'}</span></div>;
}
