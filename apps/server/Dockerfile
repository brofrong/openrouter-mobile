# syntax=docker/dockerfile:1
FROM oven/bun:1.4.2 AS web

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/rpc/package.json packages/rpc/package.json

RUN bun install --frozen-lockfile

COPY apps/mobile apps/mobile
COPY packages/domain packages/domain
COPY packages/rpc packages/rpc

ARG EXPO_PUBLIC_BASE_URL=http://localhost:3000
ENV EXPO_PUBLIC_BASE_URL=$EXPO_PUBLIC_BASE_URL
ENV BASE_URL=$EXPO_PUBLIC_BASE_URL
ENV CI=1
ENV EXPO_NO_TELEMETRY=1
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=4096

WORKDIR /app/apps/mobile
# Metro workers can keep the Expo CLI process alive after "Exported: dist".
RUN set -eu; \
  bunx expo export --platform web & \
  expo_pid=$!; \
  for _ in $(seq 1 180); do \
    if [ -f dist/index.html ] && [ -d dist/_expo ]; then \
      sleep 3; \
      kill "$expo_pid" 2>/dev/null || true; \
      wait "$expo_pid" 2>/dev/null || true; \
      exit 0; \
    fi; \
    if ! kill -0 "$expo_pid" 2>/dev/null; then \
      wait "$expo_pid" || true; \
      test -f dist/index.html && test -d dist/_expo; \
      exit 0; \
    fi; \
    sleep 1; \
  done; \
  kill "$expo_pid" 2>/dev/null || true; \
  echo "expo export timed out before writing dist"; \
  exit 1

FROM oven/bun:1.4.2-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/rpc/package.json packages/rpc/package.json

RUN bun install --frozen-lockfile --production

COPY apps/server apps/server
COPY packages packages
COPY --from=web /app/apps/mobile/dist /app/web

ENV NODE_ENV=production
ENV WEB_DIR=/app/web
WORKDIR /app/apps/server
EXPOSE 3000

CMD ["bun", "src/app/main.ts"]
