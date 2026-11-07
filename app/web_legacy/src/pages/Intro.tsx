import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";
import { StepPage } from "./StepPage";

export function Intro() {
  const [api, setApi] = useState<"checking" | "up" | "down">("checking");
  useEffect(() => {
    const ctrl = new AbortController();
    getHealth(ctrl.signal)
      .then(() => setApi("up"))
      .catch(() => !ctrl.signal.aborted && setApi("down"));
    return () => ctrl.abort();
  }, []);
  return (
    <StepPage index={0}>
      <p className="text-lg">
        A real fitter watches your swing and explains every choice. So do we. Your video stays short, and you choose
        what gets shared.
      </p>
      <p className="text-xs text-muted-foreground" data-testid="api-status">
        API: {api}
      </p>
    </StepPage>
  );
}
