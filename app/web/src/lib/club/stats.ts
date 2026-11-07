export type FrameTiming = { seekMs: number; prepMs: number; inferMs: number; detected: boolean };

export type BenchSummary = {
  frames: number;
  wallS: number;
  msPerFrame: number;
  inferMedianMs: number;
  inferP90Ms: number;
  /** First inference includes shader compilation, so it is reported apart and left out of the stats. */
  firstInferMs: number;
  /** Median inference of the first vs last 20 frames: a rise means the device throttled. */
  inferFirst20Ms: number;
  inferLast20Ms: number;
  seekMeanMs: number;
  prepMeanMs: number;
  detectedShare: number;
};

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function summarize(t: FrameTiming[], wallS: number): BenchSummary {
  const infer = t.slice(1).map((f) => f.inferMs);
  return {
    frames: t.length,
    wallS,
    msPerFrame: t.length ? (wallS * 1000) / t.length : NaN,
    inferMedianMs: quantile(infer, 0.5),
    inferP90Ms: quantile(infer, 0.9),
    firstInferMs: t[0]?.inferMs ?? NaN,
    inferFirst20Ms: quantile(infer.slice(0, 20), 0.5),
    inferLast20Ms: quantile(infer.slice(-20), 0.5),
    seekMeanMs: mean(t.map((f) => f.seekMs)),
    prepMeanMs: mean(t.map((f) => f.prepMs)),
    detectedShare: t.length ? t.filter((f) => f.detected).length / t.length : 0,
  };
}
