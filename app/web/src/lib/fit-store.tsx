import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { postExplain, postFit, type Explanation } from "@/lib/api";
import type { Answers, FitRequest, FitState, Measurements, Observation } from "@/types/fit-state";

// Browser-only fitting state (privacy default: nothing persisted server-side).
// Answers + measured numbers (never video) are saved in this browser so a golfer can come back (POR-18).
const SAVE_KEY = "takomo-fit-v1";

type Saved = { answers: Answers; measurements: Measurements };
type Inputs = Saved;

type FitStore = Saved & {
  state: FitState | null;
  explanation: Explanation | null;
  /** Final walkthrough (result screen), kept apart so a late step line can't overwrite it. */
  final: Explanation | null;
  loading: boolean;
  error: string | null;
  setAnswers: (patch: Partial<Answers>) => void;
  setMeasurement: (key: keyof Measurements, obs: Observation | null) => void;
  /** Run the engine for a step (after applying patches). Fit card, Why chip and toast update from the result. */
  commit: (step: string, patch?: { answers?: Partial<Answers>; measurements?: Measurements }) => Promise<void>;
  /** Host line for the final screen. */
  walkthrough: () => void;
  reset: () => void;
};

const Ctx = createContext<FitStore | null>(null);

function load(): Saved {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Saved>;
      return { answers: s.answers ?? {}, measurements: s.measurements ?? {} };
    }
  } catch {
    /* private mode / blocked storage: start fresh */
  }
  return { answers: {}, measurements: {} };
}

function save(s: Saved) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function FitProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(load, []);
  const [answers, setA] = useState<Answers>(initial.answers);
  const [measurements, setM] = useState<Measurements>(initial.measurements);
  const [state, setState] = useState<FitState | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [final, setFinal] = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest values for async callers (commit right after setAnswers sees fresh data).
  const inputs = useRef<Inputs>(initial);
  const stateRef = useRef<FitState | null>(null);
  const lastReq = useRef<FitRequest | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const apply = useCallback((next: Inputs) => {
    inputs.current = next;
    setA(next.answers);
    setM(next.measurements);
    save(next);
  }, []);

  const explain = useCallback((req: FitRequest, prev: FitRequest | null, role: "step_line" | "final_walkthrough") => {
    postExplain(req, prev, role, ctrl.current?.signal).then(
      role === "final_walkthrough" ? setFinal : setExplanation,
      () => undefined,
    );
  }, []);

  const commit = useCallback<FitStore["commit"]>(
    async (step, patch) => {
      const cur = inputs.current;
      const next: Inputs = {
        answers: { ...cur.answers, ...patch?.answers },
        measurements: { ...cur.measurements, ...patch?.measurements },
      };
      apply(next);
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      const req: FitRequest = {
        step,
        answers: next.answers,
        measurements: next.measurements,
        previous: stateRef.current,
      };
      setLoading(true);
      setError(null);
      try {
        const st = await postFit(req, c.signal);
        if (c.signal.aborted) return;
        const prevReq = lastReq.current;
        stateRef.current = st;
        lastReq.current = req;
        setState(st);
        explain(req, prevReq, "step_line");
      } catch (e) {
        if (!c.signal.aborted) setError((e as Error).message);
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    },
    [apply, explain],
  );

  // Returning golfer: rebuild the card from saved inputs.
  useEffect(() => {
    if (Object.keys(initial.answers).length || Object.keys(initial.measurements).length) void commit("resume");
  }, [initial, commit]);

  const value = useMemo<FitStore>(
    () => ({
      answers,
      measurements,
      state,
      explanation,
      final,
      loading,
      error,
      setAnswers: (patch) =>
        apply({
          ...inputs.current,
          answers: { ...inputs.current.answers, ...patch },
        }),
      setMeasurement: (key, obs) =>
        apply({
          ...inputs.current,
          measurements: { ...inputs.current.measurements, [key]: obs },
        }),
      commit,
      walkthrough: () => lastReq.current && explain(lastReq.current, null, "final_walkthrough"),
      reset: () => {
        ctrl.current?.abort();
        apply({ answers: {}, measurements: {} });
        stateRef.current = null;
        lastReq.current = null;
        setState(null);
        setExplanation(null);
        setFinal(null);
      },
    }),
    [answers, measurements, state, explanation, final, loading, error, apply, commit, explain],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFit(): FitStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFit outside FitProvider");
  return v;
}
