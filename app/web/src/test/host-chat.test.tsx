import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const postChat = vi.hoisted(() => vi.fn());
vi.mock('../lib/api', () => ({ postChat }));
import { LOCAL_PREFIX, useHostChat } from '../hooks/use-host-chat';

const greet = { id: 'greet', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'Hey' }] };
beforeEach(() => { postChat.mockReset(); });

it('turns host profile updates and rechecks into message parts', async () => {
  postChat.mockResolvedValue({ reply: 'Nice.', profile: { hand: { value: 'Right', status: 'sure' } }, recheck: { field: 'carry', reason: 'Long.' }, audio_token: 'a'.repeat(32) });
  const { result } = renderHook(() => useHostChat({ messages: [greet], profile: () => ({}) }));
  act(() => result.current.sendMessage({ text: '[Card 1: The basics] Hand: Right', profile: { hand: { value: 'Right', status: 'sure' } } }));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(postChat.mock.calls[0][1]).toEqual({ hand: { value: 'Right', status: 'sure' } });
  expect(result.current.messages.at(-1)?.parts.map(p => p.type)).toEqual(['tool-update_profile', 'tool-ask_recheck', 'text']);
  expect(result.current.line).toEqual({ text: 'Nice.', token: 'a'.repeat(32) }); // spoken by the page
});

it('keeps the cards moving with a local host line when the API is down', async () => {
  postChat.mockImplementation(() => Promise.reject(new Error('API 429')));
  const { result } = renderHook(() => useHostChat({ messages: [greet], profile: () => ({}) }));
  act(() => result.current.sendMessage({ text: '[Card 2: Your game] Score: >92' }));
  await new Promise(r => setTimeout(r, 20));
  expect([result.current.status, result.current.messages.length]).toEqual(['error', 3]);
  const last = result.current.messages.at(-1);
  expect(last?.role).toBe('assistant');
  expect(last?.id.startsWith(LOCAL_PREFIX)).toBe(true);
});
