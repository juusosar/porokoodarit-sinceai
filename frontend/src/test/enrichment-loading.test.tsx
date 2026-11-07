import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const read = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-start', () => ({ useServerFn: () => read }));
vi.mock('../lib/enrichment.functions', () => ({ readEnrichment: {} }));
vi.mock('../lib/fitting-session', () => ({ getFittingToken: () => 'test-capability' }));
import { useEnrichment } from '../hooks/use-enrichment';
import { emptyEnrichment } from '../lib/enrichment-schema';

beforeEach(() => { read.mockReset(); });
it('does not mark saved data ready before its read completes', async () => {
  let finish: ((value: typeof emptyEnrichment) => void) | undefined;
  read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useEnrichment(true));
  expect(result.current.ready).toBe(false);
  expect(result.current.loading).toBe(true);
  await act(async () => { finish?.({ ...emptyEnrichment, speed: 80 }); });
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.data?.speed).toBe(80);
});
it('clears a failed read on retry and restores the saved values', async () => {
  read.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...emptyEnrichment, speed: 95 });
  const { result } = renderHook(() => useEnrichment(true));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.ready).toBe(false);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.error).toBe(false);
  expect(result.current.data?.speed).toBe(95);
  expect(read).toHaveBeenCalledTimes(2);
});