import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useFit } from "@/lib/fit-store";
import { cn } from "@/lib/utils";
import type { Answers } from "@/types/fit-state";

// Questions page (POR-18). Every field optional: the engine fills gaps with typical values and says so.
type Char = NonNullable<Answers["characteristics"]>[number];
const CHARS: Char[] = [
  "forgiveness",
  "distance",
  "forged feel",
  "distance control",
  "workability",
  "less offset",
  "more offset",
];
const SCORES: [number, string][] = [
  [1, "Under 71"],
  [2, "71-77"],
  [3, "78-84"],
  [4, "85-92"],
  [5, "Over 92"],
];
const GLOVES = ["XS", "S", "M", "M/L", "L", "XL"] as const;
const IN_CM = 2.54;

function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T | null | undefined;
  onChange: (v: T | null) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(value === v ? null : v)}
            className={cn(
              "min-h-11 min-w-11 border px-3 py-1.5 text-sm",
              value === v ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// round total inches first, so 6 ft never shows as "5 ft 12 in"
function toFtIn(cm: number): { ft: number; inch: number } {
  const total = Math.round(cm / IN_CM);
  return { ft: Math.floor(total / 12), inch: total % 12 };
}

function num(v: string): number | null {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function Profile() {
  const { answers, commit } = useFit();
  const nav = useNavigate();
  const [a, setA] = useState<Answers>(answers);
  const [metric, setMetric] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<Answers>) => setA((cur) => ({ ...cur, ...patch }));

  // height in ft + in (imperial first), stored in cm
  const ftIn = a.height_cm ? toFtIn(a.height_cm) : null;
  const [ft, setFt] = useState(ftIn ? String(ftIn.ft) : "");
  const [inch, setInch] = useState(ftIn ? String(ftIn.inch) : "");
  const [cm, setCm] = useState(a.height_cm ? String(Math.round(a.height_cm)) : "");
  const [w2f, setW2f] = useState(
    a.wrist_to_floor_cm ? String(metric ? a.wrist_to_floor_cm : +(a.wrist_to_floor_cm / IN_CM).toFixed(1)) : "",
  );

  // switch units keeping the values: convert what's typed instead of dropping or relabelling it
  function toggleUnits() {
    const h = heightCm();
    const w = num(w2f);
    if (metric) {
      const fi = h === null ? null : toFtIn(h);
      setFt(fi ? String(fi.ft) : "");
      setInch(fi ? String(fi.inch) : "");
      setW2f(w === null ? "" : String(+(w / IN_CM).toFixed(1)));
    } else {
      setCm(h === null ? "" : String(Math.round(h)));
      setW2f(w === null ? "" : String(Math.round(w * IN_CM)));
    }
    setMetric(!metric);
  }

  function heightCm(): number | null {
    if (metric) return num(cm);
    const f = num(ft);
    if (f === null) return null;
    return (f * 12 + (num(inch) ?? 0)) * IN_CM;
  }

  async function next() {
    const h = heightCm();
    const w = num(w2f);
    const w2fCm = w === null ? null : metric ? w : w * IN_CM;
    if (h !== null && (h <= 100 || h >= 230)) return setErr("That height looks off. Check the number?");
    if (w2fCm !== null && (w2fCm <= 50 || w2fCm >= 120)) return setErr("Wrist-to-floor looks off. Check the number?");
    if (a.carry_7i_yd != null && (a.carry_7i_yd < 40 || a.carry_7i_yd > 260)) return setErr("7-iron carry: 40–260 yd.");
    if (a.own_7i_loft_deg != null && (a.own_7i_loft_deg <= 15 || a.own_7i_loft_deg >= 45))
      return setErr("7-iron loft: between 15° and 45°.");
    setErr(null);
    await commit("profile", {
      answers: { ...a, height_cm: h, wrist_to_floor_cm: w2fCm },
    });
    nav("/swing");
  }

  const inputCls = "w-20 border border-border bg-background p-2 text-base";
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void next();
      }}
    >
      <h1 className="text-4xl">About you</h1>
      <p className="text-sm text-muted-foreground">
        Skip anything you don't know. We'll use typical values and tell you where.
      </p>

      <Choice
        label="You play"
        options={
          [
            ["right", "Right-handed"],
            ["left", "Left-handed"],
          ] as const
        }
        value={a.hand}
        onChange={(v) => set({ hand: v })}
      />

      <fieldset className="space-y-1">
        <legend className="flex w-full justify-between text-sm text-muted-foreground">
          Height
          <button type="button" className="min-h-11 px-2 text-xs underline" onClick={toggleUnits}>
            {metric ? "use ft/in" : "use cm"}
          </button>
        </legend>
        {metric ? (
          <label className="flex items-center gap-2">
            <input
              aria-label="Height cm"
              inputMode="decimal"
              className={inputCls}
              value={cm}
              onChange={(e) => setCm(e.target.value)}
            />{" "}
            cm
          </label>
        ) : (
          <div className="flex items-center gap-2">
            <input
              aria-label="Height feet"
              inputMode="numeric"
              className={inputCls}
              value={ft}
              onChange={(e) => setFt(e.target.value)}
            />{" "}
            ft
            <input
              aria-label="Height inches"
              inputMode="numeric"
              className={inputCls}
              value={inch}
              onChange={(e) => setInch(e.target.value)}
            />{" "}
            in
          </div>
        )}
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm text-muted-foreground">
          Wrist to floor (optional): stand tall, arms hanging, measure wrist crease to floor
        </span>
        <span className="flex items-center gap-2">
          <input
            aria-label="Wrist to floor"
            inputMode="decimal"
            className={inputCls}
            value={w2f}
            onChange={(e) => setW2f(e.target.value)}
          />
          {metric ? "cm" : "in"}
        </span>
      </label>

      <Choice
        label="Glove size"
        options={GLOVES.map((g) => [g, g] as const)}
        value={a.glove}
        onChange={(v) => set({ glove: v })}
      />
      <Choice
        label="Usual score (18 holes)"
        options={SCORES}
        value={a.score_bucket}
        onChange={(v) => set({ score_bucket: v })}
      />

      <label className="block space-y-1">
        <span className="text-sm text-muted-foreground">7-iron carry, if you know it</span>
        <span className="flex items-center gap-2">
          <input
            aria-label="7-iron carry yards"
            inputMode="numeric"
            className={inputCls}
            value={a.carry_7i_yd ?? ""}
            onChange={(e) => set({ carry_7i_yd: num(e.target.value) })}
          />
          yd
        </span>
      </label>

      {a.carry_7i_yd != null && (
        <label className="block space-y-1">
          <span className="text-sm text-muted-foreground">Loft of that 7-iron, if you know it (sharpens the carry read)</span>
          <span className="flex items-center gap-2">
            <input
              aria-label="Own 7-iron loft degrees"
              inputMode="decimal"
              className={inputCls}
              value={a.own_7i_loft_deg ?? ""}
              onChange={(e) => set({ own_7i_loft_deg: num(e.target.value) })}
            />
            °
          </span>
        </label>
      )}

      <Choice
        label="Ball flight today"
        options={
          [
            ["low", "Low"],
            ["mid", "Mid"],
            ["high", "High"],
          ] as const
        }
        value={a.flight}
        onChange={(v) => set({ flight: v })}
      />

      <fieldset className="space-y-1">
        <legend className="text-sm text-muted-foreground">What matters most (up to 3)</legend>
        <div className="flex flex-wrap gap-2">
          {CHARS.map((c) => {
            const on = ((a.characteristics ?? []) as Char[]).includes(c);
            const full = (a.characteristics?.length ?? 0) >= 3;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => {
                  const cur = (a.characteristics ?? []) as Char[];
                  set({
                    characteristics: (on ? cur.filter((x) => x !== c) : [...cur, c]) as Answers["characteristics"],
                  });
                }}
                className={cn(
                  "min-h-11 border px-3 py-1.5 text-sm disabled:opacity-40",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Choice
        label="Age (optional)"
        options={
          [
            [30, "Under 40"],
            [50, "40–59"],
            [65, "60–69"],
            [72, "70+"],
          ] as const
        }
        value={a.age}
        onChange={(v) => set({ age: v })}
      />

      <Choice
        label="Sex (optional, helps pick shaft weight)"
        options={
          [
            ["male", "Male"],
            ["female", "Female"],
          ] as const
        }
        value={a.sex}
        onChange={(v) => set({ sex: v })}
      />

      {err && (
        <p role="alert" className="border border-destructive p-2 text-sm">
          {err}
        </p>
      )}
      <Button type="submit" className="w-full">
        Next
      </Button>
    </form>
  );
}
