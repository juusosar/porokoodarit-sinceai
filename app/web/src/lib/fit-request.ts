// Chat profile (short text labels) + optional extra data + swing timing -> engine FitRequest.
// Only parseable values go to the engine; anything vague stays out and the engine says what it assumed.
import type { Answers, FitRequest, Measurements } from "@/types/fit-state";
import type { Profile } from "./fitting-schema";
import { convertCarry, type Enrichment } from "./enrichment-schema";
import type { SwingRecord } from "./swing-store";

type Char = NonNullable<Answers["characteristics"]>[number];
const CHARS: [RegExp, Char][] = [
  [/forgiv|mishit|off-cent/i, "forgiveness"],
  [/\bdistance\b(?!\s*control)|longer|more yards/i, "distance"],
  [/forged|feel/i, "forged feel"],
  [/distance control|dispersion|consisten/i, "distance control"],
  [/workab|shape|shaping/i, "workability"],
  [/less offset/i, "less offset"],
  [/more offset/i, "more offset"],
];
const LAUNCH_MONITOR_SD_MPH = 1.5; // same error model as the legacy launch monitor step
const LAUNCH_MONITOR_SD = { carry: 2, launch: 0.5, spin: 150, landing: 0.7 }; // session means, our assumption
const BALL_LINE_SHOT_SD_DEG = 1.65; // lab: per-shot scatter of the transferred line
const IN_CM = 2.54;

const num = (s: string | undefined) => {
  const m = s?.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const unsure = (s: string | undefined) => !s || /not sure|skip|from swing video|unknown|\?/i.test(s);

export function scoreBucket(s: string | undefined): number | null {
  if (unsure(s) || !s) return null;
  const t = s.replace(/[–—]/g, "-").replace(/\s/g, "");
  if (/^(<|under)71/i.test(t)) return 1;
  if (/^(>|over)92/i.test(t)) return 5;
  const n = num(t);
  if (n === null) return null;
  return n < 71 ? 1 : n <= 77 ? 2 : n <= 84 ? 3 : n <= 92 ? 4 : 5;
}

/** "178 cm", "5'11\"", "71 in" -> cm. */
export function lengthCm(s: string | undefined): number | null {
  if (unsure(s) || !s) return null;
  const ft = s.match(/(\d)\s*(?:'|ft|’)\s*(\d{1,2}(?:\.\d+)?)?/);
  if (ft) return Math.round((Number(ft[1]) * 12 + Number(ft[2] ?? 0)) * IN_CM * 10) / 10;
  const n = num(s);
  if (n === null) return null;
  return /\bin|inch|"|″/i.test(s) ? Math.round(n * IN_CM * 10) / 10 : n;
}

export function characteristics(s: string | undefined): Char[] {
  if (!s) return [];
  const out: Char[] = [];
  for (const [re, c] of CHARS) if (re.test(s) && !out.includes(c)) out.push(c);
  return out.slice(0, 3);
}

export function toFitRequest(
  step: string,
  profile: Profile,
  extras: Enrichment | null,
  swing: SwingRecord | null,
): FitRequest {
  const v = (k: string) => profile[k]?.value;
  const answers: Answers = {};
  const hand = v("hand")?.toLowerCase();
  if (hand?.startsWith("r")) answers.hand = "right";
  else if (hand?.startsWith("l")) answers.hand = "left";
  const sex = v("sex")?.toLowerCase();
  if (sex === "male" || sex === "female") answers.sex = sex;
  answers.score_bucket = scoreBucket(v("score"));
  const carry = unsure(v("carry")) ? null : num(v("carry"));
  if (carry !== null && carry >= 40 && carry <= 260) answers.carry_7i_yd = carry;
  const flight = v("flight")?.toLowerCase();
  if (flight === "low" || flight === "high") answers.flight = flight;
  else if (flight === "medium" || flight === "mid") answers.flight = "mid";
  const h = lengthCm(v("height"));
  if (h !== null && h >= 120 && h < 230) answers.height_cm = h;
  const w = lengthCm(v("wrist"));
  if (w !== null && w >= 55 && w <= 110) answers.wrist_to_floor_cm = w;
  const glove = v("glove")?.toUpperCase().replace(/\s/g, "");
  if (glove && ["XS", "S", "M", "M/L", "L", "XL"].includes(glove)) answers.glove = glove as Answers["glove"];
  const chars = characteristics(v("wants"));
  if (chars.length) answers.characteristics = chars as Answers["characteristics"];

  const measurements: Measurements = {};
  if (extras && !extras.skipped && extras.club === "7-iron") {
    if (extras.speed !== null && extras.speed >= 30 && extras.speed <= 130)
      measurements.speed_7i_mph = { value: extras.speed, sd: LAUNCH_MONITOR_SD_MPH, source: "measured", method: "launch_monitor" };
    if (extras.carry !== null) {
      // A launch-monitor carry is a measurement: no over-report correction (the engine applies that only to
      // a remembered carry). It also replaces the remembered carry in the engine.
      const yd = Math.round(convertCarry(extras.carry, extras.unit, "yd"));
      if (yd >= 40 && yd <= 260)
        measurements.carry_7i_yd = { value: yd, sd: LAUNCH_MONITOR_SD.carry, source: "measured", method: "launch_monitor" };
    }
    const lm = (v: number | null | undefined, lo: number, hi: number, sd: number) =>
      v !== null && v !== undefined && v >= lo && v <= hi ? { value: v, sd, source: "measured" as const, method: "launch_monitor" } : undefined;
    const launch = lm(extras.launch, 5, 40, LAUNCH_MONITOR_SD.launch);
    const spin = lm(extras.spin, 1000, 12000, LAUNCH_MONITOR_SD.spin);
    const landing = lm(extras.landing, 15, 65, LAUNCH_MONITOR_SD.landing);
    if (launch) measurements.launch_deg = launch;
    if (spin) measurements.spin_rpm = spin;
    if (landing) measurements.landing_deg = landing;
  }
  const shots = extras && !extras.skipped ? (extras.ballLine ?? []) : [];
  if (shots.length) {
    const mean = shots.reduce((a, b) => a + b, 0) / shots.length;
    measurements.ball_line_tilt_deg = {
      value: Math.round(mean * 10) / 10,
      sd: Math.round((BALL_LINE_SHOT_SD_DEG / Math.sqrt(shots.length)) * 100) / 100,
      source: "measured",
      method: `ball_line_tap_n${shots.length}`,
    };
  }
  if (swing?.tempo) {
    const { backswingS, downswingS, sd } = swing.tempo;
    measurements.backswing_s = { value: backswingS, sd, source: "measured", method: "video_pose" };
    measurements.downswing_s = { value: downswingS, sd, source: "measured", method: "video_pose" };
  }
  for (const k of Object.keys(answers) as (keyof Answers)[]) if (answers[k] === null) delete answers[k];
  return { step, answers, measurements };
}
