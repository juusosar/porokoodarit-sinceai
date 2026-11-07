import { Link, Outlet, useLocation } from "react-router-dom";
import { FitCard } from "@/components/fit/FitCard";
import { STEPS, stepIndex } from "@/lib/steps";

export function Layout() {
  const { pathname } = useLocation();
  const i = stepIndex(pathname);
  const step = STEPS[i];
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between px-4 pt-4">
        <Link to="/" className="font-display text-2xl font-extrabold italic uppercase">
          Takomo <span className="text-primary">Fitter</span>
        </Link>
        <span className="text-xs text-muted-foreground">
          {i + 1} / {STEPS.length}
        </span>
      </header>
      <div className="h-1 bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={i + 1}>
        <div className="h-1 bg-primary transition-all" style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
      </div>
      <p className="px-4 pt-3 text-sm text-muted-foreground" data-testid="why-chip">
        <span className="font-semibold text-primary">Why: </span>
        {step.why}
      </p>
      <main className="flex-1 px-4 py-6">
        <Outlet />
      </main>
      {pathname !== "/" && <FitCard className="sticky bottom-0 m-2" />}
    </div>
  );
}
