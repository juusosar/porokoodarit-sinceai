import fixtures from "./__fixtures__/wrist_y.json";
import { analyzeFrames, wristSeries, type PoseFrame } from "./analyze";

function framesFromY(y: number[], fps: number, missingEvery = 0): PoseFrame[] {
  return y.map((v, i) => {
    if (missingEvery && i % missingEvery === 0 && i > 0) return { t: i / fps, landmarks: null };
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    lm[15] = { ...lm[15], y: v };
    lm[16] = { ...lm[16], y: v };
    return { t: i / fps, landmarks: lm };
  });
}

describe("analyzeFrames", () => {
  const f = fixtures[2];
  it("finds tempo and a swing window around takeaway..impact", () => {
    const a = analyzeFrames(framesFromY(f.y, f.fps), f.fps);
    expect(a.tempo?.topFrame).toBe(f.expected.top_frame);
    expect(a.window!.start).toBeLessThan(f.expected.takeaway_frame! / f.fps);
    expect(a.window!.end).toBeGreaterThan(f.expected.impact_frame! / f.fps);
  });

  it("fills short pose gaps", () => {
    const y = wristSeries(framesFromY(f.y, f.fps, 10));
    expect(y.every((v) => !Number.isNaN(v))).toBe(true);
  });

  it("refuses when the body is mostly not visible", () => {
    const frames = framesFromY(f.y, f.fps).map((fr, i) => (i % 2 ? { ...fr, landmarks: null } : fr));
    const a = analyzeFrames(frames, f.fps);
    expect(a.tempo).toBeNull();
    expect(a.error).toMatch(/not visible/);
  });
});

describe("analyzeVideo seek safety", () => {
  it("rejects instead of hanging when a seek never completes", async () => {
    vi.useFakeTimers();
    vi.doMock("./landmarker", () => ({
      getPoseLandmarker: async () => ({ detectForVideo: () => ({ landmarks: [] }) }),
    }));
    vi.resetModules();
    const { analyzeVideo, SEEK_TIMEOUT_MS } = await import("./analyze");
    const video = Object.assign(new EventTarget(), { duration: 2, currentTime: 0 }) as unknown as HTMLVideoElement;
    const p = analyzeVideo(video);
    const check = expect(p).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(SEEK_TIMEOUT_MS + 10);
    await check;
    vi.useRealTimers();
  });

  it("stops when aborted", async () => {
    vi.doMock("./landmarker", () => ({
      getPoseLandmarker: async () => ({ detectForVideo: () => ({ landmarks: [] }) }),
    }));
    vi.resetModules();
    const { analyzeVideo } = await import("./analyze");
    const ctrl = new AbortController();
    ctrl.abort();
    const video = Object.assign(new EventTarget(), { duration: 2, currentTime: 0 }) as unknown as HTMLVideoElement;
    await expect(analyzeVideo(video, { signal: ctrl.signal })).rejects.toThrow(/aborted/);
  });
});
