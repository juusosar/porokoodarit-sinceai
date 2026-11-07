import { z } from "zod";

// Engine head ids (app/shared/fit_state.schema.json).
export const headIdSchema = z.enum(["101-mkii", "201-mkii", "201t-mkii", "301-cb", "301-mb"]);
export type HeadId = z.infer<typeof headIdSchema>;

/** Engine spec labels saved with a selection, e.g. shaft "KBS Tour R steel", lie "+1° upright". */
export const selectionSpecsSchema = z.object({
  shaft: z.string().max(80).nullable(),
  length: z.string().max(80).nullable(),
  lie: z.string().max(80).nullable(),
  grip: z.string().max(80).nullable(),
  purchase: z.string().max(80).nullable(),
});
export type SelectionSpecs = z.infer<typeof selectionSpecsSchema>;

export const headSelectionSchema = z.object({
  head: headIdSchema,
  specs: selectionSpecsSchema,
  status: z.literal("saved_selection"),
  selectedAt: z.string().datetime(),
});
export type HeadSelection = z.infer<typeof headSelectionSchema>;
