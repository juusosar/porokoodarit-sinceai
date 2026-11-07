import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { fittingSchema, sessionTokenSchema } from "./fitting-schema";

export const readFitting = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: sessionTokenSchema }))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.token));
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("fitting_sessions").select("snapshot").eq("session_hash", hash).maybeSingle();
    if (error) throw new Error("Your fitting couldn't be loaded. Please try again.");
    return row ? JSON.stringify(fittingSchema.parse(row.snapshot)) : null;
  });

export const saveFitting = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: sessionTokenSchema, snapshot: z.string().max(500_000) }))
  .handler(async ({ data }) => {
    const snapshot = fittingSchema.parse(JSON.parse(data.snapshot));
    setResponseHeader("Cache-Control", "no-store");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.token));
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("fitting_sessions").upsert({
      session_hash: hash,
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Your fitting couldn't be saved. Please try again.");
    return { saved: true };
  });