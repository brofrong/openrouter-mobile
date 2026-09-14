import type {
  OutputModality,
  ReasoningEffort,
} from "@openrouter-mobile/domain";
import {
  AppError,
  CatalogModel,
  CatalogModelPage,
} from "@openrouter-mobile/domain";
import { Effect, type Redacted } from "effect";
import {
  type HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const OPENROUTER_IMAGE_MODELS_URL =
  "https://openrouter.ai/api/v1/images/models";
export const OPENROUTER_VIDEO_MODELS_URL =
  "https://openrouter.ai/api/v1/videos/models";

export const DEFAULT_CATALOG_PAGE_SIZE = 30;

const DEFAULT_ICON_COLOR = "#6B7280";

const GENERIC_REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
] as const satisfies ReadonlyArray<ReasoningEffort>;

type ProviderStyle = {
  readonly company: string;
  readonly iconColor: string;
};

const PROVIDERS: Record<string, ProviderStyle> = {
  amazon: { company: "Amazon", iconColor: "#FF9900" },
  anthropic: { company: "Anthropic", iconColor: "#D97757" },
  cohere: { company: "Cohere", iconColor: "#39594D" },
  deepseek: { company: "DeepSeek", iconColor: "#4D6BFE" },
  google: { company: "Google", iconColor: "#4285F4" },
  "meta-llama": { company: "Meta", iconColor: "#0668E1" },
  microsoft: { company: "Microsoft", iconColor: "#00A4EF" },
  mistralai: { company: "Mistral", iconColor: "#F54E42" },
  moonshotai: { company: "Moonshot", iconColor: "#1A1A1A" },
  nvidia: { company: "NVIDIA", iconColor: "#76B900" },
  openai: { company: "OpenAI", iconColor: "#10A37F" },
  perplexity: { company: "Perplexity", iconColor: "#20808D" },
  qwen: { company: "Qwen", iconColor: "#5A3EEC" },
  "x-ai": { company: "xAI", iconColor: "#111111" },
  alibaba: { company: "Alibaba", iconColor: "#FF6A00" },
  bytedance: { company: "ByteDance", iconColor: "#3B82F6" },
  "bytedance-seed": { company: "ByteDance", iconColor: "#3B82F6" },
  "black-forest-labs": { company: "Black Forest", iconColor: "#111111" },
  kwaivgi: { company: "Kling", iconColor: "#111111" },
};

type CuratedEffort = {
  readonly efforts: ReadonlyArray<ReasoningEffort>;
  readonly defaultEffort: ReasoningEffort;
};

const CURATED_EFFORTS: Record<string, CuratedEffort> = {
  "anthropic/claude-opus-4.8": {
    efforts: ["low", "medium", "high", "max"],
    defaultEffort: "medium",
  },
  "anthropic/claude-sonnet-4.6": {
    efforts: ["low", "medium", "high", "max"],
    defaultEffort: "medium",
  },
  "google/gemini-2.5-flash": {
    efforts: ["low", "medium", "high"],
    defaultEffort: "medium",
  },
  "google/gemini-2.5-pro": {
    efforts: ["low", "medium", "high"],
    defaultEffort: "medium",
  },
  "openai/gpt-5.4-mini": {
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
  },
  "openai/gpt-5.6-luna": {
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
  },
  "x-ai/grok-4.6": {
    efforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
  },
};

export const openRouterModelsUrl = (options: {
  readonly query?: string;
  readonly offset: number;
  readonly limit: number;
  readonly outputModality?: OutputModality;
}): string => {
  if (options.outputModality === "image") {
    return OPENROUTER_IMAGE_MODELS_URL;
  }
  if (options.outputModality === "video") {
    return OPENROUTER_VIDEO_MODELS_URL;
  }
  const params = new URLSearchParams({
    offset: String(options.offset),
    limit: String(options.limit),
    output_modalities: options.outputModality ?? "text",
    sort: "most-popular",
  });
  const query = options.query?.trim();
  if (query !== undefined && query.length > 0) {
    params.set("q", query);
  }
  return `${OPENROUTER_MODELS_URL}?${params.toString()}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const titleCaseSlug = (slug: string): string => {
  const first = slug[0];
  return first === undefined ? "Unknown" : first.toUpperCase() + slug.slice(1);
};

const providerSlug = (id: string): string => id.split("/")[0] ?? id;

const displayName = (
  id: string,
  rawName: string,
): { readonly company: string; readonly name: string } => {
  const colon = rawName.indexOf(": ");
  if (colon > 0) {
    return {
      company: rawName.slice(0, colon),
      name: rawName.slice(colon + 2),
    };
  }
  const slug = providerSlug(id);
  return {
    company: PROVIDERS[slug]?.company ?? titleCaseSlug(slug),
    name: rawName.length > 0 ? rawName : id,
  };
};

const supportsReasoning = (
  parameters: ReadonlyArray<unknown> | undefined,
): boolean =>
  parameters?.some(
    (parameter) =>
      parameter === "reasoning" ||
      parameter === "reasoning_effort" ||
      parameter === "include_reasoning",
  ) === true;

const finiteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const contextLengthOf = (
  value: Record<string, unknown>,
): number | undefined => {
  const contextLength = finiteNumber(value.context_length);
  return contextLength !== undefined && contextLength > 0
    ? contextLength
    : undefined;
};

const promptUsdPerMillionOf = (
  value: Record<string, unknown>,
): number | undefined => {
  const pricing = isRecord(value.pricing) ? value.pricing : undefined;
  const prompt = finiteNumber(pricing?.prompt);
  if (prompt === undefined || prompt < 0) {
    return undefined;
  }
  return prompt * 1_000_000;
};

const toCatalogModel = (value: unknown): CatalogModel | undefined => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.length === 0
  ) {
    return undefined;
  }
  const rawName = typeof value.name === "string" ? value.name : "";
  const { company, name } = displayName(value.id, rawName);
  const slug = providerSlug(value.id);
  const curated = CURATED_EFFORTS[value.id];
  const parameters = Array.isArray(value.supported_parameters)
    ? value.supported_parameters
    : undefined;
  const reasoning =
    curated ??
    (supportsReasoning(parameters)
      ? {
          efforts: GENERIC_REASONING_EFFORTS,
          defaultEffort: "medium" as const,
        }
      : undefined);
  const contextLength = contextLengthOf(value);
  const promptUsdPerMillion = promptUsdPerMillionOf(value);

  return new CatalogModel({
    id: value.id,
    company,
    name,
    iconColor: PROVIDERS[slug]?.iconColor ?? DEFAULT_ICON_COLOR,
    ...(reasoning === undefined
      ? {}
      : {
          efforts: reasoning.efforts,
          defaultEffort: reasoning.defaultEffort,
        }),
    ...(contextLength === undefined ? {} : { contextLength }),
    ...(promptUsdPerMillion === undefined ? {} : { promptUsdPerMillion }),
  });
};

const outputModalitiesOf = (
  value: Record<string, unknown>,
): ReadonlyArray<string> => {
  const architecture = isRecord(value.architecture)
    ? value.architecture
    : undefined;
  return Array.isArray(architecture?.output_modalities)
    ? architecture.output_modalities.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
};

const parseOpenRouterModels = (
  body: unknown,
  outputModality?: OutputModality,
): ReadonlyArray<CatalogModel> => {
  const record = isRecord(body) ? body : {};
  const rawModels = Array.isArray(record.data) ? record.data : [];
  return rawModels.flatMap((item) => {
    if (
      (outputModality === "image" ||
        outputModality === "video" ||
        outputModality === "audio") &&
      isRecord(item)
    ) {
      const outputs = outputModalitiesOf(item);
      if (outputs.length > 0 && !outputs.includes(outputModality)) {
        return [];
      }
    }
    const model = toCatalogModel(item);
    return model === undefined ? [] : [model];
  });
};

export const paginateCatalogModels = (
  models: ReadonlyArray<CatalogModel>,
  options: {
    readonly query?: string;
    readonly offset: number;
    readonly limit: number;
  },
): CatalogModelPage => {
  const needle = options.query?.trim().toLowerCase() ?? "";
  const filtered =
    needle.length === 0
      ? models
      : models.filter(
          (model) =>
            model.name.toLowerCase().includes(needle) ||
            model.company.toLowerCase().includes(needle) ||
            model.id.toLowerCase().includes(needle),
        );
  const offset = Math.max(0, options.offset);
  const limit = Math.max(1, options.limit);
  const page = filtered.slice(offset, offset + limit);
  return new CatalogModelPage({
    models: page,
    total: filtered.length,
    hasMore: offset + page.length < filtered.length,
  });
};

export const parseOpenRouterModelsPage = (
  body: unknown,
  options: {
    readonly offset: number;
    readonly limit: number;
    readonly outputModality?: OutputModality;
  },
): CatalogModelPage => {
  const record = isRecord(body) ? body : {};
  const models = parseOpenRouterModels(body, options.outputModality);
  if (
    options.outputModality === "image" ||
    options.outputModality === "video"
  ) {
    return paginateCatalogModels(models, options);
  }
  const total =
    typeof record.total_count === "number" &&
    Number.isFinite(record.total_count)
      ? record.total_count
      : options.offset + models.length;
  const links = isRecord(record.links) ? record.links : undefined;
  const hasNextLink = typeof links?.next === "string" && links.next.length > 0;
  return new CatalogModelPage({
    models,
    total,
    hasMore: hasNextLink || options.offset + options.limit < total,
  });
};

const openRouterFailed = (message: string) =>
  new AppError({
    code: "OPENROUTER",
    message,
  });

export const openRouterListModels = (options: {
  readonly http: HttpClient.HttpClient;
  readonly referer: string;
  readonly apiKey?: Redacted.Redacted<string>;
  readonly query?: string;
  readonly offset: number;
  readonly limit: number;
  readonly outputModality?: OutputModality;
}): Effect.Effect<CatalogModelPage, AppError> =>
  Effect.gen(function* () {
    let request = HttpClientRequest.get(openRouterModelsUrl(options)).pipe(
      HttpClientRequest.setHeader("HTTP-Referer", options.referer),
      HttpClientRequest.setHeader("X-Title", "openrouter-mobile"),
    );
    if (options.apiKey !== undefined) {
      request = request.pipe(HttpClientRequest.bearerToken(options.apiKey));
    }
    const response = yield* options.http.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.mapError(() =>
        openRouterFailed("OpenRouter models request failed"),
      ),
    );
    const body = yield* response.json.pipe(
      Effect.mapError(() =>
        openRouterFailed("OpenRouter models response was not JSON"),
      ),
    );
    return parseOpenRouterModelsPage(body, {
      offset: options.offset,
      limit: options.limit,
      ...(options.query === undefined ? {} : { query: options.query }),
      ...(options.outputModality === undefined
        ? {}
        : { outputModality: options.outputModality }),
    });
  });
