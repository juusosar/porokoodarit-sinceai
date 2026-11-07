import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import type { NormalizedLandmark, PoseLandmarker } from "@mediapipe/tasks-vision";
import { poseTimeline } from "@/lib/pose/landmarker";
import { detectLetterboxed, INPUT, letterbox, type ClubDetector } from "@/lib/club/detector";
import { clubTrack, type ClubPoint, type Pt } from "./club-track";
import { clubPathDeg, detectPhases, EVENTS, tempo, type SwingEvent, type Tempo } from "./phases";
import { argmax, argmin, fillLinear, gradient, rollingMean } from "./series";

// On-device version of main's processing (video_preprocessing.py + phase_detector.py + swing_analytics.py),
// made fast enough for a phone:
// - frames are decoded in order with WebCodecs (mediabunny) and resized to 640 px on the GPU: no per-frame seeks
//   and no full-resolution pixel copies (the old bench spent ~700 of 763 ms/frame there on an iPhone 13)
// - pass 1: pose only, at 15 fps on 256 px frames over the whole clip -> address / top / impact / finish
// - pass 2: pose + club detector at the clip's own frame rate, only around the downswing (top - 0.15 s ..
//   impact + 0.15 s) -> exact top / impact, tempo, path, club track
// The video never leaves the device.

const L_SHOULDER = 11;
const L_WRIST = 15;
const R_WRIST = 16;
const VIS_MIN = 0.2; // phase_detector.py
const MAX_SECONDS = 10;
const MARGIN_S = 0.15;

export type StageTiming = {
  frames: number;
  ms: number;
  decodeMs: number;
  poseMs: number;
  clubMs: number;
  /** Medians: steady-state per-frame cost, without first-run spikes. */
  poseMedianMs: number;
  clubMedianMs: number;
  /** Club split: pixel read + tensor fill vs model run (incl. GPU readback). */
  clubPrepMedianMs: number;
  clubInferMedianMs: number;
};
export type SwingPipelineResult = {
  width: number;
  height: number;
  durationS: number;
  clipFps: number | null;
  /** Event times in seconds (top + impact refined at clip frame rate when pass 2 had enough frames). */
  events: Record<SwingEvent, number>;
  tempo: Tempo | null;
  clubPathDeg: number | null;
  club: { t: number; p: ClubPoint }[];
  clubRawShare: number;
  clubShare: number;
  window: { start: number; end: number };
  timings: { pass1: StageTiming; pass2: StageTiming; totalMs: number };
};

export type PipelineOptions = {
  detector: ClubDetector | null;
  landmarker: PoseLandmarker;
  coarseFps?: number;
  /** "downswing" (default) or "all": run the club detector on every frame of the clip (worst case). */
  clubWindow?: "downswing" | "all";
  onProgress?: (stage: 1 | 2, done: number, total: number) => void;
  signal?: AbortSignal;
};

/** Same in-between events + strict ordering as phase_detector.py, recomputed after top/impact are refined. */
export function interpolateEvents(e: Record<SwingEvent, number>, step: number): Record<SwingEvent, number> {
  const out = { ...e };
  out["Toe-up"] = e.Address + 0.35 * (e.Top - e.Address);
  out["Mid-backswing"] = e.Address + 0.65 * (e.Top - e.Address);
  out["Mid-downswing"] = e.Top + 0.5 * (e.Impact - e.Top);
  out["Mid-follow-through"] = e.Impact + 0.4 * (e.Finish - e.Impact);
  for (let i = 1; i < EVENTS.length; i++)
    if (out[EVENTS[i]] <= out[EVENTS[i - 1]]) out[EVENTS[i]] = out[EVENTS[i - 1]] + step;
  return out;
}

const newTiming = (): StageTiming => ({
  frames: 0,
  ms: 0,
  decodeMs: 0,
  poseMs: 0,
  clubMs: 0,
  poseMedianMs: NaN,
  clubMedianMs: NaN,
  clubPrepMedianMs: NaN,
  clubInferMedianMs: NaN,
});
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);

/** Pose input size for pass 1: the model runs at 256 internally, so a smaller frame is cheaper to upload. */
const POSE_SIZE = 256;

/** Run pose once on a blank frame so the first real frame doesn't pay for GPU setup. Returns ms. */
export function warmUpPose(landmarker: PoseLandmarker): number {
  const t = performance.now();
  const c = document.createElement("canvas");
  c.width = POSE_SIZE;
  c.height = POSE_SIZE;
  c.getContext("2d")!.fillRect(0, 0, POSE_SIZE, POSE_SIZE);
  const clock = poseTimeline();
  landmarker.detectForVideo(c, clock(0));
  landmarker.detectForVideo(c, clock(0.033));
  return performance.now() - t;
}

export async function runSwingPipeline(file: File, opts: PipelineOptions): Promise<SwingPipelineResult> {
  const { detector, landmarker, coarseFps = 15, clubWindow = "downswing", onProgress, signal } = opts;
  const t0 = performance.now();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("no video track");
    if (!(await track.canDecode())) throw new Error("this browser cannot decode the video codec");
    const W = track.displayWidth;
    const H = track.displayHeight;
    const first = await track.getFirstTimestamp();
    const durationS = Math.min(await input.computeDuration(), first + MAX_SECONDS) - first;
    const stats = await track.computePacketStats(240);
    const clipFps = stats.averagePacketRate > 0 ? stats.averagePacketRate : null;
    const lb = letterbox(W, H, INPUT);
    const lb1 = letterbox(W, H, POSE_SIZE);
    const sink = new CanvasSink(track, { width: INPUT, height: INPUT, fit: "contain", poolSize: 2 });
    const sink1 = new CanvasSink(track, { width: POSE_SIZE, height: POSE_SIZE, fit: "contain", poolSize: 2 });

    const pose = (canvas: HTMLCanvasElement | OffscreenCanvas, tsMs: number) => {
      // letterboxed 0..1 -> source pixels
      const size = canvas.width;
      const b = size === INPUT ? lb : lb1;
      const px = (l: NormalizedLandmark): Pt => ({
        x: (l.x * size - b.padX) / b.scale,
        y: (l.y * size - b.padY) / b.scale,
      });
      const lms = landmarker.detectForVideo(canvas as HTMLCanvasElement, tsMs).landmarks[0];
      if (!lms) return { hands: null, shoulder: null };
      const vis = [lms[L_WRIST], lms[R_WRIST]].filter((l) => (l.visibility ?? 1) > VIS_MIN).map(px);
      const hands = vis.length
        ? { x: vis.reduce((s, p) => s + p.x, 0) / vis.length, y: vis.reduce((s, p) => s + p.y, 0) / vis.length }
        : null;
      const sh = lms[L_SHOULDER];
      return { hands, shoulder: (sh.visibility ?? 1) > VIS_MIN ? px(sh) : null };
    };
    const check = () => {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    };

    // ---- pass 1: pose at coarseFps over the whole clip -> phases
    const p1 = newTiming();
    const ts1 = Array.from(
      { length: Math.max(10, Math.floor(durationS * coarseFps)) },
      (_, i) => first + i / coarseFps,
    );
    const hx: number[] = [];
    const hy: number[] = [];
    const poseMs1: number[] = [];
    {
      const s = performance.now();
      const it = sink1.canvasesAtTimestamps(ts1);
      const clock = poseTimeline();
      try {
        for (let i = 0; ; i++) {
          check();
          const d = performance.now();
          const n = await it.next();
          p1.decodeMs += performance.now() - d;
          if (n.done) break;
          const q = performance.now();
          const { hands } = n.value ? pose(n.value.canvas, clock(n.value.timestamp)) : { hands: null };
          poseMs1.push(performance.now() - q);
          p1.poseMs += poseMs1[poseMs1.length - 1];
          hx.push(hands ? hands.x / W : NaN);
          hy.push(hands ? hands.y / H : NaN);
          onProgress?.(1, i + 1, ts1.length);
        }
      } finally {
        await it.return(undefined); // releases mediabunny's decoder + queued frames on stop/error
      }
      p1.frames = hx.length;
      p1.poseMedianMs = median(poseMs1);
      p1.ms = performance.now() - s;
    }
    const coarse = detectPhases({ x: hx, y: hy }, coarseFps);
    const events = Object.fromEntries(EVENTS.map((e) => [e, ts1[coarse.frames[e]]])) as Record<SwingEvent, number>;

    // ---- pass 2: pose + club at clip frame rate around the downswing
    const window =
      clubWindow === "all"
        ? { start: first, end: first + durationS }
        : { start: Math.max(first, events.Top - MARGIN_S), end: Math.min(first + durationS, events.Impact + MARGIN_S) };
    const p2 = newTiming();
    const t2: number[] = [];
    const hands2: (Pt | null)[] = [];
    const shoulder2: (Pt | null)[] = [];
    const raw2: (Pt | null)[] = [];
    const poseMs2: number[] = [];
    const clubMs2: number[] = [];
    const clubPrep2: number[] = [];
    const clubInfer2: number[] = [];
    {
      const s = performance.now();
      const expected = Math.max(1, Math.round((window.end - window.start) * (clipFps ?? 30)));
      const it = sink.canvases(window.start, window.end);
      const clock = poseTimeline();
      try {
        for (let i = 0; ; i++) {
          check();
          const d = performance.now();
          const n = await it.next();
          p2.decodeMs += performance.now() - d;
          if (n.done) break;
          const q = performance.now();
          const { hands, shoulder } = pose(n.value.canvas, clock(n.value.timestamp));
          poseMs2.push(performance.now() - q);
          p2.poseMs += poseMs2[poseMs2.length - 1];
          let club: Pt | null = null;
          if (detector) {
            const c = performance.now();
            const { box, prepMs, inferMs } = await detectLetterboxed(detector, n.value.canvas, lb);
            clubMs2.push(performance.now() - c);
            clubPrep2.push(prepMs);
            clubInfer2.push(inferMs);
            p2.clubMs += clubMs2[clubMs2.length - 1];
            if (box) club = { x: box.x * W, y: box.y * H };
          }
          t2.push(n.value.timestamp);
          hands2.push(hands);
          shoulder2.push(shoulder);
          raw2.push(club);
          onProgress?.(2, i + 1, expected);
        }
      } finally {
        await it.return(undefined);
      }
      p2.frames = t2.length;
      p2.poseMedianMs = median(poseMs2);
      p2.clubMedianMs = median(clubMs2);
      p2.clubPrepMedianMs = median(clubPrep2);
      p2.clubInferMedianMs = median(clubInfer2);
      p2.ms = performance.now() - s;
    }

    // refine top + impact at the clip's frame rate (same rules as pass 1, inside the window)
    let impact2 = -1;
    const fps2 = t2.length > 1 ? (t2.length - 1) / (t2[t2.length - 1] - t2[0]) : coarseFps;
    const wx2 = hands2.map((h) => (h ? h.x / W : NaN));
    if (t2.length >= 10 && clubWindow === "downswing" && hands2.some(Boolean)) {
      const sy = rollingMean(fillLinear(hands2.map((h) => (h ? h.y / H : NaN))), 5);
      const sx = rollingMean(fillLinear(wx2), 5);
      const dx = gradient(sx);
      const dy = gradient(sy);
      impact2 = argmax(dx.map((v, i) => Math.hypot(v, dy[i])));
      const top2 = impact2 > 3 ? argmin(sy.slice(0, impact2)) : -1;
      events.Impact = t2[impact2];
      if (top2 >= 0) events.Top = t2[top2];
      Object.assign(events, interpolateEvents(events, 1 / fps2));
    }

    const club = clubTrack(raw2, hands2, shoulder2, H);
    const n2 = Math.max(club.length, 1);
    return {
      width: W,
      height: H,
      durationS,
      clipFps,
      events,
      tempo: tempo(events.Address, events.Top, events.Impact),
      clubPathDeg: impact2 >= 0 ? clubPathDeg(wx2, impact2, fps2) : clubPathDeg(hx, coarse.frames.Impact, coarseFps),
      club: club.map((p, i) => ({ t: t2[i], p })),
      clubRawShare: raw2.filter(Boolean).length / n2,
      clubShare: club.filter((p) => p.detected).length / n2,
      window,
      timings: { pass1: p1, pass2: p2, totalMs: performance.now() - t0 },
    };
  } finally {
    input.dispose();
  }
}
