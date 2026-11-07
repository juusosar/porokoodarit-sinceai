import { describe, it, expect } from 'vitest';
import { validateVideo, speedReadiness, videoTimingSchema } from '@/lib/swing-schema';
import { hasVideoSignature } from '@/lib/swing.server';

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
  it('rejects disguised video payloads', () => {
    expect(hasVideoSignature(new TextEncoder().encode('not a video'), 'video/mp4')).toBe(false);
    expect(hasVideoSignature(new Uint8Array([0,0,0,24,102,116,121,112]), 'video/mp4')).toBe(true);
  });
});