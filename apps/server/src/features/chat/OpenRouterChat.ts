import {
  AppError,
  type CatalogModelPage,
  type OutputModality,
  type ReasoningEffort,
} from "@openrouter-mobile/domain";
import { Context, Effect, Layer, type Stream } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { AppConfig } from "../../shared/config";
import {
  isUsableOpenRouterKey,
  type OpenRouterMessage,
  type OpenRouterStreamPart,
  openRouterTokenStream,
} from "../../shared/openrouter";
import { openRouterListModels } from "../../shared/openrouter-models";

export type { OpenRouterMessage, OpenRouterStreamPart };

export type OpenRouterCompleteOptions = {
  readonly model?: string;
  readonly effort?: ReasoningEffort;
};

export type OpenRouterListModelsOptions = {
  readonly query?: string;
  readonly offset?: number;
  readonly limit?: number;
  readonly outputModality?: OutputModality;
};

export interface OpenRouterChatService {
  readonly complete: (
    messages: ReadonlyArray<OpenRouterMessage>,
    options?: OpenRouterCompleteOptions,
  ) => Effect.Effect<Stream.Stream<OpenRouterStreamPart, AppError>, AppError>;
  readonly listModels: (
    options?: OpenRouterListModelsOptions,
  ) => Effect.Effect<CatalogModelPage, AppError>;
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
    complete: (messages, options) => {
      const apiKey = config.openRouterApiKey;
      if (!isUsableOpenRouterKey(apiKey)) {
        return Effect.fail(missingKey);
      }
      return openRouterTokenStream({
        http,
        apiKey: apiKey.value,
        model: options?.model ?? config.openRouterModel,
        referer: config.betterAuthUrl,
        messages,
        ...(options?.effort === undefined ? {} : { effort: options.effort }),
      });
    },
    listModels: (options) => {
      const apiKey = config.openRouterApiKey;
      return openRouterListModels({
        http,
        referer: config.betterAuthUrl,
        offset: options?.offset ?? 0,
        limit: options?.limit ?? 30,
        ...(options?.query === undefined ? {} : { query: options.query }),
        outputModality: options?.outputModality ?? "text",
        ...(isUsableOpenRouterKey(apiKey) ? { apiKey: apiKey.value } : {}),
      });
    },
  } satisfies OpenRouterChatService;
});

export const OpenRouterChatLive = Layer.effect(
  OpenRouterChat,
  makeOpenRouterChat,
).pipe(Layer.provide(FetchHttpClient.layer));
