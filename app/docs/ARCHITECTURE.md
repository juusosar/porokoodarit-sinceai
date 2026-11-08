# Takomo Fitter: architecture (v1, updated 8 Nov 2026)

Decision record for POR-7. Hackathon build; US market first.

## Principle
"Measured, not guessed." Inputs tagged asked / measured / estimated with an SD. A deterministic engine
picks the spec and its confidence. The LLM host only explains reason codes; it never decides.

## Components
| Part | Tech | Where it runs | Notes |
|---|---|---|---|
| `app/web` | Lovable UI ported to a Vite SPA: React 19 + TanStack Router + Tailwind 4 + shadcn | Device browser, hosted on Vercel | Mobile first. Chat profiling (`/v1/chat`), swing keypoints (`/v1/swing/analyze`), engine fit (`/v1/fit`), host lines (`/v1/explain`). State in localStorage. |
| Pose | MediaPipe Tasks JS, pose landmarker lite | Device browser | 9 keypoints per frame; only these numbers leave the device, never the video. Device tempo = fallback when the API can't read the swing. |
| Swing analysis | Team research `phase_detector.py` + `swing_analytics.py` in `api/takomo_api/swing/upstream/` | API `POST /v1/swing/analyze` | Tempo, video club speed, shaft length (optional down-the-line clip). Adapters in `swing/measure.py`. Not stored or logged. |
| `app/api` | FastAPI + Pydantic v2, Python 3.12 | Cloud Run, europe-north1 | Engine, fusion, LLM + TTS proxy, settings. Keys server-side only. |
| Club detector | SwingTrace YOLO11m, ONNX FP16, onnxruntime-web WebGPU (`web/src/lib/club`) | Device browser | Club head on the down-the-line clip's address frames. Whole-swing tracking only on bench page `/bench/club` (deprioritised 7 Nov). |
| `app/vision` | ONNX export, swing research pipeline + ball-line photos (`research/`); Modal GPU stub | Dev machine | Modal stub unused, not deployed. |
| `app/shared` | JSON Schema (from Pydantic) + reason codes | Both | `fit_state.schema.json` → TS types via `npm run gen:types`. CI checks drift. |
| LLM | Own thin `LLMProvider` adapter; Gemini first | Called from API | Roles → models in config. Demo panel switch only when `TAKOMO_DEMO_MODE=true` + `X-Demo-Token`, model allowlist. `/v1/explain` takes inputs (FitRequest), re-runs the engine server-side, never a client state. JSON output validated (Pydantic) + spec-match guard + template fallback; rate limit + body cap per instance. |
| Voice (TTS) | `api/takomo_api/tts/` + `web/src/features/voice/`, ElevenLabs Flash v2.5 | Called from API | Live in production; off by default in code (`TAKOMO_TTS_PROVIDER=none`). On: `/v1/explain` adds an HMAC `audio_token` to each spoken_line; fixed host banner lines (`shared/host_lines.json`, swing + extra-data screens) get tokens from `GET /v1/voice/lines`; `GET /v1/speak` streams mp3 only for signed lines (no open TTS proxy), memory LRU cache, rate limit + daily char cap. Web: `VITE_VOICE=on|off`, mute toggle (remembered), captions always on, no browser speech fallback (server voice fails = silent). |
| Jev (TypeSafe) | Optional adapter | Called from API | Flagged. Normaliser / guardrail / close-call 2nd opinion. Never decides. |
| Storage | Browser localStorage | Browser | Saved fitting (no media), 30 days, "Delete my data". Server save (MongoDB Atlas) not built. |

## Request flow
0. Optional swing video: device sends pose keypoints to `POST /v1/swing/analyze`, gets measurements back.
1. Each UI step posts `FitRequest` (answers + measurements + previous state) to `POST /v1/fit`.
2. Engine fuses evidence (inverse-variance), runs Takomo rules, validates against catalogue, returns `FitState`
   (per part: value, range, confidence, evidence, reason codes, close call) + diff vs previous.
3. UI updates the live fit card (changed parts pulse) and shows the What-changed toast.
4. Optional: `POST /v1/explain` turns `FitState` into host lines (LLM, guarded, fallback templates).
5. Optional: `GET /v1/speak` reads a signed host line aloud (voice on only).

## Milestones → Linear
| M | Linear | Scope |
|---|---|---|
| M0+M1 | POR-7, POR-8 | This doc, privacy table, `app/` scaffold, shared schema, CI |
| M2 | POR-9 | Engine v1: catalogue, today's rules (5 Nov corrections), buildability validator |
| M3 | POR-15, POR-17 | Evidence fusion, confidence, close calls, stock vs custom |
| M4 | POR-10, POR-11 | Browser pose, skeleton overlay, tempo; Modal YOLO stub |
| M5 | POR-16 | LLM explain (Gemini), guard, fallback, demo panel |
| M6 | POR-18, POR-15 | Live fit card (evidence tags, close calls), What-changed toast, host line, profile / launch-monitor / result screens, stock vs custom, cart link stub, answer-vs-measurement follow-up (CONTRADICTION) |
| M7 | POR-19 | Dev-split eval vs lab baseline (77.1 → aim 83.6). Result (dev, no loft): 84.75 with evidence, 78.06 answers only; train 84.46 / 77.85. Script: `app/api/eval/dev_split.py`, results: `docs/EVAL.md`. |

## Branching
`main` ← one PR per change (until 8 Nov work went through `dev`, then migrated onto `main`). Each PR: one review round by a separate agent, fixes applied, rebase-merged.

## Not built
Photo measurements (POR-13), server-side save, real cart links. Built since v1: video club speed and ball-line lie test.
