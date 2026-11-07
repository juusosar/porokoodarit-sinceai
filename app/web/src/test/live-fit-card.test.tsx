import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const postFit = vi.hoisted(() => vi.fn());
const path = vi.hoisted(() => ({ value: '/' }));
vi.mock('../lib/api', () => ({ postFit }));
vi.mock('@tanstack/react-router', () => ({ useRouterState: () => path.value }));
import { LiveFitCard, movedParts } from '../components/LiveFitCard';
import { startNewFitting } from '../lib/fitting-session';
import { writeLocal } from '../lib/local-store';
import type { FitState } from '../types/fit-state';

const part = (p: string, label: string, value: string | number | null = label) => ({ part: p, label, value, confidence: 0.5 });
const state = (shaft: string, changes: FitState['changes'] = []) =>
  ({ step: 'profile', parts: { shaft: part('shaft', shaft), hand: part('hand', 'Right') }, changes }) as unknown as FitState;
const save = (token: string, profile: Record<string, { value: string; status: 'sure' | 'guess' }>) =>
  writeLocal('fitting', token, { messages: [], cardIdx: 1, cardAnswers: profile, overrides: {}, profile, resolved: [], confirmed: false });

beforeEach(() => {
  postFit.mockReset();
  localStorage.clear();
  path.value = '/';
});

it('lists only parts that moved', () => {
  const st = state('R', [
    { part: 'shaft', before: 'S', after: 'R', confidence_after: 0.6 },
    { part: 'hand', before: null, after: 'Right', confidence_after: 0.9 },
  ]);
  expect(movedParts(st)).toEqual(['Shaft: S → R']);
});

it('runs the engine on saved answers and re-runs when they change, sending the previous state', async () => {
  const token = startNewFitting();
  postFit.mockResolvedValueOnce(state('Stiff')).mockResolvedValueOnce(state('Regular', [{ part: 'shaft', before: 'Stiff', after: 'Regular', confidence_after: 0.6 }]));
  render(<LiveFitCard />);
  act(() => save(token, { hand: { value: 'Right', status: 'sure' } }));
  await waitFor(() => expect(screen.getByTestId('live-part-shaft').textContent).toContain('Stiff'), { timeout: 2000 });
  act(() => save(token, { hand: { value: 'Right', status: 'sure' }, carry: { value: '120', status: 'sure' } }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Shaft: Stiff → Regular'), { timeout: 2000 });
  expect(postFit.mock.calls[1]![0].previous.parts.shaft.label).toBe('Stiff');
});

it('stays hidden on the final clubs page', async () => {
  path.value = '/clubs';
  const token = startNewFitting();
  save(token, { hand: { value: 'Right', status: 'sure' } });
  render(<LiveFitCard />);
  await new Promise((r) => setTimeout(r, 800));
  expect(postFit).not.toHaveBeenCalled();
  expect(screen.queryByTestId('live-fit-card')).toBeNull();
});
