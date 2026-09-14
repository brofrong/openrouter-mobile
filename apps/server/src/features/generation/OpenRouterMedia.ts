import { AppError } from "@openrouter-mobile/domain";
import { Context, Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { AppConfig } from "../../shared/config";
import {
  DEFAULT_OPENROUTER_AUDIO_MODEL,
  DEFAULT_OPENROUTER_IMAGE_MODEL,
  DEFAULT_OPENROUTER_SPEECH_MODEL,
  DEFAULT_OPENROUTER_VIDEO_MODEL,
  isUsableOpenRouterKey,
  type OpenRouterUsage,
  openRouterGenerateAudio,
  openRouterGenerateImage,
  openRouterGenerateSpeech,
  openRouterGenerateVideo,
} from "../../shared/openrouter";

export type MediaKind = "image" | "video" | "speech" | "audio";

export type MediaGenerateInput = {
  readonly kind: MediaKind;
  readonly prompt: string;
  readonly jobId: string;
  readonly model?: string;
  readonly aspectRatio?: string;
  readonly resolution?: string;
  readonly quality?: string;
  readonly background?: string;
  readonly n?: number;
  readonly duration?: number;
  readonly generateAudio?: boolean;
  readonly inputReferences?: ReadonlyArray<string>;
  readonly voice?: string;
};

export type MediaGenerateResult = {
  readonly url: string;
  readonly usage?: OpenRouterUsage;
};

export interface OpenRouterMediaService {
  readonly generate: (
    input: MediaGenerateInput,
  ) => Effect.Effect<MediaGenerateResult, AppError>;
}

export class OpenRouterMedia extends Context.Service<
  OpenRouterMedia,
  OpenRouterMediaService
>()("@openrouter-mobile/server/OpenRouterMedia") {}

const missingKey = new AppError({
  code: "OPENROUTER",
  message: "OPENROUTER_API_KEY is not set",
});

const stubUrl = (input: MediaGenerateInput): string =>
  `https://example.invalid/openrouter-stub/${input.kind}/${input.jobId}`;

const stubGenerate = (input: MediaGenerateInput) =>
  Effect.sleep("50 millis").pipe(
    Effect.as({
      url: stubUrl(input),
    }),
  );

export const OpenRouterMediaStubLive = Layer.succeed(OpenRouterMedia, {
  generate: stubGenerate,
});

export const makeOpenRouterMedia = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const config = yield* AppConfig;
  return {
    generate: (input) => {
      const apiKey = config.openRouterApiKey;
      if (!isUsableOpenRouterKey(apiKey)) {
        return Effect.fail(missingKey);
      }
      if (input.kind === "audio") {
        return openRouterGenerateAudio({
          http,
          apiKey: apiKey.value,
          referer: config.baseUrl,
          model: input.model ?? DEFAULT_OPENROUTER_AUDIO_MODEL,
          prompt: input.prompt,
          ...(input.voice === undefined ? {} : { voice: input.voice }),
        });
      }
      if (input.kind === "speech") {
        return openRouterGenerateSpeech({
          http,
          apiKey: apiKey.value,
          referer: config.baseUrl,
          model: input.model ?? DEFAULT_OPENROUTER_SPEECH_MODEL,
          input: input.prompt,
          ...(input.voice === undefined ? {} : { voice: input.voice }),
        });
      }
      if (input.kind === "video") {
        return openRouterGenerateVideo({
          http,
          apiKey: apiKey.value,
          referer: config.baseUrl,
          model: input.model ?? DEFAULT_OPENROUTER_VIDEO_MODEL,
          prompt: input.prompt,
          ...(input.aspectRatio === undefined
            ? {}
            : { aspectRatio: input.aspectRatio }),
          ...(input.resolution === undefined
            ? {}
            : { resolution: input.resolution }),
          ...(input.duration === undefined ? {} : { duration: input.duration }),
          ...(input.generateAudio === undefined
            ? {}
            : { generateAudio: input.generateAudio }),
        });
      }
      return openRouterGenerateImage({
        http,
        apiKey: apiKey.value,
        referer: config.baseUrl,
        model: input.model ?? DEFAULT_OPENROUTER_IMAGE_MODEL,
        prompt: input.prompt,
        ...(input.aspectRatio === undefined
          ? {}
          : { aspectRatio: input.aspectRatio }),
        ...(input.resolution === undefined
          ? {}
          : { resolution: input.resolution }),
        ...(input.quality === undefined ? {} : { quality: input.quality }),
        ...(input.background === undefined
          ? {}
          : { background: input.background }),
        ...(input.n === undefined ? {} : { n: input.n }),
        ...(input.inputReferences === undefined
          ? {}
          : { inputReferences: input.inputReferences }),
      });
    },
  } satisfies OpenRouterMediaService;
});

export const OpenRouterMediaLive = Layer.effect(
  OpenRouterMedia,
  makeOpenRouterMedia,
).pipe(Layer.provide(FetchHttpClient.layer));
