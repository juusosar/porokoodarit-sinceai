import { describe, expect, it } from 'vitest';
import { activeEnrichment, convertCarry, emptyEnrichment, enrichmentSchema, lieAdjustmentFromImpact, trackmanLinkMessage } from '../lib/enrichment-schema';
describe('optional enrichment rules', () => {
  it('converts one yard to exactly 0.9144 metres', () => { expect(convertCarry(1, 'yd', 'm')).toBe(0.9144); expect(convertCarry(0.9144, 'm', 'yd')).toBe(1); });
  it('accepts the same maximum carry after converting 500 metres to yards', () => {
    expect(enrichmentSchema.safeParse({ ...emptyEnrichment, carry: 500, unit: 'm' }).success).toBe(true);
    expect(enrichmentSchema.safeParse({ ...emptyEnrichment, carry: convertCarry(500, 'm', 'yd'), unit: 'yd' }).success).toBe(true);
    expect(enrichmentSchema.safeParse({ ...emptyEnrichment, carry: 501, unit: 'm' }).success).toBe(false);
  });
  it('retains absent measurements as null, not zero', () => { expect(enrichmentSchema.parse(emptyEnrichment).speed).toBeNull(); expect(enrichmentSchema.safeParse({ ...emptyEnrichment, speed: 0 }).success).toBe(false); });
  it('skipping excludes all extra measurements', () => { const value = activeEnrichment({ ...emptyEnrichment, skipped: true, speed: 80, impactEnabled: true, impact: 'toe' }); expect(value.speed).toBeNull(); expect(value.impact).toBeNull(); });
  it('disabling impact excludes the observation', () => { expect(activeEnrichment({ ...emptyEnrichment, impact: 'heel' }).impact).toBeNull(); });
  it('does not change lie by one degree from heel or toe alone', () => { expect(lieAdjustmentFromImpact('heel')).toBe(0); expect(lieAdjustmentFromImpact('toe')).toBe(0); });
  it('rejects lookalike and non-HTTPS links', () => { expect(trackmanLinkMessage('https://trackmangolf.com.evil.test')).toBe('Use an HTTPS TrackMan report link.'); expect(trackmanLinkMessage('http://portal.trackmangolf.com')).toBe('Use an HTTPS TrackMan report link.'); });
});