import { describe, expect, it } from 'vitest';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { SENT_LANDMARKS, swingPayload } from '@/lib/swing-server';
import { toFitRequest } from '@/lib/fit-request';
import type { PoseFrame } from '@/lib/pose/analyze';

const lm = (i: number): NormalizedLandmark[] =>
  Array.from({ length: 33 }, (_, k) => ({ x: 0.1 + k / 100 + i / 1e6, y: 0.5 + 1 / 3, z: 0, visibility: 0.9 }));

describe('swingPayload (keypoints only)', () => {
  const frames: PoseFrame[] = [
    { t: 2, landmarks: lm(0) },
    { t: 2 + 1 / 30, landmarks: null },
    { t: 2 + 2 / 30, landmarks: lm(2) },
  ];
  const body = swingPayload(frames, { sampleFps: 30, slowMo: 8, width: 1080, height: 1920, heightCm: 180 });

  it('sends only the landmarks the API reads, rounded, null when no pose', () => {
    expect(Object.keys(body.pose.landmarks)).toEqual(SENT_LANDMARKS.map(String));
    expect(body.pose.landmarks['15'].x[0]).toBe(0.25);
    expect(body.pose.landmarks['15'].y[0]).toBe(0.8333);
    expect(body.pose.landmarks['15'].x[1]).toBeNull();
    expect(body.pose.landmarks['15'].v[1]).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/landmarks":\{[^}]*"33"/);
  });

  it('converts slow-motion media time to real swing time', () => {
    expect(body.pose.fps).toBe(240);
    expect(body.pose.t_ms).toEqual([0, 4.2, 8.3]);
    expect(body.height_cm).toBe(180);
  });
});

describe('toFitRequest with the server read', () => {
  it('adds the video speed as its own estimated measurement', () => {
    const r = toFitRequest('swing', {}, null, {
      filename: 's.mp4', size: 1, encodedFps: 30, analyzedAt: '2026-11-08T03:00:00Z', source: 'server',
      tempo: { backswingS: 0.8, downswingS: 0.26, ratio: 3.08, sd: 0.016 }, speed: { value: 72.4, sd: 12 },
    });
    expect(r.measurements?.backswing_s).toMatchObject({ value: 0.8, method: 'video_pose_server' });
    expect(r.measurements?.video_speed_7i_mph).toEqual({ value: 72.4, sd: 12, source: 'estimated', method: 'video_pendulum' });
    expect(r.measurements?.speed_7i_mph).toBeUndefined();
  });
});

describe('reading source + down-the-line samples', () => {
  it('says who read the swing and why the device was used', async () => {
    const { readingSource } = await import('@/lib/swing-server');
    expect(readingSource({ source: 'server', algorithm: 'main@7234843', notes: ['height_default'] })).toEqual({
      title: 'Read by our server from body keypoints (main@7234843)', detail: ['no height given, so speed is less certain'],
    });
    expect(readingSource({ source: 'device', fallback: 'unreachable' }).title).toBe('Read on this device (server not reachable)');
  });
  it('runs the club detector only on still frames before the takeaway, at most 40', async () => {
    const { addressSamples } = await import('@/lib/swing-dtl');
    expect(addressSamples(600, 20)).toEqual([0, 2, 5, 7, 10, 12, 15, 17]);
    expect(Math.max(...addressSamples(600, null))).toBeLessThan(40);
    expect(addressSamples(600, 3)).toEqual([0, 1, 2]);
  });
});

describe('every video data point shown', () => {
  const rec = {
    filename: 's.mp4', size: 1, encodedFps: 30, slowMo: 8, analyzedAt: '2026-11-08T03:00:00Z', source: 'server' as const,
    tempo: { backswingS: 0.9, downswingS: 0.3, ratio: 3, sd: 0.016 }, speed: { value: 78.4, sd: 12 }, shaftM: 0.85, dtl: true,
    events: { Address: 1000, Top: 1900, Impact: 2200, 'Toe-up': 1300 },
    read: { samples: 960, fps: 240, durationS: 4, heightM: 1.8, heightFrom: 'profile' as const, shaftUsedM: 0.85, shaftFrom: 'down_the_line' as const, handTravelM: 1.21, handSpeedMps: 4.03,
      dtl: { samples: 900, addressMs: 1000, stillSamples: 40, headFound: 8, shaftPx: 590, shoulderPx: 200 } },
    notes: ['height_default'],
  };
  it('lists each step with its numbers and marks what the engine gets', async () => {
    const { swingDataSteps, swingSummaryLine } = await import('@/lib/swing-data');
    const steps = swingDataSteps(rec);
    expect(steps.map(s => s.title)).toEqual(['Body pose read on this device', 'Swing phases (main’s algorithm)', 'Timing', 'Down-the-line view', 'Speed estimate (double pendulum)', 'Notes']);
    expect(steps[1].points.map(p => p.label)).toEqual(['Address', 'Toe up', 'Top', 'Impact']);
    const all = steps.flatMap(s => s.points);
    expect(all.filter(p => p.engine).map(p => p.label)).toEqual(['Backswing', 'Downswing', 'Club speed (estimate)']);
    expect(all.find(p => p.label === 'Hand travel, top to impact')?.value).toBe('1.21 m');
    expect(all.find(p => p.label === 'Club head found at address')?.value).toBe('8 of 40 still samples');
    expect(swingSummaryLine(rec)).toBe('backswing 0.90 s · downswing 0.30 s · tempo 3.0:1 · club speed ~78 mph (estimate) · hands to club head 33.5 in');
    expect(swingDataSteps(null)).toEqual([]);
  });
});
