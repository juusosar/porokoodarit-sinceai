# Takomo Fitter app

Iron fitting web tool for takomogolf.com. Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Data handling: [docs/DATA_PRIVACY.md](docs/DATA_PRIVACY.md).

```
app/
  web/     Vite + React + TS + Tailwind (shadcn / Lovable token layout)
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

## Adding Lovable screens
Lovable exports use the same stack (Vite, React, TS, Tailwind, shadcn). Copy their `src/components` and
`src/pages` into `app/web/src`. Keep our `src/index.css` tokens and `tailwind.config.ts`; theirs are not needed.
Use semantic classes (`bg-background`, `text-primary`, `bg-card`) not raw hex, so the Takomo theme applies.

## Git workflow
Rebase-merge only, linear history. See [../CONTRIBUTING.md](../CONTRIBUTING.md).
