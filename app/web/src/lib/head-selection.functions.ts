// Was Lovable Cloud server functions; now browser storage with the same call shape.
import { sessionTokenSchema } from "./fitting-schema";
import { headIdSchema, headSelectionSchema, type HeadId, type HeadSelection, type SelectionSpecs } from "./head-selection-schema";
import { readLocal, writeLocal } from "./local-store";

export async function readHeadSelection({ data }: { data: { token: string } }): Promise<HeadSelection | null> {
  const raw = readLocal<unknown>("head", sessionTokenSchema.parse(data.token));
  const parsed = headSelectionSchema.safeParse(raw);
  return raw && parsed.success ? parsed.data : null;
}

/** Saves the chosen head with the engine's spec labels at the time of choosing. Not an order. */
export async function saveHeadSelection({
  data,
}: {
  data: { token: string; head: HeadId; specs: SelectionSpecs };
}): Promise<HeadSelection> {
  const payload = headSelectionSchema.parse({
    head: headIdSchema.parse(data.head),
    specs: data.specs,
    status: "saved_selection",
    selectedAt: new Date().toISOString(),
  });
  writeLocal("head", sessionTokenSchema.parse(data.token), payload);
  return payload;
}
