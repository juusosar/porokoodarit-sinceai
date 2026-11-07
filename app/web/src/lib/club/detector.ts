import * as ort from "onnxruntime-web/webgpu";

// Club detector (team SwingTrace YOLO11m, FP16 ONNX) running fully in the browser: the video never leaves the device.
// Model (public/models) and ORT WASM (bundled by Vite into /assets) are self-hosted: no third-party CDN.
export const MODEL_URL = "/models/swingtrace-yolo11m-fp16.onnx";
export const INPUT = 640;
export const SHAFT_CLASS = 0; // same class + threshold as the Python pipeline (video_preprocessing.py)
export const MIN_CONF = 0.25;

export type Backend = "webgpu" | "wasm";
export type ClubDetector = { session: ort.InferenceSession; backend: Backend; loadMs: number; error?: string };
export type Letterbox = { scale: number; padX: number; padY: number; w: number; h: number };
/** Box centre in normalised source-frame coordinates (0..1). */
export type Detection = { x: number; y: number; w: number; h: number; conf: number };

/** Ultralytics-style letterbox: keep aspect, centre, pad with grey. */
export function letterbox(w: number, h: number, size = INPUT): Letterbox {
  const scale = Math.min(size / w, size / h);
  return { scale, padX: (size - w * scale) / 2, padY: (size - h * scale) / 2, w, h };
}

/**
 * Best box of one class from a raw YOLO head output [1, 4 + classes, anchors] (cx, cy, w, h in input pixels).
 * No NMS needed: we only keep the single most confident box.
 */
export function bestBox(
  out: ArrayLike<number>,
  dims: readonly number[],
  lb: Letterbox,
  cls = SHAFT_CLASS,
  minConf = MIN_CONF,
): Detection | null {
  const anchors = dims[2];
  const row = (r: number) => r * anchors;
  let best = -1;
  let bestConf = minConf;
  for (let i = 0; i < anchors; i++) {
    const c = out[row(4 + cls) + i];
    if (c >= bestConf) {
      bestConf = c;
      best = i;
    }
  }
  if (best < 0) return null;
  const s = lb.scale;
  return {
    x: (out[row(0) + best] - lb.padX) / s / lb.w,
    y: (out[row(1) + best] - lb.padY) / s / lb.h,
    w: out[row(2) + best] / s / lb.w,
    h: out[row(3) + best] / s / lb.h,
    conf: bestConf,
  };
}

/** RGBA pixels of the letterboxed frame -> float32 CHW 0..1, written into `out` (reuse it: no per-frame 5 MB alloc). */
export function toChw<T extends Float32Array>(rgba: Uint8ClampedArray, size: number, out: T): T {
  const n = size * size;
  for (let i = 0; i < n; i++) {
    out[i] = rgba[i * 4] / 255;
    out[n + i] = rgba[i * 4 + 1] / 255;
    out[2 * n + i] = rgba[i * 4 + 2] / 255;
  }
  return out;
}

export async function hasShaderF16(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  const adapter = await gpu?.requestAdapter().catch(() => null);
  return !!adapter?.features.has("shader-f16");
}

let instance: Promise<ClubDetector> | null = null;

/** Lazy singleton. WebGPU first; WASM (CPU) fallback so the benchmark still reports a number. */
export function getClubDetector(): Promise<ClubDetector> {
  instance ??= (async () => {
    const t0 = performance.now();
    let gpuError: string | undefined;
    if ("gpu" in navigator) {
      try {
        const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["webgpu"] });
        return { session, backend: "webgpu" as const, loadMs: performance.now() - t0 };
      } catch (e) {
        gpuError = (e as Error).message;
      }
    } else {
      gpuError = "WebGPU not available in this browser";
    }
    const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] });
    return { session, backend: "wasm" as const, loadMs: performance.now() - t0, error: gpuError };
  })();
  instance.catch(() => (instance = null));
  return instance;
}

// One input buffer + tensor for the whole run: iOS Safari kills tabs on memory pressure, so no per-frame garbage.
let inputBuf: Float32Array<ArrayBuffer> | null = null;
let inputTensor: ort.Tensor | null = null;

/** One frame: letterbox the current video frame onto `canvas`, run the model, return the shaft box + timings. */
export async function detectFrame(
  det: ClubDetector,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<{ box: Detection | null; prepMs: number; inferMs: number }> {
  const t0 = performance.now();
  const lb = letterbox(video.videoWidth, video.videoHeight);
  if (canvas.width !== INPUT || canvas.height !== INPUT) {
    canvas.width = INPUT; // resizing resets the context: only once
    canvas.height = INPUT;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, INPUT, INPUT);
  ctx.drawImage(video, lb.padX, lb.padY, lb.w * lb.scale, lb.h * lb.scale);
  inputBuf ??= new Float32Array(3 * INPUT * INPUT);
  inputTensor ??= new ort.Tensor("float32", inputBuf, [1, 3, INPUT, INPUT]);
  toChw(ctx.getImageData(0, 0, INPUT, INPUT).data, INPUT, inputBuf);
  const input = inputTensor;
  const t1 = performance.now();
  let out: ort.Tensor | undefined;
  try {
    out = (await det.session.run({ [det.session.inputNames[0]]: input }))[det.session.outputNames[0]];
    const data = (await out.getData()) as Float32Array;
    const t2 = performance.now();
    return { box: bestBox(data, out.dims, lb), prepMs: t1 - t0, inferMs: t2 - t1 };
  } finally {
    out?.dispose(); // input tensor is reused across frames
  }
}
