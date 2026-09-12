import { BunHttpServer } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { ChatLive } from "../features/chat/ChatLive";
import { OpenRouterChatLive } from "../features/chat/OpenRouterChat";
import { DurableStreamLive } from "../features/durable-stream/DurableStreamLive";
import { GenerationLive } from "../features/generation/GenerationLive";
import { OpenRouterMediaLive } from "../features/generation/OpenRouterMedia";
import { HealthLive } from "../features/health/HealthLive";
import { AuthHttpLive } from "../shared/AuthHttp";
import { AuthMiddlewareLive } from "../shared/AuthMiddleware";
import { AppConfig } from "../shared/config";
import { DbLive } from "../shared/db";
import { BunRuntime } from "../shared/runtime";
import { ServerRpcs } from "./ServerRpcs";

const RpcHttp = RpcServer.layerHttp({
  group: ServerRpcs,
  path: "/rpc",
  protocol: "http",
});

const RpcWs = RpcServer.layerHttp({
  group: ServerRpcs,
  path: "/rpc/ws",
  protocol: "websocket",
});

const FeatureInfra = Layer.mergeAll(
  DurableStreamLive,
  OpenRouterChatLive,
  OpenRouterMediaLive,
).pipe(Layer.provideMerge(DbLive));

const RpcRoutes = Layer.mergeAll(RpcHttp, RpcWs, AuthHttpLive).pipe(
  Layer.provide(HealthLive),
  Layer.provide(ChatLive),
  Layer.provide(GenerationLive),
  Layer.provide(AuthMiddlewareLive),
  Layer.provide(FeatureInfra),
  Layer.provide(RpcSerialization.layerNdjson),
);

const HttpLive = Layer.unwrap(
  Effect.map(AppConfig, ({ port }) =>
    HttpRouter.serve(RpcRoutes).pipe(
      Layer.provide(
        BunHttpServer.layer({
          hostname: "0.0.0.0",
          port,
        }),
      ),
    ),
  ),
);

const Main = Layer.mergeAll(HttpLive, DbLive);

BunRuntime.runMain(Layer.launch(Main));
