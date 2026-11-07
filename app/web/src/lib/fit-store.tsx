import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Answers, Measurements, Observation } from "@/types/fit-state";

// Browser-only fitting state (privacy default: nothing persisted server-side).
// M6 (POR-18) adds the /v1/fit call + live fit card on top of this.
type FitStore = {
  answers: Answers;
  measurements: Measurements;
  setAnswers: (patch: Partial<Answers>) => void;
  setMeasurement: (key: keyof Measurements, obs: Observation | null) => void;
};

const Ctx = createContext<FitStore | null>(null);

export function FitProvider({ children }: { children: ReactNode }) {
  const [answers, setA] = useState<Answers>({});
  const [measurements, setM] = useState<Measurements>({});
  const value = useMemo<FitStore>(
    () => ({
      answers,
      measurements,
      setAnswers: (patch) => setA((a) => ({ ...a, ...patch })),
      setMeasurement: (key, obs) => setM((m) => ({ ...m, [key]: obs })),
    }),
    [answers, measurements],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFit(): FitStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFit outside FitProvider");
  return v;
}
