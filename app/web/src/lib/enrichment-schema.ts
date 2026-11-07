import { z } from 'zod';

const optionalNumber = (max: number) => z.number().finite().positive().max(max).nullable();
export const enrichmentSchema = z.object({
  skipped: z.boolean(),
  club: z.enum(['7-iron', 'other']),
  unit: z.enum(['yd', 'm']),
  speed: optionalNumber(200),
  carry: optionalNumber(500 / 0.9144),
  launch: z.number().finite().min(0).max(90).nullable(),
  spin: optionalNumber(20000),
  landing: z.number().finite().min(10).max(70).nullable().default(null),
  source: z.literal('manual'),
  impactEnabled: z.boolean(),
  impact: z.enum(['heel', 'center', 'toe']).nullable(),
  /** Ball-line test: tilt per shot in degrees (+ = mark leans toward the toe). Photos never leave the device. */
  ballLine: z.array(z.number().finite().min(-25).max(25)).max(10).default([]),
}).superRefine((value, ctx) => {
  if (value.carry !== null && value.carry > carryLimit(value.unit)) ctx.addIssue({ code: 'custom', path: ['carry'], message: 'Carry exceeds the supported measurement range.' });
});
export type Enrichment = z.infer<typeof enrichmentSchema>;
export const emptyEnrichment: Enrichment = { skipped: false, club: '7-iron', unit: 'yd', speed: null, carry: null, launch: null, spin: null, landing: null, source: 'manual', impactEnabled: false, impact: null, ballLine: [] };
export function convertCarry(value: number, from: 'm' | 'yd', to: 'm' | 'yd') { return from === to ? value : from === 'm' ? value / 0.9144 : value * 0.9144; }
export function carryLimit(unit: 'm' | 'yd') { return unit === 'm' ? 500 : 500 / 0.9144; }
export function activeEnrichment(value: Enrichment): Enrichment {
  return value.skipped ? { ...emptyEnrichment, skipped: true } : { ...value, impact: value.impactEnabled ? value.impact : null };
}
export function lieAdjustmentFromImpact(_impact: Enrichment['impact']) { return 0; }
export function trackmanLinkMessage(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !(url.hostname === 'trackmangolf.com' || url.hostname.endsWith('.trackmangolf.com')) || url.username || url.password) return 'Use an HTTPS TrackMan report link.';
    return 'TrackMan link import is not connected yet. Enter your report numbers below—we won’t ask for your TrackMan password.';
  } catch { return 'Use a complete HTTPS TrackMan report link.'; }
}