import { render, screen } from "@testing-library/react";
import { FitCardView } from "./FitCard";
import { renderReason } from "@/lib/reasons";
import type { FitState } from "@/types/fit-state";

const STATE: FitState = {
  step: "profile",
  buildable: true,
  parts: {
    length: {
      part: "length",
      value: 0.5,
      label: "+0.5 in",
      confidence: 0.7,
      evidence: ["asked"],
      reasons: [],
      close_call: { alternative: "Standard", margin: 1, unit: "cm" },
    },
  },
  changes: [{ part: "length", before: "Standard", after: "+0.5 in", confidence_after: 0.7 }],
};

test("fit card shows label, close call, evidence and pulses changed part", () => {
  render(<FitCardView state={STATE} />);
  const el = screen.getByTestId("part-length");
  expect(el.textContent).toContain("+0.5 in");
  expect(el.textContent).toContain("≈");
  expect(el.textContent).toContain("you said");
  expect(el.className).toContain("animate-part-pulse");
  expect(screen.getByTestId("part-head").textContent).toContain("—");
});

test("reason codes render with params, missing -> ?", () => {
  const txt = renderReason({ code: "CONTRADICTION", params: { asked: 70, asked_unit: "mph", measured: 92, unit: "mph" } });
  expect(txt).toBe("You said 70 mph, but we measured 92 mph. Which is right?");
  expect(renderReason({ code: "CONTRADICTION", params: {} })).toContain("?");
  expect(renderReason({ code: "NOPE" })).toBe("NOPE");
});
