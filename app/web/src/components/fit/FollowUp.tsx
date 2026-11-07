import { Button } from "@/components/ui/button";
import { useFit } from "@/lib/fit-store";
import { renderReason } from "@/lib/reasons";
import type { Answers, Measurements } from "@/types/fit-state";

// POR-15: when an answer and a measurement disagree beyond noise, ask once which one is right
// and drop the other, instead of silently averaging two numbers that can't both be true.
export function FollowUp() {
  const { state, commit } = useFit();
  const w = state?.warnings?.find((r) => r.code === "CONTRADICTION");
  if (!w) return null;
  const input = String(w.params?.input) as keyof Answers;
  const meas = String(w.params?.measurement ?? w.params?.input) as keyof Measurements;
  const step = state?.step ?? "follow_up";
  return (
    <div
      role="alertdialog"
      aria-label="Quick check"
      className="mx-2 space-y-2 border border-primary bg-card p-3 text-sm"
    >
      <p>{renderReason(w)}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => commit(step, { answers: { [input]: null } })}>
          Use measured ({String(w.params?.measured)} {String(w.params?.unit)})
        </Button>
        <Button size="sm" variant="outline" onClick={() => commit(step, { measurements: { [meas]: null } })}>
          Use mine ({String(w.params?.asked)} {String(w.params?.asked_unit ?? w.params?.unit)})
        </Button>
      </div>
    </div>
  );
}
