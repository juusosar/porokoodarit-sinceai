import { describe, expect, it } from 'vitest';
import { characteristics, lengthCm, scoreBucket, toFitRequest } from '@/lib/fit-request';
import { emptyEnrichment } from '@/lib/enrichment-schema';

const sure = (value: string) => ({ value, status: 'sure' as const });

describe('chat profile -> engine request', () => {
  it('maps the card answers', () => {
    const r = toFitRequest('result', {
      hand: sure('Left'), sex: sure('Skip'), score: sure('85–92'), carry: sure('140 yd'), flight: sure('Medium'),
      height: sure('178 cm'), wrist: sure('86 cm'), glove: sure('M'), wants: sure('Forgiveness, distance'),
      development: sure('Same game, same swagger'), rounds: sure('20'),
    }, null, null);
    expect(r.answers).toEqual({ hand: 'left', score_bucket: 4, carry_7i_yd: 140, flight: 'mid', height_cm: 178, wrist_to_floor_cm: 86, glove: 'M', characteristics: ['forgiveness', 'distance'] });
    expect(r.measurements).toEqual({});
  });
  it('leaves out unsure and unparseable values, never sends age', () => {
    const r = toFitRequest('result', { carry: { value: 'Not sure', status: 'guess' }, flight: sure('From swing video'), glove: sure('Not sure'), age: sure('45') }, null, null);
    expect(r.answers).toEqual({});
  });
  it('reads free-text labels from the host', () => {
    expect(scoreBucket('<71')).toBe(1);
    expect(scoreBucket('about 95')).toBe(5);
    expect(lengthCm(`5'11"`)).toBeCloseTo(180.3, 1);
    expect(lengthCm('34 in')).toBeCloseTo(86.4, 1);
    expect(characteristics('Workability, forged feel, distance control')).toEqual(['forged feel', 'distance control', 'workability']);
  });
  it('uses launch monitor speed and carry for a 7-iron, plus video tempo', () => {
    const r = toFitRequest('result', { carry: sure('150 yd') }, { ...emptyEnrichment, speed: 82, carry: 140, unit: 'm', launch: 17, spin: 6000, landing: 44 }, {
      filename: 's.mp4', size: 1, encodedFps: 30, analyzedAt: '2026-11-07T12:00:00Z', tempo: { backswingS: 0.9, downswingS: 0.3, ratio: 3, sd: 0.045 },
    });
    // launch-monitor carry is a measurement (no over-report correction); the remembered carry stays an answer
    expect(r.answers?.carry_7i_yd).toBe(150);
    expect(r.measurements?.carry_7i_yd).toMatchObject({ value: 153, source: 'measured' });
    expect(r.measurements?.launch_deg).toMatchObject({ value: 17 });
    expect(r.measurements?.spin_rpm).toMatchObject({ value: 6000 });
    expect(r.measurements?.landing_deg).toMatchObject({ value: 44 });
    expect(r.measurements?.speed_7i_mph).toMatchObject({ value: 82, source: 'measured', method: 'launch_monitor' });
    expect(r.measurements?.backswing_s).toMatchObject({ value: 0.9, source: 'measured', method: 'video_pose' });
  });
  it('sends optional club speed and own loft only when given (POR-34)', () => {
    const r = toFitRequest('profile', { speed: sure('82 mph'), loft: sure('28.5°') }, null, null);
    expect(r.answers).toMatchObject({ speed_7i_mph: 82, own_7i_loft_deg: 28.5 });
    const n = toFitRequest('profile', { speed: { value: 'Not sure', status: 'guess' }, loft: { value: 'Not sure', status: 'guess' } }, null, null);
    expect(n.answers?.speed_7i_mph).toBeUndefined();
    expect(n.answers?.own_7i_loft_deg).toBeUndefined();
  });
  it('sends the ball-line test as a mean tilt with a shot-count SD', () => {
    const r = toFitRequest('result', {}, { ...emptyEnrichment, club: 'other', ballLine: [3, 4, 5, 2] }, null);
    expect(r.measurements?.ball_line_tilt_deg).toEqual({ value: 3.5, sd: 0.83, source: 'measured', method: 'ball_line_tap_n4' });
  });
  it('ignores launch monitor numbers from another club', () => {
    const r = toFitRequest('result', {}, { ...emptyEnrichment, club: 'other', speed: 95 }, null);
    expect(r.measurements).toEqual({});
  });
});
