import type { VideoToolOptions } from "@openrouter-mobile/domain";

export const GENERATE_VIDEO_TOOL_NAME = "generate_video";

export const GENERATE_VIDEO_TOOL = {
  type: "function" as const,
  function: {
    name: GENERATE_VIDEO_TOOL_NAME,
    description:
      "Generate a video from a text prompt using OpenRouter video models. Call this when the user asks to create, generate, or render a video.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["prompt"],
      properties: {
        prompt: {
          type: "string",
          description: "Text description of the video to generate.",
        },
        duration: {
          type: "integer",
          description: "Duration of the generated video in seconds.",
          minimum: 1,
        },
        resolution: {
          type: "string",
          enum: ["480p", "720p", "768p", "1080p", "1K", "2K", "4K"],
          description: "Output resolution.",
        },
        aspect_ratio: {
          type: "string",
          enum: [
            "16:9",
            "9:16",
            "1:1",
            "4:3",
            "3:4",
            "3:2",
            "2:3",
            "21:9",
            "9:21",
          ],
          description: "Output aspect ratio.",
        },
        generate_audio: {
          type: "boolean",
          description: "Whether to generate audio alongside the video.",
        },
        size: {
          type: "string",
          description:
            'Exact pixel dimensions as WIDTHxHEIGHT, e.g. "1280x720". Interchangeable with resolution + aspect_ratio.',
        },
        seed: {
          type: "integer",
          description:
            "If set, generation samples deterministically when the provider supports it.",
        },
        input_references: {
          type: "array",
          items: { type: "string" },
          description: "Reference image URLs to guide generation.",
        },
        frame_images: {
          type: "array",
          description:
            "Images to use as the first and/or last frame of the video.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["url", "frame_type"],
            properties: {
              url: { type: "string" },
              frame_type: {
                type: "string",
                enum: ["first_frame", "last_frame"],
              },
            },
          },
        },
      },
    },
  },
} as const;

export type VideoFrameType = "first_frame" | "last_frame";

export type VideoFrameImage = {
  readonly url: string;
  readonly frameType: VideoFrameType;
};

export type VideoToolArgs = {
  readonly prompt: string;
  readonly model?: string;
  readonly duration?: number;
  readonly resolution?: string;
  readonly aspectRatio?: string;
  readonly generateAudio?: boolean;
  readonly size?: string;
  readonly seed?: number;
  readonly inputReferences?: ReadonlyArray<string>;
  readonly frameImages?: ReadonlyArray<VideoFrameImage>;
};

const nonempty = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const bool = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const stringList = (value: unknown): ReadonlyArray<string> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => {
    const text = nonempty(item);
    return text === undefined ? [] : [text];
  });
  return items.length > 0 ? items : undefined;
};

const isFrameType = (value: unknown): value is VideoFrameType =>
  value === "first_frame" || value === "last_frame";

const frameImages = (
  value: unknown,
): ReadonlyArray<VideoFrameImage> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: Array<VideoFrameImage> = [];
  for (const item of value) {
    if (item === null || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const nested =
      record.image_url !== null && typeof record.image_url === "object"
        ? (record.image_url as Record<string, unknown>)
        : undefined;
    const url =
      nonempty(record.url) ??
      (nested === undefined ? undefined : nonempty(nested.url));
    const frameType = record.frame_type ?? record.frameType;
    if (url === undefined || !isFrameType(frameType)) {
      continue;
    }
    items.push({ url, frameType });
  }
  return items.length > 0 ? items : undefined;
};

export const parseVideoToolArgs = (
  value: unknown,
): VideoToolArgs | undefined => {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const prompt = nonempty(record.prompt);
  if (prompt === undefined) {
    return undefined;
  }
  const model = nonempty(record.model);
  const duration = finite(record.duration);
  const resolution = nonempty(record.resolution);
  const aspectRatio =
    nonempty(record.aspect_ratio) ?? nonempty(record.aspectRatio);
  const generateAudio =
    bool(record.generate_audio) ?? bool(record.generateAudio);
  const size = nonempty(record.size);
  const seed = finite(record.seed);
  const inputReferences =
    stringList(record.input_references) ?? stringList(record.inputReferences);
  const frames =
    frameImages(record.frame_images) ?? frameImages(record.frameImages);
  return {
    prompt,
    ...(model === undefined ? {} : { model }),
    ...(duration === undefined ? {} : { duration }),
    ...(resolution === undefined ? {} : { resolution }),
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
    ...(generateAudio === undefined ? {} : { generateAudio }),
    ...(size === undefined ? {} : { size }),
    ...(seed === undefined ? {} : { seed }),
    ...(inputReferences === undefined ? {} : { inputReferences }),
    ...(frames === undefined ? {} : { frameImages: frames }),
  };
};

export const parseVideoToolArgumentsJson = (
  raw: string,
): VideoToolArgs | undefined => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    return parseVideoToolArgs(JSON.parse(trimmed) as unknown);
  } catch {
    return undefined;
  }
};

const firstDefined = <T>(
  ...values: ReadonlyArray<T | undefined>
): T | undefined => values.find((value) => value !== undefined);

export const videoToolArgsFromOptions = (
  options: VideoToolOptions | undefined,
): Omit<VideoToolArgs, "prompt"> => {
  if (options === undefined) {
    return {};
  }
  return {
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.duration === undefined ? {} : { duration: options.duration }),
    ...(options.resolution === undefined
      ? {}
      : { resolution: options.resolution }),
    ...(options.aspectRatio === undefined
      ? {}
      : { aspectRatio: options.aspectRatio }),
    ...(options.generateAudio === undefined
      ? {}
      : { generateAudio: options.generateAudio }),
    ...(options.size === undefined ? {} : { size: options.size }),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    ...(options.inputReferences === undefined
      ? {}
      : { inputReferences: options.inputReferences }),
  };
};

export const mergeVideoToolArgs = (
  parsed: VideoToolArgs | undefined,
  overrides: Omit<VideoToolArgs, "prompt"> | undefined,
  defaults: {
    readonly prompt?: string;
    readonly model?: string;
    readonly inputReferences?: ReadonlyArray<string>;
  },
): VideoToolArgs | undefined => {
  const prompt = firstDefined(parsed?.prompt, nonempty(defaults.prompt));
  if (prompt === undefined) {
    return undefined;
  }
  const model = firstDefined(defaults.model, overrides?.model, parsed?.model);
  const duration = firstDefined(overrides?.duration, parsed?.duration);
  const resolution = firstDefined(overrides?.resolution, parsed?.resolution);
  const aspectRatio = firstDefined(overrides?.aspectRatio, parsed?.aspectRatio);
  const generateAudio = firstDefined(
    overrides?.generateAudio,
    parsed?.generateAudio,
  );
  const size = firstDefined(overrides?.size, parsed?.size);
  const seed = firstDefined(overrides?.seed, parsed?.seed);
  const inputReferences = firstDefined(
    overrides?.inputReferences,
    parsed?.inputReferences,
    defaults.inputReferences,
  );
  const frameImages = firstDefined(overrides?.frameImages, parsed?.frameImages);
  return {
    prompt,
    ...(model === undefined ? {} : { model }),
    ...(duration === undefined ? {} : { duration }),
    ...(resolution === undefined ? {} : { resolution }),
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
    ...(generateAudio === undefined ? {} : { generateAudio }),
    ...(size === undefined ? {} : { size }),
    ...(seed === undefined ? {} : { seed }),
    ...(inputReferences === undefined ? {} : { inputReferences }),
    ...(frameImages === undefined ? {} : { frameImages }),
  };
};
