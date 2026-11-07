import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { readFitting } from "@/lib/fitting.functions";
import { getFittingToken } from "@/lib/fitting-session";
import { fittingSchema, type FittingSnapshot } from "@/lib/fitting-schema";

/** Shared read path for swing and future results pages. */
export function useFitting() {
  const read = useServerFn(readFitting);
  const [snapshot, setSnapshot] = useState<FittingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = await read({ data: { token: getFittingToken() } });
        if (active) setSnapshot(saved ? fittingSchema.parse(JSON.parse(saved)) : null);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [read]);
  return { snapshot, loading, error };
}