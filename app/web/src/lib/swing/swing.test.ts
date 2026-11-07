import { clubTrack, smoothClub } from "./club-track";
import { clubPathDeg, detectPhases, tempo } from "./phases";
import { fillLinear, fillPchip, gradient, rollingMean } from "./series";

describe("series (numpy/pandas parity)", () => {
  it("rollingMean centred, min_periods=1", () => {
    expect(rollingMean([1, 2, 3, 4, 5], 3)).toEqual([1.5, 2, 3, 4, 4.5]);
    expect(rollingMean([1, NaN, 3], 3)).toEqual([1, 2, 3]);
  });
  it("gradient like numpy", () => {
    expect(gradient([1, 2, 4, 7])).toEqual([1, 1.5, 2.5, 3]);
  });
  it("fillLinear fills gaps and holds ends", () => {
    expect(fillLinear([NaN, 1, NaN, 3, NaN])).toEqual([1, 1, 2, 3, 3]);
  });
  it("fillPchip keeps monotone data monotone and respects limit", () => {
    const y = [0, 1, NaN, NaN, 4, 5, 6];
    const f = fillPchip(y, 20);
    expect(f[2]).toBeGreaterThan(1);
    expect(f[3]).toBeLessThan(4);
    expect(f[2]).toBeLessThan(f[3]);
    const g = fillPchip([0, NaN, NaN, NaN, NaN, NaN, 6, 7, 8, 9], 1);
    expect(Number.isNaN(g[3])).toBe(true);
    expect(Number.isNaN(g[1])).toBe(false);
  });
});

/** Synthetic swing at `fps`: address 0.4 s, top 1.3 s, impact 1.6 s, finish 2.4 s (y: 0 top, 1 bottom). */
function synthSwing(fps: number) {
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < Math.round(3 * fps); i++) {
    const t = i / fps;
    let yy: number;
    if (t < 0.5) yy = 0.7 + 0.02 * Math.exp(-(((t - 0.4) / 0.1) ** 2)); // hands lowest at 0.4 s
    else if (t < 1.3) yy = 0.7 - 0.5 * ((t - 0.5) / 0.8); // backswing up to 0.2
    else if (t < 1.6) yy = 0.2 + 0.52 * ((t - 1.3) / 0.3) ** 2; // accelerating down to 0.72
    else if (t < 2.4) yy = 0.72 - 0.57 * ((t - 1.6) / 0.8); // up to finish 0.15
    else yy = 0.15;
    y.push(yy);
    x.push(0.5 + (t > 1.55 && t < 1.65 ? (t - 1.55) * 0.2 : 0));
  }
  return { x, y };
}

describe("detectPhases (port of phase_detector.py)", () => {
  // Expected frames produced by main's KinematicPhaseDetector.detect_phases_from_dataframe on the same input
  // (frame 7 missing), pandas 3 / numpy 2.
  const PY = {
    30: { Address: 12, "Toe-up": 21, "Mid-backswing": 29, Top: 39, "Mid-downswing": 42, Impact: 45, "Mid-follow-through": 56, Finish: 74 },
    240: { Address: 96, "Toe-up": 172, "Mid-backswing": 237, Top: 314, "Mid-downswing": 347, Impact: 381, "Mid-follow-through": 459, Finish: 578 },
  };
  it.each([30, 240] as const)("matches the Python detector exactly at %i fps", (fps) => {
    const w = synthSwing(fps);
    w.x[7] = NaN;
    w.y[7] = NaN;
    expect(detectPhases(w, fps).frames).toEqual(PY[fps]);
  });
  it("times the backswing from the takeaway, not a waggle seconds earlier", () => {
    // hands sit still at 0.7 from 0 to 1.5 s with a waggle dip (lowest point) at 0.3 s, then rise to the top at 2.3 s
    const fps = 60;
    const y: number[] = [];
    const x: number[] = [];
    for (let i = 0; i < Math.round(3.5 * fps); i++) {
      const t = i / fps;
      let yy: number;
      if (t < 1.5) yy = 0.7 + 0.03 * Math.exp(-(((t - 0.3) / 0.05) ** 2));
      else if (t < 2.3) yy = 0.7 - 0.5 * Math.sin(((t - 1.5) / 0.8) * (Math.PI / 2)) ** 2; // eases in and out
      else if (t < 2.6) yy = 0.2 + 0.52 * ((t - 2.3) / 0.3) ** 2;
      else yy = 0.72 - 0.5 * Math.min(1, (t - 2.6) / 0.6);
      y.push(yy);
      x.push(0.5);
    }
    const p = detectPhases({ x, y }, fps);
    expect(p.frames.Address / fps).toBeLessThan(0.5); // main's address: the waggle
    expect(p.takeaway / fps).toBeGreaterThan(1.4); // takeaway: when the hands start to rise
    expect(p.takeaway / fps).toBeLessThan(1.6);
  });
  it("rejects too few frames", () => {
    expect(() => detectPhases({ x: [1, 2], y: [1, 2] }, 30)).toThrow();
  });
});

describe("tempo + path", () => {
  it("tempo ratio", () => {
    expect(tempo(0.5, 1.3, 1.6)).toEqual({ backswingS: expect.closeTo(0.8), downswingS: expect.closeTo(0.3), ratio: 2.67 });
    expect(tempo(1, 1, 2)).toBeNull();
  });
  it("path sign follows hand movement through impact", () => {
    const xs = Array.from({ length: 60 }, (_, i) => 0.5 + i * 0.001);
    expect(clubPathDeg(xs, 30, 30)!).toBeGreaterThan(0);
    expect(clubPathDeg(xs.map((v) => 1 - v), 30, 30)!).toBeLessThan(0);
  });
});

describe("club track (port of video_preprocessing.py)", () => {
  it("fills short gaps", () => {
    const raw = [{ x: 0, y: 0 }, null, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }];
    expect(smoothClub(raw)[1]).not.toBeNull();
  });
  it("anchors the club along the arm when detections stop", () => {
    const hands = Array.from({ length: 50 }, () => ({ x: 100, y: 100 }));
    const shoulder = Array.from({ length: 50 }, () => ({ x: 100, y: 0 }));
    const raw = Array.from({ length: 50 }, (_, i) => (i === 0 ? { x: 100, y: 300 } : null));
    const t = clubTrack(raw, hands, shoulder, 1000);
    expect(t[0].raw).toBe(true);
    expect(t[49].anchored).toBe(true);
    expect(t[49].y).toBeCloseTo(300);
  });
});

describe("interpolateEvents", () => {
  it("keeps events ordered after impact moves before the old mid-downswing", async () => {
    const { interpolateEvents } = await import("./pipeline");
    const e = interpolateEvents(
      {
        Address: 0,
        "Toe-up": 0.3,
        "Mid-backswing": 0.6,
        Top: 1.0,
        "Mid-downswing": 1.13,
        Impact: 1.1,
        "Mid-follow-through": 1.5,
        Finish: 2,
      },
      1 / 240,
    );
    expect(e["Mid-downswing"]).toBeCloseTo(1.05);
    const v = Object.values(e);
    v.slice(1).forEach((x, i) => expect(x).toBeGreaterThan(v[i]));
  });
});
