const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export type Health = { status: string; version: string; schema_version: string; env: string };

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
