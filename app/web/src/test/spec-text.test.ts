import { expect, it } from 'vitest';
import { specText } from '../lib/spec-text';

it('builds a pasteable spec, saying what is not determined (POR-39)', () => {
  const t = specText('201 MKII', { shaft: 'KBS Tour R steel', length: 'Standard', lie: '+1°', grip: 'Midsize', purchase: 'Custom' } );
  expect(t.split('\n')).toEqual(['My Takomo fit', 'Head: 201 MKII', 'Shaft: KBS Tour R steel', 'Length: Standard', 'Lie: +1°', 'Grip: Midsize', 'Stock or custom: Custom']);
  expect(specText('101 MKII', { shaft: null, length: null, lie: null, grip: null, purchase: null } as never)).toContain('Shaft: not determined yet');
});
