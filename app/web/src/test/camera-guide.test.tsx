import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CameraGuide } from '@/components/swing/CameraGuide';

afterEach(cleanup);

it('draws the face-on guide by default and keeps it out of the way', () => {
  render(<CameraGuide />);
  const svg = screen.getByTestId('camera-guide-face-on');
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  expect(svg.getAttribute('class')).toContain('pointer-events-none');
});

it('draws the down-the-line guide', () => {
  render(<CameraGuide view="dtl" />);
  expect(screen.getByTestId('camera-guide-dtl')).toBeInTheDocument();
});
