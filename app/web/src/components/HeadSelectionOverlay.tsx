import { useState } from 'react';
import { ArrowUpRight, Check, Copy, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { HEADS } from '@/lib/head-catalog';
import { env } from '@/lib/env';
import type { HeadSelection, SelectionSpecs } from '@/lib/head-selection-schema';
import { specText } from '@/lib/spec-text';

export function SpecSummary({ specs }: { specs: SelectionSpecs }) {
  const rows: [string, string | null][] = [['Shaft', specs.shaft], ['Length', specs.length], ['Lie', specs.lie], ['Grip', specs.grip], ['Stock or custom', specs.purchase]];
  return <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-xs uppercase text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value ?? 'Not determined yet'}</dd></div>)}</dl>;
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
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="enrichment-theme fixed inset-0 left-0 top-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col items-center justify-start overflow-y-auto rounded-none border-0 px-5 py-16 sm:rounded-none"><div className="w-full max-w-2xl text-center"><p className="text-xs uppercase tracking-widest text-primary">Your selection is saved</p><div className="relative mt-8 h-32 overflow-hidden border-b border-border" aria-hidden="true"><div className="takomo-truck absolute bottom-3 flex h-24 w-64 items-center justify-center"><Truck className="absolute inset-0 h-24 w-64 text-muted-foreground" strokeWidth={1} /><span className="absolute left-14 top-6 font-display text-xl font-bold italic text-foreground">TAKOMO</span><span className="absolute right-4 top-10 h-2 w-4 bg-primary shadow-glow" /></div></div><DialogTitle className="mt-9 font-display text-5xl font-bold uppercase italic tracking-normal">Pure strikes <span className="text-primary">on the horizon.</span></DialogTitle><DialogDescription className="mt-5 text-base">Your {head.name} fit and specifications are saved on this device. No order has been placed or queued for assembly.</DialogDescription><div className="mt-8 border-y border-border py-6 text-left"><h2 className="mb-5 font-display text-2xl font-bold uppercase italic">{head.name} · {head.set}</h2><SpecSummary specs={selection.specs} /></div><p className="mt-5 text-sm text-muted-foreground">Fewer 3-putts? Still on you.</p><p className="mt-4 text-sm text-muted-foreground">Confirm available shafts, custom options, price and delivery on Takomo. Specs aren’t sent to the shop automatically yet: copy them and paste them into your order notes.</p><Button variant="outline" className="mt-5 h-auto min-h-12 w-full whitespace-normal" onClick={copy}>{copied === 'yes' ? <><Check />Spec copied</> : <><Copy />Copy my spec</>}</Button>{copied === 'failed' && <pre className="mt-3 select-all whitespace-pre-wrap border border-border p-3 text-left text-xs" aria-label="Your spec">{text}</pre>}<Button asChild className="mt-7 h-auto min-h-12 w-full whitespace-normal font-display text-xl font-bold uppercase italic"><a href={head.url ?? shop} target="_blank" rel="noopener noreferrer">Review on Takomo <ArrowUpRight /></a></Button><Button asChild variant="link" className="mt-4"><a href={shop}>Back to Takomo Home</a></Button><Button variant="ghost" className="mt-2" onClick={onClose}>Keep comparing</Button></div></DialogContent></Dialog>;
}
