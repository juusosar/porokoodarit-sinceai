import { bestBox, letterbox, toChw } from "./detector";

describe("letterbox", () => {
  it("fits portrait 1080x1920 into 640 with side padding", () => {
    const lb = letterbox(1080, 1920);
    expect(lb.scale).toBeCloseTo(1 / 3);
    expect(lb.padX).toBeCloseTo(140);
    expect(lb.padY).toBe(0);
  });
});

describe("bestBox", () => {
  // [1, 7, 3]: rows cx, cy, w, h, cls0, cls1, cls2; 3 anchors
  const dims = [1, 7, 3];
  const out = [
    ...[320, 100, 500], // cx
    ...[320, 200, 100], // cy
    ...[64, 10, 10], // w
    ...[32, 10, 10], // h
    ...[0.2, 0.9, 0.5], // shaft
    ...[0.99, 0, 0], // other class: ignored
    ...[0, 0, 0],
  ];
  const lb = letterbox(1080, 1920);

  it("picks the most confident shaft box and maps back to source coords", () => {
    const b = bestBox(out, dims, lb)!;
    expect(b.conf).toBeCloseTo(0.9);
    expect(b.x).toBeCloseTo(((100 - 140) * 3) / 1080);
    expect(b.y).toBeCloseTo((200 * 3) / 1920);
  });

  it("returns null below the threshold", () => {
    expect(bestBox(out, dims, lb, 0, 0.95)).toBeNull();
  });
});

describe("toChw", () => {
  it("splits RGBA into planar RGB 0..1", () => {
    const rgba = new Uint8ClampedArray([255, 0, 51, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
    const want = [1, 0, 0, 1, 0, 1, 0, 1, 0.2, 0, 0, 1];
    toChw(rgba, 2, new Float32Array(12)).forEach((v, i) => expect(v).toBeCloseTo(want[i]));
  });
});
