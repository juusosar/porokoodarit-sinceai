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

export { PoseLandmarker };
