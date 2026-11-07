import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Runs fully in the browser: the video never leaves the phone. Only numbers go to the API.
// WASM + model are self-hosted (scripts/copy-mediapipe-wasm.mjs, public/models): no third-party CDN.
const WASM_BASE = "/mediapipe/wasm";
const MODEL_URL = "/models/pose_landmarker_lite.task";

let instance: Promise<PoseLandmarker> | null = null;

/** Lazy singleton. Call early (e.g. on the intro screen) to warm up while the user reads. */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  instance ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const make = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return await make("GPU");
    } catch {
      return make("CPU"); // older phones without WebGL2
    }
  })();
  instance.catch(() => (instance = null));
  return instance;
}

let lastTs = -1;
/** VIDEO mode needs strictly increasing timestamps on the shared instance, across all callers and runs. */
export function nextPoseTs(desiredMs = 0): number {
  lastTs = Math.max(lastTs + 1, Math.round(desiredMs));
  return lastTs;
}

/**
 * Timestamps for one pass over a video: real media spacing (MediaPipe's landmark smoothing uses it), shifted so they
 * continue after anything already sent to the shared instance.
 */
export function poseTimeline(): (mediaS: number) => number {
  const base = lastTs + 1;
  let t0: number | null = null;
  return (mediaS) => {
    t0 ??= mediaS;
    return nextPoseTs(base + (mediaS - t0) * 1000);
  };
}

export { PoseLandmarker };
