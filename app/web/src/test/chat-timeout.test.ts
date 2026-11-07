import { afterEach, expect, it, vi } from 'vitest';
import { postChat } from '../lib/api';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('gives up on a hung chat request after the client timeout (POR-36)', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  })));
  const p = postChat([{ role: 'user', text: 'hi' }], {}, undefined, 1000);
  const check = expect(p).rejects.toThrow(/timed out/);
  await vi.advanceTimersByTimeAsync(1001);
  await check;
});
