import { BunHttpServer } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { AiConfigLive } from "../features/ai-config/AiConfigLive";
import { ChatLive } from "../features/chat/ChatLive";
import { OpenRouterChatLive } from "../features/chat/OpenRouterChat";
import { DurableStreamLive } from "../features/durable-stream/DurableStreamLive";
import { GenerationLive } from "../features/generation/GenerationLive";
import { OpenRouterMediaLive } from "../features/generation/OpenRouterMedia";
import { HealthLive } from "../features/health/HealthLive";
import { UsageLive } from "../features/usage/UsageLive";
import { AuthHttpLive } from "../shared/AuthHttp";
import { AuthMiddlewareLive } from "../shared/AuthMiddleware";
import { AuthLive } from "../shared/auth";
import { AppConfig } from "../shared/config";
import { DbLive } from "../shared/db";
import { loadRepoEnv } from "../shared/loadEnv";
import { MediaHttpLive } from "../shared/MediaHttp";
import { applyMigrations } from "../shared/migrate";
import { ObjectStoreLive } from "../shared/object-store";
import { corsAllowedOrigins } from "../shared/origins";
import { BunRuntime } from "../shared/runtime";
import { WebLive } from "../shared/web";
import { ServerRpcs } from "./ServerRpcs";

loadRepoEnv();

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
  ObjectStoreLive,
).pipe(Layer.provideMerge(DbLive));

const RpcRoutes = HttpRouter.cors({
  allowedOrigins: corsAllowedOrigins,
  credentials: true,
}).pipe(
  Layer.provideMerge(
    Layer.mergeAll(RpcHttp, RpcWs, AuthHttpLive, MediaHttpLive, WebLive).pipe(
      Layer.provide(HealthLive),
      Layer.provide(ChatLive),
      Layer.provide(GenerationLive),
      Layer.provide(UsageLive),
      Layer.provide(AiConfigLive),
      Layer.provide(AuthMiddlewareLive),
      Layer.provide(AuthLive),
      Layer.provide(FeatureInfra),
      Layer.provide(RpcSerialization.layerNdjson),
    ),
  ),
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

const Main = Layer.unwrap(
  Effect.gen(function* () {
    yield* applyMigrations;
    return HttpLive.pipe(Layer.provide(AuthLive));
  }),
).pipe(Layer.provideMerge(DbLive));

BunRuntime.runMain(Layer.launch(Main));
