import { useEffect, useState } from "react";
import { useFit } from "@/lib/fit-store";
import { PARTS } from "@/lib/parts";

const NAME = Object.fromEntries(PARTS) as Record<string, string>;

// "What changed" toast after each step: only parts whose value moved (not first fills).
export function WhatChanged() {
  const { state } = useFit();
  const [shown, setShown] = useState<string[]>([]);
  useEffect(() => {
    const moved = (state?.changes ?? []).filter((c) => c.before && c.before !== c.after);
    setShown(moved.slice(0, 3).map((c) => `${NAME[c.part] ?? c.part}: ${c.before} → ${c.after}`));
    if (!moved.length) return;
    const t = setTimeout(() => setShown([]), 5000);
    return () => clearTimeout(t);
  }, [state]);
  if (!shown.length) return null;
  return (
    <div role="status" data-testid="what-changed" className="mx-2 border border-primary bg-card p-2 text-sm">
      <span className="font-semibold text-primary">What changed: </span>
      {shown.join(" · ")}
    </div>
  );
}
