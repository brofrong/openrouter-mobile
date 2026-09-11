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

## Packages

- `packages/domain` — `Schema.Class` DTOs only
- `packages/rpc` — `RpcGroup` contracts, no handlers
- `packages/db` — tables + `defineRelations`

Do not import `apps/server` from `apps/mobile`.
