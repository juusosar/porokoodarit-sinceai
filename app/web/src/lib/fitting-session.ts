import { sessionTokenSchema } from "./fitting-schema";
import { sweepExpired } from "./local-store";

const KEY = "takomo-fitting-session";
// Blocked storage (private mode, strict settings): keep the token for this page load so the flow still works.
let memoryToken: string | null = null;
let swept = false;

/** Call only after hydration or in an event handler. Only the capability is stored locally. */
export function getFittingToken(): string {
  if (!swept) {
    swept = true;
    sweepExpired(); // older fittings' records expire after 30 days too, not only the current one
  }
  let existing: string | null = memoryToken;
  try {
    existing = localStorage.getItem(KEY) ?? memoryToken;
  } catch {
    /* storage blocked */
  }
  if (existing && sessionTokenSchema.safeParse(existing).success) return existing;
  return startNewFitting();
}

/** Start a separate fitting without modifying the previous records. */
export function startNewFitting(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  memoryToken = token;
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* storage blocked: memory only */
  }
  return token;
}
