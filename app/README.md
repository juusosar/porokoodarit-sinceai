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
- Host chat (profiling with "Grant") -> `POST /v1/chat` (our LLM adapter, scripted fallback). Was Lovable AI gateway.
- Fit + reasons -> `POST /v1/fit`, host walkthrough + voice -> `POST /v1/explain` (+ `/v1/speak`). Was "pending validation".
- Saved fitting, extra data, head selection -> browser localStorage (30 days). Was Lovable Cloud (Supabase).
- Swing video -> read on the device with MediaPipe pose (tempo); never uploaded. Was a private cloud upload.
- Routes are files in `src/routes` (TanStack Router plugin regenerates `src/routeTree.gen.ts`; commit it).
- Hidden LLM switch panel: add `?demo=1`. Legacy screens for reference: `app/web_legacy`.

## Git workflow
Rebase-merge only, linear history. See [../CONTRIBUTING.md](../CONTRIBUTING.md).
