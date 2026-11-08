import type { CSSProperties } from 'react';
/** Displayed picture rect of an object-contain video, relative to its box; undefined until the video has a size. */
export function videoContentBox(boxW: number, boxH: number, vw: number, vh: number): CSSProperties | undefined {
  if (!vw || !vh || !boxW || !boxH) return undefined;
  const scale = Math.min(boxW / vw, boxH / vh), w = vw * scale, h = vh * scale;
  return { left: (boxW - w) / 2, top: (boxH - h) / 2, width: w, height: h };
}
