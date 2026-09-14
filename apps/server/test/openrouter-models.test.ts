import { expect, test } from "bun:test";
import { Effect, Redacted } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import {
  openRouterListModels,
  openRouterModelsUrl,
  parseOpenRouterModelsPage,
} from "../src/shared/openrouter-models";

test("openRouterModelsUrl includes search, pagination, and text modality", () => {
  const url = new URL(
    openRouterModelsUrl({
      query: "claude sonnet",
      offset: 30,
      limit: 30,
    }),
  );

  expect(`${url.origin}${url.pathname}`).toBe(
    "https://openrouter.ai/api/v1/models",
  );
  expect(url.searchParams.get("q")).toBe("claude sonnet");
  expect(url.searchParams.get("offset")).toBe("30");
  expect(url.searchParams.get("limit")).toBe("30");
  expect(url.searchParams.get("output_modalities")).toBe("text");
});

test("openRouterModelsUrl uses dedicated image and video catalogs", () => {
  const image = new URL(
    openRouterModelsUrl({ offset: 0, limit: 30, outputModality: "image" }),
  );
  const video = new URL(
    openRouterModelsUrl({ offset: 0, limit: 30, outputModality: "video" }),
  );

  expect(`${image.origin}${image.pathname}`).toBe(
    "https://openrouter.ai/api/v1/images/models",
  );
  expect(`${video.origin}${video.pathname}`).toBe(
    "https://openrouter.ai/api/v1/videos/models",
  );
  expect(image.searchParams.get("output_modalities")).toBeNull();
  expect(video.searchParams.get("output_modalities")).toBeNull();
});

test("openRouterModelsUrl asks the models catalog for audio output", () => {
  const audio = new URL(
    openRouterModelsUrl({ offset: 0, limit: 30, outputModality: "audio" }),
  );

  expect(`${audio.origin}${audio.pathname}`).toBe(
    "https://openrouter.ai/api/v1/models",
  );
  expect(audio.searchParams.get("output_modalities")).toBe("audio");
});

test("openRouterModelsUrl omits empty search query", () => {
  const url = new URL(openRouterModelsUrl({ offset: 0, limit: 30 }));
  expect(url.searchParams.get("q")).toBeNull();
});

test("parseOpenRouterModelsPage maps provider, name, and curated reasoning efforts", () => {
  const page = parseOpenRouterModelsPage(
    {
      data: [
        {
          id: "anthropic/claude-sonnet-4.6",
          name: "Anthropic: Claude Sonnet 4.6",
          context_length: 200000,
          pricing: { prompt: "0.000003", completion: "0.000015" },
          supported_parameters: ["temperature", "reasoning"],
        },
        {
          id: "openai/gpt-4o-mini",
          name: "OpenAI: GPT-4o Mini",
          context_length: 128000,
          pricing: { prompt: "0.00000015", completion: "0.0000006" },
          supported_parameters: ["temperature"],
        },
        {
          id: "unknown-lab/reasoner-1",
          name: "Reasoner 1",
          context_length: 8192,
          pricing: { prompt: "0", completion: "0" },
          supported_parameters: ["reasoning"],
        },
      ],
      total_count: 3,
    },
    { offset: 0, limit: 30 },
  );

  expect(page.total).toBe(3);
  expect(page.hasMore).toBe(false);
  expect(page.models[0]).toMatchObject({
    id: "anthropic/claude-sonnet-4.6",
    company: "Anthropic",
    name: "Claude Sonnet 4.6",
    iconColor: "#D97757",
    efforts: ["low", "medium", "high", "max"],
    defaultEffort: "medium",
    contextLength: 200000,
    promptUsdPerMillion: 3,
  });
  expect(page.models[1]).toMatchObject({
    id: "openai/gpt-4o-mini",
    company: "OpenAI",
    name: "GPT-4o Mini",
    iconColor: "#10A37F",
    contextLength: 128000,
    promptUsdPerMillion: 0.15,
  });
  expect(page.models[1]?.efforts).toBeUndefined();
  expect(page.models[2]).toMatchObject({
    id: "unknown-lab/reasoner-1",
    company: "Unknown-lab",
    name: "Reasoner 1",
    efforts: ["none", "low", "medium", "high"],
    defaultEffort: "medium",
    contextLength: 8192,
    promptUsdPerMillion: 0,
  });
});

test("parseOpenRouterModelsPage paginates using total_count", () => {
  const page = parseOpenRouterModelsPage(
    {
      data: [{ id: "openai/gpt-4o", name: "OpenAI: GPT-4o" }],
      total_count: 40,
    },
    { offset: 0, limit: 1 },
  );

  expect(page.hasMore).toBe(true);
  expect(page.total).toBe(40);
  expect(page.models).toHaveLength(1);
});

test("parseOpenRouterModelsPage omits missing or invalid context and price", () => {
  const page = parseOpenRouterModelsPage(
    {
      data: [
        {
          id: "openai/gpt-4o",
          name: "OpenAI: GPT-4o",
          context_length: 0,
          pricing: { prompt: "nope" },
        },
      ],
      total_count: 1,
    },
    { offset: 0, limit: 30 },
  );

  expect(page.models[0]?.contextLength).toBeUndefined();
  expect(page.models[0]?.promptUsdPerMillion).toBeUndefined();
});

test("parseOpenRouterModelsPage skips entries without an id", () => {
  const page = parseOpenRouterModelsPage(
    {
      data: [
        { name: "broken" },
        { id: "openai/gpt-4o", name: "OpenAI: GPT-4o" },
      ],
      total_count: 2,
    },
    { offset: 0, limit: 30 },
  );

  expect(page.models.map((model) => model.id)).toEqual(["openai/gpt-4o"]);
});

test("openRouterListModels reads a mocked models page", async () => {
  const seen: Array<string> = [];
  const mockFetch = (async (input: Parameters<typeof fetch>[0]) => {
    seen.push(String(input));
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "google/gemini-2.5-flash",
            name: "Google: Gemini 2.5 Flash",
            supported_parameters: ["reasoning"],
          },
        ],
        total_count: 1,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as unknown as typeof fetch;

  const page = await Effect.runPromise(
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      return yield* openRouterListModels({
        http,
        apiKey: Redacted.make("test-key"),
        referer: "http://localhost:3000",
        query: "gemini",
        offset: 0,
        limit: 30,
      });
    }).pipe(
      Effect.provideService(FetchHttpClient.Fetch, mockFetch),
      Effect.provide(FetchHttpClient.layer),
    ),
  );

  expect(seen).toHaveLength(1);
  const requested = new URL(seen[0] ?? "");
  expect(requested.searchParams.get("q")).toBe("gemini");
  expect(requested.searchParams.get("output_modalities")).toBe("text");
  expect(page.models[0]).toMatchObject({
    id: "google/gemini-2.5-flash",
    company: "Google",
    name: "Gemini 2.5 Flash",
  });
});

test("openRouterListModels reads the dedicated image catalog and paginates locally", async () => {
  const seen: Array<string> = [];
  const mockFetch = (async (input: Parameters<typeof fetch>[0]) => {
    seen.push(String(input));
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "openai/gpt-image-2",
            name: "OpenAI: GPT Image 2",
            architecture: { output_modalities: ["image"] },
          },
          {
            id: "anthropic/claude-sonnet-4.6",
            name: "Anthropic: Claude Sonnet 4.6",
            architecture: { output_modalities: ["text"] },
          },
          {
            id: "google/gemini-3.1-flash-image",
            name: "Google: Nano Banana 2",
            architecture: { output_modalities: ["image"] },
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as unknown as typeof fetch;

  const page = await Effect.runPromise(
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      return yield* openRouterListModels({
        http,
        referer: "http://localhost:3000",
        query: "banana",
        offset: 0,
        limit: 30,
        outputModality: "image",
      });
    }).pipe(
      Effect.provideService(FetchHttpClient.Fetch, mockFetch),
      Effect.provide(FetchHttpClient.layer),
    ),
  );

  expect(
    `${new URL(seen[0] ?? "").origin}${new URL(seen[0] ?? "").pathname}`,
  ).toBe("https://openrouter.ai/api/v1/images/models");
  expect(page.models.map((model) => model.id)).toEqual([
    "google/gemini-3.1-flash-image",
  ]);
  expect(page.total).toBe(1);
  expect(page.hasMore).toBe(false);
});
