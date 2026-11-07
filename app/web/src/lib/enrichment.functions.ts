// Was Lovable Cloud server functions; now browser storage with the same call shape.
import { sessionTokenSchema } from "./fitting-schema";
import { activeEnrichment, enrichmentSchema, type Enrichment } from "./enrichment-schema";
import { readLocal, writeLocal } from "./local-store";

export async function readEnrichment({ data }: { data: { token: string } }): Promise<Enrichment | null> {
  const raw = readLocal<unknown>("enrichment", sessionTokenSchema.parse(data.token));
  const parsed = enrichmentSchema.safeParse(raw);
  return raw && parsed.success ? parsed.data : null;
}

export async function saveEnrichment({ data }: { data: { token: string; payload: Enrichment } }): Promise<Enrichment> {
  const payload = activeEnrichment(enrichmentSchema.parse(data.payload));
  writeLocal("enrichment", sessionTokenSchema.parse(data.token), payload);
  return payload;
}
