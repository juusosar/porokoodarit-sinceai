import { useCallback, useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { readBlueprint } from '@/lib/blueprint.functions';
import { getFittingToken } from '@/lib/fitting-session';

export function useBlueprint(enabled: boolean) {
  const read = useServerFn(readBlueprint);
  const [data, setData] = useState<Awaited<ReturnType<typeof readBlueprint>> | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true); setError(false);
    void read({ data: { token: getFittingToken() } }).then(result => { if (active) setData(result); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, read, attempt]);
  return { data, loading, error, retry };
}