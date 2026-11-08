import { createFileRoute, Link } from "@tanstack/react-router";
import { useFitting } from "@/hooks/use-fitting";
import { useState, useRef } from 'react';
import { ArrowLeft, ArrowRight, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSwingUpload } from '@/hooks/use-swing-upload';
import { ActionSelector, FramingExample, GrontMessage, SwingChecklist, VideoHUD, ProcessingStatus, PrivacyNotice, GuideToggle } from '@/components/swing/SwingPanels';
import { SwingCamera } from '@/components/swing/SwingCamera';
import { VoiceToggle } from '@/features/voice';
import { readingSource, swingServerEnabled } from '@/lib/swing-server';

export const Route = createFileRoute("/swing")({
  head: () => ({
    meta: [
      { title: "Film Your Swing | Takomo Find My Fit" },
      { name: "description", content: "Show Gront one swing so he can time your tempo. The video stays on your device." },
    ],
  }),
  component: Swing,
});

function Swing() {
  const { snapshot, loading, error } = useFitting();
  const flow = useSwingUpload(snapshot?.confirmed === true);
  const picker = useRef<HTMLInputElement>(null), dtlPicker = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false), [guides, setGuides] = useState(true);
  const analyzing = flow.phase === 'analyzing', saved = flow.phase === 'saved';
  const tempo = flow.record?.tempo, rec = flow.record;
  const src = rec ? readingSource(rec) : null;
  return (
    <main className="swing-theme min-h-screen bg-background font-sans text-foreground">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-6 py-4">
        <span className="font-display text-2xl font-bold italic tracking-wide">TAKOMO</span>
        <span className="flex items-center gap-4 text-xs uppercase tracking-widest text-muted-foreground"><VoiceToggle /><span>Find my fit · <span className="text-primary">Step 2 / 4</span></span></span>
      </header>
      <section className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-10">
        <GrontMessage line={saved ? (tempo ? 'swing_tempo' : 'swing_no_tempo') : analyzing ? 'swing_reading' : 'swing_intro'} />
        <div className="mb-8 mt-7 flex flex-wrap items-end justify-between gap-4"><h1 className="font-display text-5xl font-bold uppercase italic leading-none md:text-6xl">{flow.phase === 'preview' ? <>Check your <span className="text-primary">swing.</span></> : saved ? <>Swing <span className="text-primary">read.</span></> : analyzing ? <>Reading your <span className="text-primary">swing.</span></> : <>Let’s see your <span className="text-primary">swing.</span></>}</h1><span className="text-xs uppercase tracking-widest text-muted-foreground">{flow.phase === 'selection' ? '01 / Select' : flow.phase === 'preview' ? '02 / Review' : '03 / Read'}</span></div>
        {loading ? <p className="flex gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading your fitting…</p> : error ? <p role="alert">Could not load your profile. Refresh to try again.</p> : <>
          {!snapshot?.confirmed && <p className="mb-6 border-l-2 border-primary pl-4 text-sm text-muted-foreground">Finish your profile with Gront before sending a video. You can review the filming tips below.</p>}
          {flow.phase === 'selection' && <><div className="grid items-center gap-8 md:grid-cols-[1fr_0.8fr]"><SwingChecklist /><FramingExample /></div><div data-scroll-reveal className="mt-8"><ActionSelector record={() => setCamera(true)} upload={() => picker.current?.click()} disabled={flow.busy || !snapshot?.confirmed} /></div><p className="mt-3 text-center text-xs text-muted-foreground">MP4, MOV or WebM · up to 50 MB · first 10 seconds are read (20 for slow motion)</p><div className="mt-3"><PrivacyNotice /></div></>}
          {camera && <div className="mt-6"><SwingCamera onClose={() => setCamera(false)} onVideo={file => { setCamera(false); void flow.select(file); }} /><Button className="mt-3" variant="link" onClick={() => picker.current?.click()}>Upload a video instead <ArrowRight /></Button></div>}
          {flow.url && flow.phase !== 'selection' && <div className="min-w-0"><div className="mb-3 flex items-center justify-between"><p className="text-xs uppercase tracking-widest text-muted-foreground">Your swing</p>{!flow.analysis && <GuideToggle enabled={guides} onClick={() => setGuides(!guides)} />}</div><VideoHUD url={flow.url} guides={guides} onError={flow.failPlayback} analysis={flow.analysis} /><p className="mt-3 break-all text-xs text-muted-foreground">{flow.name} · {(flow.size / 1024 / 1024).toFixed(1)} MB{flow.timing?.encodedFps ? ` · ${flow.timing.encodedFps.toFixed(1)} encoded fps` : ''}</p></div>}
          {flow.phase === 'preview' && <div data-scroll-reveal className="mt-7 space-y-4"><p className="text-sm text-muted-foreground">Face-on · chest towards camera · whole body and ball visible · 7-iron used</p><fieldset><legend className="text-xs uppercase tracking-widest text-muted-foreground">Video speed</legend><div className="mt-2 flex flex-wrap gap-2">{([[1, 'Normal'], [4, 'Slow-mo 4× (120 fps)'], [8, 'Slow-mo 8× (240 fps)']] as const).map(([v, label]) => <Button key={v} type="button" variant={flow.slowMo === v ? 'default' : 'outline'} aria-pressed={flow.slowMo === v} disabled={flow.busy} onClick={() => flow.setSlowMo(v)}>{label}</Button>)}</div><p className="mt-2 text-xs text-muted-foreground">Slow-motion clips play slower than your real swing. Pick the speed so tempo is timed in real seconds.</p></fieldset>{swingServerEnabled() && <fieldset className="border border-border p-4"><legend className="px-1 text-xs uppercase tracking-widest text-muted-foreground">Optional · down-the-line view</legend><p className="text-xs text-muted-foreground">Camera behind you on the target line, club and ball in view, same video speed (slow motion only). Lets us measure hands to club head for the speed estimate. Stays on this device too.</p>{flow.dtlFile ? <div className="mt-3 flex flex-wrap items-center gap-3"><p className="min-w-0 flex-1 break-all text-sm">{flow.dtlFile.name}</p><Button type="button" variant="ghost" disabled={flow.busy} onClick={flow.clearDtl}>Remove</Button></div> : <Button type="button" variant="outline" className="mt-3" disabled={flow.busy} onClick={() => dtlPicker.current?.click()}>Add down-the-line video</Button>}</fieldset>}<Button disabled={flow.busy} onClick={() => void flow.submit()} className="h-12 w-full font-display text-xl font-bold uppercase italic">{flow.busy ? 'Please wait…' : 'Use this video'}<ArrowRight /></Button><Button variant="ghost" disabled={flow.busy} className="w-full" onClick={() => void flow.discard()}>Choose another video</Button><PrivacyNotice /></div>}
          {(analyzing || saved) && <div data-scroll-reveal className="mt-7" role="status"><ProcessingStatus phase={flow.phase} progress={flow.progress} />{analyzing && <Button variant="outline" onClick={flow.cancel}>Stop</Button>}
            {saved && tempo && <dl className="mt-4 grid grid-cols-3 border border-border bg-card p-4 text-center" data-testid="tempo"><div><dt className="text-xs uppercase text-muted-foreground">Backswing</dt><dd className="font-display text-2xl italic">{tempo.backswingS.toFixed(2)} s</dd></div><div><dt className="text-xs uppercase text-muted-foreground">Downswing</dt><dd className="font-display text-2xl italic">{tempo.downswingS.toFixed(2)} s</dd></div><div><dt className="text-xs uppercase text-muted-foreground">Tempo</dt><dd className="font-display text-2xl italic">{tempo.ratio ? `${tempo.ratio.toFixed(1)}:1` : '–'}</dd></div></dl>}
            {saved && rec?.speed && <dl className="mt-3 grid grid-cols-2 border border-border bg-card p-4 text-center" data-testid="video-speed"><div><dt className="text-xs uppercase text-muted-foreground">Club speed (estimate)</dt><dd className="font-display text-2xl italic">{Math.round(rec.speed.value)} mph <span className="text-sm not-italic text-muted-foreground">± {Math.round(rec.speed.sd)}</span></dd></div><div><dt className="text-xs uppercase text-muted-foreground">Hands to club head</dt><dd className="font-display text-2xl italic">{rec.shaftM ? `${(rec.shaftM * 39.37).toFixed(1)} in` : '–'}</dd><dd className="text-xs text-muted-foreground">{rec.shaftM ? 'at address, from the down-the-line view' : 'typical 7-iron assumed'}</dd></div></dl>}
            {saved && <div className="mt-4 border-l-2 border-primary bg-card p-5" data-testid="reading-source">{src && <p className="text-sm font-medium">{src.title}</p>}{src && src.detail.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{src.detail.map(d => <li key={d}>{d}</li>)}</ul>}<p className="mt-2 text-sm text-muted-foreground">{rec?.source === 'server' ? 'Timing ±1 frame. The speed estimate is wide on purpose: your answers, carry or a launch monitor count more.' : 'Measured from body pose on this device (±1 frame). Speed then comes from your carry or a launch monitor.'}</p><Button variant="outline" className="mt-4" disabled={flow.busy} onClick={() => void flow.discard()}><Trash2 />Delete result & try another swing</Button></div>}
          </div>}
        </>}
        {flow.error && <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 p-4"><AlertCircle className="size-5 text-destructive" /><p className="min-w-0 flex-1 text-sm">{flow.error}</p>{flow.file && flow.phase === 'preview' && <Button variant="outline" disabled={flow.busy} onClick={() => void flow.submit()}>Try again</Button>}<Button variant="ghost" disabled={flow.busy} onClick={() => picker.current?.click()}>Choose another</Button></div>}
        <input ref={dtlPicker} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" aria-label="Choose down-the-line video" onChange={e => { const f = e.target.files?.[0]; if (f) void flow.selectDtl(f); e.target.value = ''; }} />
        <input ref={picker} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" aria-label="Choose swing video" onChange={e => { const file = e.target.files?.[0]; if (file) void flow.select(file); e.target.value = ''; }} />
        {snapshot?.confirmed && <Button asChild disabled={flow.busy} className="mt-8 h-12 w-full font-display text-xl font-bold uppercase italic"><Link to="/enrichment">{saved ? 'Continue to optional data' : 'Skip the video for now'} <ArrowRight /></Link></Button>}
        <Button asChild variant="link" className="mt-8 px-0 text-muted-foreground" disabled={flow.busy}><Link to="/"><ArrowLeft />Back to Chat</Link></Button>
      </section>
    </main>
  );
}
