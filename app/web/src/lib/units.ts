// One app-wide unit choice for lengths (POR-48): metric = cm/m, imperial = in/ft. Stored on this device.
// Engine, API and LLM text keep their own units; screens pass display text through `convertLengths`.
import { useCallback, useSyncExternalStore } from "react";

export type Units = "metric" | "imperial";
const KEY = "takomo.units";
const IN_CM = 2.54;
const listeners = new Set<() => void>();

function defaultUnits(): Units {
  try {
    return /^en-(US|LR|MM)\b/i.test(navigator.language) ? "imperial" : "metric";
  } catch {
    return "metric";
  }
}

export function getUnits(): Units {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "metric" || v === "imperial") return v;
  } catch { /* storage blocked */ }
  return defaultUnits();
}

export function setUnits(u: Units) {
  try { localStorage.setItem(KEY, u); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) l(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

export function useUnits(): Units {
  return useSyncExternalStore(subscribe, getUnits, () => "metric");
}

/** `L(text)`: the text with every length in the chosen unit. Re-renders when the toggle changes. */
export function useLen(): (text: string | null | undefined) => string {
  const u = useUnits();
  return useCallback((text: string | null | undefined) => convertLengths(text ?? "", u), [u]);
}

const trim = (n: number, d: number) => String(Number(n.toFixed(d)));
const sign = (s: string) => (s === "+" ? "+" : s === "-" || s === "−" ? "−" : "");

/** cm -> display: heights (>= 120 cm) as 5'11" in imperial, other lengths in inches. */
export function fmtCm(cm: number, u: Units): string {
  const s = cm < 0 ? "−" : "";
  const a = Math.abs(cm);
  if (u === "metric") return `${s}${a < 20 ? trim(a, 1) : Math.round(a)} cm`;
  if (a >= 120) {
    const total = Math.round(a / IN_CM);
    return `${s}${Math.floor(total / 12)}'${total % 12}"`;
  }
  return `${s}${trim(a / IN_CM, a < IN_CM ? 2 : 1)} in`;
}

/** m -> display: metres or feet. */
export function fmtM(m: number, u: Units, d = 2): string {
  return u === "metric" ? `${trim(m, d)} m` : `${trim(m * 3.2808, 1)} ft`;
}

const NUM = String.raw`([+\-−]?)(\d+(?:\.\d+)?)`;
// "in" as a unit, not the word: not followed by an article or noun that makes it a preposition.
const IN_WORD = String.raw`in(?:ch(?:es)?)?\b(?!\s+(?:a|an|the|your|my|our|this|that|golf|total|stock)\b)`;
const FT_IN = /(?<![\w.])(\d)\s?(?:'|’|ft\b)\s?(?:(\d{1,2}(?:\.\d+)?)\s?(?:"|″|”|in\b)?)?(?![a-z])/g;
const INCH = new RegExp(String.raw`(?<![\w."“])${NUM}\s?(?:${IN_WORD}|″|”|"(?!\w))`, "g");
const CM = new RegExp(String.raw`(?<![\w.])${NUM}\s?cm\b`, "g");
const METRE = new RegExp(String.raw`(?<![\w.])${NUM}\s?m\b(?![/\w])`, "g");

/** Rewrite lengths in free text (engine labels, reasons, LLM replies, answers) into the chosen unit. */
export function convertLengths(text: string, u: Units): string {
  if (!text) return text;
  if (u === "metric") {
    return text
      .replace(FT_IN, (_m, ft: string, inch?: string) => fmtCm((Number(ft) * 12 + Number(inch ?? 0)) * IN_CM, u))
      .replace(INCH, (_m, s: string, n: string) => sign(s) + fmtCm(Number(n) * IN_CM, u));
  }
  return text
    .replace(CM, (_m, s: string, n: string) => sign(s) + fmtCm(Number(n), u))
    .replace(METRE, (_m, s: string, n: string) => sign(s) + fmtM(Number(n), u));
}
