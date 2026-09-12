import { AppRpcs } from "@openrouter-mobile/rpc";
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import {
  RpcClient,
  type RpcClientError,
  RpcSerialization,
} from "effect/unstable/rpc";
import { authClient } from "./auth-client";
import { rpcHttpUrl } from "./env";
import { ExpoHttpLive } from "./http";
import { RpcSocketLive } from "./ws";

export type AppRpcClient = RpcClient.FromGroup<
  typeof AppRpcs,
  RpcClientError.RpcClientError
>;

export class RpcHttp extends Context.Service<RpcHttp, AppRpcClient>()(
  "@openrouter-mobile/mobile/RpcHttp",
) {}

export class RpcWs extends Context.Service<RpcWs, AppRpcClient>()(
  "@openrouter-mobile/mobile/RpcWs",
) {}

const withAuthCookie = <E, R>(client: HttpClient.HttpClient.With<E, R>) =>
  HttpClient.mapRequestEffect(client, (request) =>
    Effect.promise(() => authClient.getCookie()).pipe(
      Effect.map((cookie) =>
        cookie.length > 0
          ? HttpClientRequest.setHeader(request, "cookie", cookie)
          : request,
      ),
    ),
  );

const RpcHttpProtocolLive = RpcClient.layerProtocolHttp({
  url: rpcHttpUrl,
  transformClient: withAuthCookie,
});

const RpcWsProtocolLive = RpcClient.layerProtocolSocket().pipe(
  Layer.provide(RpcSocketLive),
);

export const RpcHttpLive = Layer.effect(RpcHttp, RpcClient.make(AppRpcs)).pipe(
  Layer.provide(RpcHttpProtocolLive),
);

export const RpcWsLive = Layer.effect(RpcWs, RpcClient.make(AppRpcs)).pipe(
  Layer.provide(RpcWsProtocolLive),
);

export const RpcLive = Layer.mergeAll(RpcHttpLive, RpcWsLive).pipe(
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provideMerge(ExpoHttpLive),
);
