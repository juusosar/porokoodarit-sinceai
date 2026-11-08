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
