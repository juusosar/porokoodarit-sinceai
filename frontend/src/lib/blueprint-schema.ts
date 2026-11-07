import { z } from 'zod';
import type { Profile } from './fitting-schema';
import type { Enrichment } from './enrichment-schema';

export const specsSchema = z.object({
  material: z.enum(['Steel', 'Graphite']).nullable(),
  flex: z.enum(['Light', 'Regular', 'Stiff', 'Extra stiff']).nullable(),
  weight: z.number().finite().int().min(60).max(130).nullable(),
  length: z.number().finite().min(-1.5).max(1.5).multipleOf(0.5).nullable(),
  lie: z.number().finite().int().min(-3).max(3).nullable(),
  grip: z.enum(['Undersize', 'Standard', 'Midsize']).nullable(),
});
export type Specs = z.infer<typeof specsSchema>;
export const emptySpecs: Specs = { material: null, flex: null, weight: null, length: null, lie: null, grip: null };
export const blueprintSchema = z.object({
  ruleVersion: z.literal('pending-validation-v1'),
  baseline: specsSchema,
  overrides: specsSchema.partial(),
});
export type Blueprint = z.infer<typeof blueprintSchema>;
export type SpecOverrides = Blueprint['overrides'];

// No validated Takomo mapping is configured: never substitute example specs.
export function calculateBaseline(_profile: Profile, _extras: Enrichment | null): Specs { return { ...emptySpecs }; }
export function initialBlueprint(profile: Profile, extras: Enrichment | null): Blueprint {
  return { ruleVersion: 'pending-validation-v1', baseline: calculateBaseline(profile, extras), overrides: {} };
}
export function effectiveSpecs(value: Blueprint): Specs {
  const pick = <K extends keyof Specs>(key: K): Specs[K] => value.overrides[key] === undefined ? value.baseline[key] : value.overrides[key] as Specs[K];
  return { material: pick('material'), flex: pick('flex'), weight: pick('weight'), length: pick('length'), lie: pick('lie'), grip: pick('grip') };
}
export function resetBlueprint(value: Blueprint): Blueprint { return { ...value, baseline: { ...value.baseline }, overrides: {} }; }
export function weightPosition(weight: number): number { return ((z.number().min(60).max(130).parse(weight) - 60) / 70) * 100; }
export function formatLength(value: number | null) { return value === null ? 'Not determined yet' : value === 0 ? 'Standard length' : `${value > 0 ? '+' : ''}${value}" ${value > 0 ? 'over' : 'under'} standard`; }
export function formatLie(value: number | null) { return value === null ? 'Not determined yet' : value === 0 ? 'Standard lie' : `${Math.abs(value)}° ${value > 0 ? 'upright' : 'flat'}`; }