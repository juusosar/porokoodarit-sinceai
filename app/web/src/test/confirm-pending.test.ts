import { describe, expect, it } from "vitest";
import { FIX_TEXT, confirmPending } from "@/hooks/use-host-chat";
import type { UIMessage } from "@/lib/fitting-schema";

let n = 0;
const u = (text: string): UIMessage => ({ id: `u${n++}`, role: "user", parts: [{ type: "text", text }] });
const a = (text: string, id = `a${n++}`): UIMessage => ({ id, role: "assistant", parts: [{ type: "text", text }] });
const summary = [u("[Card 4: What bugs you] Slice"), a("Here's what I've got. Did I get that right?")];

describe("confirmPending", () => {
  it("shows Yes/No after the summary", () => {
    expect(confirmPending(summary)).toBe(true);
  });
  it("keeps Yes/No after answering a question in between", () => {
    expect(confirmPending([...summary, u("What is lie angle?"), a("It's the angle of the sole to the shaft.")])).toBe(true);
  });
  it("hides Yes/No while a reply is pending", () => {
    expect(confirmPending([...summary, u("What is lie angle?")])).toBe(false);
  });
  it("hides Yes/No after No until a new summary", () => {
    const fix = [...summary, u(FIX_TEXT), a("Which part is off?")];
    expect(confirmPending(fix)).toBe(false);
    expect(confirmPending([...fix, u("Carry is 150"), a("150 it is. Did I get that right?")])).toBe(true);
  });
  it("shows Yes/No after an offline line, and after a question that follows it", () => {
    const off = [u("[Card 4: What bugs you] Slice"), a("Lost the signal", "local-1")];
    expect(confirmPending(off)).toBe(true);
    expect(confirmPending([...off, u("what happens next?"), a("You'll film a swing next.")])).toBe(true);
  });
  it("shows Yes/No after a question that follows No (golfer never stranded)", () => {
    expect(confirmPending([...summary, u(FIX_TEXT), a("Which part?"), u("what is wrist to floor?"), a("Wrist crease to floor.")])).toBe(true);
  });
  it("reads a typed No like the button", () => {
    expect(confirmPending([...summary, u("no, something's off"), a("Which part?")])).toBe(false);
  });
});
