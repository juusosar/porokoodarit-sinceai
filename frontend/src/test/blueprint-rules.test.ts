import { expect, it } from 'vitest';
import { calculateBaseline, emptySpecs, effectiveSpecs, resetBlueprint, specsSchema, weightPosition, type Blueprint } from '@/lib/blueprint-schema';
import { emptyEnrichment } from '@/lib/enrichment-schema';

it.each([[60, 0], [95, 50], [130, 100]])('positions %ig at %i percent of the 60–130g scale', (weight, position) => {
  expect(weightPosition(weight)).toBe(position);
});
it('rejects weights outside 60–130g', () => {
  expect(specsSchema.safeParse({ ...emptySpecs, weight: 59 }).success).toBe(false);
  expect(specsSchema.safeParse({ ...emptySpecs, weight: 131 }).success).toBe(false);
});
it('keeps calculated baselines immutable while overriding and resetting', () => {
  const baseline = Object.freeze({ ...emptySpecs, weight: 95 });
  const blueprint: Blueprint = { baseline, ruleVersion: 'pending-validation-v1', overrides: { weight: 110 } };
  expect(effectiveSpecs(blueprint).weight).toBe(110);
  expect(resetBlueprint(blueprint).overrides).toEqual({});
  expect(resetBlueprint(blueprint).baseline.weight).toBe(95);
  expect(blueprint.overrides.weight).toBe(110);
  expect(baseline.weight).toBe(95);
});
it('does not fabricate shaft, geometry or grip mappings from self-reports', () => {
  expect(calculateBaseline({ height: { value: '178 cm', status: 'sure' }, glove: { value: 'M', status: 'sure' } }, { ...emptyEnrichment, speed: 78, impactEnabled: true, impact: 'toe' })).toEqual(emptySpecs);
});
it('keeps missing or skipped measurements from becoming recommendations', () => {
  expect(calculateBaseline({}, null)).toEqual(emptySpecs);
  expect(calculateBaseline({}, { ...emptyEnrichment, skipped: true, speed: 78 })).toEqual(emptySpecs);
});
it('enforces buildable length and lie adjustment increments', () => {
  expect(specsSchema.safeParse({ ...emptySpecs, length: 0.25 }).success).toBe(false);
  expect(specsSchema.safeParse({ ...emptySpecs, lie: 4 }).success).toBe(false);
  expect(specsSchema.safeParse({ ...emptySpecs, length: 0.5, lie: 1 }).success).toBe(true);
});