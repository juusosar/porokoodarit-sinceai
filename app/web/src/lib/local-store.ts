// Browser-only persistence (privacy default: nothing about the golfer is stored server-side).
// Replaces Lovable Cloud (Supabase) tables. Records are keyed by the fitting capability token and
// expire after 30 days, same as the legacy saved fitting. Video never goes here.
const PREFIX = "takomo";
const TTL_MS = 30 * 24 * 3600 * 1000;

type Envelope<T> = { savedAt: number; value: T };

function key(kind: string, token: string) {
  return `${PREFIX}:${kind}:${token}`;
}

/** Fired on window after every write/remove, so live views (e.g. the live fit card) can re-read. */
export const LOCAL_EVENT = "takomo:local";

function changed() {
  try {
    window.dispatchEvent(new Event(LOCAL_EVENT));
  } catch {
    /* no window (tests/SSR) */
  }
}

export function readLocal<T>(kind: string, token: string): T | null {
  try {
    const raw = localStorage.getItem(key(kind, token));
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env.savedAt || Date.now() - env.savedAt > TTL_MS) {
      localStorage.removeItem(key(kind, token));
      return null;
    }
    return env.value;
  } catch {
    return null; // private mode / blocked storage / bad JSON: start fresh
  }
}

export function writeLocal<T>(kind: string, token: string, value: T): void {
  try {
    localStorage.setItem(key(kind, token), JSON.stringify({ savedAt: Date.now(), value } satisfies Envelope<T>));
  } catch {
    throw new Error("This browser blocked local storage.");
  }
  changed();
}

export function removeLocal(kind: string, token: string): void {
  try {
    localStorage.removeItem(key(kind, token));
    changed();
  } catch {
    /* ignore */
  }
}
