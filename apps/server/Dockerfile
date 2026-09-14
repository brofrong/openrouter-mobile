# syntax=docker/dockerfile:1
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

ENV NODE_ENV=production
WORKDIR /app/apps/server
EXPOSE 3000

CMD ["bun", "src/app/main.ts"]
