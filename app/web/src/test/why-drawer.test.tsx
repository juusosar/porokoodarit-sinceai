import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { NextSteps, WhyDrawer } from '../components/FittingData';
import type { FitState, PartState } from '../types/fit-state';

const lie = {
  part: 'lie', label: '-1°', value: -1, confidence: 0.7,
  inputs: [
    { input: 'lie_need_deg', label: 'Ball-line test', value: '-1.2°', source: 'measured', method: 'ball_line_tap_n5', weight: 0.81 },
    { input: 'lie_need_deg', label: 'Height + wrist-to-floor chart', value: '+0.3°', source: 'estimated', method: 'static_chart', weight: 0.19 },
  ],
} as unknown as PartState;

it('lists each input with its source and share', () => {
  render(<WhyDrawer part={lie} />);
  expect(screen.getByText('Ball-line test')).toBeTruthy();
  expect(screen.getByText('81%')).toBeTruthy();
  expect(screen.getByText('measured')).toBeTruthy();
});

it('renders nothing without inputs', () => {
  const { container } = render(<WhyDrawer part={{ ...lie, inputs: [] }} />);
  expect(container.innerHTML).toBe('');
});

it('shows the top next steps as plain lines', () => {
  const state = { next_steps: [
    { input: 'ball_line_test', parts: ['lie'], gain: 0.4, code: 'NEXT_BALL_LINE' },
    { input: 'launch_monitor', parts: ['shaft', 'head'], gain: 0.3, code: 'NEXT_LAUNCH_MONITOR' },
    { input: 'height', parts: ['length'], gain: 0.1, code: 'NEXT_HEIGHT' },
  ] } as unknown as FitState;
  render(<NextSteps state={state} />);
  expect(screen.getByText(/ball-line test \(five shots/)).toBeTruthy();
  expect(screen.getByText(/Firms up: shaft, head/)).toBeTruthy();
  expect(screen.queryByText(/Your height/)).toBeNull();
});
