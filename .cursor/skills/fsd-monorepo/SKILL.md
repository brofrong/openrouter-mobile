---
name: fsd-monorepo
description: Feature-Sliced Design folder and import rules for this monorepo. Use when adding files under apps/, choosing a layer, or importing across features.
---

# FSD in this monorepo

import direction `app → features → entities → shared`; features never import other features; RPC types come from `packages/rpc`, never duplicated in the UI.

## Layers

- `app` — composition (layouts, routing, Layer launch)
- `features` — user-facing capabilities (`chat`, `generation`, `durable-stream`)
- `entities` — reusable domain widgets/helpers scoped to an entity
- `shared` — runtime, rpc client, config, ui primitives

## Apps

- `apps/server/src/app/main.ts` — `BunRuntime.runMain(Layer.launch(Main))`
- `apps/server/src/app/ServerRpcs.ts` — `ChatRpcs.merge(JobRpcs, MediaRpcs).middleware(AuthMiddleware).merge(HealthRpcs)`
- `apps/server/src/features/{chat,generation,durable-stream,health}`
- `apps/server/src/shared/{runtime,auth,db,config}.ts`
- `apps/mobile/src/app/` — Expo Router (`(tabs)`, `sign-in`, `sign-up`)
- `apps/mobile/src/features/{chat,images,video,speech,audio}`
- `apps/mobile/src/shared/{runtime,rpc,auth-client,afterSeq}.ts`

## Packages

- `packages/domain` — `Schema.Class` DTOs only
- `packages/rpc` — `RpcGroup` contracts (`packages/rpc/src/AppRpcs.ts`), no handlers
- `packages/db` — tables + `defineRelations`

Do not import `apps/server` from `apps/mobile`.

Format/lint is `bun run check` (Biome), never eslint/prettier.
