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
  shaft_length_m: Observation | null;
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

export type SwingBody = ReturnType<typeof swingPayload> & {
  dtl?: { pose: ReturnType<typeof swingPayload>["pose"]; club_head: { x: (number | null)[]; y: (number | null)[] } };
};

/** Golfer-facing words for the API's notes (why a value is missing or less certain). */
export const NOTE_TEXT: Record<string, string> = {
  body_not_visible: "body not visible in most frames",
  phases_not_found: "swing not found in the clip",
  phases_out_of_order: "swing phases unclear",
  timing_implausible: "timing looked off",
  speed_needs_slow_motion: "club speed needs a slow-motion clip",
  speed_implausible: "club speed read looked off",
  height_default: "no height given, so speed is less certain",
  dtl_no_club_head: "club head not found in the down-the-line clip",
  dtl_no_shoulders: "shoulders not clear in the down-the-line clip",
  dtl_shaft_implausible: "club length from the down-the-line clip looked off",
  dtl_body_not_visible: "body not visible in the down-the-line clip",
  dtl_unreadable: "down-the-line clip could not be read on this device",
};

/** One line for the result: who read the swing and what is missing. */
export function readingSource(r: { source?: "server" | "device"; algorithm?: string; fallback?: "off" | "unreachable" | "no_read"; notes?: string[] }): { title: string; detail: string[] } {
  const notes = (r.notes ?? []).map((n) => NOTE_TEXT[n]).filter(Boolean);
  if (r.source === "server") return { title: `Read by our server from body keypoints (${r.algorithm ?? "main"})`, detail: notes };
  const why = r.fallback === "off" ? "server reading is switched off" : r.fallback === "unreachable" ? "server not reachable" : r.fallback === "no_read" ? "server couldn’t read this swing" : null;
  return { title: `Read on this device${why ? ` (${why})` : ""}`, detail: notes };
}

export async function analyzeSwingOnServer(body: SwingBody, signal?: AbortSignal): Promise<SwingServerResult> {
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
