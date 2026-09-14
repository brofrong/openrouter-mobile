import { expect, test } from "bun:test";
import { AppError } from "@openrouter-mobile/domain";
import { Effect, Option, Redacted, Result, Stream } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import {
  OpenRouterChat,
  OpenRouterChatLive,
} from "../src/features/chat/OpenRouterChat";
import {
  audioDataUrl,
  isUsableOpenRouterKey,
  isUsableOpenRouterKeyValue,
  openRouterAudioBody,
  openRouterChatBody,
  openRouterGenerateAudio,
  openRouterGenerateImage,
  openRouterGenerateSpeech,
  openRouterGenerateVideo,
  openRouterImageBody,
  openRouterSpeechBody,
  openRouterTokenStream,
  openRouterVideoBody,
  parseOpenRouterAudioSseParts,
  parseOpenRouterImageUrl,
  parseOpenRouterImageUrls,
  parseOpenRouterSseLine,
  parseOpenRouterSseParts,
  parseOpenRouterVideoJob,
  toOpenRouterUserContent,
} from "../src/shared/openrouter";

const hasRealOpenRouterKey = isUsableOpenRouterKeyValue(
  process.env.OPENROUTER_API_KEY ?? "",
);

test("openRouterChatBody omits reasoning unless effort is set", () => {
  expect(
    openRouterChatBody({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    }),
  ).toEqual({
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hi" }],
    stream: true,
    usage: { include: true },
  });
  expect(
    openRouterChatBody({
      model: "openai/gpt-5.6-luna",
      messages: [{ role: "user", content: "hi" }],
      effort: "high",
    }),
  ).toEqual({
    model: "openai/gpt-5.6-luna",
    messages: [{ role: "user", content: "hi" }],
    stream: true,
    usage: { include: true },
    reasoning: { effort: "high" },
  });
});

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

test("parseOpenRouterSseParts extracts usage and text from one chunk", () => {
  expect(
    parseOpenRouterSseParts(
      'data: {"choices":[{"delta":{"content":"Hi"}}],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14,"cost":0.0012}}',
    ),
  ).toEqual([
    { _tag: "text", text: "Hi" },
    {
      _tag: "usage",
      usage: {
        promptTokens: 10,
        completionTokens: 4,
        totalTokens: 14,
        costUsd: 0.0012,
      },
    },
  ]);
  expect(
    parseOpenRouterSseParts(
      'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"cost":0.0004}}',
    ),
  ).toEqual([
    {
      _tag: "usage",
      usage: {
        promptTokens: 3,
        completionTokens: 2,
        totalTokens: 5,
        costUsd: 0.0004,
      },
    },
  ]);
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

  expect(tokens).toEqual([
    { _tag: "text", text: "Hel" },
    { _tag: "text", text: "lo" },
  ]);
});

test("openRouterImageBody includes optional image fields", () => {
  expect(
    openRouterImageBody({
      model: "google/gemini-3.1-flash-image",
      prompt: "a cat",
    }),
  ).toEqual({
    model: "google/gemini-3.1-flash-image",
    prompt: "a cat",
  });
  expect(
    openRouterImageBody({
      model: "openai/gpt-image-2",
      prompt: "a fox",
      aspectRatio: "16:9",
      quality: "high",
      background: "opaque",
      n: 2,
    }),
  ).toEqual({
    model: "openai/gpt-image-2",
    prompt: "a fox",
    aspect_ratio: "16:9",
    quality: "high",
    background: "opaque",
    n: 2,
  });
  expect(
    openRouterImageBody({
      model: "openai/gpt-image-2",
      prompt: "paint this",
      inputReferences: ["data:image/png;base64,abc"],
    }),
  ).toEqual({
    model: "openai/gpt-image-2",
    prompt: "paint this",
    input_references: [
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,abc" },
      },
    ],
  });
});

test("parseOpenRouterVideoJob reads id, status, urls, and usage", () => {
  expect(
    parseOpenRouterVideoJob({
      id: "vid_1",
      polling_url: "https://openrouter.ai/api/v1/videos/vid_1",
      status: "completed",
      unsigned_urls: [
        "https://openrouter.ai/api/v1/videos/vid_1/content?index=0",
      ],
      usage: { cost: 0.25 },
    }),
  ).toEqual({
    id: "vid_1",
    pollingUrl: "https://openrouter.ai/api/v1/videos/vid_1",
    status: "completed",
    unsignedUrls: ["https://openrouter.ai/api/v1/videos/vid_1/content?index=0"],
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0.25,
    },
  });
  expect(
    parseOpenRouterVideoJob({
      id: "vid_2",
      status: "failed",
      error: "Content policy violation",
    }),
  ).toEqual({
    id: "vid_2",
    status: "failed",
    error: "Content policy violation",
  });
  expect(parseOpenRouterVideoJob({})).toBeUndefined();
});

test("openRouterVideoBody includes optional video fields", () => {
  expect(
    openRouterVideoBody({
      model: "google/veo-3.1",
      prompt: "a wave",
    }),
  ).toEqual({
    model: "google/veo-3.1",
    prompt: "a wave",
  });
  expect(
    openRouterVideoBody({
      model: "google/veo-3.1",
      prompt: "a wave",
      aspectRatio: "9:16",
      resolution: "1080p",
      duration: 8,
      generateAudio: false,
    }),
  ).toEqual({
    model: "google/veo-3.1",
    prompt: "a wave",
    aspect_ratio: "9:16",
    resolution: "1080p",
    duration: 8,
    generate_audio: false,
  });
});

test("toOpenRouterUserContent turns stored images into chat parts", () => {
  expect(toOpenRouterUserContent("hi")).toBe("hi");
  expect(
    toOpenRouterUserContent(
      JSON.stringify({
        text: "what is this",
        images: ["data:image/png;base64,abc"],
      }),
    ),
  ).toEqual([
    { type: "text", text: "what is this" },
    {
      type: "image_url",
      image_url: { url: "data:image/png;base64,abc" },
    },
  ]);
});

test("parseOpenRouterImageUrls keeps every image in the payload", () => {
  expect(
    parseOpenRouterImageUrls({
      data: [
        { url: "https://cdn.example/a.png" },
        { b64_json: "Yg==", media_type: "image/png" },
      ],
    }),
  ).toEqual(["https://cdn.example/a.png", "data:image/png;base64,Yg=="]);
});

test("parseOpenRouterImageUrl prefers url and otherwise builds a data url", () => {
  expect(
    parseOpenRouterImageUrl({
      data: [{ url: "https://cdn.example/cat.png" }],
    }),
  ).toBe("https://cdn.example/cat.png");
  expect(
    parseOpenRouterImageUrl({
      data: [{ b64_json: "abc123", media_type: "image/webp" }],
    }),
  ).toBe("data:image/webp;base64,abc123");
  expect(
    parseOpenRouterImageUrl({
      data: [{ b64_json: "abc123" }],
    }),
  ).toBe("data:image/png;base64,abc123");
  expect(parseOpenRouterImageUrl({ data: [] })).toBeUndefined();
});

test("openRouterSpeechBody asks OpenRouter for mp3 speech", () => {
  expect(
    openRouterSpeechBody({
      model: "mistralai/voxtral-mini-tts-2603",
      input: "hello",
    }),
  ).toEqual({
    model: "mistralai/voxtral-mini-tts-2603",
    input: "hello",
    voice: "en_paul_neutral",
    response_format: "mp3",
  });
  expect(
    openRouterSpeechBody({
      model: "x-ai/grok-voice-tts-1.0",
      input: "hi",
      voice: "eve",
    }),
  ).toEqual({
    model: "x-ai/grok-voice-tts-1.0",
    input: "hi",
    voice: "eve",
    response_format: "mp3",
  });
});

test("audioDataUrl wraps raw bytes as a playable data url", () => {
  expect(audioDataUrl(new Uint8Array([1, 2, 3]).buffer, "audio/mpeg")).toBe(
    `data:audio/mpeg;base64,${Buffer.from([1, 2, 3]).toString("base64")}`,
  );
});

test("openRouterAudioBody requests streamed audio output", () => {
  expect(
    openRouterAudioBody({
      model: "google/lyria-3-clip-preview",
      prompt: "a lo-fi beat",
    }),
  ).toEqual({
    model: "google/lyria-3-clip-preview",
    messages: [{ role: "user", content: "a lo-fi beat" }],
    stream: true,
    usage: { include: true },
    modalities: ["text", "audio"],
    audio: { format: "mp3" },
  });
  expect(
    openRouterAudioBody({
      model: "openai/gpt-audio",
      prompt: "hum a melody",
    }),
  ).toEqual({
    model: "openai/gpt-audio",
    messages: [{ role: "user", content: "hum a melody" }],
    stream: true,
    usage: { include: true },
    modalities: ["text", "audio"],
    audio: { format: "mp3", voice: "alloy" },
  });
});

test("parseOpenRouterAudioSseParts extracts audio chunks and usage", () => {
  expect(
    parseOpenRouterAudioSseParts(
      'data: {"choices":[{"delta":{"audio":{"data":"QUJD"}}}]}',
    ),
  ).toEqual([{ _tag: "audio", data: "QUJD" }]);
  expect(
    parseOpenRouterAudioSseParts(
      'data: {"choices":[{"message":{"audio":{"data":"QUJD"}}}],"usage":{"prompt_tokens":2,"completion_tokens":1,"cost":0.04}}',
    ),
  ).toEqual([
    { _tag: "audio", data: "QUJD" },
    {
      _tag: "usage",
      usage: {
        promptTokens: 2,
        completionTokens: 1,
        totalTokens: 3,
        costUsd: 0.04,
      },
    },
  ]);
  expect(parseOpenRouterAudioSseParts("data: [DONE]")).toEqual([]);
});

test("openRouterGenerateAudio concatenates streamed audio chunks into a data url", async () => {
  const first = Buffer.from([0xff, 0xfb]).toString("base64");
  const second = Buffer.from([0x90, 0x00]).toString("base64");
  const sse = [
    `data: {"choices":[{"delta":{"audio":{"data":"${first}"}}}]}`,
    `data: {"choices":[{"delta":{"audio":{"data":"${second}"}}}],"usage":{"prompt_tokens":3,"completion_tokens":1,"cost":0.04}}`,
    "data: [DONE]",
    "",
  ].join("\n");
  const mockFetch = (async () =>
    new Response(sse, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })) as unknown as typeof fetch;

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      return yield* openRouterGenerateAudio({
        http,
        apiKey: Redacted.make("test-key"),
        model: "google/lyria-3-clip-preview",
        referer: "http://localhost:3000",
        prompt: "a lo-fi beat",
      });
    }).pipe(
      Effect.provideService(FetchHttpClient.Fetch, mockFetch),
      Effect.provide(FetchHttpClient.layer),
    ),
  );

  expect(result).toEqual({
    url: `data:audio/mpeg;base64,${Buffer.from([0xff, 0xfb, 0x90, 0x00]).toString("base64")}`,
    usage: {
      promptTokens: 3,
      completionTokens: 1,
      totalTokens: 4,
      costUsd: 0.04,
    },
  });
});

test("openRouterGenerateSpeech turns the audio bytestream into a data url", async () => {
  const bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
  const mockFetch = (async () =>
    new Response(bytes, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    })) as unknown as typeof fetch;

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      return yield* openRouterGenerateSpeech({
        http,
        apiKey: Redacted.make("test-key"),
        model: "mistralai/voxtral-mini-tts-2603",
        referer: "http://localhost:3000",
        input: "hello",
        voice: "en_paul_neutral",
      });
    }).pipe(
      Effect.provideService(FetchHttpClient.Fetch, mockFetch),
      Effect.provide(FetchHttpClient.layer),
    ),
  );

  expect(result).toEqual({
    url: `data:audio/mpeg;base64,${Buffer.from(bytes).toString("base64")}`,
  });
});

test("openRouterGenerateVideo submits, polls, and downloads the clip", async () => {
  const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x18]);
  const calls: Array<string> = [];
  const mockFetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://openrouter.ai/api/v1/videos") {
      return new Response(
        JSON.stringify({
          id: "vid_1",
          polling_url: "https://openrouter.ai/api/v1/videos/vid_1",
          status: "pending",
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url === "https://openrouter.ai/api/v1/videos/vid_1") {
      const polls = calls.filter(
        (call) => call === "https://openrouter.ai/api/v1/videos/vid_1",
      ).length;
      if (polls === 1) {
        return new Response(
          JSON.stringify({
            id: "vid_1",
            status: "in_progress",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(
        JSON.stringify({
          id: "vid_1",
          status: "completed",
          unsigned_urls: [
            "https://openrouter.ai/api/v1/videos/vid_1/content?index=0",
          ],
          usage: { cost: 0.25 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url === "https://openrouter.ai/api/v1/videos/vid_1/content?index=0") {
      return new Response(bytes, {
        status: 200,
        headers: { "Content-Type": "video/mp4" },
      });
    }
    return new Response("missing", { status: 404 });
  }) as unknown as typeof fetch;

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      return yield* openRouterGenerateVideo({
        http,
        apiKey: Redacted.make("test-key"),
        model: "google/veo-3.1",
        referer: "http://localhost:3000",
        prompt: "a wave",
        aspectRatio: "9:16",
        resolution: "1080p",
        duration: 8,
        generateAudio: false,
        pollInterval: "1 millis",
      });
    }).pipe(
      Effect.provideService(FetchHttpClient.Fetch, mockFetch),
      Effect.provide(FetchHttpClient.layer),
    ),
  );

  expect(calls).toEqual([
    "https://openrouter.ai/api/v1/videos",
    "https://openrouter.ai/api/v1/videos/vid_1",
    "https://openrouter.ai/api/v1/videos/vid_1",
    "https://openrouter.ai/api/v1/videos/vid_1/content?index=0",
  ]);
  expect(result).toEqual({
    url: `data:video/mp4;base64,${Buffer.from(bytes).toString("base64")}`,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0.25,
    },
  });
});

test("openRouterGenerateVideo fails when the job reports failed", async () => {
  const mockFetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url === "https://openrouter.ai/api/v1/videos") {
      return new Response(
        JSON.stringify({
          id: "vid_fail",
          polling_url: "https://openrouter.ai/api/v1/videos/vid_fail",
          status: "pending",
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({
        id: "vid_fail",
        status: "failed",
        error: "Content policy violation",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as unknown as typeof fetch;

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      return yield* openRouterGenerateVideo({
        http,
        apiKey: Redacted.make("test-key"),
        model: "google/veo-3.1",
        referer: "http://localhost:3000",
        prompt: "a wave",
        pollInterval: "1 millis",
      });
    }).pipe(
      Effect.provideService(FetchHttpClient.Fetch, mockFetch),
      Effect.provide(FetchHttpClient.layer),
      Effect.result,
    ),
  );

  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result) && result.failure instanceof AppError) {
    expect(result.failure.code).toBe("OPENROUTER");
    expect(result.failure.message).toBe("Content policy violation");
  }
});

test("openRouterGenerateImage reads the first image from a mocked HTTP body", async () => {
  const mockFetch = (async () =>
    new Response(
      JSON.stringify({
        data: [{ b64_json: "cGl4", media_type: "image/png" }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    )) as unknown as typeof fetch;

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      return yield* openRouterGenerateImage({
        http,
        apiKey: Redacted.make("test-key"),
        model: "google/gemini-3.1-flash-image",
        referer: "http://localhost:3000",
        prompt: "a pixel",
        aspectRatio: "1:1",
      });
    }).pipe(
      Effect.provideService(FetchHttpClient.Fetch, mockFetch),
      Effect.provide(FetchHttpClient.layer),
    ),
  );

  expect(result).toEqual({ url: "data:image/png;base64,cGl4" });
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
