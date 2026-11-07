import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CARDS, QuickCard } from '../components/QuickCard';

const basics = () => {
  const card = CARDS.find(c => c.id === 1);
  if (!card) throw new Error('Missing basics card');
  return card;
};

it('collects basics without age; choices need a tap, untouched sliders are a guess', () => {
  expect(CARDS.flatMap(card => card.questions).some(question => question.key === 'age')).toBe(false);
  const submit = vi.fn();
  render(<QuickCard card={basics()} onSubmit={submit} />);
  const go = screen.getByRole('button', { name: "That's me" });
  expect(go).toBeDisabled(); // nothing preselected
  fireEvent.click(screen.getByRole('button', { name: 'Right' }));
  fireEvent.click(screen.getByRole('button', { name: 'Male' }));
  fireEvent.click(go);
  expect(submit).toHaveBeenCalledWith({
    hand: { value: 'Right', status: 'sure' },
    sex: { value: 'Male', status: 'sure' },
    rounds: { value: 'Not sure', status: 'guess' },
  });
});

it('a moved slider is the golfer’s answer', () => {
  const submit = vi.fn();
  render(<QuickCard card={basics()} onSubmit={submit} />);
  fireEvent.click(screen.getByRole('button', { name: 'Left' }));
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  fireEvent.change(screen.getByRole('slider', { name: 'Rounds / year' }), { target: { value: '30' } });
  fireEvent.click(screen.getByRole('button', { name: "That's me" }));
  expect(submit.mock.calls[0][0].rounds).toEqual({ value: '30', status: 'sure' });
});
