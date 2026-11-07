import { sessionTokenSchema } from "./fitting-schema";

const KEY = "takomo-fitting-session";

/** Call only after hydration or in an event handler. Only the capability is stored locally. */
export function getFittingToken(): string {
  const existing = localStorage.getItem(KEY);
  if (sessionTokenSchema.safeParse(existing).success && existing) return existing;
  return startNewFitting();
}

/** Start a separate fitting without modifying the previous Cloud records. */
export function startNewFitting(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(KEY, token);
  return token;
}