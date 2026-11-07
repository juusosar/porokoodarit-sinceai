import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BugsCard, REPLACE_CLUBS, showShotDetails } from '../components/BugsCard';

it('offers beginners all shot details on request and submits their selections', () => {
  const submit = vi.fn();
  render(<BugsCard score=">92" carryYd={110} onSubmit={submit} />);
  expect(screen.queryByRole('button', { name: 'Slice / shots leak right' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'My shots bug me too' }));
  fireEvent.click(screen.getByRole('button', { name: 'Slice / shots leak right' }));
  fireEvent.click(screen.getByRole('button', { name: REPLACE_CLUBS }));
  fireEvent.click(screen.getByRole('button', { name: "That's my game" }));
  expect(submit).toHaveBeenCalledWith(['Slice / shots leak right', REPLACE_CLUBS], '');
});
it('allows replacement alone without demanding detailed misses', () => {
  const submit = vi.fn();
  render(<BugsCard score=">92" onSubmit={submit} />);
  fireEvent.click(screen.getByRole('button', { name: REPLACE_CLUBS }));
  fireEvent.click(screen.getByRole('button', { name: "That's my game" }));
  expect(submit).toHaveBeenCalledWith([REPLACE_CLUBS], '');
});
it('shows shot problems immediately to more advanced golfers', () => {
  render(<BugsCard score="78–84" carryYd={150} onSubmit={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Slice / shots leak right' })).toBeVisible();
  expect(showShotDetails('85–92', 120)).toBe(false);
  expect(showShotDetails('85–92', 125)).toBe(true);
});