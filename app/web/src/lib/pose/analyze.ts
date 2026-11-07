import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { getPoseLandmarker, poseTimeline } from "./landmarker";
import { tempoFromWristY, type Tempo } from "./tempo";

export type PoseFrame = { t: number; landmarks: NormalizedLandmark[] | null };

export type SwingAnalysis = {
  frames: PoseFrame[];
  fps: number;
  tempo: Tempo | null;
  /** Swing window (s) for the optional club-tracking clip: takeaway - 0.3 s .. impact + 0.5 s. */
  window: { start: number; end: number } | null;
  detectedShare: number;
  error?: string;
};

const L_WRIST = 15;
const R_WRIST = 16;
export const MAX_SECONDS = 10;
/** Slow-motion files play 4-8x longer than the swing: read twice as much media time. */
export const maxMediaSeconds = (slowMo: number) => MAX_SECONDS * (slowMo > 1 ? 2 : 1);
/** Real-time limits; outside them the read is treated as a misread (or an unflagged slow-mo file). */
export const PLAUSIBLE = { backswingS: [0.45, 2.5], downswingS: [0.12, 0.6] } as const;
export function plausibleTempo(t: { backswingS: number; downswingS: number }): boolean {
  return t.backswingS >= PLAUSIBLE.backswingS[0] && t.backswingS <= PLAUSIBLE.backswingS[1]
    && t.downswingS >= PLAUSIBLE.downswingS[0] && t.downswingS <= PLAUSIBLE.downswingS[1];
}

/** Mean wrist height per frame; gaps (no pose) filled from the previous frame. */
export function wristSeries(frames: PoseFrame[]): number[] {
  const y: number[] = [];
  let last = NaN;
  for (const f of frames) {
    if (f.landmarks) last = (f.landmarks[L_WRIST].y + f.landmarks[R_WRIST].y) / 2;
    y.push(last);
  }
  const first = y.find((v) => !Number.isNaN(v)) ?? NaN;
  return y.map((v) => (Number.isNaN(v) ? first : v));
}

/**
 * `fps` = sampling rate in media time. `slowMo` = playback slowdown of the file (iPhone slow-mo is saved
 * as a 30 fps video that plays 4-8x slower): tempo runs at fps * slowMo so it comes out in real seconds,
 * while the swing window stays in media seconds (it is used to seek the file).
 */
export function analyzeFrames(frames: PoseFrame[], fps: number, slowMo = 1): SwingAnalysis {
  const detected = frames.filter((f) => f.landmarks).length;
  const detectedShare = frames.length ? detected / frames.length : 0;
  if (detectedShare < 0.6) {
    return { frames, fps, tempo: null, window: null, detectedShare, error: "body not visible in most frames" };
  }
  try {
    const tempo = tempoFromWristY(wristSeries(frames), fps * slowMo);
    const t0 = frames[0].t;
    return {
      frames,
      fps,
      tempo,
      detectedShare,
      window: {
        start: Math.max(0, t0 + tempo.takeawayFrame / fps - 0.3 * slowMo),
        end: t0 + tempo.impactFrame / fps + 0.5 * slowMo,
      },
    };
  } catch (e) {
    return { frames, fps, tempo: null, window: null, detectedShare, error: (e as Error).message };
  }
}

export const SEEK_TIMEOUT_MS = 3000;

export function seek(video: HTMLVideoElement, t: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (err?: Error) => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      if (err) reject(err);
      else resolve();
    };
    const onSeeked = () => done();
    const onError = () => done(new Error("video could not be decoded"));
    const onAbort = () => done(new DOMException("aborted", "AbortError"));
    const timer = setTimeout(() => done(new Error("video seek timed out")), SEEK_TIMEOUT_MS);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort);
    video.currentTime = t;
  });
}

/**
 * Step through a loaded <video> at a fixed rate and run pose on each frame.
 * Seek-based so results don't depend on device speed. `sampleFps` 30 keeps phones fast; tempo error stays ~1 frame
 * (lab error model: +-1 frame + 12 ms).
 */
export async function analyzeVideo(
  video: HTMLVideoElement,
  {
    sampleFps = 30,
    slowMo = 1,
    onProgress,
    signal,
  }: { sampleFps?: number; slowMo?: number; onProgress?: (share: number) => void; signal?: AbortSignal } = {},
): Promise<SwingAnalysis> {
  const lm = await getPoseLandmarker();
  const duration = Math.min(video.duration, maxMediaSeconds(slowMo));
  const n = Math.floor(duration * sampleFps);
  const frames: PoseFrame[] = [];
  const ts = poseTimeline();
  for (let i = 0; i < n; i++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const t = i / sampleFps;
    await seek(video, t, signal);
    const res = lm.detectForVideo(video, ts(t)); // shared instance: timestamps must keep increasing
    frames.push({ t, landmarks: res.landmarks[0] ?? null });
    onProgress?.((i + 1) / n);
  }
  return analyzeFrames(frames, sampleFps, slowMo);
}
