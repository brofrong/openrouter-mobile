import { Effect, Layer } from "effect";
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
 * Effect RPC WebSocket to `EXPO_PUBLIC_RPC_WS_URL`. `fromWebSocket` sets
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
