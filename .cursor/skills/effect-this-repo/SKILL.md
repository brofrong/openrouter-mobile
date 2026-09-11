---
name: effect-this-repo
description: How this repo uses Effect v4 — Effect.gen, Layers, Schema, ManagedRuntime, BunRuntime. Use when writing or reviewing any Effect, Layer, Schema, Stream, or Rpc handler code.
---

# Effect in this repo

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

## Schema
- `Schema.Class` in `packages/domain` for DTOs
- RPC payload/success/error use those classes
- Decode at the boundary; inside the app use the decoded type

## Later install tasks

T3–T7.5 and T11 must patch this file with real import paths from the installed `effect` / `@effect/*` versions. Until then, treat the names above as the intended API, not copy-paste-from-npm-yet.
