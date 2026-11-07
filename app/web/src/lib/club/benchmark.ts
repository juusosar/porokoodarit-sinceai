import { seek } from "@/lib/pose/analyze";
import { detectFrame, type ClubDetector, type Detection } from "./detector";
import { summarize, type BenchSummary, type FrameTiming } from "./stats";

export type BenchOptions = {
  sampleFps: number;
  maxSeconds: number;
  onFrame?: (i: number, n: number, box: Detection | null) => void;
  /** Called every `statsEvery` frames with stats so far (live view + crash-safe save). */
  onStats?: (summary: BenchSummary) => void;
  statsEvery?: number;
  signal?: AbortSignal;
};

/**
 * Step through every frame at `sampleFps` (seek-based, same as pose) and run the club detector on the full
 * 640 px letterboxed frame. No cropping or frame skipping: this measures the worst case.
 * Stops early on abort or a decode/seek error and still returns the stats so far (`stopped` says why).
 */
export async function runClubBenchmark(
  det: ClubDetector,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  { sampleFps, maxSeconds, onFrame, onStats, statsEvery = 10, signal }: BenchOptions,
): Promise<{ summary: BenchSummary; boxes: (Detection | null)[]; stopped: string | null }> {
  const n = Math.max(1, Math.floor(Math.min(video.duration, maxSeconds) * sampleFps));
  const timings: FrameTiming[] = [];
  const boxes: (Detection | null)[] = [];
  const start = performance.now();
  let stopped: string | null = null;
  for (let i = 0; i < n; i++) {
    if (signal?.aborted) {
      stopped = "stopped by user";
      break;
    }
    const s0 = performance.now();
    try {
      await seek(video, i / sampleFps, signal);
    } catch (e) {
      stopped = (e as Error).name === "AbortError" ? "stopped by user" : `stopped at frame ${i}: ${(e as Error).message}`;
      break;
    }
    const seekMs = performance.now() - s0;
    const { box, prepMs, inferMs } = await detectFrame(det, video, canvas);
    timings.push({ seekMs, prepMs, inferMs, detected: !!box });
    boxes.push(box);
    onFrame?.(i, n, box);
    if (onStats && (i + 1) % statsEvery === 0) onStats(summarize(timings, (performance.now() - start) / 1000));
    await new Promise((r) => setTimeout(r, 0)); // yield: keep the page responsive, let GC run
  }
  return { summary: summarize(timings, (performance.now() - start) / 1000), boxes, stopped };
}
