import type { Explanation } from "@/lib/api";
import type { Line } from "./player";

export function lineOf(e: Explanation | null | undefined): Line | null {
  return e ? { text: e.spoken_line, token: e.audio_token } : null;
}
