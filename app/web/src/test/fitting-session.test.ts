import { beforeEach, describe, expect, it } from "vitest";
import { getFittingToken, startNewFitting } from "@/lib/fitting-session";
import { fittingSchema } from "@/lib/fitting-schema";

describe("Fitting persistence", () => {
  beforeEach(() => localStorage.clear());
  it("starts a separate demo identity instead of reusing previous answers", () => {
    const previous = getFittingToken();
    const fresh = startNewFitting();
    expect(fresh).toMatch(/^[a-f0-9]{64}$/);
    expect(fresh).not.toBe(previous);
    expect(getFittingToken()).toBe(fresh);
  });
  it("keeps the same fitting identity across pages", () => {
    const first = getFittingToken();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(getFittingToken()).toBe(first);
  });
  it("round-trips answers, corrected profile, and conversation for results", () => {
    const saved = fittingSchema.parse(JSON.parse(JSON.stringify({
      messages: [{ id: "answer", role: "user", parts: [{ type: "text", text: "My carry is 130 yd" }] }],
      cardIdx: 4, cardAnswers: { carry: { value: "185 yd", status: "sure" } },
      overrides: { carry: { value: "130 yd", status: "sure" } },
      profile: { carry: { value: "130 yd", status: "sure" }, wants: { value: "Forgiveness", status: "guess" } },
      resolved: ["recheck-1"], confirmed: true,
    })));
    expect(saved.profile['carry']?.value).toBe("130 yd");
    expect(saved.cardAnswers['carry']?.value).toBe("185 yd");
    expect(saved.profile['wants']?.status).toBe("guess");
    expect(saved.messages[0]?.parts).toEqual([{ type: "text", text: "My carry is 130 yd" }]);
    expect(saved.confirmed).toBe(true);
    expect(saved.resolved).toEqual(["recheck-1"]);
  });
});