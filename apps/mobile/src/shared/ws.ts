import { Effect, Layer } from "effect";
import { RpcClient } from "effect/unstable/rpc";
import { Socket } from "effect/unstable/socket";
import { Platform } from "react-native";
import { authClient } from "./auth-client";
import { rpcWsUrl } from "./env";

type WebSocketInit = {
  readonly headers?: Readonly<Record<string, string>>;
};

const openRpcWebSocket = (cookie: string): WebSocket => {
  if (Platform.OS === "web") {
    return new globalThis.WebSocket(rpcWsUrl);
  }
  const NativeWebSocket = globalThis.WebSocket as unknown as {
    new (
      url: string,
      protocols?: string | string[],
      options?: WebSocketInit,
    ): WebSocket;
  };
  return new NativeWebSocket(
    rpcWsUrl,
    undefined,
    cookie.length > 0 ? { headers: { Cookie: cookie } } : undefined,
  );
};

/**
 * Effect RPC WebSocket to `{BASE_URL}/rpc/ws`. `fromWebSocket` sets
 * `binaryType = "arraybuffer"`. Native attaches `Cookie` on the handshake;
 * browsers send cookies for `localhost:3000` automatically and forbid custom
 * Cookie headers.
 */
export const RpcSocketLive = Layer.effect(
  Socket.Socket,
  Socket.fromWebSocket(
    Effect.acquireRelease(
      Effect.tryPromise({
        try: async () => {
          const cookie = await authClient.getCookie();
          return openRpcWebSocket(cookie);
        },
        catch: (cause) =>
          new Socket.SocketError({
            reason: new Socket.SocketOpenError({
              kind: "Unknown",
              cause,
            }),
          }),
      }),
      (ws) =>
        Effect.sync(() => {
          ws.close(1000);
        }),
    ),
  ),
);

/**
 * `retryTransientErrors` exists on `layerProtocolSocket` in effect@4.0.0-rc.113
 * (`RpcClient.ts`). It retries `SocketOpenError` (connect fail / ping timeout)
 * without failing in-flight RPCs. Socket close still ends the current
 * ChatSubscribe / JobSubscribe; the stream hook resubscribes with afterSeq.
 */
export const RpcWsProtocolLive = RpcClient.layerProtocolSocket({
  retryTransientErrors: true,
}).pipe(Layer.provide(RpcSocketLive));
