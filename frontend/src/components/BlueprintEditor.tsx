import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { effectiveSpecs, specsSchema, type Blueprint, type Specs, type SpecOverrides } from '@/lib/blueprint-schema';

export function WeightControl({ weight, onChange }: { weight: number | null; onChange: (n: number) => void }) {
  return <div className="mt-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><label htmlFor="shaft-weight" className="text-xs uppercase text-muted-foreground">Shaft weight</label><span className="font-display text-xl font-bold italic text-primary">{weight === null ? 'No weight selected' : `${weight}g · YOUR SELECTION`}</span></div><Slider id="shaft-weight" aria-label="Shaft weight" min={60} max={130} step={1} value={[weight ?? 60]} onValueChange={values => { const n = values[0]; if (n !== undefined) onChange(n); }} /><div className="mt-3 flex justify-between text-xs tabular-nums text-muted-foreground"><span>60g</span><span>95g</span><span>130g</span></div></div>;
}

export function BlueprintEditor({ blueprint, open, onClose, onSave, saving, error }: { blueprint: Blueprint; open: boolean; onClose: () => void; onSave: (overrides: SpecOverrides) => void; saving: boolean; error: boolean }) {
  const [draft, setDraft] = useState<SpecOverrides>({ ...blueprint.overrides });
  const specs = effectiveSpecs({ ...blueprint, overrides: draft });
  const [invalid, setInvalid] = useState(false);
  function field<K extends keyof Specs>(key: K, value: Specs[K]) { setInvalid(false); setDraft(d => ({ ...d, [key]: value })); }
  const selectClass = 'mt-2 h-11 w-full border border-input bg-background px-3 text-sm';
  return <Sheet open={open} onOpenChange={value => { if (!value && !saving) onClose(); }}><SheetContent className="enrichment-theme w-full overflow-y-auto sm:max-w-md"><SheetHeader><SheetTitle className="font-display text-3xl font-bold uppercase italic">Your call.</SheetTitle><SheetDescription>These are manual choices, not verified fitting recommendations.</SheetDescription></SheetHeader><fieldset disabled={saving} className="mt-8 space-y-6">
    <label className="block text-sm">Shaft material<select aria-label="Shaft material" className={selectClass} value={specs.material ?? ''} onChange={e => field('material', e.target.value ? e.target.value as Specs['material'] : null)}><option value="">Not selected</option><option>Steel</option><option>Graphite</option></select></label>
    <label className="block text-sm">Shaft flex<select aria-label="Shaft flex" className={selectClass} value={specs.flex ?? ''} onChange={e => field('flex', e.target.value ? e.target.value as Specs['flex'] : null)}><option value="">Not selected</option>{['Light', 'Regular', 'Stiff', 'Extra stiff'].map(value => <option key={value}>{value}</option>)}</select></label>
    <WeightControl weight={specs.weight} onChange={n => field('weight', n)} />
    <label className="block text-sm">Club length adjustment (inches)<input aria-label="Club length adjustment" type="number" min={-1.5} max={1.5} step={0.5} value={specs.length ?? ''} className={selectClass} onChange={e => field('length', e.target.value === '' ? null : Number(e.target.value))} /></label>
    <label className="block text-sm">Lie adjustment (degrees)<input aria-label="Lie adjustment" type="number" min={-3} max={3} step={1} value={specs.lie ?? ''} className={selectClass} onChange={e => field('lie', e.target.value === '' ? null : Number(e.target.value))} /><span className="mt-2 block text-xs text-muted-foreground">Positive = upright · Negative = flat</span></label>
    <label className="block text-sm">Grip size<select aria-label="Grip size" className={selectClass} value={specs.grip ?? ''} onChange={e => field('grip', e.target.value ? e.target.value as Specs['grip'] : null)}><option value="">Not selected</option>{['Undersize', 'Standard', 'Midsize'].map(value => <option key={value}>{value}</option>)}</select></label>
    <Button variant="outline" className="w-full" onClick={() => { setDraft({}); setInvalid(false); }}><RotateCcw />Restore baseline</Button>
    {(error || invalid) && <p role="alert" className="text-sm text-destructive">{invalid ? 'Use 60–130g, length in 0.5-inch steps within ±1.5 inches, and lie in whole degrees within ±3°.' : 'Could not save your adjustments. Your edits are still here; try again.'}</p>}
    <Button className="h-12 w-full font-display text-xl font-bold uppercase italic" onClick={() => { if (!specsSchema.partial().safeParse(draft).success) { setInvalid(true); return; } onSave(draft); }}>{saving ? 'Saving…' : 'Save adjustments'}</Button><Button variant="ghost" className="w-full" onClick={onClose}>Cancel</Button>
  </fieldset></SheetContent></Sheet>;
}