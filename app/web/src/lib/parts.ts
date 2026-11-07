import type { EvidenceSource } from "@/types/fit-state";

export const PARTS = [
  ["head", "Head"],
  ["shaft", "Shaft"],
  ["length", "Length"],
  ["lie", "Lie"],
  ["grip", "Grip"],
  ["hand", "Hand"],
  ["purchase", "Stock/custom"],
] as const;

export const EVIDENCE_LABEL: Record<EvidenceSource, string> = {
  measured: "measured",
  asked: "you said",
  estimated: "estimated",
  default: "typical",
};

/** Shown confidence: never 100 % (every input has noise), plus a plain word (POR-32). */
export const MAX_SHOWN_CONFIDENCE = 95;
export function confidenceView(c: number | undefined | null): { pct: number; word: string } {
  const pct = Math.min(MAX_SHOWN_CONFIDENCE, Math.round((c ?? 0) * 100));
  return { pct, word: pct >= 75 ? "Confident" : pct >= 50 ? "Likely" : "Close call" };
}
