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

it('fits the guide to the letterboxed picture, not the whole box', async () => {
  const { videoContentBox } = await import('@/lib/video-box');
  // 16:9 stream in a 300x400 (3:4) box: picture is full width, centred vertically.
  expect(videoContentBox(300, 400, 1920, 1080)).toEqual({ left: 0, top: 115.625, width: 300, height: 168.75 });
  // Portrait stream in a 16:9 box: full height, centred horizontally.
  expect(videoContentBox(640, 360, 1080, 1920)).toEqual({ left: 218.75, top: 0, width: 202.5, height: 360 });
  expect(videoContentBox(300, 400, 0, 0)).toBeUndefined();
});
