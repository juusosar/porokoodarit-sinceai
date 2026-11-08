import { describe, expect, it } from "vitest";
import { convertLengths, fmtCm } from "./units";

describe("convertLengths", () => {
  it("metric: inches and feet to cm", () => {
    expect(convertLengths("+0.5 in", "metric")).toBe("+1.3 cm");
    expect(convertLengths("length: +0.5 in from height 5'11\"", "metric")).toBe("length: +1.3 cm from height 180 cm");
    expect(convertLengths("hands to club head 30.2 in", "metric")).toBe("hands to club head 77 cm");
    expect(convertLengths("-1 in", "metric")).toBe("−2.5 cm");
  });
  it("metric: leaves words and other units alone", () => {
    expect(convertLengths("Standard", "metric")).toBe("Standard");
    expect(convertLengths("1 in the bag, 75 mph, 7-iron, 31°", "metric")).toBe("1 in the bag, 75 mph, 7-iron, 31°");
    expect(convertLengths("178 cm", "metric")).toBe("178 cm");
    expect(convertLengths('Priorities: "140"', "metric")).toBe('Priorities: "140"');
  });
  it("review cases: quotes, prepositions, ranges, fractions", () => {
    for (const t of [`Slice, "can't carry past 140"`, "You said “my best is 150”", "1 in 3 golfers", "Keep 1 in mind", "5 in 10 shots", "shoot 85 in tournaments", "carry 150 in calm conditions", "1 in each", "1/2 in", "you said ‘8’ and"])
      expect(convertLengths(t, "metric")).toBe(t);
    expect(convertLengths("36–37 in", "metric")).toBe("91–94 cm");
    expect(convertLengths("0.5-1 in longer", "metric")).toBe("1.3–2.5 cm longer");
    expect(convertLengths("I am 5'10'' tall", "metric")).toBe("I am 178 cm tall");
    expect(convertLengths("Standard length would be 0.5 in shorter", "metric")).toBe("Standard length would be 1.3 cm shorter");
    expect(convertLengths("+0.5 in (stock Standard)", "metric")).toBe("+1.3 cm (stock Standard)");
  });
  it("imperial: cm and m to in / ft", () => {
    expect(convertLengths("Height: 178 cm, wrist 86 cm", "imperial")).toBe("Height: 5'10\", wrist 33.9 in");
    expect(convertLengths("hand 18.9 cm", "imperial")).toBe("hand 7.4 in");
    expect(convertLengths("travel 1.21 m, speed 9.5 m/s, 75 mph", "imperial")).toBe("travel 47.6 in, speed 9.5 m/s, 75 mph");
    expect(convertLengths("1.80 m tall, carry 140 m", "imperial")).toBe("70.9 in tall, carry 140 m");
    expect(convertLengths("170–180 cm", "imperial")).toBe("5'7\"–5'11\"");
    expect(convertLengths("+0.5 in", "imperial")).toBe("+0.5 in");
  });
  it("fmtCm", () => {
    expect(fmtCm(180.3, "imperial")).toBe("5'11\"");
    expect(fmtCm(86, "metric")).toBe("86 cm");
  });
});
