# Deploy (containers)

Two images, both plain OCI containers that listen on `$PORT` (default 8080). Any host that runs a container
works: Cloud Run, Fly.io, Railway, Azure Container Apps, AWS App Runner, a VM with Docker.
`app/vision` (Modal GPU) is separate and not containerised here.

| Image | Build | Config |
|---|---|---|
| `api` | `docker build -t takomo-api app/api` | `TAKOMO_*` env vars (see `api/.env.example`) |
| `web` | `docker build -f web/Dockerfile -t takomo-web app` (context `app/`, needs `app/shared`) | `VITE_API_URL`, `VITE_SHOP_URL`, `VITE_CLUB_TRACKING`, `VITE_VOICE`, read at container start |

The web image writes `/env.js` from its env at start, so the **same image** runs against any API URL.
Without a value, the build-time `VITE_*` value (or app default) is used. Vercel / `npm run dev` use the
empty `public/env.js`, so they behave as before.

## Local full stack
```bash
cd app
cp api/.env.example api/.env        # optional: Gemini key / Vertex settings
docker compose up --build           # web http://localhost:3000, API http://localhost:8080
```
Vertex (keyless) in compose needs credentials in the container, e.g. mount ADC:
`-v ~/.config/gcloud:/home/app/.config/gcloud:ro`. Without LLM config the API uses templates.

## Build + push (any registry)
```bash
REGISTRY=<registry>/<repo> TAG=v1 PUSH=1 app/deploy/build.sh
```

## Cloud Run
Current setup (`gcloud run deploy --source app/api`) keeps working unchanged. Image-based alternative:
```bash
cp app/deploy/api.env.example.yaml app/deploy/api.env.yaml   # fill in, gitignored
GCP_PROJECT=<proj> REGISTRY=europe-north1-docker.pkg.dev/<proj>/takomo TAG=v1 app/deploy/cloudrun.sh
```
Deploys API + web, wires the web to the API URL. Fails if `api.env.yaml` is missing.
Careful: default service name `takomo-api` (`API_SERVICE`) + `--min-instances 1` (`API_MIN_INSTANCES`). If the live
`--source` service has that name, this switches it to image deploys and keeps one instance always on (cost). Then add the web URL to `TAKOMO_CORS_ORIGINS`.

## Other hosts
1. Push both images (above).
2. Create two services from the images. Port 8080 (or set `PORT`).
3. API env: `TAKOMO_*` vars. Web env: `VITE_API_URL=<public API URL>`.
4. API `TAKOMO_CORS_ORIGINS=<public web URL>`.
5. Health check: API `GET /health`, web `GET /`.

Vertex keyless auth only works on GCP (service account). Elsewhere use `TAKOMO_GEMINI_API_KEY` as a secret.

## Voice (ElevenLabs TTS, optional)
Off unless `TAKOMO_TTS_PROVIDER=elevenlabs`. Key lives in Secret Manager, never in env files or the web app:
```bash
printf '%s' "$ELEVENLABS_KEY" | gcloud secrets create takomo-elevenlabs-key --data-file=- --replication-policy=automatic
gcloud secrets add-iam-policy-binding takomo-elevenlabs-key \
  --member "serviceAccount:<run-service-account>" --role roles/secretmanager.secretAccessor
gcloud run services update takomo-api --region europe-north1 \
  --set-secrets TAKOMO_ELEVENLABS_API_KEY=takomo-elevenlabs-key:latest \
  --update-env-vars TAKOMO_TTS_PROVIDER=elevenlabs
```
Turn off: `--update-env-vars TAKOMO_TTS_PROVIDER=none` (API) or `VITE_VOICE=off` (web; no browser speech fallback). Check: `GET /v1/settings` → `voice.on`.

## Vercel (web, current)
Unchanged: root `app/web`, `VITE_*` set as build env in Vercel.
