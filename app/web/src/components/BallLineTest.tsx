// Ball-line lie test: the golfer photographs the club face after each shot and taps four points. The photo is
// shown from a local object URL and never uploaded; only the tilt numbers are saved.
import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TAP_ORDER, tiltDeg, type Pt } from '@/lib/lie/ball-line';

export const MAX_SHOTS = 10;
const GOOD_SHOTS = 3;

export function BallLineTest({ shots, onChange, disabled }: { shots: number[]; onChange: (shots: number[]) => void; disabled?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pts, setPts] = useState<Pt[]>([]);
  const [error, setError] = useState('');
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  function pick(file: File | undefined) {
    if (!file) return;
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(file));
    setPts([]);
    setError('');
  }
  function tap(e: React.MouseEvent<HTMLImageElement>) {
    if (pts.length >= 4 || !img.current) return;
    const r = img.current.getBoundingClientRect();
    // natural-pixel coordinates so the angle doesn't depend on display scaling
    const sx = img.current.naturalWidth / r.width, sy = img.current.naturalHeight / r.height;
    const next = [...pts, { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }];
    setPts(next);
    if (next.length === 4) {
      try {
        const t = tiltDeg(next[0], next[1], next[2], next[3]);
        if (Math.abs(t) > 25) { setError('That reads over 25°. Check the points and try again.'); return; }
        onChange([...shots, t].slice(-MAX_SHOTS));
        setUrl(null);
        setPts([]);
      } catch { setError('Two points landed on the same spot. Tap again.'); setPts([]); }
    }
  }
  const mean = shots.length ? shots.reduce((a, b) => a + b, 0) / shots.length : null;
  const dot = (p: Pt, i: number) => {
    const el = img.current;
    if (!el || !el.naturalWidth) return null;
    return <span key={i} aria-hidden className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary" style={{ left: `${(p.x / el.naturalWidth) * 100}%`, top: `${(p.y / el.naturalHeight) * 100}%` }} />;
  };

  return <div className="mt-5" data-testid="ball-line-test">
    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
      <li>Draw a straight line on a ball with a whiteboard marker.</li>
      <li>Set the ball with the line vertical, facing the club. Hit a 7-iron off a hard mat.</li>
      <li>Photograph the face square-on, then tap the four points below. Repeat for {GOOD_SHOTS}–5 shots.</li>
    </ol>
    {!url && <label className={`mt-4 inline-flex h-11 cursor-pointer items-center gap-2 border border-input px-4 text-sm ${disabled || shots.length >= MAX_SHOTS ? 'pointer-events-none opacity-50' : ''}`}>
      <Camera className="size-4 text-primary" />{shots.length ? 'Add another shot' : 'Add a face photo'}
      <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} disabled={disabled || shots.length >= MAX_SHOTS} />
    </label>}
    {url && <div className="mt-4">
      <p role="status" className="mb-2 text-sm">Tap {pts.length + 1} of 4: <span className="text-primary">{TAP_ORDER[Math.min(pts.length, 3)]}</span></p>
      <div className="relative inline-block max-w-full touch-manipulation select-none">
        <img ref={img} src={url} alt="Club face after the shot" onClick={tap} className="block max-h-[60vh] max-w-full cursor-crosshair" />
        {pts.map(dot)}
      </div>
      <div className="mt-2 flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => { setPts([]); setError(''); }}><RotateCcw />Redo taps</Button><Button type="button" variant="ghost" size="sm" onClick={() => { setUrl(null); setPts([]); }}>Cancel</Button></div>
    </div>}
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    {shots.length > 0 && <div className="mt-5">
      <ul className="flex flex-wrap gap-2 text-sm">{shots.map((t, i) => <li key={i} className="flex items-center gap-1 border border-border px-2 py-1">Shot {i + 1}: {t > 0 ? '+' : ''}{t.toFixed(1)}°<button type="button" aria-label={`Remove shot ${i + 1}`} disabled={disabled} onClick={() => onChange(shots.filter((_, j) => j !== i))}><Trash2 className="size-3.5 text-muted-foreground" /></button></li>)}</ul>
      {mean !== null && <p className="mt-3 text-sm text-muted-foreground">Average {mean > 0 ? '+' : ''}{mean.toFixed(1)}° {Math.abs(mean) < 1 ? '(about square)' : mean > 0 ? '(leans to the toe: your club may be too upright)' : '(leans to the heel: your club may be too flat)'}.{shots.length < GOOD_SHOTS ? ` Add ${GOOD_SHOTS - shots.length} more for a steadier read.` : ''}</p>}
    </div>}
    <p className="mt-3 text-xs text-muted-foreground">Photos stay on this device. Only the angles are saved.</p>
  </div>;
}
