# Takomo Fitter app

Iron fitting web tool for takomogolf.com. Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Data handling: [docs/DATA_PRIVACY.md](docs/DATA_PRIVACY.md).

```
app/
  web/     UI (Lovable design, ported): Vite SPA, React 19, TanStack Router, Tailwind 4, shadcn
  web_legacy/  previous MVP UI, reference only (not built or deployed)
  api/     FastAPI: engine, fusion, LLM proxy
  shared/  fit_state.schema.json (generated) + reason_codes.json
  vision/  Modal GPU YOLO service (M4)
  deploy/  container build + deploy scripts (any host)
  docs/
```

## Data & privacy

Where each piece of data is processed and stored, and for how long. Reflects the code on `dev` (7 Nov 2026).
Hosting: API on Google Cloud Run, europe-north1 (Finland). Gemini via Vertex AI, location `global`. Web on Vercel.

| Data | Processed on | Sent to | Stored | Retention |
|---|---|---|---|---|
| Card answers (hand, sex, score, carry, loft, flight, height, wrist-to-floor, glove) | Phone | API (Cloud Run), per request; also Gemini, as the card summary turn and profile labels in the chat | This browser's localStorage | 30 days, or until "Delete my data" |
| Chat messages the golfer types + profile labels | Phone | API, then Gemini (Google) to write the host's reply (last 6 turns) | localStorage (chat history); not stored by the API | 30 days in browser; Gemini per Google's API terms |
| Swing video | Phone (MediaPipe pose, self-hosted WASM) | Nowhere | Not stored | Gone when the page closes |
| Swing pose keypoints (9 body points per frame as numbers: head, shoulders, wrists, ankles; no images) | Phone | API `/v1/swing/analyze`, once per video (off with `VITE_SWING_SERVER=off`) | Not stored or logged by the API | Gone after the response |
| Swing timing (backswing / downswing seconds) + estimated club speed | API (main's algorithm), phone as fallback | API, per request | localStorage | 30 days, or until "Delete my data" |
| Extra data (launch monitor speed, carry, launch, spin, strike) | Phone | API: speed and carry only | localStorage | 30 days, or until "Delete my data" |
| Fit state (engine labels, reason codes and their params, e.g. carry said/used, own loft; rebuilt server-side from inputs) | API | Gemini, to word the explanation | Not stored by the API | Gemini per Google's API terms |
| Host lines (chat replies + explanation lines the API signed) | API | ElevenLabs, only when voice is on | Audio in API memory cache (not on disk) | Until instance restart / cache eviction; ElevenLabs per its API terms |
| Request logs (latency, token counts, error codes; an error may quote a short piece of model output) | API | Google Cloud Logging | Cloud Logging | Project log retention |
| Web fonts | Browser | Google Fonts (fonts.googleapis.com / gstatic.com) sees the page request (IP, user agent) | Browser cache | Browser cache |
| TrackMan session data (7 Nov test) | Team laptop | Nowhere | Local dev folder, with signed consent | Hackathon period |

Not built (no data flows): body / hand photo measurement, club tracking in the main flow (bench page only, on device),
server-side "save my fitting" (MongoDB Atlas), analytics events, Modal GPU path.

Rules
- Video never leaves the phone. Only timing numbers do.
- What the golfer types in chat goes to Gemini. Don't type names or contact details; the host never asks for them.
- API keys live only on the server. The voice endpoint only speaks lines the API signed itself.
- Pose model, MediaPipe and ONNX Runtime WASM are self-hosted with the web app. Fonts are the one third-party load.
- "Start over" begins a new fitting; older records stay until they expire (30 days) or "Delete my data" (result page) removes every Takomo key in this browser.
- Every upload has a skip path; the fit works with answers only (lower confidence, shown as such).
- Synthetic lab data is labelled synthetic and never presented as real golfers.

Source of truth: [docs/DATA_PRIVACY.md](docs/DATA_PRIVACY.md) (keep both in sync).

## Run locally
```bash
# API
cd app/api && uv venv && . .venv/bin/activate && uv pip install -e '.[dev]'
cp .env.example .env && uvicorn takomo_api.main:app --reload --port 8080

# Web
cd app/web && npm ci && cp .env.example .env.local && npm run dev   # http://localhost:5173
```

### Or with Docker (full stack, one command)
```bash
cd app && docker compose up --build   # web http://localhost:3000, API http://localhost:8080
```
Deploy + other hosts: [deploy/DEPLOY.md](deploy/DEPLOY.md).

## Schema changes
Edit `app/api/takomo_api/schema.py`, then:
```bash
cd app/api && python -m takomo_api.export_schema
cd ../web && npm run gen:types
```
CI fails if either generated file is stale.

## Web UI (from Lovable)
`app/web` is the Lovable design (original export kept at repo root `frontend/`), ported to a static SPA on our API:
- Host chat (profiling with "Gront") -> `POST /v1/chat` (our LLM adapter, scripted fallback). Was Lovable AI gateway.
- Fit + reasons -> `POST /v1/fit`, host walkthrough + voice -> `POST /v1/explain` (+ `/v1/speak`). Was "pending validation".
- Saved fitting, extra data, head selection -> browser localStorage (30 days). Was Lovable Cloud (Supabase).
- Swing video -> pose read on the device (MediaPipe); keypoints only -> `POST /v1/swing/analyze` (main's algorithm: tempo + estimated speed), on-device tempo as fallback. Video never uploaded. Was a private cloud upload. See `app/vision/research/README.md`.
- Routes are files in `src/routes` (TanStack Router plugin regenerates `src/routeTree.gen.ts`; commit it).
- Hidden LLM switch panel: add `?demo=1`. Legacy screens for reference: `app/web_legacy`.

## Git workflow
Rebase-merge only, linear history. See [../CONTRIBUTING.md](../CONTRIBUTING.md).
