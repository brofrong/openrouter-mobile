import { type ModelIdentity, unknownModelIdentity } from "./identity";

export const imageAspectRatioValues = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "21:9",
  "auto",
] as const;

export const imageResolutionValues = ["512", "1K", "2K", "4K"] as const;

export const imageQualityValues = [
  "auto",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export const imageBackgroundValues = ["auto", "transparent", "opaque"] as const;

export type ImageAspectRatio = (typeof imageAspectRatioValues)[number];
export type ImageResolution = (typeof imageResolutionValues)[number];
export type ImageQuality = (typeof imageQualityValues)[number];
export type ImageBackground = (typeof imageBackgroundValues)[number];

export type ImageModel = ModelIdentity & {
  readonly aspectRatios?: ReadonlyArray<ImageAspectRatio>;
  readonly resolutions?: ReadonlyArray<ImageResolution>;
  readonly qualities?: ReadonlyArray<ImageQuality>;
  readonly backgrounds?: ReadonlyArray<ImageBackground>;
  readonly defaultAspectRatio?: ImageAspectRatio;
  readonly defaultResolution?: ImageResolution;
  readonly defaultQuality?: ImageQuality;
  readonly defaultBackground?: ImageBackground;
  readonly maxN?: number;
  readonly maxInputReferences?: number;
};

export type ImageModelOptions = {
  readonly aspectRatio?: ImageAspectRatio;
  readonly resolution?: ImageResolution;
  readonly quality?: ImageQuality;
  readonly background?: ImageBackground;
  readonly n?: number;
};

export const DEFAULT_IMAGE_MODEL_ID = "google/gemini-3.1-flash-image";

const commonAspects = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
] as const satisfies ReadonlyArray<ImageAspectRatio>;

export const IMAGE_MODELS: ReadonlyArray<ImageModel> = [
  {
    id: DEFAULT_IMAGE_MODEL_ID,
    company: "Google",
    name: "Nano Banana 2",
    iconColor: "#4285F4",
    aspectRatios: [...commonAspects, "21:9"],
    resolutions: ["512", "1K", "2K", "4K"],
    defaultAspectRatio: "1:1",
    defaultResolution: "1K",
    maxInputReferences: 14,
  },
  {
    id: "google/gemini-3-pro-image",
    company: "Google",
    name: "Nano Banana Pro",
    iconColor: "#4285F4",
    aspectRatios: [...commonAspects, "21:9"],
    resolutions: ["1K", "2K", "4K"],
    defaultAspectRatio: "1:1",
    defaultResolution: "1K",
    maxInputReferences: 14,
  },
  {
    id: "openai/gpt-image-2.5-flare",
    company: "OpenAI",
    name: "GPT Image 2.5 Flare",
    iconColor: "#10A37F",
    aspectRatios: [...commonAspects, "21:9", "auto"],
    qualities: ["auto", "low", "medium", "high", "xhigh", "max"],
    backgrounds: ["auto", "transparent", "opaque"],
    defaultAspectRatio: "1:1",
    defaultQuality: "auto",
    defaultBackground: "auto",
    maxN: 10,
    maxInputReferences: 16,
  },
  {
    id: "openai/gpt-image-2",
    company: "OpenAI",
    name: "GPT Image 2",
    iconColor: "#10A37F",
    aspectRatios: [...commonAspects, "21:9", "auto"],
    qualities: ["auto", "low", "medium", "high"],
    backgrounds: ["auto", "opaque"],
    defaultAspectRatio: "1:1",
    defaultQuality: "auto",
    defaultBackground: "auto",
    maxN: 10,
    maxInputReferences: 16,
  },
  {
    id: "bytedance-seed/seedream-5-0-lite",
    company: "ByteDance",
    name: "Seedream 5 Lite",
    iconColor: "#3B82F6",
    aspectRatios: [...commonAspects, "21:9", "auto"],
    resolutions: ["2K", "4K"],
    defaultAspectRatio: "1:1",
    defaultResolution: "2K",
    maxN: 4,
    maxInputReferences: 14,
  },
  {
    id: "x-ai/grok-imagine-image-2.0",
    company: "xAI",
    name: "Grok Imagine 2",
    iconColor: "#111111",
    aspectRatios: [...commonAspects, "auto"],
    resolutions: ["1K", "2K"],
    qualities: ["low", "medium"],
    defaultAspectRatio: "1:1",
    defaultResolution: "1K",
    defaultQuality: "medium",
    maxInputReferences: 3,
  },
  {
    id: "black-forest-labs/flux.2-pro",
    company: "Black Forest",
    name: "FLUX.2 Pro",
    iconColor: "#111111",
    aspectRatios: commonAspects,
    defaultAspectRatio: "1:1",
    maxInputReferences: 8,
  },
  {
    id: "qwen/qwen-image-3",
    company: "Qwen",
    name: "Qwen Image 3",
    iconColor: "#7C3AED",
    aspectRatios: commonAspects,
    resolutions: ["1K", "2K"],
    defaultAspectRatio: "1:1",
    defaultResolution: "1K",
    maxN: 6,
    maxInputReferences: 4,
  },
];

const modelsById = new Map(IMAGE_MODELS.map((model) => [model.id, model]));

const defaultModel = IMAGE_MODELS[0];

if (defaultModel === undefined) {
  throw new Error("IMAGE_MODELS must not be empty");
}

export const resolveImageModel = (id: string | undefined): ImageModel => {
  if (id === undefined || id.length === 0) {
    return defaultModel;
  }
  return modelsById.get(id) ?? unknownModelIdentity(id);
};

export const imageModelFromPicker = (identity: ModelIdentity): ImageModel => {
  const curated = modelsById.get(identity.id);
  if (curated === undefined) {
    return identity;
  }
  return {
    ...curated,
    company: identity.company,
    name: identity.name,
    iconColor: identity.iconColor,
  };
};

export const imageModelHasOptions = (model: ImageModel): boolean =>
  (model.aspectRatios?.length ?? 0) > 0 ||
  (model.resolutions?.length ?? 0) > 0 ||
  (model.qualities?.length ?? 0) > 0 ||
  (model.backgrounds?.length ?? 0) > 0 ||
  (model.maxN ?? 1) > 1;

const pickSupported = <T extends string>(
  supported: ReadonlyArray<T> | undefined,
  current: T | undefined,
  fallback: T | undefined,
): T | undefined => {
  if (supported === undefined || supported.length === 0) {
    return undefined;
  }
  if (current !== undefined && supported.includes(current)) {
    return current;
  }
  if (fallback !== undefined && supported.includes(fallback)) {
    return fallback;
  }
  return supported[0];
};

export const resolveImageOptions = (
  model: ImageModel,
  current: ImageModelOptions,
): ImageModelOptions => {
  const aspectRatio = pickSupported(
    model.aspectRatios,
    current.aspectRatio,
    model.defaultAspectRatio,
  );
  const resolution = pickSupported(
    model.resolutions,
    current.resolution,
    model.defaultResolution,
  );
  const quality = pickSupported(
    model.qualities,
    current.quality,
    model.defaultQuality,
  );
  const background = pickSupported(
    model.backgrounds,
    current.background,
    model.defaultBackground,
  );
  const maxN = model.maxN ?? 1;
  const n =
    maxN <= 1
      ? undefined
      : current.n !== undefined &&
          Number.isInteger(current.n) &&
          current.n >= 1 &&
          current.n <= maxN
        ? current.n
        : 1;
  return {
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
    ...(resolution === undefined ? {} : { resolution }),
    ...(quality === undefined ? {} : { quality }),
    ...(background === undefined ? {} : { background }),
    ...(n === undefined ? {} : { n }),
  };
};
