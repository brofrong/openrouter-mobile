# OpenRouter Mobile

Expo + Tamagui client talking to OpenRouter through a Bun + Effect v4 RPC server. Auth is Better Auth (email/password, or OIDC SSO when configured). The app API is Effect RPC only — not tRPC, oRPC, or REST (except Better Auth `/api/auth/*`).

## Stack

| Piece | What this repo uses |
| --- | --- |
| Client | Expo SDK 57 (iOS / Android / web), Tamagui v5, Feature-Sliced Design |
| RPC | `effect/unstable/rpc` (`@effect/rpc` is not published on Effect 4 rc) |
| HTTP | `effect/unstable/http` (`HttpRouter`) |
| Server | Bun, Effect v4, `BunHttpServer` / `BunRuntime` from `@effect/platform-bun` |
| Auth | Better Auth 1.7.4 email/password or OIDC SSO, `@better-auth/expo`, `@better-auth/drizzle-adapter/relations-v2` |
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
cp .env.example .env   # OPENROUTER_API_KEY, BASE_URL
docker compose up -d
bun install
bun run --filter @openrouter-mobile/server start   # or `dev`; applies drizzle migrations, then listens
bun run --filter @openrouter-mobile/mobile web
```

Root `bun run dev` is Turbo (Expo `start` + server `--watch`). Smoke wants `mobile web` plus an explicit server `PORT`. Native: `bun run --filter @openrouter-mobile/mobile start` (then iOS / Android).

### Port 3000

The server defaults to `PORT=3000` and hostname `0.0.0.0`. If 3000 is already taken, pick a free port and point `BASE_URL` at it. Auth (`/api/auth/*`), RPC HTTP (`/rpc`), and RPC WebSocket (`/rpc/ws`) are derived from that origin:

```bash
PORT=3010 BASE_URL=http://localhost:3010 \
  bun run --filter @openrouter-mobile/server start

BASE_URL=http://localhost:3010 \
  bun run --filter @openrouter-mobile/mobile web
```

Better Auth `trustedOrigins` already includes Expo web on 8081, 8082, and 19006.

## Environment

Copy `.env.example` to `.env`. Required / used vars:

| Variable | Where | Notes |
| --- | --- | --- |
| `DATABASE_URL` | server, db | Default `postgres://openrouter:openrouter@localhost:5432/openrouter`. Prod compose builds this from `POSTGRES_*`. |
| `PORT` | server | HTTP listen port, default `3000`. Prod compose keeps `3000` (Caddy → `server:3000`). |
| `NODE_ENV` | server | Local default `development`. Prod compose defaults to `production`. |
| `OPENROUTER_API_KEY` | server only | Chat streaming. Missing key → chat send fails; media stubs still work. |
| `OPENROUTER_MODEL` | server | Chat model override. Default `openai/gpt-4o-mini`. |
| `BASE_URL` | server, mobile | Public origin (e.g. `https://openrouter.brofrong.ru`). Auth, `/rpc`, and `/rpc/ws` are derived from it. |
| `EXPO_PUBLIC_BASE_URL` | mobile / image build | Same origin as `BASE_URL`. Expo inlines `EXPO_PUBLIC_*`; `app.config` copies `BASE_URL` if this is unset. |
| `WEB_DIR` | server | Expo web export (`index.html`). Default `/app/web` (Docker). Missing file → static skipped. |
| `AUTH_DISABLE_SIGNUP` | server | `true`/`yes`/`1` disables new accounts (email sign-up and first-time OIDC login). Default `false`. |
| `OIDC_ISSUER` | server | Optional. Issuer or discovery URL. With client id/secret, OIDC is the only sign-in. Callback: `{BASE_URL}/api/auth/callback/oidc`. |
| `OIDC_CLIENT_ID` | server | Required together with `OIDC_ISSUER` and `OIDC_CLIENT_SECRET`. |
| `OIDC_CLIENT_SECRET` | server | Required together with `OIDC_ISSUER` and `OIDC_CLIENT_ID`. |
| `OIDC_SCOPES` | server | Default `openid email profile`. |
| `BETTER_AUTH_SECRET` | server | Optional. Seed on first boot if ≥32 chars; otherwise generated into `kv`. |
| `BETTER_AUTH_URL` | server | Optional legacy alias for `BASE_URL`. |
| `POSTGRES_USER` / `PASSWORD` / `DB` | compose | Postgres service + prod `DATABASE_URL`. |
| `DOMAIN` / `ACME_EMAIL` | Caddy | TLS host and ACME contact (`deploy/Caddyfile`). |
| `IMAGE_TAG` | compose | GHCR tag, default `latest`. |

## Quality

```bash
bun run check          # Biome lint + format
bun run check:fix      # Biome --write
bun run check-types    # per-package `tsc --noEmit` (mobile pins TypeScript ~6.0.3; do not typecheck Expo with root TS 7)
bun run db:migrate     # drizzle-orm migrate (also runs automatically on server start)
bun run --filter @openrouter-mobile/db db:generate  # drizzle-kit generate only
```

## Release

Version lives in the root `package.json`. `bun run release` bumps it, commits, tags `vX.Y.Z`, and pushes the commit + tag to `origin` — that tag is the only trigger for publishing images and the APK.

```bash
bun run release            # interactive: major / minor / bugfix
bun run release bugfix     # 0.0.1 → 0.0.2
bun run release minor      # 0.1.0
bun run release major      # 1.0.0
```

Tag `v*` runs **Release**: `ghcr.io/<owner>/openrouter-mobile/server` (API + web, semver + `latest`), and the APK on the GitHub Release. PRs / `main` only run Biome.

## Auth and RPC

- Default auth is email/password. Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` to switch to OIDC-only SSO. `AUTH_DISABLE_SIGNUP` disables registration. Email verification, extra OAuth providers, orgs, and 2FA are out of scope.
- Session cookie: `better-auth.session_token`. RPC requires a session except `Health` and `AuthSettings`.
- Unary RPCs (`ChatList`, `ChatSend`, `ImageGenerate`, …) go over HTTP POST `/rpc` (NDJSON).
- Streams (`ChatSubscribe`, `JobSubscribe`) go over WebSocket `/rpc/ws`.
- Stream protocol: persist each chunk to `stream_events` **before** PubSub. Reconnect: subscribe live → replay `seq > afterSeq` → tail live, dedup by seq.

Do not add tRPC, oRPC, Zod, Prisma, ESLint, Prettier, TanStack Query, NextAuth, or Clerk.
