import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { UIMessage } from '@/lib/fitting-schema';
import { useChatPacing } from '../hooks/use-chat-pacing';

const reply: UIMessage = { id: 'reply', role: 'assistant', parts: [{ type: 'text', text: 'Hello there.' }] };
afterEach(() => vi.useRealTimers());

it('pauses before revealing a reply and reveals it incrementally', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useChatPacing([reply], false));
  act(() => vi.advanceTimersByTime(700));
  expect(result.current.visibleText(reply)).toBe('');
  act(() => vi.advanceTimersByTime(60));
  expect(result.current.visibleText(reply)).toBe('Hel');
  expect(result.current.questionsReady).toBe(false);
});

it('waits 900ms after the full reply before revealing questions', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useChatPacing([reply], false));
  act(() => vi.advanceTimersByTime(880));
  expect(result.current.visibleText(reply)).toBe('Hello there.');
  act(() => vi.advanceTimersByTime(899));
  expect(result.current.questionsReady).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.questionsReady).toBe(true);
});

it('does not replay saved replies or show questions during a stream', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useChatPacing([reply], true, [reply]));
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current.visibleText(reply)).toBe('Hello there.');
  expect(result.current.questionsReady).toBe(false);
});