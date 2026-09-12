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

### Protocol Layers (copied from `effect@4.0.0-rc.113` `RpcServer.ts`)

HTTP router is `effect/unstable/http` (`HttpRouter`), not `@effect/platform`. NDJSON: `RpcSerialization.layerNdjson`.

`Protocol` is a single service — HTTP and WebSocket each need their own `RpcServer.layer` / `layerHttp` (do not `Layer.provide` both protocol layers onto one server).

```ts
import { HttpRouter } from "effect/unstable/http"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { BunHttpServer } from "@effect/platform-bun"

export const layer = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: { ... }
): Layer.Layer<never, never, Protocol | Rpc.ToHandler<Rpcs> | ...>

export const layerHttp = <Rpcs extends Rpc.Any>(options: {
  readonly group: RpcGroup.RpcGroup<Rpcs>
  readonly path: HttpRouter.PathInput
  readonly protocol?: "http" | "websocket" | undefined
  ...
}): Layer.Layer<never, never, RpcSerialization | HttpRouter | Rpc.ToHandler<Rpcs> | ...>

export const layerProtocolHttp = (options: {
  readonly path: HttpRouter.PathInput
  readonly streamBufferSize?: number | "unbounded" | undefined
}): Layer.Layer<Protocol, never, RpcSerialization.RpcSerialization | HttpRouter.HttpRouter>

export const layerProtocolWebsocket = (options: {
  readonly path: HttpRouter.PathInput
}): Layer.Layer<Protocol, never, RpcSerialization.RpcSerialization | HttpRouter.HttpRouter>
```

Server wiring in `apps/server/src/app/main.ts`:

```ts
const RpcHttp = RpcServer.layerHttp({
  group: HealthRpcs,
  path: "/rpc",
  protocol: "http",
})
const RpcWs = RpcServer.layerHttp({
  group: HealthRpcs,
  path: "/rpc/ws",
  protocol: "websocket",
})
const RpcRoutes = Layer.mergeAll(RpcHttp, RpcWs).pipe(
  Layer.provide(HealthLive),
  Layer.provide(RpcSerialization.layerNdjson),
)
const HttpLive = HttpRouter.serve(RpcRoutes).pipe(
  Layer.provide(BunHttpServer.layer({ hostname: "0.0.0.0", port: 3000 })),
)
```

HTTP is POST `/rpc`. WebSocket upgrade is GET `/rpc/ws`. Handlers: `HealthRpcs.toLayer({ Health: () => Effect.succeed({ ok: true as const }) })`.

## Durable stream kernel (T8)

Copy these signatures from `apps/server/src/features/durable-stream/DurableStream.ts`. Do not reinvent the algorithm.

Live layer: `apps/server/src/features/durable-stream/DurableStreamLive.ts` (`Layer.effect(DurableStream, makeDurableStream)`). Health does not provide `DbLive` into RPC — `Layer.provide(DbLive)` onto stream tests/handlers (`DurableStreamLive.pipe(Layer.provideMerge(DbLive))` in tests so `AppDb` stays available).

```ts
append(
  streamId: string,
  kind: "token" | "job",
  payload: unknown,
): Effect.Effect<StreamEvent, DurableStreamError>

subscribe(
  streamId: string,
  afterSeq?: number,
): Stream.Stream<StreamEvent, DurableStreamError>

runInto(
  streamId: string,
  kind: "token" | "job",
  source: Stream.Stream<unknown>,
): Stream.Stream<StreamEvent, DurableStreamError>
```

`DurableStreamError` is `EffectDrizzleQueryError | Schema.SchemaError`.

Producer (`append`): `INSERT … RETURNING` then `PubSub.publish`. Never publish first. `Semaphore.make(1)` around append so seq order is preserved.

Consumer (`subscribe`): `Stream.unwrap` → `PubSub.subscribe` (wait until subscribed) → replay `db.query.streamEvents.findMany({ where: { streamId, seq: { gt: afterSeq ?? 0 } }, orderBy: { seq: "asc" } })` → `Stream.concat(replay, live.filter(seq > watermark && streamId))` → dedup by `seq`.

- Source of truth: `stream_events(stream_id, seq, payload)`
- In-memory PubSub is a live tail only — chunks still persist if nobody is connected
- `ChatSubscribe` / `JobSubscribe` map this stream to `TokenChunk` / `JobEvent`

## Client (`apps/mobile/src/shared/rpc.ts`)

```ts
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"

RpcClient.make(AppRpcs)
RpcClient.layerProtocolHttp({
  url: process.env.EXPO_PUBLIC_RPC_HTTP_URL,
  transformClient: (client) =>
    HttpClient.mapRequestEffect(client, (request) =>
      Effect.promise(() => authClient.getCookie()).pipe(
        Effect.map((cookie) =>
          cookie.length > 0
            ? HttpClientRequest.setHeader(request, "cookie", cookie)
            : request
        )
      )
    ),
})
RpcClient.layerProtocolSocket()
RpcSerialization.layerNdjson
```

Queries/mutations (`ChatList`, `ChatSend`, `ImageGenerate`, …) go over HTTP POST `/rpc`. Streams (`ChatSubscribe`, `JobSubscribe`) go over WebSocket `/rpc/ws`. Two client services (`RpcHttp`, `RpcWs`) share one `ManagedRuntime`; each protocol layer is provided privately so `Protocol` does not clash.
