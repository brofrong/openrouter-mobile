import { expect, test } from "bun:test";
import { toWebSocketBase, trimTrailingSlash, urlsFromBase } from "./env";

test("trims trailing slashes from BASE_URL", () => {
  expect(trimTrailingSlash("https://openrouter.brofrong.ru/")).toBe(
    "https://openrouter.brofrong.ru",
  );
});

test("maps https BASE_URL to auth, RPC HTTP, and WSS", () => {
  expect(urlsFromBase("https://openrouter.brofrong.ru")).toEqual({
    authUrl: "https://openrouter.brofrong.ru",
    rpcHttpUrl: "https://openrouter.brofrong.ru/rpc",
    rpcWsUrl: "wss://openrouter.brofrong.ru/rpc/ws",
  });
});

test("maps http BASE_URL to ws, not wss", () => {
  expect(urlsFromBase("http://localhost:3010/")).toEqual({
    authUrl: "http://localhost:3010",
    rpcHttpUrl: "http://localhost:3010/rpc",
    rpcWsUrl: "ws://localhost:3010/rpc/ws",
  });
});

test("toWebSocketBase leaves unknown schemes unchanged", () => {
  expect(toWebSocketBase("ws://already")).toBe("ws://already");
});
