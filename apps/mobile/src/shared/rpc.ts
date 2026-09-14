import { AppRpcs } from "@openrouter-mobile/rpc";
import { Context, Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import {
  RpcClient,
  type RpcClientError,
  RpcSchema,
  RpcSerialization,
} from "effect/unstable/rpc";
import { authClient } from "./auth-client";
import { rpcHttpUrl } from "./env";
import { ExpoHttpLive } from "./http";
import { withCookieOptions } from "./rpc-cookie";
import { RpcWsProtocolLive } from "./ws";

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

const streamRpcTags = new Set<string>(
  [...AppRpcs.requests.values()]
    .filter((rpc) => RpcSchema.isStreamSchema(rpc.successSchema))
    .map((rpc) => rpc._tag),
);

const attachCookieToClient = (client: AppRpcClient): AppRpcClient => {
  const authed: Record<string, unknown> = { ...client };
  for (const tag of AppRpcs.requests.keys()) {
    const method = authed[tag];
    if (typeof method !== "function") {
      continue;
    }
    const call = method as (
      payload: never,
      opts?: Parameters<typeof withCookieOptions>[1],
    ) => unknown;
    if (streamRpcTags.has(tag)) {
      authed[tag] = (
        payload: never,
        opts?: Parameters<typeof withCookieOptions>[1],
      ) =>
        Stream.unwrap(
          Effect.promise(() => authClient.getCookie()).pipe(
            Effect.map(
              (cookie) =>
                call(payload, withCookieOptions(cookie, opts)) as Stream.Stream<
                  unknown,
                  unknown
                >,
            ),
          ),
        );
    } else {
      authed[tag] = (
        payload: never,
        opts?: Parameters<typeof withCookieOptions>[1],
      ) =>
        Effect.promise(() => authClient.getCookie()).pipe(
          Effect.flatMap(
            (cookie) =>
              call(
                payload,
                withCookieOptions(cookie, opts),
              ) as Effect.Effect<never>,
          ),
        );
    }
  }
  return authed as AppRpcClient;
};

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

export const RpcHttpLive = Layer.effect(
  RpcHttp,
  RpcClient.make(AppRpcs).pipe(Effect.map(attachCookieToClient)),
).pipe(Layer.provide(RpcHttpProtocolLive));

export const RpcWsLive = Layer.effect(
  RpcWs,
  RpcClient.make(AppRpcs).pipe(Effect.map(attachCookieToClient)),
).pipe(Layer.provide(RpcWsProtocolLive));

export const RpcLive = Layer.mergeAll(RpcHttpLive, RpcWsLive).pipe(
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provideMerge(ExpoHttpLive),
);
