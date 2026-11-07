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
  recheck: { field: string; reason: string } | null;
  fallback_reason: string | null;
};

/** One profiling turn with the host. Only chat text + the profile labels are sent; never video. */
export async function postChat(
  messages: { role: "user" | "assistant"; text: string }[],
  profile: Record<string, ChatField>,
  signal?: AbortSignal,
): Promise<ChatReply> {
  const r = await fetch(`${API_URL}/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // API accepts 1-40 char labels; trim rather than fail every later turn with 422.
    body: JSON.stringify({
      messages,
      profile: Object.fromEntries(
        Object.entries(profile)
          .filter(([, f]) => f.value.trim())
          .map(([k, f]) => [k, { value: f.value.trim().slice(0, 40), status: f.status }]),
      ),
    }),
    signal,
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}
