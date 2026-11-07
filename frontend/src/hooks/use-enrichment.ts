import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { readEnrichment } from '@/lib/enrichment.functions';
import { getFittingToken } from '@/lib/fitting-session';
import type { Enrichment } from '@/lib/enrichment-schema';

export function useEnrichment(confirmed: boolean) {
  const read = useServerFn(readEnrichment);
  const [data, setData] = useState<Enrichment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!confirmed) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setReady(false);
    setError(false);
    void read({ data: { token: getFittingToken() } }).then(value => { if (active) { setData(value); setReady(true); } }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [confirmed, read, attempt]);
  return { data, loading, error, ready, retry: () => setAttempt(v => v + 1) };
}