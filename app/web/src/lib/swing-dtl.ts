// Optional down-the-line clip: club head at address, read on this device with the team's YOLO model (main's DTL
// step in video_preprocessing.py). Only box centres (numbers) go to the API, which turns them into a shaft length.
import { bestHeadBox, detectLetterboxed, getClubDetector, INPUT, letterbox } from "@/lib/club/detector";
import { seek, type PoseFrame } from "@/lib/pose/analyze";

/** main measures over the still frames before address, at most 40 (at 240 fps). */
export const STATIC_FRAMES_MAX = 40;
/** Detector runs per clip: enough for a median, cheap on a phone. */
export const HEAD_SAMPLES = 8;

/** Sample indices (evenly spread) before the takeaway, capped like main. */
export function addressSamples(n: number, takeawayIdx: number | null, samples = HEAD_SAMPLES): number[] {
  const cutoff = Math.max(1, Math.min(takeawayIdx ?? STATIC_FRAMES_MAX, STATIC_FRAMES_MAX, n));
  const k = Math.min(samples, cutoff);
  return Array.from({ length: k }, (_, i) => Math.floor((i * cutoff) / k));
}

/**
 * Club-head centre (normalised to the frame) for the address samples of `frames`; null for every other sample.
 * `video` is the loaded DTL clip the pose frames came from.
 */
export async function clubHeadsAtAddress(
  video: HTMLVideoElement,
  frames: PoseFrame[],
  takeawayIdx: number | null,
  signal?: AbortSignal,
): Promise<{ x: (number | null)[]; y: (number | null)[]; found: number }> {
  const x: (number | null)[] = frames.map(() => null);
  const y: (number | null)[] = frames.map(() => null);
  const det = await getClubDetector();
  const W = video.videoWidth, H = video.videoHeight;
  const lb = letterbox(W, H, INPUT);
  const canvas = document.createElement("canvas");
  canvas.width = INPUT;
  canvas.height = INPUT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  let found = 0;
  for (const i of addressSamples(frames.length, takeawayIdx)) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    await seek(video, frames[i].t, signal);
    ctx.drawImage(video, lb.padX, lb.padY, W * lb.scale, H * lb.scale); // only a 640 px copy, no full-res read
    const { box } = await detectLetterboxed(det, canvas, lb, bestHeadBox);
    if (box) {
      x[i] = Math.round(box.x * 1e4) / 1e4;
      y[i] = Math.round(box.y * 1e4) / 1e4;
      found++;
    }
  }
  return { x, y, found };
}
