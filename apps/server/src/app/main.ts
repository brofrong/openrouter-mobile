import { BunHttpServer } from "@effect/platform-bun";
import { HealthRpcs } from "@openrouter-mobile/rpc";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { HealthLive } from "../features/health/HealthLive";
import { AppConfig } from "../shared/config";
import { DbLive } from "../shared/db";
import { BunRuntime } from "../shared/runtime";

const RpcHttp = RpcServer.layerHttp({
  group: HealthRpcs,
  path: "/rpc",
  protocol: "http",
});

const RpcWs = RpcServer.layerHttp({
  group: HealthRpcs,
  path: "/rpc/ws",
  protocol: "websocket",
});

/**
 * T7.5 mounts Better Auth on GET+POST `/api/auth/*`.
 * Keep this layer in `HttpRouter.serve` so auth routes share the same server.
 */
const AuthHttpLive = Layer.empty;

const RpcRoutes = Layer.mergeAll(RpcHttp, RpcWs, AuthHttpLive).pipe(
  Layer.provide(HealthLive),
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
