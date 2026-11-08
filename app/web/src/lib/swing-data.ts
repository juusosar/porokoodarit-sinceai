// Every data point read from the swing video, in reading order, for the result and summary screens.
// `engine` marks the values sent to the fitting engine; the rest shows how they were reached.
import type { SwingRecord } from "@/lib/swing-store";
import { NOTE_TEXT } from "@/lib/swing-server";

export type SwingDataPoint = { label: string; value: string; engine?: boolean };
export type SwingDataStep = { title: string; points: SwingDataPoint[] };

const EVENT_ORDER = ["Address", "Toe-up", "Mid-backswing", "Top", "Mid-downswing", "Impact", "Mid-follow-through", "Finish"];
const s2 = (v: number) => `${v.toFixed(2)} s`;
const inches = (m: number) => `${(m * 39.37).toFixed(1)} in`;

/** The steps of the read and the numbers each step produced. Empty when no swing was read. */
export function swingDataSteps(r: SwingRecord | null): SwingDataStep[] {
  if (!r?.tempo) return [];
  const server = r.source === "server";
  const read = r.read;
  const steps: SwingDataStep[] = [];

  const clip: SwingDataPoint[] = [];
  if (r.slowMo && r.slowMo > 1) clip.push({ label: "Video speed", value: `slow motion ${r.slowMo}×` });
  if (read) {
    clip.push({ label: "Pose samples", value: `${read.samples} over ${read.durationS.toFixed(1)} s` });
    clip.push({ label: "Sample rate (real time)", value: `${Math.round(read.fps)} per s` });
  }
  clip.push({ label: "Sent to server", value: server ? "body keypoints only (head, shoulders, wrists, ankles)" : "nothing" });
  steps.push({ title: "Body pose read on this device", points: clip });

  const ev = Object.entries(r.events ?? {}).sort((a, b) => a[1] - b[1] || EVENT_ORDER.indexOf(a[0]) - EVENT_ORDER.indexOf(b[0]));
  if (ev.length) steps.push({ title: server ? "Swing phases (server)" : "Swing phases (on this device)", points: ev.map(([k, ms]) => ({ label: k.replace(/-/g, " "), value: s2(ms / 1000) })) });

  const t = r.tempo;
  steps.push({
    title: "Timing",
    points: [
      { label: "Backswing", value: `${s2(t.backswingS)} ± ${Math.round(t.sd * 1000)} ms`, engine: true },
      { label: "Downswing", value: `${s2(t.downswingS)} ± ${Math.round(t.sd * 1000)} ms`, engine: true },
      ...(t.ratio ? [{ label: "Tempo", value: `${t.ratio.toFixed(1)}:1` }] : []),
    ],
  });

  if (read?.dtl || r.dtl) {
    const d = read?.dtl;
    const pts: SwingDataPoint[] = [];
    if (d) {
      pts.push({ label: "Pose samples", value: String(d.samples) });
      if (d.addressMs !== null) pts.push({ label: "Takeaway starts", value: s2(d.addressMs / 1000) });
      pts.push({ label: "Club head found at address", value: `${d.headFound} of ${d.stillSamples} still samples` });
      if (d.shaftPx !== null) pts.push({ label: "Hands to club head", value: `${Math.round(d.shaftPx)} px` });
      if (d.shoulderPx !== null) pts.push({ label: "Shoulder width", value: `${Math.round(d.shoulderPx)} px` });
    }
    pts.push({ label: "Your hands to club head", value: r.shaftM ? inches(r.shaftM) : "not measured" });
    steps.push({ title: "Down-the-line view", points: pts });
  }

  if (server && (r.speed || read?.handTravelM)) {
    const pts: SwingDataPoint[] = [];
    if (read?.heightM) pts.push({ label: "Height used", value: `${Math.round(read.heightM * 100)} cm${read.heightFrom === "default" ? " (typical, none given)" : " (your profile)"}` });
    if (read?.shaftUsedM) pts.push({ label: "Hands to club head used", value: `${inches(read.shaftUsedM)}${read.shaftFrom === "down_the_line" ? " (measured)" : " (typical 7-iron)"}` });
    if (read?.handTravelM != null) pts.push({ label: "Hand travel, top to impact", value: `${read.handTravelM.toFixed(2)} m` });
    if (read?.handSpeedMps != null) pts.push({ label: "Hand speed, downswing", value: `${read.handSpeedMps.toFixed(1)} m/s` });
    pts.push({ label: "Club speed (estimate)", value: r.speed ? `${Math.round(r.speed.value)} mph ± ${Math.round(r.speed.sd)}` : "not estimated", engine: !!r.speed });
    steps.push({ title: "Speed estimate (double pendulum)", points: pts });
  }

  const notes = (r.notes ?? []).map((n) => NOTE_TEXT[n]).filter(Boolean);
  if (notes.length) steps.push({ title: "Notes", points: notes.map((n) => ({ label: "", value: n })) });
  return steps;
}

/** Profile summary rows the video replaces: tempo (timing only), speed (estimate) when not answered. */
export function swingProfileValue(key: string, answer: { value: string; status: string } | undefined, r: SwingRecord | null): string | null {
  if (!r?.tempo) return null;
  const t = r.tempo;
  if (key === "tempo") return `backswing ${s2(t.backswingS)} · downswing ${s2(t.downswingS)}${t.ratio ? ` · ${t.ratio.toFixed(1)}:1` : ""} · measured from video`;
  if (key === "speed" && r.speed && (!answer || answer.status !== "sure"))
    return `about ${Math.round(r.speed.value)} mph ± ${Math.round(r.speed.sd)} · estimated from swing video`;
  return null;
}

/** One line for the source data: the values the engine got from the video. */
export function swingSummaryLine(r: SwingRecord | null): string | null {
  if (!r?.tempo) return null;
  const t = r.tempo;
  return [
    `backswing ${s2(t.backswingS)}`, `downswing ${s2(t.downswingS)}`,
    ...(t.ratio ? [`tempo ${t.ratio.toFixed(1)}:1`] : []),
    ...(r.speed ? [`club speed ~${Math.round(r.speed.value)} mph (estimate)`] : []),
    ...(r.shaftM ? [`hands to club head ${inches(r.shaftM)}`] : []),
  ].join(" · ");
}
