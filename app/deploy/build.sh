#!/usr/bin/env bash
# Build (and optionally push) both images. Provider-neutral: any OCI registry.
#   REGISTRY=europe-north1-docker.pkg.dev/my-proj/takomo TAG=v1 PUSH=1 deploy/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REGISTRY="${REGISTRY:-takomo}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
PLATFORM="${PLATFORM:-linux/amd64}"   # Cloud Run / most hosts are amd64 (matters on Apple Silicon)

docker build --platform "$PLATFORM" -t "$REGISTRY/api:$TAG" api
docker build --platform "$PLATFORM" -t "$REGISTRY/web:$TAG" -f web/Dockerfile .

if [[ "${PUSH:-0}" == "1" ]]; then
  docker push "$REGISTRY/api:$TAG"
  docker push "$REGISTRY/web:$TAG"
fi
echo "api: $REGISTRY/api:$TAG"
echo "web: $REGISTRY/web:$TAG"
