import { describe, expect, it } from "vitest";
import { CARDS, asksBallFlight } from "@/components/QuickCard";

describe("ball flight questions", () => {
  it("never includes tempo in any questionnaire card", () => expect(CARDS.flatMap(card => card.questions).some(question => question.key === "tempo")).toBe(false));
  it("skipped when score is over 92", () => expect(asksBallFlight(">92", 160)).toBe(false));
  it("skipped when 7-iron carry is short (120 yd)", () => expect(asksBallFlight("85–92", 120)).toBe(false));
  it("asked for a mid player with decent carry", () => expect(asksBallFlight("85–92", 140)).toBe(true));
});
