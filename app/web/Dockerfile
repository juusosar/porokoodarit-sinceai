# Web image: static Vite build served by nginx (non-root). Build context = app/ (needs app/shared):
#   docker build -f web/Dockerfile -t takomo-web .
# Runtime env (no rebuild per environment): VITE_API_URL, VITE_SHOP_URL, VITE_CLUB_TRACKING, VITE_VOICE, VITE_LIVE_FIT_CARD, PORT (default 8080).
FROM node:22-alpine AS build
WORKDIR /src/web
COPY web/package.json web/package-lock.json web/.npmrc ./
RUN npm ci --no-audit --no-fund
COPY shared /src/shared
COPY web ./
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
ENV PORT=8080
COPY web/docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 web/docker/40-runtime-env.sh /docker-entrypoint.d/40-runtime-env.sh
# Group 0 + g+w: env.js stays writable when a host runs the image as an arbitrary UID (OpenShift, k8s runAsUser).
COPY --from=build --chown=101:0 /src/web/dist /usr/share/nginx/html
USER root
RUN chmod -R g+w /usr/share/nginx/html
USER 101
EXPOSE 8080
