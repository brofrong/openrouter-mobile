import { AppError } from "@openrouter-mobile/domain";
import { Context, Effect, Layer, type Stream } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { AppConfig } from "../../shared/config";
import {
  isUsableOpenRouterKey,
  type OpenRouterMessage,
  openRouterTokenStream,
} from "../../shared/openrouter";

export type { OpenRouterMessage };

export interface OpenRouterChatService {
  readonly complete: (
    messages: ReadonlyArray<OpenRouterMessage>,
  ) => Effect.Effect<Stream.Stream<string, AppError>, AppError>;
}

export class OpenRouterChat extends Context.Service<
  OpenRouterChat,
  OpenRouterChatService
>()("@openrouter-mobile/server/OpenRouterChat") {}

const missingKey = new AppError({
  code: "OPENROUTER",
  message: "OPENROUTER_API_KEY is not set",
});

export const makeOpenRouterChat = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const config = yield* AppConfig;
  return {
    complete: (messages) => {
      const apiKey = config.openRouterApiKey;
      if (!isUsableOpenRouterKey(apiKey)) {
        return Effect.fail(missingKey);
      }
      return openRouterTokenStream({
        http,
        apiKey: apiKey.value,
        model: config.openRouterModel,
        referer: config.betterAuthUrl,
        messages,
      });
    },
  } satisfies OpenRouterChatService;
});

export const OpenRouterChatLive = Layer.effect(
  OpenRouterChat,
  makeOpenRouterChat,
).pipe(Layer.provide(FetchHttpClient.layer));
