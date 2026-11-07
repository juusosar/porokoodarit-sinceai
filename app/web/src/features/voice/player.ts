import { API_URL, voiceMode } from "./config";

// One voice at a time for the whole app. Framework-free so it is easy to test and to remove.

export type Line = { text: string; token?: string | null };

const MUTE_KEY = "takomo-voice-muted";
let muted = readMuted();
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
  cur = null;
  if (el && el.getAttribute("src")) {
    el.pause();
    el.removeAttribute("src");
    el.load(); // actually abort the download (removing src alone does not)
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

// One audio element for the whole app, "unlocked" by the first tap/key. Safari and iOS only let an element
// play without a gesture once it has played inside one; host lines arrive async (after the API answers),
// so a fresh `new Audio()` per line was blocked there and the line never even requested /v1/speak.
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
let el: HTMLAudioElement | null = null;
let unlocked = false;
let cur: { line: Line; started: boolean; fellBack: boolean } | null = null;

function element(): HTMLAudioElement {
  if (el) return el;
  const a = new Audio();
  a.preload = "none"; // no provider call until play() is allowed
  a.addEventListener("playing", () => {
    if (cur) cur.started = true;
  });
  a.addEventListener("error", () => fallback());
  el = a;
  return a;
}

function fallback(): void {
  // Server voice failed before playing (budget, provider down, network): same line in the browser voice.
  // Once audio has started, a cut-off clip just ends; repeating the line would play it twice.
  const c = cur;
  if (!c || c.started || c.fellBack) return;
  c.fellBack = true;
  browserSpeak(c.line.text);
}

/**
 * Runs inside user gestures until one succeeds: plays inside the gesture so the shared element (and the
 * browser voice) count as user-started. A line blocked earlier (e.g. on page load) plays right here;
 * otherwise a short silent clip primes the element.
 */
export function unlock(): void {
  if (unlocked || voiceMode() === "off") return;
  const a = element();
  if (cur?.started) {
    unlocked = true; // a line is already playing: the element works, don't cut it off
    return;
  }
  const pending = cur && !cur.started && a.getAttribute("src") ? cur : null;
  if (!pending) a.src = SILENT;
  a.play().then(
    () => {
      unlocked = true;
      if (!pending && a.src === SILENT) a.pause();
    },
    () => undefined, // not a gesture this browser accepts (or aborted by a new line): retry on the next one
  );
  try {
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(""));
  } catch {
    /* no browser TTS */
  }
}

if (typeof window !== "undefined") {
  // iOS counts touchend/pointerup/click as media gestures, not pointerdown/touchstart.
  for (const ev of ["touchend", "pointerup", "click", "keydown"]) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
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
  const a = element();
  const me = { line, started: false, fellBack: false };
  cur = me;
  a.src = url;
  a.play().catch((e: unknown) => {
    if (cur !== me) return; // replaced by a newer line
    if ((e as DOMException)?.name === "NotAllowedError") {
      // autoplay blocked (no tap on the page yet): stay quiet, captions are on screen
      console.info("[voice] autoplay blocked by the browser; tap the page or use Hear it");
      return;
    }
    fallback();
  });
}
