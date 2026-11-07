import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useFit } from "@/lib/fit-store";

// Optional: launch-monitor club speed beats every estimate (lab: radar/TrackMan ~1.5 mph SD).
const LM_SD_MPH = 1.5;

export function LaunchMonitor() {
  const { measurements, commit } = useFit();
  const nav = useNavigate();
  const [speed, setSpeed] = useState(measurements.speed_7i_mph ? String(measurements.speed_7i_mph.value) : "");
  const [err, setErr] = useState<string | null>(null);

  async function next() {
    const v = speed.trim() ? parseFloat(speed.replace(",", ".")) : null;
    if (v !== null && (!Number.isFinite(v) || v < 30 || v > 130)) return setErr("7-iron club speed: 30–130 mph.");
    setErr(null);
    await commit("launch_monitor", {
      measurements: {
        speed_7i_mph:
          v === null
            ? null
            : {
                value: v,
                sd: LM_SD_MPH,
                source: "measured",
                method: "launch_monitor",
              },
      },
    });
    nav("/result");
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void next();
      }}
    >
      <h1 className="text-4xl">Launch monitor</h1>
      <p className="text-sm text-muted-foreground">
        Hit a few 7-irons on TrackMan, a radar or a sim? Enter your average club speed. No numbers? Skip, we've got you.
      </p>
      <label className="flex items-center gap-2">
        <input
          aria-label="7-iron club speed mph"
          inputMode="decimal"
          className="w-24 border border-border bg-background p-2 text-base"
          value={speed}
          onChange={(e) => setSpeed(e.target.value)}
        />
        mph (7-iron club speed)
      </label>
      {err && (
        <p role="alert" className="border border-destructive p-2 text-sm">
          {err}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit">See my fit</Button>
        <Button type="button" variant="ghost" onClick={() => commit("launch_monitor").then(() => nav("/result"))}>
          Skip
        </Button>
      </div>
    </form>
  );
}
