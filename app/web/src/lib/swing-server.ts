// Swing analysis on the API (POST /v1/swing/analyze) with main's algorithm. Only pose keypoints are sent:
// the few landmarks it reads, as numbers. The video and its pixels never leave the device.
// The answer is measurements only (tempo, estimated club speed); the fitting engine decides what they mean.
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Observation } from "@/types/fit-state";
import { env } from "@/lib/env";
import type { PoseFrame } from "@/lib/pose/analyze";

/** Head (body height), shoulders, wrists, ankles: what app/api/takomo_api/swing reads. */
export const SENT_LANDMARKS = [0, 1, 2, 11, 12, 15, 16, 27, 28] as const;
const TIMEOUT_MS = 8000;

export type SwingServerResult = {
  backswing_s: Observation | null;
  downswing_s: Observation | null;
  video_speed_7i_mph: Observation | null;
  events_ms: Record<string, number>;
  algorithm: string;
  notes: string[];
};

export function swingServerEnabled(): boolean {
  return env("VITE_SWING_SERVER", "on") !== "off";
}

const r4 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4);

/**
 * Request body from on-device pose frames. `sampleFps` = pose samples per media second, `slowMo` = playback
 * slowdown: the API gets real swing time (media time / slowMo), so it never has to guess the frame rate.
 */
export function swingPayload(
  frames: PoseFrame[],
  { sampleFps, slowMo, width, height, heightCm }: { sampleFps: number; slowMo: number; width: number; height: number; heightCm?: number | null },
) {
  const landmarks: Record<string, { x: (number | null)[]; y: (number | null)[]; v: (number | null)[] }> = {};
  for (const id of SENT_LANDMARKS) {
    const pick = (f: PoseFrame): NormalizedLandmark | undefined => f.landmarks?.[id];
    landmarks[String(id)] = {
      x: frames.map((f) => r4(pick(f)?.x)),
      y: frames.map((f) => r4(pick(f)?.y)),
      v: frames.map((f) => (f.landmarks ? r4(pick(f)?.visibility ?? 1) : null)),
    };
  }
  const t0 = frames[0]?.t ?? 0;
  return {
    view: "face_on" as const,
    ...(heightCm ? { height_cm: heightCm } : {}),
    pose: {
      fps: sampleFps * slowMo,
      t_ms: frames.map((f) => Math.round(((f.t - t0) * 1000) / slowMo * 10) / 10),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      landmarks,
    },
  };
}

export async function analyzeSwingOnServer(body: ReturnType<typeof swingPayload>, signal?: AbortSignal): Promise<SwingServerResult> {
  const url = `${env("VITE_API_URL", "http://localhost:8080")}/v1/swing/analyze`;
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!r.ok) throw new Error(`swing API ${r.status}`);
  return r.json();
}
