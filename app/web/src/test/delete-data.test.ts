import { expect, it } from 'vitest';
import { clearAllLocal } from '../lib/local-store';

it('deletes every Takomo key and nothing else (POR-35)', () => {
  localStorage.setItem('takomo:fitting:abc', '1');
  localStorage.setItem('takomo-fitting-session', 'abc');
  localStorage.setItem('other-site', 'keep');
  expect(clearAllLocal()).toBe(2);
  expect(localStorage.getItem('takomo:fitting:abc')).toBeNull();
  expect(localStorage.getItem('takomo-fitting-session')).toBeNull();
  expect(localStorage.getItem('other-site')).toBe('keep');
});

it('sweeps expired records from every fitting, keeps fresh ones', async () => {
  const { sweepExpired } = await import('../lib/local-store');
  localStorage.clear();
  const day = 24 * 3600 * 1000;
  localStorage.setItem('takomo:fitting:old', JSON.stringify({ savedAt: Date.now() - 31 * day, value: 1 }));
  localStorage.setItem('takomo:fitting:new', JSON.stringify({ savedAt: Date.now() - day, value: 1 }));
  localStorage.setItem('takomo-voice-muted', '1');
  expect(sweepExpired()).toBe(1);
  expect(localStorage.getItem('takomo:fitting:old')).toBeNull();
  expect(localStorage.getItem('takomo:fitting:new')).not.toBeNull();
  expect(localStorage.getItem('takomo-voice-muted')).toBe('1');
});
