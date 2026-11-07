import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { DemoPanel, demoEnabled } from "@/components/DemoPanel";
import { FitCard } from "@/components/fit/FitCard";
import { FollowUp } from "@/components/fit/FollowUp";
import { HostLine } from "@/components/fit/HostLine";
import { VoiceToggle } from "@/features/voice";
import { WhatChanged } from "@/components/fit/WhatChanged";
import { useFit } from "@/lib/fit-store";
import { STEPS, stepIndex } from "@/lib/steps";

export function Layout() {
  const { pathname } = useLocation();
  const i = stepIndex(pathname);
  const step = STEPS[i];
  const { error, loading, state, answers, reset } = useFit();
  const nav = useNavigate();
  const hasData = !!state || Object.keys(answers).length > 0;
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      {demoEnabled() && <DemoPanel />}
      <header className="flex items-center justify-between px-4 pt-4">
        <Link to="/" className="font-display text-2xl font-extrabold italic uppercase">
          Takomo <span className="text-primary">Fitter</span>
        </Link>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <VoiceToggle />
          {hasData && (
            <button
              type="button"
              className="min-h-11 underline"
              onClick={() => {
                reset();
                nav("/");
              }}
            >
              Start over
            </button>
          )}
          {i + 1} / {STEPS.length}
        </span>
      </header>
      <p className="sr-only" aria-live="polite">
        {loading ? "Updating your fit…" : state ? "Fit updated." : ""}
      </p>
      <div
        className="h-1 bg-muted"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={i + 1}
      >
        <div className="h-1 bg-primary transition-all" style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
      </div>
      <p className="px-4 pt-3 text-sm text-muted-foreground" data-testid="why-chip">
        <span className="font-semibold text-primary">Why: </span>
        {step.why}
      </p>
      {pathname !== "/" && pathname !== "/result" && <HostLine />}
      <main className="flex-1 px-4 py-6">
        <Outlet />
      </main>
      {pathname !== "/" && (
        <div className="sticky bottom-0 space-y-2 pb-2">
          {error && (
            <p role="alert" className="mx-2 border border-destructive bg-card p-2 text-xs">
              Couldn't reach the fitter ({error}). Your answers are saved; try again.
            </p>
          )}
          <FollowUp />
          <WhatChanged />
          {pathname !== "/result" && <FitCard className="mx-2" />}
        </div>
      )}
    </div>
  );
}
