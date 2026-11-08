import { Camera, UploadCloud, ArrowUpRight, CheckCircle2, Circle, Loader2, LockKeyhole, Crosshair, Zap } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { drawSkeleton } from '@/lib/pose/overlay';
import type { SwingAnalysis } from '@/lib/pose/analyze';
import framing from '@/assets/swing-framing-face-on.jpg';
import { swingServerEnabled } from '@/lib/swing-server';
import type { Stage, StagePlan } from '@/hooks/use-swing-upload';
import { HearItButton, hostParagraphs, useHostLine, useSpeakLine, type HostLineId } from '@/features/voice';

/** Host banner: fixed line from app/shared/host_lines.json, read aloud in the host voice when it changes. */
export function GrontMessage({ line }: { line: HostLineId }) {
  const spoken = useHostLine(line);
  useSpeakLine(spoken);
  return <div className="flex items-center gap-4 border-b border-border pb-6"><img src="/images/host-avatar.png" alt="Gront Harvot" className="h-20 w-20 shrink-0 rounded-lg border border-primary object-cover md:h-24 md:w-24" /><div><p className="text-xs uppercase tracking-widest text-primary">Gront · AI-assisted fitter</p><p className="mt-2 max-w-lg text-lg font-medium leading-snug">{hostParagraphs(line).join(' ')}</p><HearItButton line={spoken} className="mt-1 text-xs text-primary underline" /></div></div>;
}
export function SwingChecklist() {
  return <div className="space-y-5"><p className="text-xs uppercase tracking-widest text-muted-foreground">A good video starts here</p>{[['01', 'Film from the front', 'Chest towards the camera. Keep the whole shaft in frame.'], ['02', 'Show your feet & the ball', 'Stay centred. Leave room for the full swing.'], ['03', 'Use your 7-iron', 'One normal shot, not a practice swing.']].map(([n, title, detail]) => <div key={n} className="flex gap-4"><span className="font-display text-3xl italic text-primary">{n}</span><div><h2 className="font-medium">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div></div>)}<p className="flex gap-2 border-t border-border pt-4 text-sm text-muted-foreground"><Zap className="size-4 shrink-0 text-primary" />Use slow motion: 240 fps. Otherwise, 60 fps or higher. Bright daylight helps.</p></div>;
}
export function FramingExample() {
  return <figure className="relative overflow-hidden rounded-lg"><img src={framing} width={1024} height={1024} alt="Face-on view of a golfer with feet, ball and entire seven iron visible" className="aspect-square w-full object-cover" /><div className="pointer-events-none absolute inset-[10%] border border-primary"><div className="absolute inset-x-0 bottom-[12%] border-t border-primary" /><div className="absolute inset-y-0 left-1/2 border-l border-primary/60" /></div><figcaption className="absolute inset-x-0 bottom-0 bg-background/90 px-4 py-3 text-xs text-foreground">Camera 3–4 m in front · waist height · chest towards camera</figcaption></figure>;
}
export function ActionSelector({ record, upload, disabled }: { record: () => void; upload: () => void; disabled: boolean }) {
  return <div className="grid gap-3 sm:grid-cols-2">{[{ title: 'Record a swing', subtitle: 'Open camera', Icon: Camera, onClick: record }, { title: 'Upload a video', subtitle: 'Select from device library', Icon: UploadCloud, onClick: upload }].map(({ title, subtitle, Icon, onClick }) => <Button key={title} variant="outline" disabled={disabled} onClick={onClick} className="h-auto min-h-28 justify-start gap-4 rounded-lg border-border bg-card px-5 py-5 text-left hover:border-primary/40"><Icon className="text-primary" /><span className="min-w-0"><span className="block whitespace-normal font-display text-2xl font-bold uppercase italic">{title}</span><span className="mt-1 block whitespace-normal text-xs text-muted-foreground">{subtitle}</span></span><ArrowUpRight className="ml-auto" /></Button>)}</div>;
}
export function VideoHUD({ url, guides, onError, analysis }: { url: string; guides: boolean; onError: () => void; analysis?: SwingAnalysis | null }) {
  const videoRef = useRef<HTMLVideoElement>(null), canvasRef = useRef<HTMLCanvasElement>(null);
  // Pose skeleton follows playback once the swing has been read (shows what was measured).
  useEffect(() => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas || !analysis) return;
    let raf = 0;
    const draw = () => {
      // object-contain letterboxes the video: lay the canvas over the picture itself.
      const vw = video.videoWidth || 16, vh = video.videoHeight || 9, scale = Math.min(video.clientWidth / vw, video.clientHeight / vh);
      const w = Math.round(vw * scale), h = Math.round(vh * scale);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; Object.assign(canvas.style, { width: `${w}px`, height: `${h}px`, left: `${(video.clientWidth - w) / 2}px`, top: `${(video.clientHeight - h) / 2}px` }); }
      const i = Math.min(analysis.frames.length - 1, Math.round(video.currentTime * analysis.fps));
      drawSkeleton(canvas, analysis.frames[i]?.landmarks ?? null);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analysis]);
  return <div className="relative aspect-video overflow-hidden rounded-lg bg-card"><video ref={videoRef} src={url} controls playsInline muted preload="metadata" onError={onError} className="h-full w-full object-contain" />{analysis && <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute" />}{guides && !analysis && <svg viewBox="0 0 640 360" className="pointer-events-none absolute inset-0 h-full w-full pb-12" aria-hidden="true"><g stroke="currentColor" fill="none" className="text-foreground/20"><path d="M213 0v360M426 0v360M0 120h640M0 240h640" /></g><g stroke="currentColor" fill="none" className="text-primary"><rect x="170" y="25" width="300" height="290" rx="4" /><path d="M320 15v310M120 300h400" strokeDasharray="6 5" /><circle cx="395" cy="290" r="14" /><path d="M305 90a15 15 0 1 0 30 0a15 15 0 1 0 -30 0M320 105v90m0-65-35 45m35-45 35 45m-35 20-30 70m30-70 30 70" /></g></svg>}</div>;
}
const STAGE_ROWS: { stage: Stage; title: string; when?: keyof StagePlan }[] = [
  { stage: 'face_on', title: 'Reading body pose on this device (face-on)' },
  { stage: 'dtl_pose', title: 'Reading body pose, down-the-line view', when: 'dtl' },
  { stage: 'club_head', title: 'Finding the club head at address', when: 'dtl' },
  { stage: 'server', title: 'Server: swing phases, timing, hand travel and speed from keypoints', when: 'server' },
  { stage: 'done', title: 'Saving timing and speed for your fit' },
];
export function ProcessingStatus({ phase, progress, stage = 'face_on', plan = { dtl: false, server: false } }: { phase: string; progress: number; stage?: Stage; plan?: StagePlan }) {
  const done = phase === 'saved';
  const shown = STAGE_ROWS.filter(r => !r.when || plan[r.when]);
  const at = done ? shown.length : Math.max(0, shown.findIndex(r => r.stage === stage));
  const rows = shown.map((r, i) => ({ title: r.title, done: i < at || done, active: !done && i === at && phase === 'analyzing' }));
  return <ol className="divide-y divide-border">{rows.map((row, i) => <li key={row.title} className="flex items-center gap-3 py-4 text-sm">{row.done ? <CheckCircle2 className="size-5 text-primary" /> : row.active ? <Loader2 className="size-5 animate-spin text-primary motion-reduce:animate-none" /> : <Circle className="size-5 text-muted-foreground" />}<span className={row.active || row.done ? 'text-foreground' : 'text-muted-foreground'}>{row.title}</span>{i === 0 && <span className="ml-auto tabular-nums text-primary">{done ? '100%' : `${progress}%`}</span>}</li>)}</ol>;
}
export function PrivacyNotice() { return <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3" />{swingServerEnabled() ? 'Your video stays on this device. Only body keypoint positions (numbers, no images) are sent to read timing and speed.' : 'Your video stays on this device. Only timing numbers are used.'}</p>; }
export function GuideToggle({ enabled, onClick }: { enabled: boolean; onClick: () => void }) { return <Button size="sm" variant="outline" onClick={onClick} aria-pressed={enabled}><Crosshair />{enabled ? 'Hide guides' : 'Show guides'}</Button>; }
