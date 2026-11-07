import { useFit } from "@/lib/fit-store";
import { lineOf, useSpeakLine } from "@/features/voice";

// The host's line for the latest step, with a badge saying where it came from (AI or template).
export function HostLine() {
  const { explanation } = useFit();
  useSpeakLine(lineOf(explanation));
  if (!explanation) return null;
  const ai = explanation.source === "llm";
  return (
    <p className="px-4 pt-2 text-sm" data-testid="host-line">
      {explanation.caption}{" "}
      <span
        className="border border-border px-1 text-[10px] uppercase text-muted-foreground"
        title={explanation.model ?? ""}
      >
        {ai ? `AI · ${explanation.provider}` : "fitter notes"}
      </span>
    </p>
  );
}
