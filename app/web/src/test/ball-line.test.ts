import { describe, expect, it } from 'vitest';
import { tiltDeg } from '@/lib/lie/ball-line';

describe('ball-line tilt (port of lab camera/ball_line.py)', () => {
  // right-handed face photo: heel left, toe right, leading edge horizontal
  const heel = { x: 100, y: 300 }, toe = { x: 400, y: 300 };
  it('is zero for a vertical mark', () => { expect(tiltDeg({ x: 250, y: 280 }, { x: 250, y: 180 }, heel, toe)).toBe(0); });
  it('is positive when the top leans toward the toe (too upright)', () => {
    expect(tiltDeg({ x: 250, y: 280 }, { x: 260, y: 180 }, heel, toe)).toBeCloseTo(5.7, 1);
  });
  it('is negative toward the heel and ignores point order', () => {
    expect(tiltDeg({ x: 260, y: 180 }, { x: 250, y: 280 }, heel, toe)).toBeCloseTo(5.7, 1);
    expect(tiltDeg({ x: 250, y: 280 }, { x: 240, y: 180 }, heel, toe)).toBeCloseTo(-5.7, 1);
  });
  it('measures against a tilted leading edge (phone held at an angle)', () => {
    // rotate the whole scene by 10 degrees: a vertical-to-the-face mark stays 0
    const r = (p: { x: number; y: number }) => { const a = (10 * Math.PI) / 180; return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) }; };
    expect(tiltDeg(r({ x: 250, y: 280 }), r({ x: 250, y: 180 }), r(heel), r(toe))).toBeCloseTo(0, 5);
  });
  it('matches the lab reference values', () => {
    // python: tilt_deg((0,0),(1,-10),(0,5),(10,5)) == 5.7
    expect(tiltDeg({ x: 0, y: 0 }, { x: 1, y: -10 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(5.7);
  });
});
