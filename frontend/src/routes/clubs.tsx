import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { ArrowLeft, ArrowRight, Check, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFitting } from '@/hooks/use-fitting';
import { HEADS } from '@/lib/head-catalog';
import { shortlist, shortlistReason, type HeadId, type HeadSelection } from '@/lib/head-selection-schema';
import { readHeadSelection, saveHeadSelection } from '@/lib/head-selection.functions';
import { getFittingToken } from '@/lib/fitting-session';
import { HeadSelectionOverlay } from '@/components/HeadSelectionOverlay';
import { FittingData } from '@/components/FittingData';
import { ClubReveal } from '@/components/ClubReveal';

export const Route = createFileRoute('/clubs')({ head: () => ({ meta: [
  { title: 'Your Iron Shortlist | Takomo Golf' }, { name: 'description', content: 'Compare two Takomo iron heads, understand the trade-offs and save your selection with your fitting specifications.' },
  { property: 'og:title', content: 'Your Iron Shortlist | Takomo Golf' }, { property: 'og:description', content: 'A clear two-head shortlist with honest reasoning and your saved specifications.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
] }), component: Clubs });

function Clubs() {
  const fitting = useFitting();
  const confirmed = fitting.snapshot?.confirmed === true;
  const read = useServerFn(readHeadSelection), save = useServerFn(saveHeadSelection);
  const [selection, setSelection] = useState<HeadSelection | null>(null);
  const [overlay, setOverlay] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(false), [reading, setReading] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!confirmed) return;
    let active = true; setReading(true);
    void read({ data: { token: getFittingToken() } }).then(value => { if (active) setSelection(value); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setReading(false); });
    return () => { active = false; };
  }, [confirmed, read]);
  async function choose(head: HeadId) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(false);
    try { const value = await save({ data: { token: getFittingToken(), head } }); setSelection(value); setOverlay(true); }
    catch { setError(true); }
    finally { busy.current = false; setSaving(false); }
  }
  const profile = fitting.snapshot?.profile ?? {};
  const order = shortlist(profile);
  const primaryId = order[0] ?? '101', secondaryId = order[1] ?? '201';
  const primary = HEADS[primaryId], secondary = HEADS[secondaryId];
  const loading = fitting.loading || (confirmed && reading);
  return <main className="enrichment-theme min-h-screen bg-background font-sans text-foreground"><header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background px-5 py-4 md:px-8"><span className="font-display text-2xl font-bold italic">TAKOMO</span><span className="text-xs uppercase tracking-widest text-muted-foreground">Find my fit · <span className="text-primary">Step 4 / 4</span></span></header><section className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-10">
    <div className="flex items-center gap-4 border-b border-border pb-6"><img src="/images/grant-avatar.png" alt="Grant Horvat" className="size-20 shrink-0 border border-primary object-cover" /><div><p className="text-xs uppercase tracking-widest text-primary">Grant · AI-assisted fitter</p><p className="mt-2 max-w-xl text-base leading-relaxed">Two heads. Clear trade-offs. Here’s why we’d start with one over the other for your game.</p></div></div>
    {fitting.error ? <div role="alert" className="py-8"><p>Could not load your fitting. Your saved data is safe.</p><Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Try again</Button></div> : loading ? <p className="py-8 text-muted-foreground">Loading your shortlist…</p> : !confirmed ? <p className="py-8">Confirm your profile with Grant first.</p> : <>
      <div className="mt-8 flex flex-wrap items-center gap-3"><p className="text-xs font-medium uppercase tracking-widest text-primary">01 · First to compare</p><span className="ml-auto text-xs text-muted-foreground">Profile-based shortlist · fit not verified</span></div>
      <div className="mt-6 text-center"><h1 className="font-display text-6xl font-bold uppercase italic leading-none md:text-7xl">{primary.name} IRONS</h1><p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">{primary.set}</p></div>
      <ClubReveal image={primary.image} name={primary.name} />
      <div className="mx-auto mt-6 max-w-2xl text-center"><h2 className="font-display text-2xl font-bold uppercase italic text-primary">Why these for you?</h2><p className="mt-3 text-lg leading-relaxed">{primaryId === '101' ? /mishit|forgiv|inconsisten|forgive/.test(profile['wants']?.value.toLowerCase() ?? '') ? 'A little more room for the strikes that don’t find the middle. That makes the 101 MKII our first option for your game: forgiveness takes priority over a smaller, more demanding-looking head.' : /distance|dist/.test(profile['wants']?.value.toLowerCase() ?? '') ? 'Distance and an easier launch are the priorities here. The 101 MKII puts those ahead of a compact shape, making it our first option for your game.' : 'More help, less emphasis on a compact shape. For your current game, we’d start with the forgiveness-focused 101 MKII rather than prioritising a smaller head.' : 'A compact head keeps control and shaping at the centre of the comparison. That makes the 201 MKII our first option for your game—with a more compact shape that asks more of your strike consistency.'}</p><p className="mt-3 text-xs text-muted-foreground">Your answers guide this shortlist. It is not a verified fitting recommendation.</p></div>
      <div data-scroll-reveal className="grid gap-7 border-b border-border py-7 md:grid-cols-2"><div><h2 className="font-display text-xl font-bold uppercase italic">The head, in brief</h2><p className="mt-4 text-sm leading-relaxed text-muted-foreground">{primary.description}</p><ul className="mt-4 space-y-3">{shortlistReason(profile, primaryId).slice(1).map(reason => <li key={reason} className="flex gap-3 text-sm text-muted-foreground"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{reason}</li>)}</ul></div><div><h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase italic"><Scale className="size-5 text-primary" />Known trade-offs</h2><p className="mt-4 text-sm leading-relaxed text-muted-foreground">{primary.tradeoff}</p><p className="mt-3 text-xs text-muted-foreground">No calibrated match percentage or video-based launch prediction is available.</p></div></div>
      <Button disabled={saving} className="mt-6 h-auto min-h-14 w-full whitespace-normal font-display text-2xl font-bold uppercase italic" onClick={() => void choose(primaryId)}>{saving ? 'Saving your selection…' : 'Love it! Let’s review the order'}<ArrowRight /></Button><p className="mt-3 text-center text-xs text-muted-foreground">Saves your selection. No purchase or assembly booking yet.</p>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">Could not load or save your selection. Your fitting is safe; try selecting the head again.</p>}{selection && <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Check className="size-4 text-primary" />Saved selection: {HEADS[selection.head].name}<Button variant="link" className="h-auto px-1" onClick={() => setOverlay(true)}>Review</Button></p>}
      <section data-scroll-reveal className="mt-16 border-t border-border pt-7"><p className="text-xs uppercase tracking-widest text-muted-foreground">02 · A different trade-off</p><div className="mt-5 grid items-center gap-5 sm:grid-cols-[160px_1fr]"><ClubReveal image={secondary.image} name={secondary.name} compact /><div><h2 className="font-display text-3xl font-bold uppercase italic">{secondary.name} irons</h2><p className="mt-2 text-xs uppercase text-muted-foreground">{secondary.set}</p><p className="mt-3 max-w-xl text-sm text-muted-foreground">{secondary.tradeoff}</p><Button variant="outline" disabled={saving} className="mt-4 h-auto whitespace-normal" onClick={() => void choose(secondaryId)}>Select {secondary.name} with my specs <ArrowRight /></Button></div></div></section>
      <div data-scroll-reveal className="mt-7 border-l-2 border-primary pl-5"><h2 className="font-display text-2xl font-bold uppercase italic">Why we’d still start with the {primary.name}</h2><p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{primaryId === '101' ? /mishit|forgiv|inconsisten|forgive/.test(profile['wants']?.value.toLowerCase() ?? '') ? 'Help on off-centre strikes matters more for your game than a smaller head. The 201 MKII offers a more compact shape, but that alone doesn’t address your mishits. That’s why the forgiveness-focused 101 MKII stays first in your comparison.' : /distance|dist/.test(profile['wants']?.value.toLowerCase() ?? '') ? 'Your comparison puts distance and easier launch ahead of a compact look. The 201 MKII offers a smaller profile, but the 101 MKII keeps your distance and launch priorities first.' : 'For your current game, we’d prioritise help over a compact look. The 201 MKII gives you the smaller profile; the 101 MKII keeps forgiveness at the centre of the comparison. That is the trade-off behind our shortlist order.' : 'Control and shaping are the priorities driving your shortlist. The 101 MKII offers the larger, forgiveness-focused alternative, but the compact 201 MKII stays first for the feel and control you’re after, with less emphasis on forgiveness.'}</p><p className="mt-3 text-xs text-muted-foreground">A stronger starting point for your priorities, not a proven winner.</p></div>
      <FittingData />
      <p className="mt-8 border-l-2 border-primary pl-4 text-xs leading-relaxed text-muted-foreground">Check the final configuration and return conditions on Takomo before purchasing. Custom builds are not returnable; eligible stock sets have 30-day returns.</p>
    </>}
    <Button asChild variant="link" className="mt-8 px-0 text-muted-foreground"><Link to="/enrichment"><ArrowLeft />Review extra data</Link></Button>
  </section>{overlay && selection && <HeadSelectionOverlay selection={selection} onClose={() => setOverlay(false)} />}</main>;
}