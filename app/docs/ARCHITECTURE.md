# Takomo Fitter: architecture (v1, 7 Nov 2026)

Decision record for POR-7. Hackathon build; US market first.

## Principle
"Measured, not guessed." Inputs tagged asked / measured / estimated with an SD. A deterministic engine
picks the spec and its confidence. The LLM host only explains reason codes; it never decides.

## Components
| Part | Tech | Where it runs | Notes |
|---|---|---|---|
| `app/web` | Vite + React 18 + TS + Tailwind 3 (shadcn/Lovable token layout) | Phone browser, hosted on Vercel | Mobile first. Lovable exports drop in (`@/` alias, HSL CSS vars, `components/ui`). |
| Pose | MediaPipe Tasks JS, pose landmarker lite | Phone browser | Skeleton overlay + swing-window cut. Landmarks only leave the phone. |
| `app/api` | FastAPI + Pydantic v2, Python 3.12 | Cloud Run, min 1 instance (US) | Engine, fusion, LLM + TTS proxy, settings. Keys server-side only. |
| `app/vision` | YOLO11m club tracking (ONNX / TensorRT FP16) | Modal GPU (T4/L4) | Opt-in upload of ~1.5 s 640px clip, deleted after. Feature flag. |
| `app/shared` | JSON Schema (from Pydantic) + reason codes | Both | `fit_state.schema.json` → TS types via `npm run gen:types`. CI checks drift. |
| LLM | Own thin `LLMProvider` adapter; Gemini first | Called from API | Roles → models in config. Demo panel switch only when `TAKOMO_DEMO_MODE=true` + `X-Demo-Token`, model allowlist. `/v1/explain` takes inputs (FitRequest), re-runs the engine server-side, never a client state. JSON output validated (Pydantic) + spec-match guard + template fallback; rate limit + body cap per instance. |
| Jev (TypeSafe) | Optional adapter | Called from API | Flagged. Normaliser / guardrail / close-call 2nd opinion. Never decides. |
| Voice | `TTSProvider` (ElevenLabs Flash) | Called from API | Fixed lines pre-generated, dynamic lines after guardrail. Captions always on. |
| Storage | Browser state; opt-in MongoDB Atlas | Browser / Atlas | "Save my fitting" (no media, 30 d) + anonymous events. |

## Request flow
1. Each UI step posts `FitRequest` (answers + measurements + previous state) to `POST /v1/fit`.
2. Engine fuses evidence (inverse-variance), runs Takomo rules, validates against catalogue, returns `FitState`
   (per part: value, range, confidence, evidence, reason codes, close call) + diff vs previous.
3. UI updates the live fit card (changed parts pulse) and shows the What-changed toast.
4. Optional: `POST /v1/explain` turns `FitState` into host lines (LLM, guarded, fallback templates).

## Milestones → Linear
| M | Linear | Scope |
|---|---|---|
| M0+M1 | POR-7, POR-8 | This doc, privacy table, `app/` scaffold, shared schema, CI |
| M2 | POR-9 | Engine v1: catalogue, today's rules (5 Nov corrections), buildability validator |
| M3 | POR-15, POR-17 | Evidence fusion, confidence, close calls, stock vs custom |
| M4 | POR-10, POR-11 | Browser pose, skeleton overlay, tempo; Modal YOLO stub |
| M5 | POR-16 | LLM explain (Gemini), guard, fallback, demo panel |
| M6 | POR-18 | Live fit card, Why / What-changed, result screen, cart link stub |
| M7 | POR-19 | Dev-split eval vs lab baseline (77.1 → aim 83.6) |

## Branching
`main` ← `dev` ← one PR per milestone. Each PR: one review round by a separate agent, fixes applied, merged to `dev`.

## Not in scaffold
Speed from video (POR-12), photo measurements (POR-13), ball-line lie (POR-14): need Saturday TrackMan footage.
Capture format (240 fps / HEVC transcode) still open.
