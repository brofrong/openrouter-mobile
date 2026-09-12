import type { AppError } from "@openrouter-mobile/domain";
import { Context, Effect, Layer } from "effect";

export type MediaKind = "image" | "video" | "speech" | "audio";

export type MediaGenerateInput = {
  readonly kind: MediaKind;
  readonly prompt: string;
  readonly jobId: string;
};

export type MediaGenerateResult = {
  readonly url: string;
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

const stubUrl = (input: MediaGenerateInput): string =>
  `https://example.invalid/openrouter-stub/${input.kind}/${input.jobId}`;

export const makeOpenRouterMedia = Effect.succeed({
  generate: (input) =>
    Effect.sleep("50 millis").pipe(
      Effect.as({
        url: stubUrl(input),
      }),
    ),
} satisfies OpenRouterMediaService);

export const OpenRouterMediaLive = Layer.effect(
  OpenRouterMedia,
  makeOpenRouterMedia,
);
