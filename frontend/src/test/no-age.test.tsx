import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CARDS, QuickCard } from '../components/QuickCard';

it('collects basics without age and allows confirmation without it', () => {
  const basics = CARDS.find(card => card.id === 1);
  if (!basics) throw new Error('Missing basics card');
  expect(CARDS.flatMap(card => card.questions).some(question => question.key === 'age')).toBe(false);
  const submit = vi.fn();
  render(<QuickCard card={basics} onSubmit={submit} />);
  fireEvent.click(screen.getByRole('button', { name: "That's me" }));
  expect(submit).toHaveBeenCalledWith({
    hand: { value: 'Right', status: 'sure' },
    sex: { value: 'Male', status: 'sure' },
    rounds: { value: '20', status: 'sure' },
  });
});