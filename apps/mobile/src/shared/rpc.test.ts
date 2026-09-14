import { expect, test } from "bun:test";
import { AppRpcs } from "@openrouter-mobile/rpc";
import { RpcSchema } from "effect/unstable/rpc";
import { withCookieOptions } from "./rpc-cookie";

test("withCookieOptions puts the session cookie on RPC headers", () => {
  expect(withCookieOptions("")).toBeUndefined();
  expect(withCookieOptions("better-auth.session_token=abc")).toEqual({
    headers: { cookie: "better-auth.session_token=abc" },
  });
  expect(
    withCookieOptions("better-auth.session_token=abc", {
      headers: { "x-test": "1" },
    }),
  ).toEqual({
    headers: {
      cookie: "better-auth.session_token=abc",
      "x-test": "1",
    },
  });
});

test("stream RPCs are ChatSubscribe and JobSubscribe", () => {
  const tags = [...AppRpcs.requests.values()]
    .filter((rpc) => RpcSchema.isStreamSchema(rpc.successSchema))
    .map((rpc) => rpc._tag)
    .sort();
  expect(tags).toEqual(["ChatSubscribe", "JobSubscribe"]);
});
