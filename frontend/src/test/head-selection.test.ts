import { expect, it } from 'vitest';
import { shortlist, headSelectionSchema } from '@/lib/head-selection-schema';
import { emptySpecs } from '@/lib/blueprint-schema';

it('shows no more than two unique heads for all supported score groups', () => {
  for (const score of ['<71', '71–77', '78–84', '85–92', '>92']) {
    const heads = shortlist({ score: { value: score, status: 'sure' } });
    expect(heads).toHaveLength(2);
    expect(new Set(heads).size).toBe(2);
  }
});
it('puts the forgiving comparison first for a >92 score', () => {
  expect(shortlist({ score: { value: '>92', status: 'sure' }, wants: { value: 'Workability', status: 'sure' } })[0]).toBe('101');
});
it('changes the browsing order for control priorities without pretending to calculate confidence', () => {
  expect(shortlist({ wants: { value: 'Workability, control', status: 'sure' } })[0]).toBe('201');
});
it('cannot serialize a selection as an order or an assembly confirmation', () => {
  expect(headSelectionSchema.safeParse({ head: '101', specs: emptySpecs, status: 'ordered', selectedAt: '2026-11-07T11:00:00Z' }).success).toBe(false);
  expect(headSelectionSchema.safeParse({ head: '101', specs: emptySpecs, status: 'saved_selection', selectedAt: '2026-11-07T11:00:00Z' }).success).toBe(true);
});