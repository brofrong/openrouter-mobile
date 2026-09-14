export const DEFAULT_BASE_URL = "http://localhost:3000";

export const trimTrailingSlash = (url: string): string =>
  url.replace(/\/+$/, "");

export const toWebSocketBase = (httpUrl: string): string => {
  if (httpUrl.startsWith("https://")) {
    return `wss://${httpUrl.slice("https://".length)}`;
  }
  if (httpUrl.startsWith("http://")) {
    return `ws://${httpUrl.slice("http://".length)}`;
  }
  return httpUrl;
};

export const urlsFromBase = (baseUrl: string) => {
  const base = trimTrailingSlash(baseUrl);
  return {
    authUrl: base,
    rpcHttpUrl: `${base}/rpc`,
    rpcWsUrl: `${toWebSocketBase(base)}/rpc/ws`,
  };
};

const configuredBaseUrl =
  process.env.EXPO_PUBLIC_BASE_URL ??
  process.env.EXPO_PUBLIC_AUTH_URL ??
  DEFAULT_BASE_URL;

export const { authUrl, rpcHttpUrl, rpcWsUrl } =
  urlsFromBase(configuredBaseUrl);
