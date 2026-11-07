import { useEffect, useMemo, useState } from "react";
import { postExplain, postFit, type Explanation } from "@/lib/api";
import { toFitRequest } from "@/lib/fit-request";
import type { Profile } from "@/lib/fitting-schema";
import type { Enrichment } from "@/lib/enrichment-schema";
import type { SwingRecord } from "@/lib/swing-store";
import type { FitState } from "@/types/fit-state";

/**
 * Runs our fitting engine (POST /v1/fit) on the saved inputs, then asks the host for the final
 * walkthrough (POST /v1/explain). The explanation never blocks the specs: it arrives when it arrives.
 */
export function useFitState(enabled: boolean, profile: Profile | null, extras: Enrichment | null, swing: SwingRecord | null) {
  const request = useMemo(
    () => (enabled && profile ? toFitRequest("result", profile, extras, swing) : null),
    [enabled, profile, extras, swing],
  );
  const key = request ? JSON.stringify(request) : "";
  const [state, setState] = useState<FitState | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!request) return;
    const c = new AbortController();
    setLoading(true);
    setError(false);
    setExplanation(null);
    postFit(request, c.signal)
      .then((st) => {
        if (c.signal.aborted) return;
        setState(st);
        setLoading(false);
        return postExplain(request, null, "final_walkthrough", c.signal).then((e) => {
          if (!c.signal.aborted) setExplanation(e);
        }, () => undefined);
      })
      .catch(() => {
        if (c.signal.aborted) return;
        setError(true);
        setLoading(false);
      });
    return () => c.abort();
    // key = request content; attempt = manual retry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  return { request, state, explanation, loading, error, retry: () => setAttempt((n) => n + 1) };
}
