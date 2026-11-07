import { describe, it, expect } from 'vitest';
import { validateVideo, speedReadiness, videoTimingSchema } from '@/lib/swing-schema';

describe('Swing submission rules', () => {
  it('never treats 240 fps encoded playback as verified camera speed', () => {
    expect(speedReadiness(240, false)).toBe(false);
    expect(videoTimingSchema.safeParse({ duration: 5, encodedFps: 240, captureVerified: true }).success).toBe(false);
  });
  it('requires at least 60 fps even when timing is verified', () => {
    expect(speedReadiness(30, true)).toBe(false);
    expect(speedReadiness(60, true)).toBe(true);
  });
  it('rejects oversized and non-video uploads', () => {
    expect(() => validateVideo({ name: 'swing.mp4', type: 'video/mp4', size: 50 * 1024 * 1024 + 1 })).toThrow();
    expect(() => validateVideo({ name: 'swing.txt', type: 'text/plain', size: 100 })).toThrow();
    expect(validateVideo({ name: 'swing.mp4', type: 'video/mp4', size: 100 }).mime).toBe('video/mp4');
  });
});