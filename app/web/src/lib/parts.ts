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
