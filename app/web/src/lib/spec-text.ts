import type { SelectionSpecs } from "./head-selection-schema";

/** Plain-text spec the golfer can paste into Takomo's order notes or chat (until cart links carry it). */
export function specText(headName: string, specs: SelectionSpecs): string {
  const rows: [string, string | null][] = [
    ["Head", headName],
    ["Shaft", specs.shaft],
    ["Length", specs.length],
    ["Lie", specs.lie],
    ["Grip", specs.grip],
    ["Stock or custom", specs.purchase],
  ];
  return ["My Takomo fit", ...rows.map(([k, v]) => `${k}: ${v ?? "not determined yet"}`)].join("\n");
}
