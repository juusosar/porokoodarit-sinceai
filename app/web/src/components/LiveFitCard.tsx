// Live fit card: runs the engine (POST /v1/fit) on whatever the golfer has saved so far and shows the
// parts filling in, with a short "what changed" line after each update. UX not final.
// Self-contained on purpose: to remove it, delete the <LiveFitCard /> line in routes/__root.tsx
// (or set VITE_LIVE_FIT_CARD=off at runtime). It only reads the browser store, never writes.
import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { postFit } from "@/lib/api";
import { env } from "@/lib/env";
import { toFitRequest } from "@/lib/fit-request";
import { fittingSchema, type Profile } from "@/lib/fitting-schema";
import { getFittingToken } from "@/lib/fitting-session";
import { activeEnrichment, enrichmentSchema, type Enrichment } from "@/lib/enrichment-schema";
import { LOCAL_EVENT, readLocal } from "@/lib/local-store";
import { PARTS } from "@/lib/parts";
import { readSwing, type SwingRecord } from "@/lib/swing-store";
import type { FitState } from "@/types/fit-state";

// The final page shows the full fit; the bench page is a dev tool.
const HIDDEN_ON = ["/clubs", "/results", "/bench"];
const STEP_OF: Record<string, string> = { "/": "profile", "/swing": "swing", "/enrichment": "launch_monitor" };
const COLLAPSED_KEY = "takomo-live-fit-collapsed";
const DEBOUNCE_MS = 600;

export function liveFitCardEnabled(): boolean {
  return env("VITE_LIVE_FIT_CARD", "on") !== "off";
}

type Inputs = { profile: Profile; extras: Enrichment | null; swing: SwingRecord | null };

function readInputs(): Inputs | null {
  try {
    const token = getFittingToken();
    const snap = fittingSchema.safeParse(readLocal<unknown>("fitting", token));
    if (!snap.success || !Object.keys(snap.data.profile).length) return null;
    const ex = enrichmentSchema.safeParse(readLocal<unknown>("enrichment", token));
    return { profile: snap.data.profile, extras: ex.success ? activeEnrichment(ex.data) : null, swing: readSwing(token) };
  } catch {
    return null;
  }
}

function readCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    if (saved !== null) return saved === "1";
  } catch {
    /* storage blocked */
  }
  // Phones: start as a one-line bar so it doesn't cover the chat input.
  return typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches === true;
}

/** Parts whose value moved since the previous run (not first fills), as short "Part: a → b" lines. */
export function movedParts(state: FitState | null): string[] {
  const name = Object.fromEntries(PARTS) as Record<string, string>;
  return (state?.changes ?? [])
    .filter((c) => c.before && c.after && c.before !== c.after)
    .slice(0, 3)
    .map((c) => `${name[c.part] ?? c.part}: ${c.before} → ${c.after}`);
}

export function LiveFitCard() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hidden = HIDDEN_ON.some((p) => path === p || path.startsWith(`${p}/`));
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<FitState | null>(null);
  const [moved, setMoved] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const prev = useRef<FitState | null>(null);
  const lastKey = useRef("");

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(LOCAL_EVENT, bump);
    window.addEventListener("storage", bump); // other tabs
    return () => {
      window.removeEventListener(LOCAL_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  useEffect(() => {
    if (hidden) return;
    const c = new AbortController();
    const t = setTimeout(() => {
      const inputs = readInputs();
      if (!inputs) {
        prev.current = null;
        lastKey.current = "";
        setState(null);
        return;
      }
      const req = toFitRequest(STEP_OF[path] ?? "profile", inputs.profile, inputs.extras, inputs.swing);
      const key = JSON.stringify(req);
      if (key === lastKey.current) return; // same inputs, same fit
      postFit({ ...req, previous: prev.current }, c.signal).then(
        (st) => {
          lastKey.current = key;
          prev.current = { ...st, changes: [] };
          setState(st);
          setMoved(movedParts(st));
        },
        () => undefined, // the card is extra; the flow never depends on it
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [version, path, hidden]);

  useEffect(() => {
    if (!moved.length) return;
    const t = setTimeout(() => setMoved([]), 5000);
    return () => clearTimeout(t);
  }, [moved]);

  if (hidden || !state) return null;
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        /* storage blocked */
      }
      return !c;
    });
  };
  return (
    <aside
      aria-label="Your fit so far"
      data-testid="live-fit-card"
      className="fixed bottom-20 right-3 z-40 sm:bottom-3 w-[min(22rem,calc(100vw-1.5rem))] border border-border bg-background/95 text-foreground shadow-lg backdrop-blur"
    >
      <button type="button" onClick={toggle} aria-expanded={!collapsed} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
        <span>Your fit so far</span>
        {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {moved.length > 0 && (
        <p role="status" className="border-t border-border px-3 py-1.5 text-xs text-primary">
          {moved.join(" · ")}
        </p>
      )}
      {!collapsed && (
        <dl className="grid grid-cols-3 gap-x-3 gap-y-2 border-t border-border px-3 py-2 text-sm">
          {PARTS.map(([key, name]) => {
            const p = state.parts[key];
            return (
              <div key={key} className="min-w-0" data-testid={`live-part-${key}`}>
                <dt className="truncate text-[10px] uppercase text-muted-foreground">{name}</dt>
                <dd className="truncate font-medium">{p?.value == null ? "—" : p.label}</dd>
                <div className="mt-1 h-1 bg-muted" aria-hidden>
                  <div className="h-1 bg-primary transition-all" style={{ width: `${Math.round((p?.confidence ?? 0) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </dl>
      )}
    </aside>
  );
}
