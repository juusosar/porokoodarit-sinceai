import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CARDS, QuickCard } from '@/components/QuickCard';
import { fittingSchema } from '@/lib/fitting-schema';

afterEach(cleanup);

it.each(['Better golf is on the menu', 'Same game, same swagger', 'My best golf might be behind me'])('saves the explicit development intention: %s', (goal) => {
  const game = CARDS.find(card => card.id === 2);
  if (!game) throw new Error('Game card missing');
  const submit = vi.fn();
  render(<QuickCard card={game} onSubmit={submit} />);
  expect(screen.getByRole('button', { name: "That's me" })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '>92' }));
  fireEvent.click(screen.getByRole('button', { name: goal }));
  fireEvent.click(screen.getByRole('button', { name: "That's me" }));
  expect(submit).toHaveBeenCalledOnce();
  const answers = submit.mock.calls[0]?.[0];
  expect(answers.development).toEqual({ value: goal, status: 'sure' });
  const saved = fittingSchema.parse(JSON.parse(JSON.stringify({
    messages: [], cardIdx: 2, cardAnswers: answers, overrides: {}, profile: answers, resolved: [], confirmed: false,
  })));
  expect(saved.cardAnswers['development']?.value).toBe(goal);
  expect(saved.profile['development']).toEqual({ value: goal, status: 'sure' });
});