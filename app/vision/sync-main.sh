#!/usr/bin/env bash
# Copy Katariina's swing processing code from `main` into the app/ layout and record the source commit.
#   app/vision/sync-main.sh            # sync from origin/main (fetches first)
#   app/vision/sync-main.sh --check    # exit 1 if any copy differs from origin/main (CI drift warning)
# Copies stay verbatim: our fixes live in app/api/takomo_api/swing/measure.py, never in upstream/.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
REF="${SYNC_REF:-origin/main}"

# main path -> app path
MAP=(
  "phase_detector.py:app/api/takomo_api/swing/upstream/phase_detector.py"
  "swing_analytics.py:app/api/takomo_api/swing/upstream/swing_analytics.py"
  "video_preprocessing.py:app/vision/research/video_preprocessing.py"
  "video_preprocessing.ipynb:app/vision/research/video_preprocessing.ipynb"
)
UPSTREAM_FILE=app/api/takomo_api/swing/upstream/UPSTREAM

git fetch -q origin main || true
SHA=$(git rev-parse --short "$REF")

if [[ "${1:-}" == "--check" ]]; then
  drift=()
  for m in "${MAP[@]}"; do
    src=${m%%:*}; dst=${m#*:}
    if ! git cat-file -e "$REF:$src" 2>/dev/null; then drift+=("$src (gone on main)"); continue; fi
    [[ "$(git rev-parse "$REF:$src")" == "$(git hash-object "$dst")" ]] || drift+=("$src -> $dst")
  done
  if ((${#drift[@]})); then
    echo "main ($SHA) has swing code changes not synced (synced: $(head -1 "$UPSTREAM_FILE")):"
    printf '  %s\n' "${drift[@]}"
    echo "Run app/vision/sync-main.sh, check app/api/tests/test_swing.py, review measure.py adapters."
    exit 1
  fi
  echo "swing code in sync with main $SHA"
  exit 0
fi

for m in "${MAP[@]}"; do
  src=${m%%:*}; dst=${m#*:}
  git show "$REF:$src" > "$dst"
  echo "synced $src -> $dst"
done
printf '%s\n%s\n' "$(git rev-parse "$REF")" "Synced from main by app/vision/sync-main.sh on $(date -u +%F). Do not edit these files here." > "$UPSTREAM_FILE"
echo "UPSTREAM -> $SHA"
