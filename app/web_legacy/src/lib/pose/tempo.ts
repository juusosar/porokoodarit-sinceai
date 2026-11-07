// Swing tempo from the lead wrist's vertical image position (y down, any unit).
// Port of TAKOMO_FITTING_LAB_2026 camera/tempo.py (MIT, Since AI ry); same thresholds.

export type Tempo = {
  takeawayFrame: number;
  topFrame: number;
  impactFrame: number;
  backswingS: number;
  downswingS: number;
  ratio: number | null;
  frameUncertaintyS: number;
};

function smooth(y: number[], k: number): number[] {
  if (k <= 1) return y.slice();
  const left = Math.floor(k / 2);
  const right = k - 1 - left;
  const padded = [...Array(left).fill(y[0]), ...y, ...Array(right).fill(y[y.length - 1])];
  const out: number[] = [];
  for (let i = 0; i < y.length; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += padded[i + j];
    out.push(s / k);
  }
  return out;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function tempoFromWristY(y: number[], fps: number, stillPx?: number): Tempo {
  const k = Math.max(1, Math.round(fps / 60));
  const ys = smooth(y, k);
  const n0 = Math.max(3, Math.floor(0.15 * fps));
  const address = median(ys.slice(0, n0));
  const minY = Math.min(...ys);
  const span = address - minY;
  if (!(span > 0)) throw new Error("no backswing found (wrist never rises)");
  const thr = stillPx ?? 0.04 * span;
  let takeaway = ys.findIndex((v) => address - v > thr);
  if (takeaway < 0) throw new Error("no backswing found");
  while (takeaway > 0 && address - ys[takeaway - 1] > 0.005 * span) takeaway--;

  const w = Math.max(2, Math.floor(0.15 * fps));
  let top = -1;
  for (let i = takeaway + 1; i < ys.length - 1; i++) {
    const lo = Math.max(takeaway, i - w);
    const hi = Math.min(ys.length, i + w + 1);
    const winMin = Math.min(...ys.slice(lo, hi));
    if (ys[i] <= winMin && address - ys[i] > 0.5 * span) {
      top = i;
      break;
    }
  }
  if (top < 0) top = ys.indexOf(minY);

  const end = Math.min(ys.length, top + Math.floor(0.6 * fps) + 1);
  let impact = top;
  for (let i = top; i < end; i++) if (ys[i] > ys[impact]) impact = i;

  const back = (top - takeaway) / fps;
  const down = (impact - top) / fps;
  return {
    takeawayFrame: takeaway,
    topFrame: top,
    impactFrame: impact,
    backswingS: round4(back),
    downswingS: round4(down),
    ratio: down > 0 ? Math.round((back / down) * 100) / 100 : null,
    frameUncertaintyS: round4(1 / fps),
  };
}
