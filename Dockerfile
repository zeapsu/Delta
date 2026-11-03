# Delta self-hosted image (#74). Multi-arch (amd64/arm64): see the docker
# workflow and docs/self-hosting.md. Data (SQLite DB + backups) lives in /data.
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Toolchain only for better-sqlite3's fallback source build (no prebuild for
# the platform); it stays out of the runtime image.
FROM base AS build-tools
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

FROM build-tools AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The commit being built, for the in-app update notice (next.config.ts).
ARG DELTA_COMMIT=""
RUN npm run build

# Production deps only. tsx is one: `npm run token` runs in the container.
FROM build-tools AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force \
  && rm -rf node_modules/@next/swc-*-musl

FROM base AS runtime
ENV NODE_ENV=production \
    DATABASE_PATH=/data/delta.db \
    PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json next.config.ts tsconfig.json proxy.ts instrumentation.ts ./
COPY public ./public
COPY drizzle ./drizzle
COPY db ./db
COPY lib ./lib
COPY scripts ./scripts
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
# Migrations apply at server start (instrumentation.ts). Binds 0.0.0.0 inside
# the container; which host interface it is published on is the compose
# file's DELTA_BIND. scripts/start.mjs runs `next start`, and the sync/backup
# jobs too when DELTA_JOBS=on (single-container installs such as Unraid).
CMD ["node", "scripts/start.mjs"]
