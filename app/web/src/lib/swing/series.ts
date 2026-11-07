// Small numpy/pandas equivalents used by the swing pipeline (ported from main: phase_detector.py, video_preprocessing.py).

/** pandas rolling(window, center=True, min_periods=1).mean() for odd windows, NaN-aware. */
export function rollingMean(xs: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return xs.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      const v = xs[j];
      if (j >= 0 && j < xs.length && !Number.isNaN(v)) {
        s += v;
        n++;
      }
    }
    return n ? s / n : NaN;
  });
}

/** numpy.gradient with unit spacing: central differences inside, one-sided at the ends. */
export function gradient(xs: number[]): number[] {
  const n = xs.length;
  if (n < 2) return xs.map(() => 0);
  return xs.map((_, i) => (i === 0 ? xs[1] - xs[0] : i === n - 1 ? xs[n - 1] - xs[n - 2] : (xs[i + 1] - xs[i - 1]) / 2));
}

/** pandas interpolate(limit_direction="both") for method="linear": gaps filled, ends held at the nearest value. */
export function fillLinear(xs: number[]): number[] {
  const idx = xs.flatMap((v, i) => (Number.isNaN(v) ? [] : [i]));
  if (!idx.length) return xs.slice();
  return xs.map((v, i) => {
    if (!Number.isNaN(v)) return v;
    if (i < idx[0]) return xs[idx[0]];
    if (i > idx[idx.length - 1]) return xs[idx[idx.length - 1]];
    let k = 0;
    while (idx[k + 1] < i) k++;
    const a = idx[k];
    const b = idx[k + 1];
    return xs[a] + ((xs[b] - xs[a]) * (i - a)) / (b - a);
  });
}

/** Fritsch-Carlson PCHIP slopes (same as scipy PchipInterpolator) at the known points. */
function pchipSlopes(x: number[], y: number[]): number[] {
  const n = x.length;
  const h = x.slice(1).map((v, i) => v - x[i]);
  const d = h.map((hi, i) => (y[i + 1] - y[i]) / hi);
  if (n === 2) return [d[0], d[0]];
  const m = new Array<number>(n).fill(0);
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] * d[k] <= 0) continue;
    const w1 = 2 * h[k] + h[k - 1];
    const w2 = h[k] + 2 * h[k - 1];
    m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
  }
  const end = (h0: number, h1: number, d0: number, d1: number) => {
    let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(s) !== Math.sign(d0)) s = 0;
    else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > Math.abs(3 * d0)) s = 3 * d0;
    return s;
  };
  m[0] = end(h[0], h[1], d[0], d[1]);
  m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  return m;
}

/**
 * pandas interpolate(method="pchip", limit, limit_direction="both") for interior gaps: each missing point within
 * `limit` steps of a known point is filled on the PCHIP curve through the known points. Ends are not extrapolated.
 * Fewer than 4 known points: linear, as in video_preprocessing.py.
 */
export function fillPchip(xs: number[], limit = 20): number[] {
  const kx = xs.flatMap((v, i) => (Number.isNaN(v) ? [] : [i]));
  if (kx.length < 2) return xs.slice();
  const ky = kx.map((i) => xs[i]);
  const m = kx.length >= 4 ? pchipSlopes(kx, ky) : null;
  const out = xs.slice();
  for (let k = 0; k < kx.length - 1; k++) {
    const a = kx[k];
    const b = kx[k + 1];
    for (let i = a + 1; i < b; i++) {
      if (Math.min(i - a, b - i) > limit) continue;
      const h = b - a;
      const t = (i - a) / h;
      if (!m) {
        out[i] = ky[k] + (ky[k + 1] - ky[k]) * t;
        continue;
      }
      const t2 = t * t;
      const t3 = t2 * t;
      out[i] =
        (2 * t3 - 3 * t2 + 1) * ky[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ky[k + 1] + (t3 - t2) * h * m[k + 1];
    }
  }
  return out;
}

export const argmax = (xs: number[]) => xs.reduce((b, v, i) => (v > xs[b] ? i : b), 0);
export const argmin = (xs: number[]) => xs.reduce((b, v, i) => (v < xs[b] ? i : b), 0);
