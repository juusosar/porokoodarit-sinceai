import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { STEPS } from "@/lib/steps";

// Generic placeholder for a flow step. Each milestone replaces one of these with the real screen.
export function StepPage({ index, children }: { index: number; children?: React.ReactNode }) {
  const step = STEPS[index];
  const next = STEPS[index + 1];
  return (
    <div className="space-y-6">
      <h1 className="text-4xl">{step.title}</h1>
      {children ?? <p className="text-muted-foreground">Coming soon.</p>}
      {next && (
        <div className="flex gap-3">
          <Link to={next.path} className={buttonVariants()}>
            {index === 0 ? "Start fitting" : "Next"}
          </Link>
          {step.optional && (
            <Link to={next.path} className={buttonVariants({ variant: "ghost" })}>
              Skip
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
