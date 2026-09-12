export const authUrl =
  process.env.EXPO_PUBLIC_AUTH_URL ?? "http://localhost:3000";

export const rpcHttpUrl =
  process.env.EXPO_PUBLIC_RPC_HTTP_URL ?? "http://localhost:3000/rpc";

export const rpcWsUrl =
  process.env.EXPO_PUBLIC_RPC_WS_URL ?? "ws://localhost:3000/rpc/ws";
