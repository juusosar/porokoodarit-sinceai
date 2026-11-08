// Config lookup: runtime (window.__TAKOMO_ENV__, written by the web container at start) wins over
// build-time import.meta.env. One image can then run against any API URL / host.
// Build-time values are read by literal name so Vite inlines only these (not the whole env object).
const BUILD = {
  VITE_API_URL: import.meta.env.VITE_API_URL as string | undefined,
  VITE_SHOP_URL: import.meta.env.VITE_SHOP_URL as string | undefined,
  VITE_CLUB_TRACKING: import.meta.env.VITE_CLUB_TRACKING as string | undefined,
  VITE_VOICE: import.meta.env.VITE_VOICE as string | undefined,
  VITE_LIVE_FIT_CARD: import.meta.env.VITE_LIVE_FIT_CARD as string | undefined,
  VITE_SWING_SERVER: import.meta.env.VITE_SWING_SERVER as string | undefined,
};
type Key = keyof typeof BUILD;

declare global {
  interface Window {
    __TAKOMO_ENV__?: Partial<Record<Key, string>>;
  }
}

export function env(key: Key, fallback: string): string {
  // Empty runtime value = not set. Build-time keeps the old `??` semantics (empty string is a value).
  const runtime = typeof window !== "undefined" ? window.__TAKOMO_ENV__?.[key] : undefined;
  return runtime || (BUILD[key] ?? fallback);
}
