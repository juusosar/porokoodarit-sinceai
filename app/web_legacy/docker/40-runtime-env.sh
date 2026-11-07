#!/bin/sh
# Writes /env.js from container env so one image serves any environment. Unset = build-time value / app default.
set -eu
esc() { printf '%s' "$1" | tr -d '\n\r' | sed 's/\\/\\\\/g; s/"/\\"/g'; }
cat > /usr/share/nginx/html/env.js <<JS
window.__TAKOMO_ENV__ = {
  VITE_API_URL: "$(esc "${VITE_API_URL:-}")",
  VITE_SHOP_URL: "$(esc "${VITE_SHOP_URL:-}")",
  VITE_CLUB_TRACKING: "$(esc "${VITE_CLUB_TRACKING:-}")",
  VITE_VOICE: "$(esc "${VITE_VOICE:-}")"
};
JS
echo "runtime env written to /usr/share/nginx/html/env.js"
