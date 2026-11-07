import { useEffect, useRef, useState } from 'react';
import type { UIMessage } from '@/lib/fitting-schema';

export const REPLY_PAUSE_MS = 700;
export const QUESTION_PAUSE_MS = 900;
export const REVEAL_TICK_MS = 40;
export const CHARACTERS_PER_TICK = 3;

export function useChatPacing(messages: UIMessage[], networkBusy: boolean, restored: UIMessage[] = []) {
  const [shown, setShown] = useState<Record<string, number>>(() => Object.fromEntries(restored.map(m => [m.id, textOf(m).length])));
  const starts = useRef<Record<string, number>>({});
  const latest = useRef(messages);
  latest.current = messages;
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setShown(previous => {
        const next = { ...previous };
        let changed = false;
        for (const message of latest.current) {
          if (message.role !== 'assistant') continue;
          const length = textOf(message).length;
          if (!length || (previous[message.id] ?? 0) >= length) continue;
          const startedAt = starts.current[message.id] ?? now;
          starts.current[message.id] = startedAt;
          if (now - startedAt < REPLY_PAUSE_MS) continue;
          next[message.id] = Math.min(length, (previous[message.id] ?? 0) + CHARACTERS_PER_TICK);
          changed = true;
        }
        return changed ? next : previous;
      });
    }, REVEAL_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const revealing = messages.some(m => m.role === 'assistant' && (shown[m.id] ?? 0) < textOf(m).length);
  const [questionsReady, setQuestionsReady] = useState(false);
  const last = messages.at(-1);
  const settled = !networkBusy && !revealing && last?.role === 'assistant';
  useEffect(() => {
    setQuestionsReady(false);
    if (!settled) return;
    const timer = setTimeout(() => setQuestionsReady(true), QUESTION_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [settled, last?.id]);
  return {
    presenting: networkBusy || revealing,
    questionsReady: settled && questionsReady,
    visibleText: (message: UIMessage) => message.role === 'assistant' ? textOf(message).slice(0, shown[message.id] ?? 0) : textOf(message),
  };
}

function textOf(message: UIMessage) {
  return message.parts.map(part => part.type === 'text' ? part.text : '').join('');
}