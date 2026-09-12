import { Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";

const expoFetchImpl = expoFetch as unknown as typeof globalThis.fetch;

/**
 * FetchHttpClient over `expo/fetch`. Native RPC must use `credentials: "omit"`
 * so the manual `Cookie` header from `authClient.getCookie()` is not
 * overwritten. Web cannot set `Cookie` from JS, so the browser cookie jar is
 * used with `credentials: "include"` instead.
 */
export const ExpoHttpLive = Layer.mergeAll(
  FetchHttpClient.layer,
  Layer.succeed(FetchHttpClient.Fetch, expoFetchImpl),
  Layer.succeed(FetchHttpClient.RequestInit, {
    credentials: Platform.OS === "web" ? "include" : "omit",
  }),
);
