const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export type Health = { status: string; version: string; schema_version: string; env: string };

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const r = await fetch(`${API_URL}/health`, { signal });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}
