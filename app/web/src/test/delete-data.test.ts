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
