import { useCallback, useEffect, useRef, useState } from 'react';
import { getFittingToken } from '@/lib/fitting-session';
import { inspectVideo } from '@/lib/video-metadata';
import { analyzeVideo, PLAUSIBLE, plausibleTempo, type SwingAnalysis } from '@/lib/pose/analyze';
import { getPoseLandmarker } from '@/lib/pose/landmarker';
import { deleteSwing, readSwing, saveSwing, swingRecordSchema, type SwingRecord } from '@/lib/swing-store';
import { analyzeSwingOnServer, swingPayload, swingServerEnabled, type SwingBody, type SwingServerResult } from '@/lib/swing-server';
import { clubHeadsAtAddress } from '@/lib/swing-dtl';
import { lengthCm } from '@/lib/fit-request';
import { fittingSchema } from '@/lib/fitting-schema';
import { readLocal } from '@/lib/local-store';

// Lab error model for video tempo: +-1 frame plus 12 ms (same as the legacy swing step).
const TEMPO_EXTRA_SD_S = 0.012;

type Timing = Awaited<ReturnType<typeof inspectVideo>>;
type Candidate = { backswingS: number; downswingS: number; ratio: number | null; sd: number };

/** Golfer height from the profile (scales hand travel for the speed estimate); null when not answered. */
function profileHeightCm(): number | null {
  try {
    const snap = fittingSchema.safeParse(readLocal<unknown>('fitting', getFittingToken()));
    const h = snap.success ? lengthCm(snap.data.profile.height?.value) : null;
    return h !== null && h >= 120 && h <= 230 ? h : null;
  } catch { return null; }
}

function serverCandidate(r: SwingServerResult | null): Candidate | null {
  if (!r?.backswing_s || !r.downswing_s) return null;
  const back = r.backswing_s.value, down = r.downswing_s.value;
  return { backswingS: back, downswingS: down, ratio: Math.round((back / down) * 100) / 100, sd: Math.max(r.backswing_s.sd, r.downswing_s.sd) };
}

const DTL_LOAD_TIMEOUT_MS = 8000;

/** iOS may never fire loadeddata for a second video element: give up after `ms` or on Stop. */
function withTimeout<T>(p: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('down-the-line video did not load')), ms);
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); };
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(v => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); resolve(v); },
      e => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(e); });
  });
}

function loadVideo(src: string): { video: HTMLVideoElement; loaded: Promise<void> } {
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = src;
  const loaded = new Promise<void>((resolve, reject) => {
    video.addEventListener('loadeddata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('Your browser cannot decode this video. Export an MP4 original and try again.')), { once: true });
  });
  video.load();
  video.play().then(() => video.pause()).catch(() => undefined);
  return { video, loaded };
}

const usable = (c: Candidate | null): c is Candidate => !!c && plausibleTempo(c) && swingRecordSchema.shape.tempo.safeParse(c).success;
export type Phase = 'selection' | 'preview' | 'analyzing' | 'saved';

/**
 * Swing video flow. The video is read on this device with MediaPipe pose (WASM, self-hosted); the video is never
 * uploaded. Pose keypoints (numbers only) go to the API, which runs main's swing algorithm and returns tempo +
 * an estimated club speed. If the API is off, unreachable or can't read the swing, the on-device tempo is used.
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
  /** Optional second clip, down-the-line, for the golfer's shaft length (speed). Never uploaded either. */
  const [dtlFile, setDtlFile] = useState<File | null>(null);
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
      setFile(next); setDtlFile(null); setUrl(localUrl.current); setTiming(details); setName(next.name); setSize(next.size); setAnalysis(null); setPhase('preview');
    } catch { setError('This video could not be read. Choose an MP4, MOV or WebM under 50 MB and 10 minutes.'); }
    finally { setBusy(false); }
  }
  async function selectDtl(next: File) {
    setError('');
    try { await inspectVideo(next); setDtlFile(next); }
    catch { setError('This down-the-line video could not be read. Choose an MP4, MOV or WebM under 50 MB.'); }
  }
  /** Call from the click handler: iOS Safari only loads an unplayed video inside a user gesture. */
  async function submit() {
    if (!file || !localUrl.current) return;
    const { video, loaded } = loadVideo(localUrl.current);
    // the down-the-line clip starts loading inside the same tap (iOS), read after the face-on clip
    // speed (and so club length) needs a slow-motion clip: at normal speed the second clip isn't read at all
    const wantDtl = !!dtlFile && swingServerEnabled();
    const dtlUrl = wantDtl && slowMo > 1 ? URL.createObjectURL(dtlFile) : null;
    const dtl = dtlUrl ? loadVideo(dtlUrl) : null;
    dtl?.loaded.catch(() => undefined);
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    setBusy(true); setError(''); setProgress(0); setPhase('analyzing');
    try {
      await loaded;
      const share = dtl ? 0.6 : 1;
      const result = await analyzeVideo(video, { slowMo, onProgress: p => setProgress(Math.round(p * share * 100)), signal: c.signal });
      if (c.signal.aborted) return;
      setAnalysis(result);
      const t = result.tempo;
      const device: Candidate | null = t ? { backswingS: t.backswingS, downswingS: t.downswingS, ratio: t.ratio, sd: t.frameUncertaintyS + TEMPO_EXTRA_SD_S } : null;
      let server: SwingServerResult | null = null;
      let fallback: SwingRecord['fallback'] = swingServerEnabled() ? undefined : 'off';
      const extraNotes: string[] = [];
      let dtlRead = false;
      if (swingServerEnabled() && result.detectedShare >= 0.6) {
        const heightCm = profileHeightCm();
        const body: SwingBody = swingPayload(result.frames, { sampleFps: result.fps, slowMo, width: video.videoWidth, height: video.videoHeight, heightCm });
        if (wantDtl && !dtl) extraNotes.push('dtl_needs_slow_motion');
        if (dtl) {
          // Optional view: pose + club head at address on this device; a failure here only drops the shaft length.
          try {
            await withTimeout(dtl.loaded, DTL_LOAD_TIMEOUT_MS, c.signal);
            const d = await analyzeVideo(dtl.video, { slowMo, onProgress: p => setProgress(Math.round((0.6 + p * 0.3) * 100)), signal: c.signal });
            if (d.detectedShare < 0.6) extraNotes.push('dtl_body_not_visible');
            else {
              const heads = await clubHeadsAtAddress(dtl.video, d.frames, d.tempo?.takeawayFrame ?? null, c.signal);
              body.dtl = { pose: swingPayload(d.frames, { sampleFps: d.fps, slowMo, width: dtl.video.videoWidth, height: dtl.video.videoHeight }).pose, club_head: { x: heads.x, y: heads.y } };
              dtlRead = true;
            }
          } catch (e) {
            if (c.signal.aborted) throw e; // Stop: the outer handler returns to the preview
            console.warn('down-the-line clip not read', e);
            extraNotes.push('dtl_unreadable');
          }
          setProgress(95);
        }
        try {
          try {
            server = await analyzeSwingOnServer(body, c.signal);
          } catch (e) {
            // a rejected down-the-line part must not cost the face-on read: retry once without it
            if (c.signal.aborted || !body.dtl) throw e;
            delete body.dtl; dtlRead = false; extraNotes.push('dtl_rejected');
            server = await analyzeSwingOnServer(body, c.signal);
          }
        } catch (e) {
          if (c.signal.aborted) throw e;
          fallback = 'unreachable';
          console.warn('swing API unavailable, using on-device timing', e); // fallback, not an error for the golfer
        }
      }
      if (c.signal.aborted) return;
      // Server (main's algorithm) first; the on-device read is the fallback.
      const fromServer = serverCandidate(server);
      const useServer = usable(fromServer);
      if (server && !useServer) fallback = 'no_read';
      const candidate = useServer ? fromServer : device;
      // Pose can misread a swing (e.g. impact 1 frame after top): implausible timing is dropped, not saved.
      const plausible = usable(candidate);
      const speed = useServer && server?.video_speed_7i_mph ? { value: Math.round(server.video_speed_7i_mph.value * 10) / 10, sd: server.video_speed_7i_mph.sd } : null;
      // Too slow for a real swing at normal speed: most likely a slow-motion file read as normal speed (POR-30).
      const looksSlowMo = !!candidate && slowMo === 1 && (candidate.backswingS > PLAUSIBLE.backswingS[1] || candidate.downswingS > PLAUSIBLE.downswingS[1]);
      if (looksSlowMo) {
        // Stay on the preview with the file kept, so the speed picker and "Try again" are right there.
        setPhase('preview');
        setError('This swing looks like slow motion. Pick its speed under “Video speed” and tap Try again, or continue: we’ll use your answers.');
        return;
      }
      const saved: SwingRecord = {
        filename: file.name, size: file.size, encodedFps: timing?.encodedFps ?? null, slowMo, analyzedAt: new Date().toISOString(),
        tempo: plausible ? candidate : null,
        speed: plausible ? speed : null,
        source: plausible ? (useServer ? 'server' : 'device') : undefined,
        ...(useServer && server ? { algorithm: server.algorithm.slice(0, 40) } : {}),
        shaftM: useServer && server?.shaft_length_m ? Math.round(server.shaft_length_m.value * 100) / 100 : null,
        dtl: dtlRead,
        notes: [...(server?.notes ?? []), ...extraNotes].slice(0, 12),
        ...(fallback ? { fallback } : {}),
      };
      saveSwing(getFittingToken(), saved);
      setRecord(saved); setProgress(100); setPhase('saved');
      if (!saved.tempo) setError(`Couldn’t read your swing timing${result.error ? ` (${result.error})` : candidate ? ' (timing looked off)' : ''}. Try again with your whole body in frame, or continue: we’ll use your answers.`);
    } catch (e) {
      if (c.signal.aborted || (e as Error).name === 'AbortError') { setPhase('preview'); return; }
      setError(e instanceof Error && !e.message.startsWith('[') ? e.message : 'Could not read your video. Try again.'); setPhase('preview');
    } finally {
      setBusy(false); video.removeAttribute('src'); video.load();
      if (dtl) { dtl.video.removeAttribute('src'); dtl.video.load(); }
      if (dtlUrl) URL.revokeObjectURL(dtlUrl);
    }
  }
  async function discard() {
    ctrl.current?.abort();
    try { deleteSwing(getFittingToken()); } catch { /* nothing saved */ }
    if (localUrl.current) { URL.revokeObjectURL(localUrl.current); localUrl.current = null; }
    setUrl(null); setFile(null); setDtlFile(null); setTiming(null); setRecord(null); setAnalysis(null); setError(''); setPhase('selection');
  }
  return { phase, file, url, timing, name, size, progress, error, busy, record, analysis, slowMo, setSlowMo, dtlFile, selectDtl, clearDtl: () => setDtlFile(null), select, submit, discard, restore, cancel: () => ctrl.current?.abort(), failPlayback: () => setError('Your browser cannot play this video. Choose another video or export an MP4 original.') };
}
