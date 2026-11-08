import { setUnits, useUnits } from "@/lib/units";

/** Header switch for all lengths in the app (cm / in). One choice for every page, remembered on this device. */
export function UnitToggle() {
  const units = useUnits();
  const metric = units === "metric";
  return (
    <button
      type="button"
      className="min-h-11 underline"
      aria-label={metric ? "Lengths in centimetres. Switch to inches" : "Lengths in inches. Switch to centimetres"}
      onClick={() => setUnits(metric ? "imperial" : "metric")}
      data-testid="unit-toggle"
    >
      {metric ? "cm" : "in"}
    </button>
  );
}
