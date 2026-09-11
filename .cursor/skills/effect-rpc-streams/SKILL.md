---
name: effect-rpc-streams
description: Durable @effect/rpc streams — persist-then-publish, subscribe-then-replay reconnect, afterSeq. Use when writing RPC groups, stream handlers, WebSocket/HTTP RPC transports, or reconnect.
---

# Effect RPC streams

Producer: persist → publish (never publish first).
Consumer: subscribe live (wait until subscribed) → replay seq > afterSeq → concat live filtered seq > max(replayed).
Client payload always has `afterSeq: Schema.optionalKey(Schema.Number)`.
Client stores last `seq` from the stream and sends it on reconnect.
Do not use Socket.IO. Transports are RpcServer.layerProtocolHttp and layerProtocolWebsocket only.

## Implementation target (T8)

Full kernel lives at `apps/server/src/features/durable-stream/DurableStream.ts` (file does not exist yet). Copy that subscribe/append once T8 lands; do not reinvent the algorithm.

- Source of truth: `stream_events(stream_id, seq, payload)`
- In-memory PubSub is a live tail only — chunks still persist if nobody is connected
- `ChatSend` / `JobSubscribe` map this stream to `TokenChunk` / `JobEvent`

## Later install tasks

T6 / T7 / T8 / T11 must patch this skill with real `Rpc.make` / `RpcGroup.make` / protocol Layer signatures from the installed `@effect/rpc`.
