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
- Server entry: `BunRuntime.runMain(Layer.launch(Main))`
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

Contract package: `@openrouter-mobile/rpc` (`AppRpcs` = `ChatRpcs.merge(JobRpcs, MediaRpcs, HealthRpcs)`). See `.cursor/skills/effect-rpc-streams/SKILL.md` for `Rpc.make` / `RpcGroup.make` signatures.

## Later install tasks

T7–T7.5 and T11 must still patch this file with real import paths from the installed packages (platform-bun, sql-pg, ManagedRuntime). Schema and Rpc APIs above are from the installed `effect` and should be reused as-is.
