import { env } from "@/lib/env";

/**
 * VITE_VOICE (build or runtime env):
 * - "on" (default): server voice (ElevenLabs via the API) when the line is signed, else the browser voice.
 * - "browser": browser speechSynthesis only, never calls the API for audio.
 * - "off": no voice at all, no voice UI. Captions are always shown regardless.
 */
export type VoiceMode = "on" | "browser" | "off";

export function voiceMode(): VoiceMode {
  const v = env("VITE_VOICE", "on").trim().toLowerCase();
  if (v === "off" || v === "false" || v === "0") return "off";
  if (v === "browser") return "browser";
  return "on";
}

export const API_URL = () => env("VITE_API_URL", "http://localhost:8080");
