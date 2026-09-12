---
name: better-auth
description: How this repo uses Better Auth 1.7 with Expo and Drizzle Relations v2. Use when writing auth, sessions, sign-in, sign-up, cookies, or RPC AuthMiddleware.
---

# Better Auth in this repo

Installed: `better-auth@1.7.4`, `@better-auth/expo@1.7.4`, `@better-auth/drizzle-adapter@1.7.4`.

## Server (`apps/server/src/shared/auth.ts`)

```ts
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import { expo } from "@better-auth/expo"
import { betterAuth } from "better-auth"
import { account, createAuthDb, session, user, verification } from "@openrouter-mobile/db"
import { trustedOrigins } from "./origins"

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://openrouter:openrouter@localhost:5432/openrouter"

const db = createAuthDb(databaseUrl)

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true }, // do NOT set requireEmailVerification
  plugins: [expo()],
  trustedOrigins: [...trustedOrigins], // origins.ts is ReadonlyArray; Better Auth wants string[]
})

export type Session = typeof auth.$Infer.Session
```

- `trustedOrigins` and RPC CORS share `apps/server/src/shared/origins.ts` (Expo web 8081/8082/19006 + `openrouter-mobile://` / `exp://`).
- Adapter: `drizzleAdapter` from `@better-auth/drizzle-adapter/relations-v2` (NOT `better-auth/adapters/drizzle`, NOT `@better-auth/drizzle-adapter` default/v1).
- Server plugin: `expo()` from `@better-auth/expo`.
- Classic Drizzle client only: `createAuthDb` in `packages/db/src/client.ts` uses `drizzle-orm/postgres-js` + `postgres`. Effect `PgDrizzle` is not accepted by the adapter. `drizzle-orm/bun-sql` fails under `bun x auth generate` (CLI loads config with Node/jiti; `bun` is not resolvable).
- Mount `auth.handler` on the same Effect `HttpRouter` as RPC in `apps/server/src/shared/AuthHttp.ts` (`HttpRouter.add("*", "/api/auth/*", ...)` + `HttpServerRequest.toWeb` / `HttpServerResponse.fromWeb`). Better Auth HTTP, not Effect RPC.
- Email/password enabled; do not require email verification for MVP.
- Env: `BETTER_AUTH_SECRET` (>=32 chars), `BETTER_AUTH_URL`. Read by Better Auth from `process.env` (Bun `.env`). `AppConfig` also requires `BETTER_AUTH_SECRET`.

## Schema + relations

```bash
bun x auth@latest generate --config apps/server/src/shared/auth.ts --output packages/db/src/schema/auth.ts --yes
bun run --filter @openrouter-mobile/db db:generate
bun run db:migrate
```

Generated file exports tables plus `authRelations` via `defineRelationsPart`. Merge after app relations in `packages/db/src/relations.ts`:

```ts
import { defineRelations } from "drizzle-orm"
import * as schema from "./schema"
import { authRelations } from "./schema/auth"

export const appRelations = defineRelations(schema, (r) => ({ /* chats, messages, generationJobs */ }))
export const relations = { ...appRelations, ...authRelations }
```

`chats.userId` and `generation_jobs.userId` FK to `user.id`.

## RPC session middleware (`apps/server/src/shared/AuthMiddleware.ts`)

```ts
import { AppError } from "@openrouter-mobile/domain"
import { Context, Effect, Layer } from "effect"
import type { Headers } from "effect/unstable/http/Headers"
import { RpcMiddleware } from "effect/unstable/rpc"
import { auth, type Session } from "./auth"

export class CurrentSession extends Context.Service<CurrentSession, Session>()(
  "@openrouter-mobile/server/CurrentSession",
) {}

export class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, {
  provides: CurrentSession
}>()("@openrouter-mobile/server/AuthMiddleware", { error: AppError }) {}

const unauthorized = () =>
  new AppError({ code: "UNAUTHORIZED", message: "Not signed in" })

const toWebHeaders = (headers: Headers): globalThis.Headers => {
  const webHeaders = new globalThis.Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") webHeaders.append(key, value)
  }
  return webHeaders
}

export const AuthMiddlewareLive = Layer.succeed(
  AuthMiddleware,
  (effect, { headers }) =>
    Effect.tryPromise({
      try: () => auth.api.getSession({ headers: toWebHeaders(headers) }),
      catch: () => unauthorized(),
    }).pipe(
      Effect.flatMap((session) =>
        session
          ? Effect.provideService(effect, CurrentSession, session)
          : Effect.fail(unauthorized()),
      ),
    ),
)
```

Apply to every procedure except Health in `apps/server/src/app/ServerRpcs.ts`:

```ts
export class ServerRpcs extends ChatRpcs.merge(JobRpcs, MediaRpcs)
  .middleware(AuthMiddleware)
  .merge(HealthRpcs) {}
```

The client contract remains `AppRpcs` in `packages/rpc/src/AppRpcs.ts` (no middleware). Server session: `auth.api.getSession({ headers })` with a Web `Headers` built from RPC `headers` (Effect headers are lowercase; include `cookie`).

## Expo client (`apps/mobile/src/shared/auth-client.ts`)

```ts
import { expoClient } from "@better-auth/expo/client"
import { createAuthClient } from "better-auth/react"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"
import { authUrl } from "./env"

const webStorage = {
  getItem(key: string): string | null {
    try {
      return globalThis.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    globalThis.localStorage.setItem(key, value)
  },
  getItemAsync(key: string): Promise<string | null> {
    return Promise.resolve(webStorage.getItem(key))
  },
  setItemAsync(key: string, value: string): Promise<void> {
    webStorage.setItem(key, value)
    return Promise.resolve()
  },
}

export const authClient = createAuthClient({
  baseURL: authUrl,
  plugins: [
    expoClient({
      scheme: "openrouter-mobile",
      storagePrefix: "openrouter-mobile",
      storage: Platform.OS === "web" ? webStorage : SecureStore,
    }),
  ],
})
```

- `expo-secure-store@57` has no web implementation. Pass a `localStorage` adapter (`getItem` / `setItem` / `getItemAsync` / `setItemAsync`) on web.
- On web the Expo plugin does **not** persist `Set-Cookie` into storage; it leaves `credentials` alone so the browser cookie jar is used. RPC HTTP therefore uses `credentials: "include"` on web and `omit` on native.
- RPC: `headers: { Cookie: await authClient.getCookie() }` via `HttpClientRequest.setHeader(..., "cookie", cookie)`, native fetch `credentials: "omit"`.
- Cookie header format from sign-in `Set-Cookie`: `Cookie: better-auth.session_token=<token>.<url-encoded-hmac>`
- Root layout (`apps/mobile/src/app/_layout.tsx`): no session → `/sign-in`; signed-in users see tabs. Sign-out is the tabs header button.

Official Better Auth skill pack: `.cursor/skills/better-auth-official/`. Prefer this repo skill for stack and MVP scope: no email verification, adapter path `@better-auth/drizzle-adapter/relations-v2` (not `better-auth/adapters/drizzle`), and no Next.js/Prisma handlers. Use the official pack for library API details.

Docs: https://better-auth.com/docs/integrations/expo and https://better-auth.com/docs/adapters/drizzle
