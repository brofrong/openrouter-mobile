import { expect, test } from "bun:test";
import { AppError } from "@openrouter-mobile/domain";
import { Effect, Option, Redacted, Result, Stream } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import {
  OpenRouterChat,
  OpenRouterChatLive,
} from "../src/features/chat/OpenRouterChat";
import {
  isUsableOpenRouterKey,
  isUsableOpenRouterKeyValue,
  openRouterTokenStream,
  parseOpenRouterSseLine,
} from "../src/shared/openrouter";

if (process.env.BETTER_AUTH_SECRET === undefined) {
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-chars-long";
}

const hasRealOpenRouterKey = isUsableOpenRouterKeyValue(
  process.env.OPENROUTER_API_KEY ?? "",
);

test("parseOpenRouterSseLine extracts delta content and ignores [DONE]", () => {
  expect(
    parseOpenRouterSseLine('data: {"choices":[{"delta":{"content":"Hi"}}]}'),
  ).toEqual(Option.some("Hi"));
  expect(parseOpenRouterSseLine("data: [DONE]")).toEqual(Option.none());
  expect(parseOpenRouterSseLine("event: message")).toEqual(Option.none());
  expect(
    parseOpenRouterSseLine('data: {"choices":[{"delta":{"content":""}}]}'),
  ).toEqual(Option.none());
});

test("placeholder and empty OpenRouter keys are rejected", () => {
  expect(isUsableOpenRouterKeyValue("")).toBe(false);
  expect(isUsableOpenRouterKeyValue("replace-with-openrouter-api-key")).toBe(
    false,
  );
  expect(isUsableOpenRouterKeyValue("sk-or-real")).toBe(true);
  expect(isUsableOpenRouterKey(Option.none())).toBe(false);
  expect(isUsableOpenRouterKey(Option.some(Redacted.make("sk-or-real")))).toBe(
    true,
  );
});

test("openRouterTokenStream reads tokens from a mocked HTTP SSE body", async () => {
  const sse = [
    'data: {"choices":[{"delta":{"content":"Hel"}}]}',
    'data: {"choices":[{"delta":{"content":"lo"}}]}',
    "data: [DONE]",
    "",
  ].join("\n");
  const mockFetch = (async () =>
    new Response(sse, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })) as unknown as typeof fetch;

  const tokens = await Effect.runPromise(
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const stream = yield* openRouterTokenStream({
        http,
        apiKey: Redacted.make("test-key"),
        model: "openai/gpt-4o-mini",
        referer: "http://localhost:3000",
        messages: [{ role: "user", content: "hi" }],
      });
      return yield* Stream.runCollect(stream);
    }).pipe(
      Effect.provideService(FetchHttpClient.Fetch, mockFetch),
      Effect.provide(FetchHttpClient.layer),
    ),
  );

  expect(tokens).toEqual(["Hel", "lo"]);
});

(hasRealOpenRouterKey ? test.skip : test)(
  "OpenRouterChatLive fails with OPENROUTER when the API key is missing",
  async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const openrouter = yield* OpenRouterChat;
        return yield* openrouter.complete([{ role: "user", content: "hi" }]);
      }).pipe(Effect.provide(OpenRouterChatLive), Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result) && result.failure instanceof AppError) {
      expect(result.failure.code).toBe("OPENROUTER");
    }
  },
);
