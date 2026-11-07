// Was Lovable Cloud server functions; now browser storage with the same call shape.
import { fittingSchema, sessionTokenSchema } from "./fitting-schema";
import { readLocal, writeLocal } from "./local-store";

export async function readFitting({ data }: { data: { token: string } }): Promise<string | null> {
  const token = sessionTokenSchema.parse(data.token);
  const raw = readLocal<unknown>("fitting", token);
  if (!raw) return null;
  const parsed = fittingSchema.safeParse(raw);
  return parsed.success ? JSON.stringify(parsed.data) : null;
}

export async function saveFitting({ data }: { data: { token: string; snapshot: string } }): Promise<{ saved: true }> {
  const token = sessionTokenSchema.parse(data.token);
  const snapshot = fittingSchema.parse(JSON.parse(data.snapshot));
  writeLocal("fitting", token, snapshot);
  return { saved: true };
}
