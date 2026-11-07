import { createFileRoute, Link } from "@tanstack/react-router";
import { useFitting } from "@/hooks/use-fitting";
import { useState, useRef } from 'react';
import { ArrowLeft, ArrowRight, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSwingUpload } from '@/hooks/use-swing-upload';
import { ActionSelector, FramingExample, GrantMessage, SwingChecklist, VideoHUD, ProcessingStatus, PrivacyNotice, GuideToggle } from '@/components/swing/SwingPanels';
import { SwingCamera } from '@/components/swing/SwingCamera';

export const Route = createFileRoute("/swing")({
  head: () => ({
    meta: [
      { title: "Film Your Swing | Takomo Find My Fit" },
      { name: "description", content: "Send Grant a short swing video so he can check your speed, tempo and ball flight." },
      { property: "og:title", content: "Film Your Swing | Takomo Find My Fit" },
      { property: "og:description", content: "Send Grant a short swing video so he can check your speed, tempo and ball flight." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Swing,
});

function Swing() {
  const { snapshot, loading, error } = useFitting();
  const flow = useSwingUpload(snapshot?.confirmed === true);
  const picker = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false), [guides, setGuides] = useState(true);
  const processing = ['uploading', 'checking', 'saved'].includes(flow.phase);
  return (
    <main className="swing-theme min-h-screen bg-background font-sans text-foreground">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-6 py-4">
        <span className="font-display text-2xl font-bold italic tracking-wide">TAKOMO</span>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Find my fit · <span className="text-primary">Step 2 / 4</span></span>
      </header>
      <section className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-10">
        <GrantMessage message={flow.phase === 'saved' ? 'Your video is saved privately. Accurate numbers need verified timing and calibration—not guesswork.' : processing ? 'I’m keeping your video safe. Speed helps choose shaft flex; your score and goals guide forgiveness.' : "One normal swing. Let’s see what your clubs are working with."} />
        <div className="mb-8 mt-7 flex flex-wrap items-end justify-between gap-4"><h1 className="font-display text-5xl font-bold uppercase italic leading-none md:text-6xl">{flow.phase === 'preview' ? <>Check your <span className="text-primary">swing.</span></> : flow.phase === 'saved' ? <>Video <span className="text-primary">received.</span></> : processing ? <>Sending your <span className="text-primary">swing.</span></> : <>Let’s see your <span className="text-primary">swing.</span></>}</h1><span className="text-xs uppercase tracking-widest text-muted-foreground">{flow.phase === 'selection' ? '01 / Select' : flow.phase === 'preview' ? '02 / Review' : '03 / Process'}</span></div>
        {loading ? <p className="flex gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading your fitting…</p> : error ? <p role="alert">Could not load your profile. Refresh to try again.</p> : <>
          {!snapshot?.confirmed && <p className="mb-6 border-l-2 border-primary pl-4 text-sm text-muted-foreground">Finish your profile with Grant before sending a video. You can review the filming tips below.</p>}
          {flow.phase === 'selection' && <><div className="grid items-center gap-8 md:grid-cols-[1fr_0.8fr]"><SwingChecklist /><FramingExample /></div><div data-scroll-reveal className="mt-8"><ActionSelector record={() => setCamera(true)} upload={() => picker.current?.click()} disabled={flow.busy || !snapshot?.confirmed} /></div><p className="mt-3 text-center text-xs text-muted-foreground">MP4, MOV or WebM · up to 50 MB · up to 10 minutes</p></>}
          {camera && <div className="mt-6"><SwingCamera onClose={() => setCamera(false)} onVideo={file => { setCamera(false); void flow.select(file); }} /><Button className="mt-3" variant="link" onClick={() => picker.current?.click()}>Use a slow-motion original instead <ArrowRight /></Button></div>}
          {flow.url && flow.phase !== 'selection' && <><div className={processing ? 'grid gap-6 md:grid-cols-2' : ''}><div className={flow.phase === 'saved' ? 'order-2 min-w-0' : 'min-w-0'}><div className="mb-3 flex items-center justify-between"><p className="text-xs uppercase tracking-widest text-muted-foreground">Your swing</p><GuideToggle enabled={guides} onClick={() => setGuides(!guides)} /></div><VideoHUD url={flow.url} guides={guides} onError={flow.failPlayback} /><p className="mt-3 break-all text-xs text-muted-foreground">{flow.name} · {(flow.size / 1024 / 1024).toFixed(1)} MB{flow.timing?.encodedFps ? ` · ${flow.timing.encodedFps.toFixed(1)} encoded fps` : ''}</p><p className="mt-2 text-xs text-primary">Capture frame rate unverified</p></div>{processing && <div className={`flex min-w-0 flex-col justify-center rounded-lg border border-border bg-card p-6 ${flow.phase === 'saved' ? 'order-1' : ''}`}><img src="/images/grant.jpg" alt="Grant Horvat" className="mb-5 aspect-video w-full rounded-lg object-cover object-top" /><p className="text-xs uppercase tracking-widest text-primary">Grant · AI-assisted fitting</p><p className="mt-3 text-sm text-muted-foreground">{flow.phase === 'saved' ? 'Tempo can inform shaft feel. Speed needs verified frame timing and scale; a single face-on video cannot guarantee an exact attack angle.' : 'Your normal swing gives us context. We’ll only use measurements that can be supported by the video.'}</p></div>}</div>
          {flow.phase === 'preview' && <div data-scroll-reveal className="mt-7 space-y-4"><p className="text-sm text-muted-foreground">Face-on · chest towards camera · feet and ball visible · full shaft in frame · 7-iron used</p><Button disabled={flow.busy} onClick={() => void flow.submit()} className="h-12 w-full font-display text-xl font-bold uppercase italic">{flow.busy ? 'Please wait…' : 'Use this video'}<ArrowRight /></Button><Button variant="ghost" disabled={flow.busy} className="w-full" onClick={() => void flow.discard()}>Choose another video</Button><PrivacyNotice /></div>}
          {processing && <div data-scroll-reveal className="mt-7"><ProcessingStatus phase={flow.phase} progress={flow.progress} />{flow.phase === 'saved' ? <div className="mt-4 border-l-2 border-primary bg-card p-5"><h2 className="font-medium">Saved privately. Swing review is not available yet.</h2><p className="mt-2 text-sm text-muted-foreground">Video analysis must be connected and validated before we can check quality, calibrate scale or estimate speed. Your profile and video are saved; no measurements have been produced.</p><Button variant="outline" className="mt-4" disabled={flow.busy} onClick={() => void flow.discard()}><Trash2 />Delete video & choose another</Button></div> : flow.phase === 'uploading' ? <Button variant="outline" onClick={flow.cancel}>Stop upload</Button> : null}</div>}</>}
        </>}
        {flow.error && <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 p-4"><AlertCircle className="size-5 text-destructive" /><p className="min-w-0 flex-1 text-sm">{flow.error}</p><Button variant="outline" disabled={flow.busy} onClick={() => flow.file ? void flow.submit() : void flow.restore()}>Try again</Button><Button variant="ghost" disabled={flow.busy} onClick={() => picker.current?.click()}>Choose another</Button></div>}
        <input ref={picker} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" aria-label="Choose swing video" onChange={e => { const file = e.target.files?.[0]; if (file) void flow.select(file); e.target.value = ''; }} />
        {snapshot?.confirmed && <Button asChild disabled={flow.busy || processing && flow.phase !== 'saved'} className="mt-8 h-12 w-full font-display text-xl font-bold uppercase italic"><Link to="/enrichment">Continue to optional data <ArrowRight /></Link></Button>}
        <Button asChild variant="link" className="mt-8 px-0 text-muted-foreground" disabled={flow.busy}><Link to="/"><ArrowLeft />Back to Chat</Link></Button>
      </section>
    </main>
  );
}
