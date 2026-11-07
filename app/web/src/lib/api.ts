import type { FitRequest, FitState } from "@/types/fit-state";
import { env } from "@/lib/env";

const API_URL = env("VITE_API_URL", "http://localhost:8080");

export type Health = {
  status: string;
  version: string;
  schema_version: string;
  env: string;
};

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const r = await fetch(`${API_URL}/health`, { signal });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

export type RoleSetting = { provider: string; model: string };
export type LlmSettings = {
  roles: Record<string, RoleSetting>;
  providers: Record<string, boolean>;
  demo_mode: boolean;
};

export async function getSettings(): Promise<LlmSettings> {
  const r = await fetch(`${API_URL}/v1/settings`);
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

export async function putSettings(roles: Record<string, RoleSetting>, demoToken: string): Promise<LlmSettings> {
  const r = await fetch(`${API_URL}/v1/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Demo-Token": demoToken },
    body: JSON.stringify(roles),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  return r.json();
}

// ---------------------------------------------------------------- fit + explain (M6, POR-18)

export async function postFit(req: FitRequest, signal?: AbortSignal): Promise<FitState> {
  const r = await fetch(`${API_URL}/v1/fit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  return r.json();
}

export type Explanation = {
  source: "llm" | "template";
  provider: string;
  model: string | null;
  latency_ms: number;
  spoken_line: string;
  caption: string;
  parts: Partial<Record<string, string>>;
  fallback_reason: string | null;
  /** Present when server voice (TTS) is on; see features/voice. */
  audio_token?: string | null;
};

// Server re-runs the engine from inputs; a fit state is never sent (prompt-injection safe).
export async function postExplain(
  request: FitRequest,
  previousRequest: FitRequest | null,
  role: "step_line" | "final_walkthrough",
  signal?: AbortSignal,
): Promise<Explanation> {
  const r = await fetch(`${API_URL}/v1/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request: { ...request, previous: null },
      previous_request: previousRequest && {
        ...previousRequest,
        previous: null,
      },
      role,
    }),
    signal,
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------- host chat (POR-24)

export type ChatField = { value: string; status: "sure" | "guess" };
export type ChatReply = {
  source: "llm" | "template";
  provider: string;
  model: string | null;
  latency_ms: number;
  reply: string;
  profile: Record<string, ChatField>;
  fallback_reason: string | null;
  audio_token?: string | null;
};

/** Server chat budget is 12 s (TAKOMO_LLM_TIMEOUT_S_CHAT); past this the client gives up and shows a local line. */
export const CHAT_CLIENT_TIMEOUT_MS = 15_000;

/** Abort on the caller's signal or after `ms` (cold start / hung request never leaves the chat on dots). */
function withTimeout(ms: number, signal?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(new DOMException("timed out", "TimeoutError")), ms);
  const forward = () => c.abort(signal?.reason);
  if (signal?.aborted) forward();
  else signal?.addEventListener("abort", forward, { once: true });
  const done = () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  };
  return { signal: c.signal, done };
}

/** One profiling turn with the host. Only chat text + the profile labels are sent; never video. */
export async function postChat(
  messages: { role: "user" | "assistant"; text: string }[],
  profile: Record<string, ChatField>,
  signal?: AbortSignal,
  timeoutMs = CHAT_CLIENT_TIMEOUT_MS,
): Promise<ChatReply> {
  const t = withTimeout(timeoutMs, signal);
  try {
    const r = await fetch(`${API_URL}/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // API accepts 1-60 char labels (VALUE_MAX in api/takomo_api/llm/chat.py); trim rather than fail every later turn with 422.
      body: JSON.stringify({
        messages,
        profile: Object.fromEntries(
          Object.entries(profile)
            .filter(([, f]) => f.value.trim())
            .map(([k, f]) => [k, { value: f.value.trim().slice(0, 60), status: f.status }]),
        ),
      }),
      signal: t.signal,
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    return await r.json();
  } finally {
    t.done();
  }
}
