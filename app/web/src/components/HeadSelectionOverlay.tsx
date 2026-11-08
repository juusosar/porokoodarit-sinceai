import { useState } from 'react';
import { useLen } from '@/lib/units';
import { ArrowUpRight, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { HEADS } from '@/lib/head-catalog';
import { env } from '@/lib/env';
import type { HeadSelection, SelectionSpecs } from '@/lib/head-selection-schema';
import { specText } from '@/lib/spec-text';

export function SpecSummary({ specs }: { specs: SelectionSpecs }) {
  const L = useLen();
  const rows: [string, string | null][] = [['Shaft', specs.shaft], ['Length', specs.length], ['Lie', specs.lie], ['Grip', specs.grip], ['Stock or custom', specs.purchase]];
  return <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-xs uppercase text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value ? L(value) : 'Not determined yet'}</dd></div>)}</dl>;
}
/** Box truck that drives in, parks, drives off; drawn as one SVG so the Takomo logo and headlight stay on the truck. */
function DeliveryTruck() {
  const wheel = (cx: number) => <g key={cx} className="takomo-wheel"><circle cx={cx} cy={83} r={11} fill="var(--background)" stroke="currentColor" strokeWidth={2} /><path d={`M${cx - 6} 83h12M${cx} 77v12`} stroke="currentColor" strokeWidth={1.5} /></g>;
  return <svg className="takomo-truck absolute bottom-0 h-24 w-64 text-muted-foreground" viewBox="0 0 256 96" fill="none"><path d="M10 14h154v62H10z" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" /><path d="M164 32h38l26 24v20h-64z" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" /><path d="M172 38h27l17 16h-44z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" /><path d="M6 76h226" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /><rect x={224} y={60} width={8} height={5} fill="var(--primary)" /><image href="/brand/takomo-wordmark.png" x={32} y={37} width={110} height={16} />{[44, 122, 204].map(wheel)}</svg>;
}
export function HeadSelectionOverlay({ selection, onClose }: { selection: HeadSelection; onClose: () => void }) {
  const head = HEADS[selection.head];
  const shop = env('VITE_SHOP_URL', 'https://takomogolf.com');
  const text = specText(head.name, selection.specs);
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const copy = () => {
    if (!navigator.clipboard) { setCopied('failed'); return; }
    navigator.clipboard.writeText(text).then(() => setCopied('yes'), () => setCopied('failed'));
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="enrichment-theme fixed inset-0 left-0 top-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col items-center justify-start overflow-y-auto rounded-none border-0 px-5 py-16 sm:rounded-none"><div className="w-full max-w-2xl text-center"><p className="text-xs uppercase tracking-widest text-primary">Your selection is saved</p><div className="relative mt-8 h-32 overflow-hidden border-b border-border" aria-hidden="true"><DeliveryTruck /></div><DialogTitle className="mt-9 font-display text-5xl font-bold uppercase italic tracking-normal">Pure strikes <span className="text-primary">on the horizon.</span></DialogTitle><DialogDescription className="mt-5 text-base">Your {head.name} fit and specifications are saved on this device. No order has been placed or queued for assembly.</DialogDescription><div className="mt-8 border-y border-border py-6 text-left"><h2 className="mb-5 font-display text-2xl font-bold uppercase italic">{head.name} · {head.set}</h2><SpecSummary specs={selection.specs} /></div><p className="mt-5 text-sm text-muted-foreground">Fewer 3-putts? Still on you.</p><p className="mt-4 text-sm text-muted-foreground">Confirm available shafts, custom options, price and delivery on Takomo. Specs aren’t sent to the shop automatically yet: copy them and paste them into your order notes.</p><Button variant="outline" className="mt-5 h-auto min-h-12 w-full whitespace-normal" onClick={copy}>{copied === 'yes' ? <><Check />Spec copied</> : <><Copy />Copy my spec</>}</Button>{copied === 'failed' && <pre className="mt-3 select-all whitespace-pre-wrap border border-border p-3 text-left text-xs" aria-label="Your spec">{text}</pre>}<Button asChild className="mt-7 h-auto min-h-12 w-full whitespace-normal font-display text-xl font-bold uppercase italic"><a href={head.url ?? shop} target="_blank" rel="noopener noreferrer">Review on Takomo <ArrowUpRight /></a></Button><Button asChild variant="link" className="mt-4"><a href={shop}>Back to Takomo Home</a></Button><Button variant="ghost" className="mt-2" onClick={onClose}>Keep comparing</Button></div></DialogContent></Dialog>;
}
