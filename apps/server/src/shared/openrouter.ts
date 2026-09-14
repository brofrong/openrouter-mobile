import {
  AppError,
  decodeStoredContent,
  type ReasoningEffort,
} from "@openrouter-mobile/domain";
import { type Duration, Effect, Option, Redacted, Stream } from "effect";
import {
  type HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";

export const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";

export const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";

export const OPENROUTER_SPEECH_URL =
  "https://openrouter.ai/api/v1/audio/speech";

export const OPENROUTER_VIDEOS_URL = "https://openrouter.ai/api/v1/videos";

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

export const DEFAULT_OPENROUTER_IMAGE_MODEL = "google/gemini-3.1-flash-image";

export const DEFAULT_OPENROUTER_VIDEO_MODEL = "bytedance/seedance-2.0-mini";

export const DEFAULT_OPENROUTER_SPEECH_MODEL =
  "mistralai/voxtral-mini-tts-2603";

export const DEFAULT_OPENROUTER_AUDIO_MODEL = "google/lyria-3-clip-preview";

export const DEFAULT_OPENROUTER_SPEECH_VOICE = "en_paul_neutral";

export const DEFAULT_OPENROUTER_AUDIO_VOICE = "alloy";

export const OPENROUTER_AUDIO_FORMATS = [
  "mp3",
  "wav",
  "flac",
  "opus",
  "pcm16",
] as const;

export type OpenRouterAudioFormat = (typeof OPENROUTER_AUDIO_FORMATS)[number];

export type OpenRouterTextPart = {
  readonly type: "text";
  readonly text: string;
};

export type OpenRouterImagePart = {
  readonly type: "image_url";
  readonly image_url: {
    readonly url: string;
  };
};

export type OpenRouterContent =
  | string
  | ReadonlyArray<OpenRouterTextPart | OpenRouterImagePart>;

export type OpenRouterMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: OpenRouterContent;
};

export const toOpenRouterUserContent = (content: string): OpenRouterContent => {
  const decoded = decodeStoredContent(content);
  if (decoded.images.length === 0) {
    return decoded.text;
  }
  const parts: Array<OpenRouterTextPart | OpenRouterImagePart> = [];
  if (decoded.text.length > 0) {
    parts.push({ type: "text", text: decoded.text });
  }
  for (const url of decoded.images) {
    parts.push({ type: "image_url", image_url: { url } });
  }
  return parts;
};

export type OpenRouterUsage = {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly costUsd: number;
};

export type OpenRouterStreamPart =
  | { readonly _tag: "text"; readonly text: string }
  | { readonly _tag: "usage"; readonly usage: OpenRouterUsage };

export type OpenRouterAudioStreamPart =
  | { readonly _tag: "audio"; readonly data: string }
  | { readonly _tag: "usage"; readonly usage: OpenRouterUsage };

export const openRouterChatBody = (options: {
  readonly model: string;
  readonly messages: ReadonlyArray<OpenRouterMessage>;
  readonly effort?: ReasoningEffort;
}) => ({
  model: options.model,
  messages: options.messages,
  stream: true,
  usage: { include: true },
  ...(options.effort === undefined
    ? {}
    : { reasoning: { effort: options.effort } }),
});

export const openRouterImageBody = (options: {
  readonly model: string;
  readonly prompt: string;
  readonly aspectRatio?: string;
  readonly resolution?: string;
  readonly quality?: string;
  readonly background?: string;
  readonly n?: number;
  readonly inputReferences?: ReadonlyArray<string>;
}) => ({
  model: options.model,
  prompt: options.prompt,
  ...(options.aspectRatio === undefined
    ? {}
    : { aspect_ratio: options.aspectRatio }),
  ...(options.resolution === undefined
    ? {}
    : { resolution: options.resolution }),
  ...(options.quality === undefined ? {} : { quality: options.quality }),
  ...(options.background === undefined
    ? {}
    : { background: options.background }),
  ...(options.n === undefined ? {} : { n: options.n }),
  ...(options.inputReferences === undefined ||
  options.inputReferences.length === 0
    ? {}
    : {
        input_references: options.inputReferences.map((url) => ({
          type: "image_url",
          image_url: { url },
        })),
      }),
});

export const openRouterVideoBody = (options: {
  readonly model: string;
  readonly prompt: string;
  readonly aspectRatio?: string;
  readonly resolution?: string;
  readonly duration?: number;
  readonly generateAudio?: boolean;
}) => ({
  model: options.model,
  prompt: options.prompt,
  ...(options.aspectRatio === undefined
    ? {}
    : { aspect_ratio: options.aspectRatio }),
  ...(options.resolution === undefined
    ? {}
    : { resolution: options.resolution }),
  ...(options.duration === undefined ? {} : { duration: options.duration }),
  ...(options.generateAudio === undefined
    ? {}
    : { generate_audio: options.generateAudio }),
});

const imageUrlFromRecord = (value: unknown): string | undefined => {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.url === "string" && record.url.length > 0) {
    return record.url;
  }
  if (typeof record.b64_json === "string" && record.b64_json.length > 0) {
    const mediaType =
      typeof record.media_type === "string" && record.media_type.length > 0
        ? record.media_type
        : "image/png";
    return `data:${mediaType};base64,${record.b64_json}`;
  }
  return undefined;
};

export const parseOpenRouterImageUrls = (
  body: unknown,
): ReadonlyArray<string> => {
  if (body === null || typeof body !== "object") {
    return [];
  }
  const data = (body as { readonly data?: unknown }).data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.flatMap((item) => {
    const url = imageUrlFromRecord(item);
    return url === undefined ? [] : [url];
  });
};

export const parseOpenRouterImageUrl = (body: unknown): string | undefined =>
  parseOpenRouterImageUrls(body)[0];

export type OpenRouterVideoJob = {
  readonly id: string;
  readonly status: string;
  readonly pollingUrl?: string;
  readonly unsignedUrls?: ReadonlyArray<string>;
  readonly error?: string;
  readonly usage?: OpenRouterUsage;
};

const stringField = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const stringList = (value: unknown): ReadonlyArray<string> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  return items.length > 0 ? items : undefined;
};

export const parseOpenRouterVideoJob = (
  body: unknown,
): OpenRouterVideoJob | undefined => {
  if (body === null || typeof body !== "object") {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  const id = stringField(record.id);
  const status = stringField(record.status);
  if (id === undefined || status === undefined) {
    return undefined;
  }
  const pollingUrl = stringField(record.polling_url);
  const unsignedUrls = stringList(record.unsigned_urls);
  const error = stringField(record.error);
  const usage = parseOpenRouterUsage(record.usage);
  return {
    id,
    status,
    ...(pollingUrl === undefined ? {} : { pollingUrl }),
    ...(unsignedUrls === undefined ? {} : { unsignedUrls }),
    ...(error === undefined ? {} : { error }),
    ...(usage === undefined ? {} : { usage }),
  };
};

const OPENROUTER_VIDEO_HOST = "openrouter.ai";
const OPENROUTER_VIDEO_PATH = "/api/v1/videos/";

const isOpenRouterVideoUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === OPENROUTER_VIDEO_HOST &&
      url.pathname.startsWith(OPENROUTER_VIDEO_PATH)
    );
  } catch {
    return false;
  }
};

const videoJobUrl = (jobId: string): string =>
  `${OPENROUTER_VIDEOS_URL}/${encodeURIComponent(jobId)}`;

const videoContentUrl = (job: OpenRouterVideoJob): string => {
  const unsigned = job.unsignedUrls?.[0];
  if (unsigned !== undefined && isOpenRouterVideoUrl(unsigned)) {
    return unsigned;
  }
  return `${videoJobUrl(job.id)}/content?index=0`;
};

const videoPollUrl = (job: OpenRouterVideoJob): string => {
  if (job.pollingUrl !== undefined && isOpenRouterVideoUrl(job.pollingUrl)) {
    return job.pollingUrl;
  }
  return videoJobUrl(job.id);
};

const isFailedVideoStatus = (status: string): boolean =>
  status === "failed" || status === "cancelled" || status === "expired";

const DEFAULT_VIDEO_POLL_INTERVAL = "2 seconds";
const DEFAULT_VIDEO_MAX_POLLS = 180;

export const joinImageUrls = (urls: ReadonlyArray<string>): string =>
  urls.join("\n");

export const openRouterSpeechBody = (options: {
  readonly model: string;
  readonly input: string;
  readonly voice?: string;
}) => ({
  model: options.model,
  input: options.input,
  voice: options.voice ?? DEFAULT_OPENROUTER_SPEECH_VOICE,
  response_format: "mp3" as const,
});

const isOpenAiAudioModel = (model: string): boolean =>
  model.startsWith("openai/");

export const openRouterAudioBody = (options: {
  readonly model: string;
  readonly prompt: string;
  readonly voice?: string;
  readonly format?: OpenRouterAudioFormat;
}) => {
  const format = options.format ?? "mp3";
  const voice =
    options.voice ??
    (isOpenAiAudioModel(options.model)
      ? DEFAULT_OPENROUTER_AUDIO_VOICE
      : undefined);
  return {
    model: options.model,
    messages: [{ role: "user" as const, content: options.prompt }],
    stream: true,
    usage: { include: true },
    modalities: ["text", "audio"] as const,
    audio: {
      format,
      ...(voice === undefined ? {} : { voice }),
    },
  };
};

export const audioMimeType = (format: OpenRouterAudioFormat): string => {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "flac":
      return "audio/flac";
    case "opus":
      return "audio/opus";
    case "pcm16":
      return "audio/pcm";
    default:
      return "audio/mpeg";
  }
};

export const audioDataUrl = (
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
): string => binaryDataUrl(bytes, contentType, "audio/mpeg");

export const videoDataUrl = (
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
): string => binaryDataUrl(bytes, contentType, "video/mp4");

const binaryDataUrl = (
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
  fallbackMime: string,
): string => {
  const mime = contentType.split(";")[0]?.trim() || fallbackMime;
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
};

export const isUsableOpenRouterKeyValue = (value: string): boolean =>
  value.length > 0 && value !== "replace-with-openrouter-api-key";

export const isUsableOpenRouterKey = (
  key: Option.Option<Redacted.Redacted<string>>,
): key is Option.Some<Redacted.Redacted<string>> =>
  Option.isSome(key) && isUsableOpenRouterKeyValue(Redacted.value(key.value));

const finiteNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export const parseOpenRouterUsage = (
  value: unknown,
): OpenRouterUsage | undefined => {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const promptTokens = finiteNumber(record.prompt_tokens);
  const completionTokens = finiteNumber(record.completion_tokens);
  const totalFromApi = finiteNumber(record.total_tokens);
  return {
    promptTokens,
    completionTokens,
    totalTokens:
      totalFromApi > 0 ? totalFromApi : promptTokens + completionTokens,
    costUsd: finiteNumber(record.cost),
  };
};

export const parseOpenRouterSseParts = (
  line: string,
): ReadonlyArray<OpenRouterStreamPart> => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return [];
  }
  const data = trimmed.slice("data:".length).trim();
  if (data.length === 0 || data === "[DONE]") {
    return [];
  }
  try {
    const json = JSON.parse(data) as {
      choices?: ReadonlyArray<{ delta?: { content?: unknown } }>;
      usage?: unknown;
    };
    const parts: Array<OpenRouterStreamPart> = [];
    const content = json.choices?.[0]?.delta?.content;
    if (typeof content === "string" && content.length > 0) {
      parts.push({ _tag: "text", text: content });
    }
    const usage = parseOpenRouterUsage(json.usage);
    if (usage !== undefined) {
      parts.push({ _tag: "usage", usage });
    }
    return parts;
  } catch {
    return [];
  }
};

export const parseOpenRouterSseLine = (line: string): Option.Option<string> => {
  const text = parseOpenRouterSseParts(line).find(
    (part) => part._tag === "text",
  );
  return text === undefined ? Option.none() : Option.some(text.text);
};

const audioDataFromUnknown = (value: unknown): string | undefined => {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const data = (value as { readonly data?: unknown }).data;
  return typeof data === "string" && data.length > 0 ? data : undefined;
};

export const parseOpenRouterAudioSseParts = (
  line: string,
): ReadonlyArray<OpenRouterAudioStreamPart> => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return [];
  }
  const data = trimmed.slice("data:".length).trim();
  if (data.length === 0 || data === "[DONE]") {
    return [];
  }
  try {
    const json = JSON.parse(data) as {
      choices?: ReadonlyArray<{
        delta?: { audio?: unknown };
        message?: { audio?: unknown };
      }>;
      usage?: unknown;
    };
    const parts: Array<OpenRouterAudioStreamPart> = [];
    const choice = json.choices?.[0];
    const audio =
      audioDataFromUnknown(choice?.delta?.audio) ??
      audioDataFromUnknown(choice?.message?.audio);
    if (audio !== undefined) {
      parts.push({ _tag: "audio", data: audio });
    }
    const usage = parseOpenRouterUsage(json.usage);
    if (usage !== undefined) {
      parts.push({ _tag: "usage", usage });
    }
    return parts;
  } catch {
    return [];
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
  readonly effort?: ReasoningEffort;
}): Effect.Effect<Stream.Stream<OpenRouterStreamPart, AppError>, AppError> =>
  Effect.succeed(
    Stream.unwrap(
      Effect.gen(function* () {
        const request = HttpClientRequest.post(
          OPENROUTER_CHAT_COMPLETIONS_URL,
        ).pipe(
          HttpClientRequest.bearerToken(options.apiKey),
          HttpClientRequest.setHeader("HTTP-Referer", options.referer),
          HttpClientRequest.setHeader("X-Title", "openrouter-mobile"),
          HttpClientRequest.bodyJsonUnsafe(openRouterChatBody(options)),
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
          Stream.map(parseOpenRouterSseParts),
          Stream.flattenIterable,
          Stream.mapError(() => openRouterFailed("OpenRouter stream failed")),
        );
      }),
    ),
  );

export const openRouterGenerateImage = (options: {
  readonly http: HttpClient.HttpClient;
  readonly apiKey: Redacted.Redacted<string>;
  readonly model: string;
  readonly referer: string;
  readonly prompt: string;
  readonly aspectRatio?: string;
  readonly resolution?: string;
  readonly quality?: string;
  readonly background?: string;
  readonly n?: number;
  readonly inputReferences?: ReadonlyArray<string>;
}): Effect.Effect<
  { readonly url: string; readonly usage?: OpenRouterUsage },
  AppError
> =>
  Effect.gen(function* () {
    const request = HttpClientRequest.post(OPENROUTER_IMAGES_URL).pipe(
      HttpClientRequest.bearerToken(options.apiKey),
      HttpClientRequest.setHeader("HTTP-Referer", options.referer),
      HttpClientRequest.setHeader("X-Title", "openrouter-mobile"),
      HttpClientRequest.bodyJsonUnsafe(openRouterImageBody(options)),
    );
    const response = yield* options.http.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.mapError(() =>
        openRouterFailed("OpenRouter image request failed"),
      ),
    );
    const body = yield* response.json.pipe(
      Effect.mapError(() =>
        openRouterFailed("OpenRouter image response was not JSON"),
      ),
    );
    const urls = parseOpenRouterImageUrls(body);
    const url = urls[0];
    if (url === undefined) {
      return yield* openRouterFailed("OpenRouter image response had no image");
    }
    const usage = parseOpenRouterUsage(
      body !== null && typeof body === "object"
        ? (body as { readonly usage?: unknown }).usage
        : undefined,
    );
    return {
      url: joinImageUrls(urls),
      ...(usage === undefined ? {} : { usage }),
    };
  });

export const openRouterGenerateSpeech = (options: {
  readonly http: HttpClient.HttpClient;
  readonly apiKey: Redacted.Redacted<string>;
  readonly model: string;
  readonly referer: string;
  readonly input: string;
  readonly voice?: string;
}): Effect.Effect<{ readonly url: string }, AppError> =>
  Effect.gen(function* () {
    const request = HttpClientRequest.post(OPENROUTER_SPEECH_URL).pipe(
      HttpClientRequest.bearerToken(options.apiKey),
      HttpClientRequest.setHeader("HTTP-Referer", options.referer),
      HttpClientRequest.setHeader("X-Title", "openrouter-mobile"),
      HttpClientRequest.bodyJsonUnsafe(openRouterSpeechBody(options)),
    );
    const response = yield* options.http.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.mapError(() =>
        openRouterFailed("OpenRouter speech request failed"),
      ),
    );
    const contentType = response.headers["content-type"] ?? "";
    if (contentType.includes("application/json")) {
      return yield* openRouterFailed(
        "OpenRouter speech response was not audio",
      );
    }
    const bytes = yield* response.arrayBuffer.pipe(
      Effect.mapError(() =>
        openRouterFailed("OpenRouter speech response was empty"),
      ),
    );
    if (bytes.byteLength === 0) {
      return yield* openRouterFailed("OpenRouter speech response had no audio");
    }
    return {
      url: audioDataUrl(
        bytes,
        contentType.length > 0 ? contentType : "audio/mpeg",
      ),
    };
  });

export const openRouterGenerateAudio = (options: {
  readonly http: HttpClient.HttpClient;
  readonly apiKey: Redacted.Redacted<string>;
  readonly model: string;
  readonly referer: string;
  readonly prompt: string;
  readonly voice?: string;
  readonly format?: OpenRouterAudioFormat;
}): Effect.Effect<
  { readonly url: string; readonly usage?: OpenRouterUsage },
  AppError
> =>
  Effect.gen(function* () {
    const format = options.format ?? "mp3";
    const request = HttpClientRequest.post(
      OPENROUTER_CHAT_COMPLETIONS_URL,
    ).pipe(
      HttpClientRequest.bearerToken(options.apiKey),
      HttpClientRequest.setHeader("HTTP-Referer", options.referer),
      HttpClientRequest.setHeader("X-Title", "openrouter-mobile"),
      HttpClientRequest.bodyJsonUnsafe(openRouterAudioBody(options)),
    );
    const response = yield* options.http.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.mapError(() =>
        openRouterFailed("OpenRouter audio request failed"),
      ),
    );
    const contentType = response.headers["content-type"] ?? "";
    if (contentType.includes("application/json")) {
      const body = yield* response.json.pipe(
        Effect.mapError(() =>
          openRouterFailed("OpenRouter audio response was not JSON"),
        ),
      );
      const record = body !== null && typeof body === "object" ? body : {};
      const choices = (record as { readonly choices?: unknown }).choices;
      const choice = Array.isArray(choices) ? choices[0] : undefined;
      const audio =
        audioDataFromUnknown(
          choice !== null && typeof choice === "object"
            ? (choice as { readonly message?: { readonly audio?: unknown } })
                .message?.audio
            : undefined,
        ) ??
        audioDataFromUnknown(
          choice !== null && typeof choice === "object"
            ? (choice as { readonly delta?: { readonly audio?: unknown } })
                .delta?.audio
            : undefined,
        );
      if (audio === undefined) {
        return yield* openRouterFailed(
          "OpenRouter audio response had no audio",
        );
      }
      const bytes = Buffer.from(audio, "base64");
      if (bytes.byteLength === 0) {
        return yield* openRouterFailed(
          "OpenRouter audio response had no audio",
        );
      }
      const usage = parseOpenRouterUsage(
        (record as { readonly usage?: unknown }).usage,
      );
      return {
        url: audioDataUrl(bytes, audioMimeType(format)),
        ...(usage === undefined ? {} : { usage }),
      };
    }
    const stream = response.stream.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.takeUntil(
        (line) =>
          line.trim() === "data: [DONE]" || line.trim() === "data:[DONE]",
        { excludeLast: true },
      ),
      Stream.map(parseOpenRouterAudioSseParts),
      Stream.flattenIterable,
      Stream.mapError(() => openRouterFailed("OpenRouter audio stream failed")),
    );
    const parts = yield* Stream.runCollect(stream);
    const chunks: Array<Buffer> = [];
    let usage: OpenRouterUsage | undefined;
    for (const part of parts) {
      if (part._tag === "audio") {
        chunks.push(Buffer.from(part.data, "base64"));
      } else {
        usage = part.usage;
      }
    }
    if (chunks.length === 0) {
      return yield* openRouterFailed("OpenRouter audio response had no audio");
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.byteLength === 0) {
      return yield* openRouterFailed("OpenRouter audio response had no audio");
    }
    return {
      url: audioDataUrl(bytes, audioMimeType(format)),
      ...(usage === undefined ? {} : { usage }),
    };
  });

const authorizeOpenRouter = (
  request: HttpClientRequest.HttpClientRequest,
  options: {
    readonly apiKey: Redacted.Redacted<string>;
    readonly referer: string;
  },
) =>
  request.pipe(
    HttpClientRequest.bearerToken(options.apiKey),
    HttpClientRequest.setHeader("HTTP-Referer", options.referer),
    HttpClientRequest.setHeader("X-Title", "openrouter-mobile"),
  );

const readOpenRouterJson = (
  response: HttpClientResponse.HttpClientResponse,
  message: string,
) => response.json.pipe(Effect.mapError(() => openRouterFailed(message)));

export const openRouterGenerateVideo = (options: {
  readonly http: HttpClient.HttpClient;
  readonly apiKey: Redacted.Redacted<string>;
  readonly model: string;
  readonly referer: string;
  readonly prompt: string;
  readonly aspectRatio?: string;
  readonly resolution?: string;
  readonly duration?: number;
  readonly generateAudio?: boolean;
  readonly pollInterval?: Duration.Input;
  readonly maxPolls?: number;
}): Effect.Effect<
  { readonly url: string; readonly usage?: OpenRouterUsage },
  AppError
> =>
  Effect.gen(function* () {
    const pollInterval = options.pollInterval ?? DEFAULT_VIDEO_POLL_INTERVAL;
    const maxPolls = options.maxPolls ?? DEFAULT_VIDEO_MAX_POLLS;
    const submitRequest = authorizeOpenRouter(
      HttpClientRequest.post(OPENROUTER_VIDEOS_URL).pipe(
        HttpClientRequest.bodyJsonUnsafe(openRouterVideoBody(options)),
      ),
      options,
    );
    const submitted = yield* options.http.execute(submitRequest).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.mapError(() =>
        openRouterFailed("OpenRouter video request failed"),
      ),
    );
    const submittedBody = yield* readOpenRouterJson(
      submitted,
      "OpenRouter video response was not JSON",
    );
    let job = parseOpenRouterVideoJob(submittedBody);
    if (job === undefined) {
      return yield* openRouterFailed("OpenRouter video response had no job");
    }

    for (let attempt = 0; attempt < maxPolls; attempt++) {
      if (job.status === "completed") {
        break;
      }
      if (isFailedVideoStatus(job.status)) {
        return yield* openRouterFailed(
          job.error ?? `OpenRouter video generation ${job.status}`,
        );
      }
      yield* Effect.sleep(pollInterval);
      const pollRequest = authorizeOpenRouter(
        HttpClientRequest.get(videoPollUrl(job)),
        options,
      );
      const polled = yield* options.http.execute(pollRequest).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.mapError(() => openRouterFailed("OpenRouter video poll failed")),
      );
      const polledBody = yield* readOpenRouterJson(
        polled,
        "OpenRouter video poll response was not JSON",
      );
      const next = parseOpenRouterVideoJob(polledBody);
      if (next === undefined) {
        return yield* openRouterFailed("OpenRouter video poll had no job");
      }
      job = next;
    }

    if (job.status !== "completed") {
      if (isFailedVideoStatus(job.status)) {
        return yield* openRouterFailed(
          job.error ?? `OpenRouter video generation ${job.status}`,
        );
      }
      return yield* openRouterFailed("OpenRouter video generation timed out");
    }

    const contentRequest = authorizeOpenRouter(
      HttpClientRequest.get(videoContentUrl(job)),
      options,
    );
    const content = yield* options.http.execute(contentRequest).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.mapError(() =>
        openRouterFailed("OpenRouter video download failed"),
      ),
    );
    const contentType = content.headers["content-type"] ?? "";
    if (contentType.includes("application/json")) {
      return yield* openRouterFailed("OpenRouter video response was not video");
    }
    const bytes = yield* content.arrayBuffer.pipe(
      Effect.mapError(() =>
        openRouterFailed("OpenRouter video response was empty"),
      ),
    );
    if (bytes.byteLength === 0) {
      return yield* openRouterFailed("OpenRouter video response had no video");
    }
    return {
      url: videoDataUrl(
        bytes,
        contentType.length > 0 ? contentType : "video/mp4",
      ),
      ...(job.usage === undefined ? {} : { usage: job.usage }),
    };
  });
