import { useState } from "react";
import { ArrowRight, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { QuestionInfo } from '@/components/QuestionInfo';

export type Q =
  | { key: string; label: string; type: "choice"; options: string[]; initial: string }
  | { key: string; label: string; type: "range"; min: number; max: number; step: number; unit: string; initial: number; unknown?: boolean; plusMax?: boolean; optional?: boolean };

export type CardDef = { id: number; title: string; questions: Q[] };

export const CARDS: CardDef[] = [
  {
    id: 1,
    title: "The basics",
    questions: [
      { key: "hand", label: "Hand", type: "choice", options: ["Right", "Left"], initial: "" },
      { key: "sex", label: "Sex", type: "choice", options: ["Male", "Female", "Skip"], initial: "" },
      { key: "rounds", label: "Rounds / year", type: "range", min: 0, max: 100, step: 5, unit: "", initial: 20, plusMax: true },
    ],
  },
  {
    id: 2,
    title: "Your game",
    questions: [
      { key: "score", label: "Typical 18-hole score", type: "choice", options: ["<71", "71–77", "78–84", "85–92", ">92"], initial: "" },
      { key: "carry", label: "Average 7-iron carry", type: "range", min: 80, max: 200, step: 5, unit: " yd", initial: 140, unknown: true },
      { key: "loft", label: "Your current 7-iron loft, if you know it", type: "range", min: 26, max: 36, step: 0.5, unit: "°", initial: 31, unknown: true, optional: true },
      { key: "development", label: "Over the next few years, where do you see your game heading?", type: "choice", options: ["Better golf is on the menu", "Same game, same swagger", "My best golf might be behind me"], initial: "" },
      { key: "flight", label: "Ball flight", type: "choice", options: ["Low", "Medium", "High", "Not sure"], initial: "" },
    ],
  },
  {
    id: 3,
    title: "Measurements",
    questions: [
      { key: "height", label: "Height", type: "range", min: 150, max: 205, step: 1, unit: " cm", initial: 178 },
      { key: "wrist", label: "Wrist to floor (in golf shoes)", type: "range", min: 70, max: 100, step: 0.5, unit: " cm", initial: 86, unknown: true },
      { key: "glove", label: "Glove size", type: "choice", options: ["XS", "S", "M", "L", "XL", "Not sure"], initial: "" },
    ],
  },
];

export type Answer = { value: string; status: "sure" | "guess" };

/** Beginners/high handicappers rarely know their ball flight: skip it and assume a typical flight (the engine says so). */
export const SHORT_CARRY_YD = 120;
export function asksBallFlight(score: string, carryYd: number | null) {
  if (score === ">92") return false;
  if (carryYd !== null && carryYd <= SHORT_CARRY_YD) return false;
  return true;
}
const ADVANCED = new Set(["flight", "loft"]);

function fmt(q: Extract<Q, { type: "range" }>, n: number) {
  return `${n}${q.plusMax && n >= q.max ? "+" : ""}${q.unit}`;
}

export function QuickCard({
  card,
  onSubmit,
  onKeep,
  note,
  initial,
}: {
  card: CardDef;
  onSubmit: (a: Record<string, Answer>) => void;
  onKeep?: () => void;
  note?: string;
  initial?: string | undefined;
}) {
  const [vals, setVals] = useState<Record<string, string | number>>(() =>
    Object.fromEntries(
      card.questions.map((q) => {
        if (initial && q.type === "choice" && q.options.includes(initial)) return [q.key, initial];
        const n = initial ? parseFloat(initial) : NaN;
        if (q.type === "range" && !isNaN(n)) return [q.key, Math.min(q.max, Math.max(q.min, n))];
        return [q.key, q.initial];
      }),
    ),
  );
  const [unknown, setUnknown] = useState<Record<string, boolean>>({});
  // Sliders start at a typical value; only a moved slider counts as the golfer's answer (POR-29).
  const [touched, setTouched] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(card.questions.map((q) => [q.key, Boolean(initial && q.type === "range" && !isNaN(parseFloat(initial)))])),
  );
  const showAdvanced =
    card.id !== 2 || asksBallFlight(String(vals["score"]), unknown["carry"] ? null : Number(vals["carry"]));
  const visible = card.questions.filter((q) => showAdvanced || !ADVANCED.has(q.key));
  const complete = visible.every((q) => q.type !== "choice" || q.options.includes(String(vals[q.key])));

  const submit = () => {
    if (!complete) return;
    const out: Record<string, Answer> = {};
    if (card.id === 2) out["tempo"] = { value: "From swing video", status: "guess" };
    if (!showAdvanced) for (const k of ADVANCED) out[k] = { value: "Not sure", status: "guess" };
    for (const q of visible) {
      if (q.type === "range") {
        out[q.key] = unknown[q.key] || !touched[q.key] ? { value: "Not sure", status: "guess" } : { value: fmt(q, vals[q.key] as number), status: "sure" };
      } else {
        const v = String(vals[q.key]);
        out[q.key] = { value: v, status: v === "Not sure" ? "guess" : "sure" };
      }
    }
    onSubmit(out);
  };

  return (
    <div data-scroll-reveal className="chat-question ml-0 border-l-2 border-primary bg-card/70 p-5 sm:ml-12 sm:p-6">
      <p className="font-display text-2xl font-bold uppercase italic text-foreground">{card.title}</p>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      <div className="mt-5 space-y-6">
        {visible.map((q) => (
          <div key={q.key}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1"><p className="text-sm text-muted-foreground">{q.label}</p><QuestionInfo field={q.key} label={q.label} variant="tooltip" /></div>
              {q.type === "range" && (
                <p className="shrink-0 font-display text-2xl font-bold italic tabular-nums text-primary">{unknown[q.key] ? "?" : touched[q.key] ? fmt(q, vals[q.key] as number) : <span className="text-base not-italic font-normal text-muted-foreground">{q.optional ? "Optional" : "Drag to set"}</span>}</p>
              )}
            </div>
            {q.type === "choice" ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {q.options.map((o) => (
                  <Button
                    key={o}
                    type="button"
                    variant="outline"
                    aria-pressed={vals[q.key] === o}
                    onClick={() => setVals((v) => ({ ...v, [q.key]: o }))}
                    className="chat-choice h-auto min-h-11 max-w-full gap-2 whitespace-normal rounded-none border-border bg-background/50 px-4 py-2 text-left text-sm shadow-none"
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center border border-current" aria-hidden="true">{vals[q.key] === o && <Check className="size-3" />}</span>
                    {o}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="range"
                  aria-label={q.label}
                  min={q.min}
                  max={q.max}
                  step={q.step}
                  value={vals[q.key] as number}
                  disabled={unknown[q.key]}
                  onChange={(e) => { setVals((v) => ({ ...v, [q.key]: Number(e.target.value) })); setTouched((t) => ({ ...t, [q.key]: true })); }}
                  className="chat-range min-w-0 flex-1 accent-primary disabled:opacity-30"
                />
                {q.unknown && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-pressed={Boolean(unknown[q.key])}
                    onClick={() => setUnknown((u) => ({ ...u, [q.key]: !u[q.key] }))}
                    className={`shrink-0 px-2.5 py-1 text-xs ${unknown[q.key] ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                  >
                    Not sure
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
        {!showAdvanced && (
          <p className="text-xs text-muted-foreground">No need to know your ball flight yet: we'll assume a typical mid flight and say so in your result.</p>
        )}
      </div>
      <Button disabled={!complete} onClick={submit} className="mt-6 h-auto w-full justify-between rounded-none px-5 py-3 font-display text-lg font-bold uppercase italic">
        {onKeep ? "Update" : "That's me"}
        <ArrowRight className="size-5" />
      </Button>
      {onKeep && (
        <Button variant="outline" onClick={onKeep} className="mt-2 h-auto w-full border border-border py-2.5 text-sm text-muted-foreground transition hover:text-foreground">
          My first answer was right
        </Button>
      )}
    </div>
  );
}
