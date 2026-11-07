#!/usr/bin/env bash
# Deploy prebuilt images to Cloud Run (one provider adapter; see DEPLOY.md for others).
# Images from deploy/build.sh with PUSH=1. Env vars for the API are passed through from the shell / env file.
#   GCP_PROJECT=my-proj REGISTRY=europe-north1-docker.pkg.dev/my-proj/takomo TAG=v1 deploy/cloudrun.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # app/
: "${GCP_PROJECT:?set GCP_PROJECT}" "${REGISTRY:?set REGISTRY}" "${TAG:?set TAG}"
REGION="${REGION:-europe-north1}"
API_SERVICE="${API_SERVICE:-takomo-api}"
WEB_SERVICE="${WEB_SERVICE:-takomo-web}"
API_ENV_FILE="${API_ENV_FILE:-deploy/api.env.yaml}"   # relative to app/; YAML map of TAKOMO_* vars, never committed

[[ -f "$API_ENV_FILE" ]] || { echo "missing $API_ENV_FILE (copy deploy/api.env.example.yaml)" >&2; exit 1; }

gcloud run deploy "$API_SERVICE" --project "$GCP_PROJECT" --region "$REGION" \
  --image "$REGISTRY/api:$TAG" --allow-unauthenticated --min-instances "${API_MIN_INSTANCES:-1}" \
  --env-vars-file "$API_ENV_FILE"

API_URL="$(gcloud run services describe "$API_SERVICE" --project "$GCP_PROJECT" --region "$REGION" --format 'value(status.url)')"

gcloud run deploy "$WEB_SERVICE" --project "$GCP_PROJECT" --region "$REGION" \
  --image "$REGISTRY/web:$TAG" --allow-unauthenticated \
  --set-env-vars "VITE_API_URL=$API_URL"

echo "API: $API_URL"
echo "Web: $(gcloud run services describe "$WEB_SERVICE" --project "$GCP_PROJECT" --region "$REGION" --format 'value(status.url)')"
echo "Remember: add the web URL to TAKOMO_CORS_ORIGINS on the API."
