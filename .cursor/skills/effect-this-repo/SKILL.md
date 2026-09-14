---
name: effect-this-repo
description: How this repo uses Effect v4 — Effect.gen, Layers, Schema, ManagedRuntime, BunRuntime. Use when writing or reviewing any Effect, Layer, Schema, Stream, or Rpc handler code.
---

# Effect in this repo

Installed: `effect@4.0.0-rc.113` (npm dist-tag `rc`). Import from `"effect"`, not a subpath.

```ts
import { Effect, Schema } from "effect"
```

Confirmed in `node_modules/.bun/effect@4.0.0-rc.113/node_modules/effect/src/index.ts`:
`export * as Schema from "./Schema.ts"`

## Do
- `Effect.gen(function* () { const x = yield* Service })`
- Errors as `Schema.TaggedError` / `Data.TaggedError`
- Wire dependencies with `Layer.provide` / `Layer.mergeAll`
- Server entry: `BunRuntime.runMain(Layer.launch(Main))` (`apps/server/src/shared/runtime.ts` re-exports `BunRuntime`)
- Mobile entry: one `ManagedRuntime` in `apps/mobile/src/shared/runtime.ts`
- Streams: `Stream`, never ad-hoc callback accumulation for OpenRouter

## Do not
- `try/catch` around Effect programs
- `Effect.runPromise` inside React render (only inside runtime / event handlers)
- Zod, io-ts, yup
- Newing services (`new Foo()`) instead of `Context.Service` + Layer
- Importing `apps/server` from `apps/mobile`

## Schema (copied from effect@4.0.0-rc.113)

DTOs live in `packages/domain` as `Schema.Class`. RPC payload/success/error use those classes. Decode at the boundary; inside the app use the decoded type.

Enable `exactOptionalPropertyTypes` in tsconfig so `Schema.optionalKey` types match runtime (`age?: number`, not `age?: number | undefined`).

### `Schema.Class`

From `effect/src/Schema.ts` / `dist/Schema.d.ts`:

```ts
import { Schema } from "effect"

class Person extends Schema.Class<Person>("Person")({
  name: Schema.String,
  age: Schema.Number
}) {}
```

Signature: `Schema.Class<Self>(identifier: string)(fields)`

### `Schema.TaggedError`

```ts
import { Effect, Schema } from "effect"

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.Number
}) {}
```

Signature: `Schema.TaggedError<Self>()(tag, fields)` — first `()` is optional identifier; second call is `_tag` + fields. Yieldable in `Effect.gen`.

### Literals, optional keys, dates, brands

These names exist in 4.0.0-rc.113 (not v3 `Schema.Literal("a", "b")` / `Schema.optional`):

```ts
import { Schema } from "effect"

Schema.Literals(["active", "inactive", "pending"])
Schema.optionalKey(Schema.Number) // { readonly age?: number }
Schema.DateTimeUtc                 // Type: DateTime.Utc; JSON codec: UTC ISO strings
Schema.String.pipe(Schema.brand("UserId"))
Schema.Number
Schema.String
Schema.Unknown
```

- `Schema.Literals(literals: ReadonlyArray<LiteralValue>)` — union of literals. Single value: `Schema.Literal`.
- `Schema.optionalKey(schema)` — exact optional key (omit the key; do not pass `undefined`). Distinct from `Schema.optional`, which adds `| undefined`.
- `Schema.DateTimeUtc` — validates `DateTime.Utc`. Default JSON codec decodes UTC ISO strings and encodes UTC ISO strings. Related: `DateTimeUtcFromString`, `DateTimeUtcFromDate`, `DateTimeUtcFromMillis`.
- `Schema.brand("UserId")` — nominal brand only (no extra runtime checks). Use as `Schema.String.pipe(Schema.brand("UserId"))`. Type: `typeof UserId.Type`.

## Rpc (copied from effect@4.0.0-rc.113)

`@effect/rpc` is not published on this rc line. Import from the `effect` package:

```ts
import { Rpc, RpcGroup } from "effect/unstable/rpc"
```

Contract package: `@openrouter-mobile/rpc` (`packages/rpc/src/AppRpcs.ts`: `AppRpcs` = `ChatRpcs.merge(JobRpcs, MediaRpcs, HealthRpcs)`). Server auth wrap is `ServerRpcs` in `apps/server/src/app/ServerRpcs.ts`. See `.cursor/skills/effect-rpc-streams/SKILL.md` for `Rpc.make` / `RpcGroup.make` signatures.

## Server runtime (copied from `@effect/platform-bun@4.0.0-rc.113`)

HTTP lives in `effect/unstable/http`, not `@effect/platform`. Bun adapters:

```ts
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
```

`apps/server/src/shared/runtime.ts` re-exports `BunRuntime`. `apps/server/src/app/main.ts` launches `Main`.

- `BunHttpServer.layer({ hostname: "0.0.0.0", port })` → `Layer<HttpServer | HttpPlatform | Etag.Generator | BunServices, ServeError>` (`port` from `AppConfig`, default 3000)
- Always pass `hostname` as an IP. Omitting it makes Bun report `hostname: "localhost"`, and `NetAddress.inetAddressFromIpString` then fails (`expected exactly four decimal octets`).
- `BunRuntime.runMain(Layer.launch(Main))`

Config (Effect 4, not v3 `Config.string`):

```ts
import { Config, Redacted } from "effect"

Config.Redacted("DATABASE_URL")
Config.Port("PORT").pipe(Config.withDefault(3000))
Config.all({ databaseUrl, port, baseUrl })
```

Better Auth (`better-auth@1.7.4`): `betterAuth` from `"better-auth"` in `apps/server/src/shared/auth.ts`, `drizzleAdapter` from `"@better-auth/drizzle-adapter/relations-v2"`, `expo` from `"@better-auth/expo"`. RPC middleware is `RpcMiddleware.Service` from `"effect/unstable/rpc"`. Session: `auth.api.getSession({ headers })`. See `.cursor/skills/better-auth/SKILL.md`.

## Mobile runtime

```ts
import { Layer, ManagedRuntime } from "effect"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"

export const mobileRuntime = ManagedRuntime.make(MobileLive)
```

`apps/mobile/src/shared/runtime.ts` is the only mobile `ManagedRuntime`. Unary RPC uses `RpcHttp` (HTTP NDJSON); `ChatSubscribe` / `JobSubscribe` use `RpcWs`. Do not call `Effect.runPromise` from React render — `mobileRuntime.runPromise` / `runCallback` in effects and handlers only.
