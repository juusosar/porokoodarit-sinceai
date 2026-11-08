import * as ort from "onnxruntime-web/webgpu";

// Club detector (team SwingTrace YOLO11m, FP16 ONNX) running fully in the browser: the video never leaves the device.
// Model (public/models) and ORT WASM (bundled by Vite into /assets) are self-hosted: no third-party CDN.
export const MODEL_URL = "/models/swingtrace-yolo11m-fp16.onnx";
export const INPUT = 640;
export const SHAFT_CLASS = 0; // same class + threshold as the Python pipeline (video_preprocessing.py)
export const MIN_CONF = 0.25;
/** main's down-the-line read (video_preprocessing.py): class 1 = club head, else the best box of any class, conf 0.20. */
export const HEAD_CLASS = 1;
export const HEAD_MIN_CONF = 0.2;

export type Backend = "webgpu" | "wasm";
export type ClubDetector = {
  session: ort.InferenceSession;
  backend: Backend;
  loadMs: number;
  /** First inferences compile GPU shaders (seconds on Safari): done once at load, not during a swing. */
  warmMs?: number;
  error?: string;
};
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

/** Club head like main's DTL read: the best class-1 box, or the most confident box of any class when no head is found. */
export function bestHeadBox(out: ArrayLike<number>, dims: readonly number[], lb: Letterbox): Detection | null {
  const head = bestBox(out, dims, lb, HEAD_CLASS, HEAD_MIN_CONF);
  if (head) return head;
  let best: Detection | null = null;
  for (let c = 0; c < dims[1] - 4; c++) {
    const d = bestBox(out, dims, lb, c, HEAD_MIN_CONF);
    if (d && (!best || d.conf > best.conf)) best = d;
  }
  return best;
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

async function warmUp(d: ClubDetector): Promise<ClubDetector> {
  const t = performance.now();
  const c = document.createElement("canvas");
  c.width = INPUT;
  c.height = INPUT;
  c.getContext("2d")!.fillRect(0, 0, INPUT, INPUT);
  const lb = letterbox(INPUT, INPUT);
  await detectLetterboxed(d, c, lb);
  await detectLetterboxed(d, c, lb);
  return { ...d, warmMs: performance.now() - t };
}

/** Lazy singleton, warmed up. WebGPU first; WASM (CPU) fallback so the benchmark still reports a number. */
export function getClubDetector(): Promise<ClubDetector> {
  instance ??= (async () => {
    const t0 = performance.now();
    let gpuError: string | undefined;
    if ("gpu" in navigator) {
      try {
        const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["webgpu"] });
        return warmUp({ session, backend: "webgpu" as const, loadMs: performance.now() - t0 });
      } catch (e) {
        gpuError = (e as Error).message;
      }
    } else {
      gpuError = "WebGPU not available in this browser";
    }
    const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] });
    return warmUp({ session, backend: "wasm" as const, loadMs: performance.now() - t0, error: gpuError });
  })();
  instance.catch(() => (instance = null));
  return instance;
}

// One input buffer + tensor for the whole run: iOS Safari kills tabs on memory pressure, so no per-frame garbage.
let inputBuf: Float32Array<ArrayBuffer> | null = null;
let inputTensor: ort.Tensor | null = null;

type Canvas2D = HTMLCanvasElement | OffscreenCanvas;

/**
 * Detect on a canvas that already holds the INPUT x INPUT letterboxed frame (e.g. decoded + resized by mediabunny).
 * Only a 640x640 pixel read: no full-resolution copy.
 */
export async function detectLetterboxed(
  det: ClubDetector,
  canvas: Canvas2D,
  lb: Letterbox,
  pick: (out: ArrayLike<number>, dims: readonly number[], lb: Letterbox) => Detection | null = bestBox,
): Promise<{ box: Detection | null; prepMs: number; inferMs: number }> {
  const t0 = performance.now();
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  // padding grey 114 like Ultralytics training (mediabunny pads black)
  ctx.fillStyle = "rgb(114,114,114)";
  const px = Math.floor(lb.padX);
  const py = Math.floor(lb.padY);
  if (px > 0) {
    ctx.fillRect(0, 0, px, INPUT);
    ctx.fillRect(INPUT - px, 0, px, INPUT);
  }
  if (py > 0) {
    ctx.fillRect(0, 0, INPUT, py);
    ctx.fillRect(0, INPUT - py, INPUT, py);
  }
  inputBuf ??= new Float32Array(3 * INPUT * INPUT);
  inputTensor ??= new ort.Tensor("float32", inputBuf, [1, 3, INPUT, INPUT]);
  toChw(ctx.getImageData(0, 0, INPUT, INPUT).data, INPUT, inputBuf);
  const t1 = performance.now();
  let out: ort.Tensor | undefined;
  try {
    out = (await det.session.run({ [det.session.inputNames[0]]: inputTensor }))[det.session.outputNames[0]];
    const data = (await out.getData()) as Float32Array;
    const t2 = performance.now();
    return { box: pick(data, out.dims, lb), prepMs: t1 - t0, inferMs: t2 - t1 };
  } finally {
    out?.dispose(); // input tensor is reused across frames
  }
}
