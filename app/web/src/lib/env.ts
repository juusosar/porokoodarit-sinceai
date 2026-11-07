// Config lookup: runtime (window.__TAKOMO_ENV__, written by the web container at start) wins over
// build-time import.meta.env. One image can then run against any API URL / host.
type Key = "VITE_API_URL" | "VITE_SHOP_URL" | "VITE_CLUB_TRACKING";

declare global {
  interface Window {
    __TAKOMO_ENV__?: Partial<Record<Key, string>>;
  }
}

export function env(key: Key, fallback: string): string {
  const runtime = typeof window !== "undefined" ? window.__TAKOMO_ENV__?.[key] : undefined;
  return runtime || (import.meta.env[key] as string | undefined) || fallback;
}
