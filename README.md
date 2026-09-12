# OpenRouter Mobile

Expo + Tamagui client talking to OpenRouter through a Bun + Effect v4 RPC server. Auth is Better Auth (email/password). The app API is Effect RPC only — not tRPC, oRPC, or REST (except Better Auth `/api/auth/*`).

## Stack

| Piece | What this repo uses |
| --- | --- |
| Client | Expo SDK 57 (iOS / Android / web), Tamagui v5, Feature-Sliced Design |
| RPC | `effect/unstable/rpc` (`@effect/rpc` is not published on Effect 4 rc) |
| HTTP | `effect/unstable/http` (`HttpRouter`) |
| Server | Bun, Effect v4, `BunHttpServer` / `BunRuntime` from `@effect/platform-bun` |
| Auth | Better Auth 1.7.4 email/password, `@better-auth/expo`, `@better-auth/drizzle-adapter/relations-v2` |
| DB | PostgreSQL, `drizzle-orm@1.0.0-rc.5-ab785fc`, Relational Queries v2 (`defineRelations`) |
| Lint / format | Biome (`bun run check` / `bun run check:fix`). Not ESLint or Prettier. |

Packages are `@openrouter-mobile/*` (not `@repo/*`):

- `apps/mobile` — Expo app
- `apps/server` — Bun Effect server
- `packages/domain` — Effect Schema DTOs
- `packages/rpc` — RPC groups (`AppRpcs`)
- `packages/db` — Drizzle schema + relations

Chat uses the real OpenRouter API. Image / video / speech / audio jobs are **stubbed** and return placeholder URLs. The OpenRouter API key never leaves `apps/server`.

## Setup

```bash
cp .env.example .env   # BETTER_AUTH_SECRET, OPENROUTER_API_KEY, BETTER_AUTH_URL
docker compose up -d
bun install
bun run db:migrate
bun run --filter @openrouter-mobile/server start   # or `dev`; PORT if 3000 taken
bun run --filter @openrouter-mobile/mobile web
```

Root `bun run dev` is Turbo (Expo `start` + server `--watch`). Smoke wants `mobile web` plus an explicit server `PORT`. Native: `bun run --filter @openrouter-mobile/mobile start` (then iOS / Android).

### Port 3000

The server defaults to `PORT=3000` and hostname `0.0.0.0`. If 3000 is already taken, pick a free port and keep auth + RPC URLs in sync:

```bash
PORT=3010 BETTER_AUTH_URL=http://localhost:3010 \
  bun run --filter @openrouter-mobile/server start

EXPO_PUBLIC_AUTH_URL=http://localhost:3010 \
EXPO_PUBLIC_RPC_HTTP_URL=http://localhost:3010/rpc \
EXPO_PUBLIC_RPC_WS_URL=ws://localhost:3010/rpc/ws \
  bun run --filter @openrouter-mobile/mobile web
```

Better Auth `trustedOrigins` already includes Expo web on 8081, 8082, and 19006.

## Environment

Copy `.env.example` to `.env`. Required / used vars:

| Variable | Where | Notes |
| --- | --- | --- |
| `DATABASE_URL` | server, db | Default `postgres://openrouter:openrouter@localhost:5432/openrouter` |
| `OPENROUTER_API_KEY` | server only | Chat streaming. Missing key → chat send fails; media stubs still work. |
| `BETTER_AUTH_SECRET` | server | ≥32 characters. Required. |
| `BETTER_AUTH_URL` | server | Public origin of the auth/RPC server (must match `PORT`). |
| `PORT` | server | HTTP listen port, default `3000`. |
| `EXPO_PUBLIC_AUTH_URL` | mobile | Better Auth base URL (`/api/auth/*`). |
| `EXPO_PUBLIC_RPC_HTTP_URL` | mobile | Unary RPC, default `http://localhost:3000/rpc`. |
| `EXPO_PUBLIC_RPC_WS_URL` | mobile | Streams, default `ws://localhost:3000/rpc/ws`. |
| `OPENROUTER_MODEL` | server | Optional chat model override (`AppConfig` default `openai/gpt-4o-mini`). |

## Quality

```bash
bun run check          # Biome lint + format
bun run check:fix      # Biome --write
bun run check-types    # per-package `tsc --noEmit` (mobile pins TypeScript ~6.0.3; do not typecheck Expo with root TS 7)
bun run db:migrate     # drizzle-kit migrate
```

## Auth and RPC

- MVP auth is email/password only. Email verification, OAuth, orgs, and 2FA are out of scope.
- Session cookie: `better-auth.session_token`. RPC requires a session except `Health`.
- Unary RPCs (`ChatList`, `ChatSend`, `ImageGenerate`, …) go over HTTP POST `/rpc` (NDJSON).
- Streams (`ChatSubscribe`, `JobSubscribe`) go over WebSocket `/rpc/ws`.
- Stream protocol: persist each chunk to `stream_events` **before** PubSub. Reconnect: subscribe live → replay `seq > afterSeq` → tail live, dedup by seq.

Do not add tRPC, oRPC, Zod, Prisma, ESLint, Prettier, TanStack Query, NextAuth, or Clerk.
