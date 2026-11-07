import { useCallback, useEffect, useRef, useState } from 'react';
import { getFittingToken } from '@/lib/fitting-session';
import { inspectVideo } from '@/lib/video-metadata';
import { analyzeVideo, PLAUSIBLE, plausibleTempo, type SwingAnalysis } from '@/lib/pose/analyze';
import { getPoseLandmarker } from '@/lib/pose/landmarker';
import { deleteSwing, readSwing, saveSwing, swingRecordSchema, type SwingRecord } from '@/lib/swing-store';

// Lab error model for video tempo: +-1 frame plus 12 ms (same as the legacy swing step).
const TEMPO_EXTRA_SD_S = 0.012;

type Timing = Awaited<ReturnType<typeof inspectVideo>>;
export type Phase = 'selection' | 'preview' | 'analyzing' | 'saved';

/**
 * Swing video flow. Replaces Lovable's private cloud upload: the video is read on this device with
 * MediaPipe pose (WASM, self-hosted) and only the timing numbers are kept. Nothing is uploaded.
 */
export function useSwingUpload(enabled: boolean) {
  const [phase, setPhase] = useState<Phase>('selection');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [name, setName] = useState('');
  const [size, setSize] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<SwingRecord | null>(null);
  const [analysis, setAnalysis] = useState<SwingAnalysis | null>(null);
  const [slowMo, setSlowMo] = useState(1);
  const localUrl = useRef<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const restore = useCallback(async () => {
    setError('');
    try {
      const saved = readSwing(getFittingToken());
      if (saved) { setRecord(saved); setName(saved.filename); setSize(saved.size); setPhase('saved'); }
    } catch { setError('Could not load your swing result. Try again.'); }
  }, []);
  useEffect(() => { if (enabled) void restore(); }, [enabled, restore]);
  useEffect(() => {
    if (enabled) getPoseLandmarker().catch(() => undefined); // warm up the model while the golfer reads
  }, [enabled]);
  useEffect(() => () => { ctrl.current?.abort(); if (localUrl.current) URL.revokeObjectURL(localUrl.current); }, []);
  async function select(next: File) {
    setBusy(true); setError('');
    try {
      const details = await inspectVideo(next);
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
      localUrl.current = URL.createObjectURL(next);
      setFile(next); setUrl(localUrl.current); setTiming(details); setName(next.name); setSize(next.size); setAnalysis(null); setPhase('preview');
    } catch { setError('This video could not be read. Choose an MP4, MOV or WebM under 50 MB and 10 minutes.'); }
    finally { setBusy(false); }
  }
  /** Call from the click handler: iOS Safari only loads an unplayed video inside a user gesture. */
  async function submit() {
    if (!file || !localUrl.current) return;
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = localUrl.current;
    const loaded = new Promise<void>((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('Your browser cannot decode this video. Export an MP4 original and try again.')), { once: true });
    });
    video.load();
    video.play().then(() => video.pause()).catch(() => undefined);
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    setBusy(true); setError(''); setProgress(0); setPhase('analyzing');
    try {
      await loaded;
      const result = await analyzeVideo(video, { slowMo, onProgress: share => setProgress(Math.round(share * 100)), signal: c.signal });
      if (c.signal.aborted) return;
      setAnalysis(result);
      const t = result.tempo;
      const candidate = t ? { backswingS: t.backswingS, downswingS: t.downswingS, ratio: t.ratio, sd: t.frameUncertaintyS + TEMPO_EXTRA_SD_S } : null;
      // Pose can misread a swing (e.g. impact 1 frame after top): implausible timing is dropped, not saved.
      const plausible = !!candidate && plausibleTempo(candidate) && swingRecordSchema.shape.tempo.safeParse(candidate).success;
      // Too slow for a real swing at normal speed: most likely a slow-motion file read as normal speed (POR-30).
      const looksSlowMo = !!candidate && slowMo === 1 && (candidate.backswingS > PLAUSIBLE.backswingS[1] || candidate.downswingS > PLAUSIBLE.downswingS[1]);
      const saved: SwingRecord = {
        filename: file.name, size: file.size, encodedFps: timing?.encodedFps ?? null, slowMo, analyzedAt: new Date().toISOString(),
        tempo: plausible ? candidate : null,
      };
      saveSwing(getFittingToken(), saved);
      setRecord(saved); setProgress(100); setPhase('saved');
      if (!saved.tempo) setError(looksSlowMo
        ? 'This swing looks like slow motion. Pick the slow-motion speed above and read it again, or continue: we’ll use your answers.'
        : `Couldn’t read your swing timing${result.error ? ` (${result.error})` : candidate ? ' (timing looked off)' : ''}. Try again with your whole body in frame, or continue: we’ll use your answers.`);
    } catch (e) {
      if (c.signal.aborted || (e as Error).name === 'AbortError') { setPhase('preview'); return; }
      setError(e instanceof Error && !e.message.startsWith('[') ? e.message : 'Could not read your video. Try again.'); setPhase('preview');
    } finally { setBusy(false); video.removeAttribute('src'); video.load(); }
  }
  async function discard() {
    ctrl.current?.abort();
    try { deleteSwing(getFittingToken()); } catch { /* nothing saved */ }
    if (localUrl.current) { URL.revokeObjectURL(localUrl.current); localUrl.current = null; }
    setUrl(null); setFile(null); setTiming(null); setRecord(null); setAnalysis(null); setError(''); setPhase('selection');
  }
  return { phase, file, url, timing, name, size, progress, error, busy, record, analysis, slowMo, setSlowMo, select, submit, discard, restore, cancel: () => ctrl.current?.abort(), failPlayback: () => setError('Your browser cannot play this video. Choose another video or export an MP4 original.') };
}
