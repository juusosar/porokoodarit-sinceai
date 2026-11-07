import { argmax, argmin, fillLinear, gradient, rollingMean } from "./series";

// Port of main's KinematicPhaseDetector.detect_phases_from_dataframe (phase_detector.py) and calculate_tempo /
// calculate_club_path (swing_analytics.py). Wrist coordinates are normalised to the video frame (MediaPipe space).

export const EVENTS = [
  "Address",
  "Toe-up",
  "Mid-backswing",
  "Top",
  "Mid-downswing",
  "Impact",
  "Mid-follow-through",
  "Finish",
] as const;
export type SwingEvent = (typeof EVENTS)[number];

/** Per frame mean of both wrists; NaN when not visible. */
export type WristTrack = { x: number[]; y: number[] };

export type Phases = { fps: number; frames: Record<SwingEvent, number> };

export function detectPhases({ x, y }: WristTrack, fps: number): Phases {
  const n = y.length;
  if (n < 10) throw new Error(`Too few frames (${n}) for kinematic analysis.`);
  if (y.every(Number.isNaN)) throw new Error("No wrist positions found.");
  const sy = rollingMean(fillLinear(y), 5);
  const sx = x.every(Number.isNaN) ? sy.map(() => 0) : rollingMean(fillLinear(x), 5);
  const dx = gradient(sx);
  const dy = gradient(sy);
  const speed = dx.map((v, i) => Math.hypot(v, dy[i]) * fps);

  // 1. Impact: the fastest hand movement in the clip.
  const impact = argmax(speed);
  // 2. Top: hands highest (min y) within 3.5 s before impact.
  const preStart = Math.max(0, impact - Math.trunc(fps * 3.5));
  const top = impact > preStart + 3 ? preStart + argmin(sy.slice(preStart, impact)) : Math.max(0, impact - Math.trunc(fps * 0.35));
  // 3. Address: hands lowest (max y) within 4 s before top.
  const addrStart = Math.max(0, top - Math.trunc(fps * 4.0));
  const address = top > addrStart + 3 ? addrStart + argmax(sy.slice(addrStart, top)) : Math.max(0, top - Math.trunc(fps * 1.0));
  // 4. Finish: hands highest within 2.5 s after impact.
  const postEnd = Math.min(n - 1, impact + Math.trunc(fps * 2.5));
  const finish =
    postEnd > impact + 2 ? impact + argmin(sy.slice(impact, postEnd + 1)) : Math.min(n - 1, impact + Math.trunc(fps * 0.8));

  const idx = [
    address,
    Math.trunc(address + 0.35 * (top - address)),
    Math.trunc(address + 0.65 * (top - address)),
    top,
    Math.trunc(top + 0.5 * (impact - top)),
    impact,
    Math.trunc(impact + 0.4 * (finish - impact)),
    finish,
  ];
  for (let i = 1; i < idx.length; i++) if (idx[i] <= idx[i - 1]) idx[i] = idx[i - 1] + 1;
  const frames = Object.fromEntries(EVENTS.map((e, i) => [e, Math.min(idx[i], n - 1)])) as Record<SwingEvent, number>;
  return { fps, frames };
}

export type Tempo = { backswingS: number; downswingS: number; ratio: number };

/** calculate_tempo, from event times in seconds. */
export function tempo(addressS: number, topS: number, impactS: number): Tempo | null {
  const back = topS - addressS;
  const down = impactS - topS;
  if (back <= 0 || down <= 0) return null;
  return { backswingS: back, downswingS: down, ratio: Math.round((back / down) * 100) / 100 };
}

/**
 * calculate_club_path: horizontal hand movement through impact -> path angle in degrees (+ in-to-out, - out-to-in,
 * down-the-line view). main uses +-3 frames of a 30 fps clip; here the window is +-0.1 s so 240 fps clips match.
 */
export function clubPathDeg(wristX: number[], impactIdx: number, fps: number): number | null {
  const k = Math.max(1, Math.round(0.1 * fps));
  const xs = wristX.slice(Math.max(0, impactIdx - k), impactIdx + k + 1).filter((v) => !Number.isNaN(v));
  if (xs.length < 2) return null;
  const deg = (Math.atan2(xs[xs.length - 1] - xs[0], 0.4) * 180) / Math.PI;
  return Math.round(Math.min(12, Math.max(-12, deg)) * 10) / 10;
}
