---
name: effect-rpc-streams
description: Durable Effect RPC streams — persist-then-publish, subscribe-then-replay reconnect, afterSeq. Use when writing RPC groups, stream handlers, WebSocket/HTTP RPC transports, or reconnect.
---

# Effect RPC streams

Producer: persist → publish (never publish first).
Consumer: subscribe live (wait until subscribed) → replay seq > afterSeq → concat live filtered seq > max(replayed).
Stream procedure payloads have `afterSeq: Schema.optionalKey(Schema.Number)` (`ChatSubscribe`, `JobSubscribe`). `ChatMessages` may also take `afterSeq` as an optional history cursor. `ChatSend` is unary (starts generation; do not reconnect through it).
Client stores last `seq` from the stream and sends it on reconnect.
Do not use Socket.IO. Transports are `RpcServer.layerProtocolHttp` and `RpcServer.layerProtocolWebsocket` only.

## Installed APIs (`effect@4.0.0-rc.113`)

`@effect/rpc` is **not published** on the Effect 4 rc line (npm latest is still Effect 3 `0.76.2`). RPC lives **inside `effect`**:

```ts
import { Schema } from "effect"
import { Rpc, RpcGroup, RpcServer, RpcSerialization } from "effect/unstable/rpc"
```

Package: `@openrouter-mobile/rpc`. Groups only — no handlers. Merge:

```ts
export class AppRpcs extends ChatRpcs.merge(JobRpcs, MediaRpcs, HealthRpcs) {}
```

### `Rpc.make` (from `effect/src/unstable/rpc/Rpc.ts`)

```ts
export const make = <
  const Tag extends string,
  Payload extends Schema.Top | Schema.Struct.Fields = Schema.Void,
  Success extends Schema.Top = Schema.Void,
  Error extends Schema.Top = Schema.Never,
  const Stream extends boolean = false
>(tag: Tag, options?: {
  readonly payload?: Payload
  readonly success?: Success
  readonly error?: Error
  readonly defect?: DefectSchema
  readonly stream?: Stream
  readonly primaryKey?: [Payload] extends [Schema.Struct.Fields] ? ((
      payload: Payload extends Schema.Struct.Fields ? Struct.Simplify<Schema.Struct<Payload>["Type"]> : Payload["Type"]
    ) => string) :
    never
}): Rpc<
  Tag,
  Payload extends Schema.Struct.Fields ? Schema.Struct<Payload> : Payload,
  Stream extends true ? RpcSchema.Stream<Success, Error> : Success,
  Stream extends true ? typeof Schema.Never : Error
>
```

- `payload` may be a schema **or** struct fields (`Schema.Struct` is built for you).
- `stream: true` wraps success/error in `RpcSchema.Stream` and sets the RPC error schema to `Schema.Never`.
- Defaults: `payload`/`success` → `Schema.Void`, `error` → `Schema.Never`.

### `RpcGroup.make` (from `effect/src/unstable/rpc/RpcGroup.ts`)

```ts
export const make = <const Rpcs extends ReadonlyArray<Rpc.Any>>(
  ...rpcs: Rpcs
): RpcGroup<Rpcs[number]>
```

Subclass the result: `export class ChatRpcs extends RpcGroup.make(...) {}`.

Merge groups with the instance method (not a top-level `RpcGroup.merge`):

```ts
merge<const Groups extends ReadonlyArray<Any>>(
  ...groups: Groups
): RpcGroup<R | Rpcs<Groups[number]>>
```

Handlers later: `Group.toLayer({ ... })` / `toLayerHandler`.

### Protocol Layers (T7 still patches these with wiring)

From `RpcServer` in the same module:

```ts
export const layer = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: { ... }
): Layer.Layer<never, never, Protocol | Rpc.ToHandler<Rpcs> | ...>

export const layerProtocolHttp = (options: {
  readonly path: HttpRouter.PathInput
  readonly streamBufferSize?: number | "unbounded" | undefined
}): Layer.Layer<Protocol, never, RpcSerialization.RpcSerialization | HttpRouter.HttpRouter>

export const layerProtocolWebsocket = (options: {
  readonly path: HttpRouter.PathInput
}): Layer.Layer<Protocol, never, RpcSerialization.RpcSerialization | HttpRouter.HttpRouter>
```

`RpcSerialization.layerNdjson` exists. HTTP router is `effect/unstable/http` (`HttpRouter`), not `@effect/platform`.

## Implementation target (T8)

Full kernel lives at `apps/server/src/features/durable-stream/DurableStream.ts` (file does not exist yet). Copy that subscribe/append once T8 lands; do not reinvent the algorithm.

- Source of truth: `stream_events(stream_id, seq, payload)`
- In-memory PubSub is a live tail only — chunks still persist if nobody is connected
- `ChatSubscribe` / `JobSubscribe` map this stream to `TokenChunk` / `JobEvent`

## Later install tasks

T7 / T8 / T11 must still patch this skill with real `RpcClient` / protocol Layer **wiring** from the installed `effect/unstable/rpc` (import path and `Rpc.make` / `RpcGroup.make` signatures above are from `effect@4.0.0-rc.113`).
