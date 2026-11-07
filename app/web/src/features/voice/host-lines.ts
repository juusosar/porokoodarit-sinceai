import { useEffect, useState } from "react";
import data from "@shared/host_lines.json";
import { API_URL, voiceMode } from "./config";
import type { Line } from "./player";

// Fixed host banner lines (app/shared/host_lines.json). The web shows them; the API signs the same text
// for the server voice (GET /v1/voice/lines), so /v1/speak still only reads lines the API vouches for.
export type HostLineId = keyof typeof data.lines;

export function hostParagraphs(id: HostLineId): readonly string[] {
  return data.lines[id];
}

export function hostText(id: HostLineId): string {
  return data.lines[id].join(" ");
}

type Tokens = Partial<Record<HostLineId, string | null>>;
let tokens: Promise<Tokens> | null = null;

/** One request per visit; server voice off (route not mounted) or offline = no tokens = silent. */
export function loadTokens(): Promise<Tokens> {
  if (voiceMode() !== "on") return Promise.resolve({});
  tokens ??= fetch(`${API_URL()}/v1/voice/lines`)
    .then((r) => (r.ok ? r.json() : { tokens: {} }))
    .then((b: { tokens?: Tokens }) => b.tokens ?? {})
    .catch(() => {
      tokens = null; // network blip: try again on the next screen
      return {};
    });
  return tokens;
}

/** Line for a fixed banner; the token arrives a moment later (then useSpeakLine plays it). */
export function useHostLine(id: HostLineId): Line {
  const [map, setMap] = useState<Tokens>({});
  useEffect(() => {
    let live = true;
    void loadTokens().then((t) => live && setMap(t));
    return () => {
      live = false;
    };
  }, []);
  return { text: hostText(id), token: map[id] ?? null };
}
