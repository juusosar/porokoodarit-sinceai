// Flow from Notion "App Workflow Breakdown". Each step has a one-line Why (shown before the user acts).
export type Step = { path: string; key: string; title: string; why: string; optional?: boolean };

export const STEPS: Step[] = [
  { path: "/", key: "intro", title: "Find your fit", why: "Measured, not guessed. Takes about 5 minutes." },
  { path: "/profile", key: "profile", title: "About you", why: "Height + wrist-to-floor set your length and lie." },
  { path: "/swing", key: "swing", title: "Your swing", why: "Your tempo and speed pick the shaft that suits you." },
  {
    path: "/launch-monitor",
    key: "launch_monitor",
    title: "Launch monitor",
    why: "Got TrackMan or radar numbers? They beat any guess.",
    optional: true,
  },
  { path: "/result", key: "result", title: "Your fit", why: "Every part, with the reason behind it." },
];

export function stepIndex(path: string): number {
  return Math.max(0, STEPS.findIndex((s) => s.path === path));
}
