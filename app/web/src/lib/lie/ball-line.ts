// Ball-line lie test: tilt of the transferred marker line against the club face.
// Port of TAKOMO_FITTING_LAB_2026 camera/ball_line.py (MIT, Since AI ry).
//
// The golfer taps the two ends of the mark and two points on the leading edge (heel end, toe end).
// tilt > 0: the top of the line leans toward the toe -> club toe-up at impact (too upright) -> needs flatter.
// Face angle also rotates the mark, so it exaggerates; the engine scales it (fusion.BALL_LINE_K).
// Everything runs on the device: the photo is never uploaded.

export type Pt = { x: number; y: number };

/** Angle between the mark and the face's vertical in degrees, + toward the toe. Image pixels, y down. */
export function tiltDeg(lineBottom: Pt, lineTop: Pt, heel: Pt, toe: Pt): number {
  const ex = toe.x - heel.x;
  const ey = toe.y - heel.y;
  const edge = Math.hypot(ex, ey);
  if (!(edge > 0)) throw new Error("heel and toe points are the same");
  const lx = lineTop.x - lineBottom.x;
  const ly = lineTop.y - lineBottom.y;
  if (!(Math.hypot(lx, ly) > 0)) throw new Error("line points are the same");
  const ux = ex / edge;
  const uy = ey / edge; // along the leading edge, toward the toe
  let nx = uy;
  let ny = -ux; // perpendicular, face "up"
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  let alongToe = lx * ux + ly * uy;
  let alongUp = lx * nx + ly * ny;
  if (alongUp < 0) {
    // points given in either order
    alongToe = -alongToe;
    alongUp = -alongUp;
  }
  return Math.round(((Math.atan2(alongToe, alongUp) * 180) / Math.PI) * 10) / 10;
}

export const TAP_ORDER = ["Bottom of the line", "Top of the line", "Leading edge, heel end", "Leading edge, toe end"] as const;
