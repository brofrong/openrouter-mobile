---
name: better-auth
description: How this repo uses Better Auth 1.7 with Expo and Drizzle Relations v2. Use when writing auth, sessions, sign-in, sign-up, cookies, or RPC AuthMiddleware.
---

# Better Auth in this repo

Installed: `better-auth@1.7.4`, `@better-auth/expo@1.7.4`, `@better-auth/drizzle-adapter@1.7.4`.

## Server imports (`apps/server/src/shared/auth.ts`)

```ts
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import { expo } from "@better-auth/expo"
import { betterAuth } from "better-auth"
import { account, createAuthDb, session, user, verification } from "@openrouter-mobile/db"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true }, // do NOT set requireEmailVerification
  plugins: [expo()],
  trustedOrigins: [
    "openrouter-mobile://",
    "http://localhost:8081",
    "http://localhost:3000",
    ...(process.env.NODE_ENV === "production" ? [] : ["exp://", "exp://**"]),
  ],
})

export type Session = typeof auth.$Infer.Session
```

- Adapter: `drizzleAdapter` from `@better-auth/drizzle-adapter/relations-v2` (NOT `better-auth/adapters/drizzle`, NOT `@better-auth/drizzle-adapter` default/v1).
- Server plugin: `expo()` from `@better-auth/expo`.
- Classic Drizzle client only: `createAuthDb` in `packages/db/src/client.ts` uses `drizzle-orm/postgres-js` + `postgres`. Effect `PgDrizzle` is not accepted by the adapter. `drizzle-orm/bun-sql` fails under `bun x auth generate` (CLI loads config with Node/jiti; `bun` is not resolvable).
- Mount `auth.handler` on the same Effect `HttpRouter` as RPC (`HttpRouter.add("*", "/api/auth/*", ...)` + `HttpServerRequest.toWeb` / `HttpServerResponse.fromWeb`). Better Auth HTTP, not Effect RPC.
- Email/password enabled; do not require email verification for MVP.
- Env: `BETTER_AUTH_SECRET` (>=32 chars), `BETTER_AUTH_URL`. Read by Better Auth from `process.env` (Bun `.env`). `AppConfig` also requires `BETTER_AUTH_SECRET`.

## Schema + relations

```bash
bun x auth@latest generate --config apps/server/src/shared/auth.ts --output packages/db/src/schema/auth.ts --yes
bun run --filter @openrouter-mobile/db db:generate
bun run db:migrate
```

Generated file exports tables plus `authRelations` via `defineRelationsPart`. Merge after app relations:

```ts
import { defineRelations } from "drizzle-orm"
import * as schema from "./schema"
import { authRelations } from "./schema/auth"

export const appRelations = defineRelations(schema, (r) => ({ /* chats, messages, jobs */ }))
export const relations = { ...appRelations, ...authRelations }
```

`chats.userId` and `generation_jobs.userId` FK to `user.id`.

## RPC session middleware (`apps/server/src/shared/AuthMiddleware.ts`)

```ts
import { RpcMiddleware } from "effect/unstable/rpc"
import { AppError } from "@openrouter-mobile/domain"

export class CurrentSession extends Context.Service<CurrentSession, Session>()(
  "@openrouter-mobile/server/CurrentSession",
) {}

export class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, {
  provides: CurrentSession
}>()("@openrouter-mobile/server/AuthMiddleware", { error: AppError }) {}

// Layer.succeed(AuthMiddleware, (effect, { headers }) =>
//   auth.api.getSession({ headers: webHeaders }) then Effect.provideService(effect, CurrentSession, session)
// )
```

Apply to every procedure except Health: `ChatRpcs.omit(...).middleware(AuthMiddleware).merge(HealthRpcs)`.

Server session: `auth.api.getSession({ headers })` with a Web `Headers` built from RPC `headers` (Effect headers are lowercase; include `cookie`).

## Expo client (T11)

- `createAuthClient` from `better-auth/react`
- `expoClient` from `@better-auth/expo/client`
- `expo-secure-store`
- RPC: `headers: { Cookie: await authClient.getCookie() }`, `credentials: "omit"` on native
- Cookie header format from sign-in `Set-Cookie`: `Cookie: better-auth.session_token=<token>.<url-encoded-hmac>`

Official Better Auth skill pack: `.cursor/skills/better-auth-official/`. Prefer this repo skill for stack and MVP scope: no email verification, adapter path `@better-auth/drizzle-adapter/relations-v2` (not `better-auth/adapters/drizzle`), and no Next.js/Prisma handlers. Use the official pack for library API details.

Docs: https://better-auth.com/docs/integrations/expo and https://better-auth.com/docs/adapters/drizzle
