import { expect, it } from 'vitest';
import { headSelectionSchema } from '@/lib/head-selection-schema';

const specs = { shaft: 'KBS Tour R steel', length: 'Standard', lie: '+1° upright', grip: 'Standard', purchase: 'Custom' };

it('cannot serialize a selection as an order or an assembly confirmation', () => {
  expect(headSelectionSchema.safeParse({ head: '101-mkii', specs, status: 'ordered', selectedAt: '2026-11-07T11:00:00Z' }).success).toBe(false);
  expect(headSelectionSchema.safeParse({ head: '101-mkii', specs, status: 'saved_selection', selectedAt: '2026-11-07T11:00:00Z' }).success).toBe(true);
});
it('only accepts heads the engine knows', () => {
  expect(headSelectionSchema.safeParse({ head: '101', specs, status: 'saved_selection', selectedAt: '2026-11-07T11:00:00Z' }).success).toBe(false);
});
