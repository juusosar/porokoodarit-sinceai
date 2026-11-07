import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSettings, putSettings, type LlmSettings } from "@/lib/api";

// Hidden demo panel (open with ?demo=1). Switches LLM provider/model per role at runtime.
// The API only accepts changes when TAKOMO_DEMO_MODE=true.
// eslint-disable-next-line react-refresh/only-export-components
export function demoEnabled(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("demo") === "1") sessionStorage.setItem("demo", "1");
    return sessionStorage.getItem("demo") === "1";
  } catch {
    return false;
  }
}

export function DemoPanel() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<LlmSettings | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (open) getSettings().then(setS, (e) => setMsg(String(e)));
  }, [open]);

  const update = (role: string, key: "provider" | "model", value: string) =>
    setS((cur) => (cur ? { ...cur, roles: { ...cur.roles, [role]: { ...cur.roles[role], [key]: value } } } : cur));

  return (
    <div className="fixed right-2 top-2 z-50 text-xs">
      <button className="border border-primary bg-background px-2 py-1 text-primary" onClick={() => setOpen(!open)}>
        demo
      </button>
      {open && (
        <div className="mt-1 w-72 space-y-3 border border-border bg-card p-3">
          {!s && <p>{msg || "Loading…"}</p>}
          {s &&
            Object.entries(s.roles).map(([role, cfg]) => (
              <fieldset key={role} className="space-y-1">
                <legend className="font-semibold">{role}</legend>
                <select
                  aria-label={`${role} provider`}
                  className="w-full bg-background p-1"
                  value={cfg.provider}
                  onChange={(e) => update(role, "provider", e.target.value)}
                >
                  {Object.entries(s.providers).map(([p, ok]) => (
                    <option key={p} value={p}>
                      {p}
                      {ok ? "" : " (no key)"}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`${role} model`}
                  className="w-full bg-background p-1"
                  value={cfg.model}
                  onChange={(e) => update(role, "model", e.target.value)}
                />
              </fieldset>
            ))}
          {s && (
            <Button
              size="sm"
              disabled={!s.demo_mode}
              onClick={() =>
                putSettings(s.roles).then(
                  (n) => (setS(n), setMsg("Saved")),
                  (e) => setMsg(String(e)),
                )
              }
            >
              {s.demo_mode ? "Save" : "API not in demo mode"}
            </Button>
          )}
          {msg && s && <p className="text-muted-foreground">{msg}</p>}
        </div>
      )}
    </div>
  );
}
