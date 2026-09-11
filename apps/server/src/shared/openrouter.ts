import { AppError } from "@openrouter-mobile/domain";
import { Effect, Option, Redacted, Stream } from "effect";
import {
  type HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";

export const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

export type OpenRouterMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

export const isUsableOpenRouterKeyValue = (value: string): boolean =>
  value.length > 0 && value !== "replace-with-openrouter-api-key";

export const isUsableOpenRouterKey = (
  key: Option.Option<Redacted.Redacted<string>>,
): key is Option.Some<Redacted.Redacted<string>> =>
  Option.isSome(key) && isUsableOpenRouterKeyValue(Redacted.value(key.value));

export const parseOpenRouterSseLine = (line: string): Option.Option<string> => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return Option.none();
  }
  const data = trimmed.slice("data:".length).trim();
  if (data.length === 0 || data === "[DONE]") {
    return Option.none();
  }
  try {
    const json = JSON.parse(data) as {
      choices?: ReadonlyArray<{ delta?: { content?: unknown } }>;
    };
    const content = json.choices?.[0]?.delta?.content;
    return typeof content === "string" && content.length > 0
      ? Option.some(content)
      : Option.none();
  } catch {
    return Option.none();
  }
};

const openRouterFailed = (message: string) =>
  new AppError({
    code: "OPENROUTER",
    message,
  });

export const openRouterTokenStream = (options: {
  readonly http: HttpClient.HttpClient;
  readonly apiKey: Redacted.Redacted<string>;
  readonly model: string;
  readonly referer: string;
  readonly messages: ReadonlyArray<OpenRouterMessage>;
}): Effect.Effect<Stream.Stream<string, AppError>, AppError> =>
  Effect.gen(function* () {
    const request = HttpClientRequest.post(
      OPENROUTER_CHAT_COMPLETIONS_URL,
    ).pipe(
      HttpClientRequest.bearerToken(options.apiKey),
      HttpClientRequest.setHeader("HTTP-Referer", options.referer),
      HttpClientRequest.setHeader("X-Title", "openrouter-mobile"),
      HttpClientRequest.bodyJsonUnsafe({
        model: options.model,
        messages: options.messages,
        stream: true,
      }),
    );
    const response = yield* options.http.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.mapError(() =>
        openRouterFailed("OpenRouter chat completions request failed"),
      ),
    );
    return response.stream.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.takeUntil(
        (line) =>
          line.trim() === "data: [DONE]" || line.trim() === "data:[DONE]",
        { excludeLast: true },
      ),
      Stream.map(parseOpenRouterSseLine),
      Stream.filter(Option.isSome),
      Stream.map((option) => option.value),
      Stream.mapError(() => openRouterFailed("OpenRouter stream failed")),
    );
  });
