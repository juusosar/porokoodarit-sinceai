import { z } from 'zod';
import type { Profile } from './fitting-schema';
import { specsSchema } from './blueprint-schema';

export const headIdSchema = z.enum(['101', '201']);
export type HeadId = z.infer<typeof headIdSchema>;
export const headSelectionSchema = z.object({ head: headIdSchema, specs: specsSchema, status: z.literal('saved_selection'), selectedAt: z.string().datetime() });
export type HeadSelection = z.infer<typeof headSelectionSchema>;

// A transparent browsing shortlist, not a calibrated match score or fitting engine.
export function shortlist(profile: Profile): HeadId[] {
  const wants = profile['wants']?.value.toLowerCase() ?? '';
  const score = profile['score']?.value ?? '';
  const forgivenessFirst = score === '>92' || score === '85–92' || /forgiv|distance|mishit/.test(wants);
  return forgivenessFirst || !/workab|control|feel/.test(wants) ? ['101', '201'] : ['201', '101'];
}
export function shortlistReason(profile: Profile, head: HeadId): string[] {
  const reasons = [head === '101' ? 'A forgiveness-focused head is a sensible place to start your comparison.' : 'A more compact head is worth comparing when control and shaping matter to you.'];
  if (profile['score']) reasons.push(`You reported a typical score of ${profile['score'].value}. This is a browsing guide, not a verified fit.`);
  if (profile['wants']) reasons.push(`Your priorities: ${profile['wants'].value}. Try both heads against those priorities.`);
  return reasons;
}