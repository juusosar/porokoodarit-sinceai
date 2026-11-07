import fixtures from "./__fixtures__/wrist_y.json";
import { tempoFromWristY } from "./tempo";

// Real swings from the repo's pose CSV (MediaPipe lite, 30 fps), expected values from the lab's Python.
describe("tempoFromWristY matches lab tempo.py", () => {
  for (const f of fixtures) {
    it(f.video, () => {
      const t = tempoFromWristY(f.y, f.fps);
      expect(t.takeawayFrame).toBe(f.expected.takeaway_frame);
      expect(t.topFrame).toBe(f.expected.top_frame);
      expect(t.impactFrame).toBe(f.expected.impact_frame);
      expect(t.backswingS).toBeCloseTo(f.expected.backswing_s!, 3);
      expect(t.downswingS).toBeCloseTo(f.expected.downswing_s!, 3);
    });
  }

  it("rejects a still clip", () => {
    expect(() => tempoFromWristY(Array(60).fill(0.5), 30)).toThrow();
  });
});
