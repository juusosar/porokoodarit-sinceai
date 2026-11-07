import { z } from "zod";

/** Chat message shape (was the AI SDK's UIMessage): text plus the host's structured profile/recheck parts. */
export type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool-update_profile"; toolCallId: string; input: Record<string, { value: string; status: "sure" | "guess" }> }
  | { type: "tool-ask_recheck"; toolCallId: string; input: { field: string; reason: string } };
export type UIMessage = { id: string; role: "user" | "assistant" | "system"; parts: MessagePart[] };

export const profileSchema = z.record(z.string().max(40), z.object({
  value: z.string().max(500),
  status: z.enum(["sure", "guess"]),
}));
export type Profile = z.infer<typeof profileSchema>;

const messageSchema = z.custom<UIMessage>((value) => {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<UIMessage>;
  return typeof m.id === "string" && ["user", "assistant", "system"].includes(m.role ?? "") && Array.isArray(m.parts);
});

export const fittingSchema = z.object({
  messages: z.array(messageSchema).max(200),
  cardIdx: z.number().int().min(0).max(4),
  cardAnswers: profileSchema,
  overrides: profileSchema,
  profile: profileSchema,
  resolved: z.array(z.string()).max(200),
  confirmed: z.boolean(),
});
export type FittingSnapshot = z.infer<typeof fittingSchema>;
export const sessionTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);