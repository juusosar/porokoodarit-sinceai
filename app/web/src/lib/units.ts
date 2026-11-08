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

const N = String.raw`\d+(?:\.\d+)?`;
const NUM = String.raw`([+\-−]?)(${N})`;
// Optional range start ("170–180 cm", "0.5-1 in") so both ends convert.
const FROM = String.raw`(?:(${N})\s?[–-]\s?)?`;
// No number glued to a word, decimal or fraction ("7-iron" is fine: its unit never follows).
const EDGE = String.raw`(?<![\w./])`;
// "in" counts as inches only at the end of a phrase or before a length word: "1 in 3", "150 in calm" stay as words.
const IN_UNIT = String.raw`(?:inch(?:es)?\b|″|in\b(?=\s*(?:$|[.,;:!?()\]·/–-]|(?:shorter|longer|over|under|from|than|and|or|tall|long|length|of)\b)))`;
const FT_IN = /(?<![\w./])(\d)\s?(?:'|’|ft\b)\s?(\d{1,2}(?:\.\d+)?)\s?(?:''|"|″|”|in\b)?/g;
const INCH = new RegExp(String.raw`${EDGE}${FROM}${NUM}\s?${IN_UNIT}`, "g");
const CM = new RegExp(String.raw`${EDGE}${FROM}${NUM}\s?cm\b`, "g");
// Only body/club-sized metres (< 3 m); carry distances in metres are distances, not lengths.
const METRE = new RegExp(String.raw`${EDGE}${NUM}\s?m\b(?![/\w])`, "g");

// Range start without its unit when it's the same as the end's: "91–94 cm", "5'7"–5'11"".
const range = (from: string | undefined, conv: (n: number) => string) => (from ? `${conv(Number(from)).replace(/ (cm|in)$/, "")}–` : "");

/** Rewrite lengths in free text (engine labels, reasons, LLM replies, answers) into the chosen unit. */
export function convertLengths(text: string, u: Units): string {
  if (!text) return text;
  if (u === "metric") {
    return text
      .replace(FT_IN, (_m, ft: string, inch: string) => fmtCm((Number(ft) * 12 + Number(inch)) * IN_CM, u))
      .replace(INCH, (_m, from: string | undefined, s: string, n: string) =>
        range(from, (v) => fmtCm(v * IN_CM, u)) + sign(s) + fmtCm(Number(n) * IN_CM, u));
  }
  return text
    .replace(CM, (_m, from: string | undefined, s: string, n: string) => range(from, (v) => fmtCm(v, u)) + sign(s) + fmtCm(Number(n), u))
    .replace(METRE, (m, s: string, n: string) => (Number(n) < 3 ? `${sign(s)}${trim((Number(n) * 100) / IN_CM, 1)} in` : m));
}
