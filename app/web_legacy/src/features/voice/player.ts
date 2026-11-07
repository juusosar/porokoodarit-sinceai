import { API_URL, voiceMode } from "./config";

// One voice at a time for the whole app. Framework-free so it is easy to test and to remove.

export type Line = { text: string; token?: string | null };

const MUTE_KEY = "takomo-voice-muted";
let muted = readMuted();
let audio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* blocked storage: still mute for this visit */
  }
  if (next) stop();
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function stop(): void {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load(); // actually abort the download (removing src alone does not)
    audio = null;
  }
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* no browser TTS */
  }
}

export function speakUrl(line: Line): string | null {
  if (!line.token) return null;
  const q = new URLSearchParams({ text: line.text, token: line.token });
  return `${API_URL()}/v1/speak?${q}`;
}

function browserSpeak(text: string): void {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    window.speechSynthesis.speak(u);
  } catch {
    /* no browser TTS: captions carry the line */
  }
}

/**
 * Speak a host line. `force` = explicit "Hear it" tap: ignores mute and may use the browser voice.
 * Automatic lines only use the server voice (browser voice only as fallback when it fails), so with
 * server voice off the app stays silent unless the user asks.
 */
export function speak(line: Line, force = false): void {
  const mode = voiceMode();
  if (mode === "off" || !line.text) return;
  if (muted && !force) return;
  stop();
  const url = mode === "on" ? speakUrl(line) : null;
  if (!url) {
    if (force || mode === "browser") browserSpeak(line.text);
    return;
  }
  const a = new Audio();
  a.preload = "none"; // no provider call until play() is allowed
  a.src = url;
  audio = a;
  let started = false;
  let fellBack = false;
  const fallback = () => {
    // server voice failed before playing (budget, provider down, network): same line in the browser voice.
    // Once audio has started, a cut-off clip just ends; repeating the line would play it twice.
    if (started || fellBack || audio !== a) return;
    fellBack = true;
    audio = null;
    browserSpeak(line.text);
  };
  a.addEventListener("playing", () => (started = true));
  a.addEventListener("error", fallback);
  a.play().catch((e: unknown) => {
    // NotAllowedError = autoplay blocked before any user tap: stay quiet, captions are on screen
    if ((e as DOMException)?.name !== "NotAllowedError") fallback();
  });
}
