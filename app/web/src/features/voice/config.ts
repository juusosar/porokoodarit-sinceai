import { env } from "@/lib/env";

/**
 * VITE_VOICE (build or runtime env):
 * - "on" (default): server voice (ElevenLabs via the API) for signed lines. No browser speech fallback:
 *   if the API has voice off or the audio fails, the app stays silent and the captions carry the line.
 * - "off": no voice at all, no voice UI. Captions are always shown regardless.
 * (The old "browser" mode is gone; that value now means "on".)
 */
export type VoiceMode = "on" | "off";

export function voiceMode(): VoiceMode {
  const v = env("VITE_VOICE", "on").trim().toLowerCase();
  if (v === "off" || v === "false" || v === "0") return "off";
  return "on";
}

export const API_URL = () => env("VITE_API_URL", "http://localhost:8080");
