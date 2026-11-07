import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { getPoseLandmarker } from "./landmarker";
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

export function analyzeFrames(frames: PoseFrame[], fps: number): SwingAnalysis {
  const detected = frames.filter((f) => f.landmarks).length;
  const detectedShare = frames.length ? detected / frames.length : 0;
  if (detectedShare < 0.6) {
    return { frames, fps, tempo: null, window: null, detectedShare, error: "body not visible in most frames" };
  }
  try {
    const tempo = tempoFromWristY(wristSeries(frames), fps);
    const t0 = frames[0].t;
    return {
      frames,
      fps,
      tempo,
      detectedShare,
      window: {
        start: Math.max(0, t0 + tempo.takeawayFrame / fps - 0.3),
        end: t0 + tempo.impactFrame / fps + 0.5,
      },
    };
  } catch (e) {
    return { frames, fps, tempo: null, window: null, detectedShare, error: (e as Error).message };
  }
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    video.addEventListener("seeked", () => resolve(), { once: true });
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
  { sampleFps = 30, onProgress }: { sampleFps?: number; onProgress?: (share: number) => void } = {},
): Promise<SwingAnalysis> {
  const lm = await getPoseLandmarker();
  const duration = Math.min(video.duration, MAX_SECONDS);
  const n = Math.floor(duration * sampleFps);
  const frames: PoseFrame[] = [];
  let lastTs = -1;
  for (let i = 0; i < n; i++) {
    const t = i / sampleFps;
    await seek(video, t);
    const ts = Math.max(lastTs + 1, Math.round(t * 1000)); // timestamps must increase
    lastTs = ts;
    const res = lm.detectForVideo(video, ts);
    frames.push({ t, landmarks: res.landmarks[0] ?? null });
    onProgress?.((i + 1) / n);
  }
  return analyzeFrames(frames, sampleFps);
}
