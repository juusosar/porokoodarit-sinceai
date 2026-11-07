import { fillPchip, rollingMean } from "./series";

// Port of main's extract_and_interpolate_club_data + kinematic arm-anchor fallback (video_preprocessing.py).
// All coordinates in pixels of the source frame.

export type Pt = { x: number; y: number };
export type ClubPoint = Pt & { detected: boolean; raw: boolean; anchored: boolean };

/** PCHIP fill (gaps up to 20 frames), then 3-frame centred smoothing (min_periods=1, like pandas). */
export function smoothClub(raw: (Pt | null)[]): (Pt | null)[] {
  const xs = rollingMean(fillPchip(raw.map((p) => p?.x ?? NaN), 20), 3);
  const ys = rollingMean(fillPchip(raw.map((p) => p?.y ?? NaN), 20), 3);
  return xs.map((x, i) => (Number.isNaN(x) || Number.isNaN(ys[i]) ? null : { x, y: ys[i] }));
}

/**
 * Shaft length is calibrated on the first raw detection (distance hands -> shaft box centre, 5..60 % of frame
 * height). Frames still missing the club get it extended along the shoulder -> hands line.
 */
export function clubTrack(
  raw: (Pt | null)[],
  hands: (Pt | null)[],
  shoulder: (Pt | null)[],
  frameHeight: number,
): ClubPoint[] {
  const smooth = smoothClub(raw);
  let shaftLen: number | null = null;
  return smooth.map((p, i) => {
    const w = hands[i];
    const s = shoulder[i];
    const r = raw[i];
    if (w && shaftLen === null && r && p) {
      const d = Math.hypot(p.x - w.x, p.y - w.y);
      if (d > 0.05 * frameHeight && d < 0.6 * frameHeight) shaftLen = d;
    }
    if (p) return { ...p, detected: true, raw: !!r, anchored: false };
    if (w && s && shaftLen !== null) {
      const ax = w.x - s.x;
      const ay = w.y - s.y;
      const norm = Math.hypot(ax, ay);
      if (norm > 1e-3)
        return { x: w.x + (ax / norm) * shaftLen, y: w.y + (ay / norm) * shaftLen, detected: true, raw: false, anchored: true };
    }
    return { x: NaN, y: NaN, detected: false, raw: false, anchored: false };
  });
}
