import { type ModelIdentity, unknownModelIdentity } from "./identity";
import {
  AURA_2_VOICES,
  GEMINI_TTS_VOICES,
  GROK_TTS_VOICES,
  MAI_VOICE_2_VOICES,
  MINIMAX_SPEECH_VOICES,
  QWEN_TTS_VOICES,
  VOXTRAL_VOICES,
} from "./speech-voices";

export type MediaModel = ModelIdentity;

export type SpeechModel = MediaModel & {
  readonly voices?: ReadonlyArray<string>;
  readonly defaultVoice?: string;
};

export type SpeechModelOptions = {
  readonly voice?: string;
};

export const videoAspectRatioValues = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "21:9",
  "9:21",
] as const;

export const videoResolutionValues = ["480p", "720p", "1080p", "4K"] as const;

export type VideoAspectRatio = (typeof videoAspectRatioValues)[number];
export type VideoResolution = (typeof videoResolutionValues)[number];

export type VideoModel = MediaModel & {
  readonly aspectRatios?: ReadonlyArray<VideoAspectRatio>;
  readonly resolutions?: ReadonlyArray<VideoResolution>;
  readonly durations?: ReadonlyArray<number>;
  readonly generateAudio?: boolean;
  readonly defaultAspectRatio?: VideoAspectRatio;
  readonly defaultResolution?: VideoResolution;
  readonly defaultDuration?: number;
  readonly defaultGenerateAudio?: boolean;
};

export type VideoModelOptions = {
  readonly aspectRatio?: VideoAspectRatio;
  readonly resolution?: VideoResolution;
  readonly duration?: number;
  readonly generateAudio?: boolean;
};

export type MediaModelKind = "video" | "speech" | "audio";

export const DEFAULT_VIDEO_MODEL_ID = "bytedance/seedance-2.0-mini";
export const DEFAULT_SPEECH_MODEL_ID = "mistralai/voxtral-mini-tts-2603";
export const DEFAULT_AUDIO_MODEL_ID = "google/lyria-3-clip-preview";

const durationRange = (from: number, to: number): ReadonlyArray<number> =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

const seedanceMiniAspects = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
  "9:21",
] as const satisfies ReadonlyArray<VideoAspectRatio>;

const seedance25Aspects = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
] as const satisfies ReadonlyArray<VideoAspectRatio>;

const grokAspects = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
] as const satisfies ReadonlyArray<VideoAspectRatio>;

const wanAspects = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
] as const satisfies ReadonlyArray<VideoAspectRatio>;

export const VIDEO_MODELS: ReadonlyArray<VideoModel> = [
  {
    id: DEFAULT_VIDEO_MODEL_ID,
    company: "ByteDance",
    name: "Seedance 2.0 Mini",
    iconColor: "#3B82F6",
    aspectRatios: seedanceMiniAspects,
    resolutions: ["480p", "720p"],
    durations: durationRange(4, 15),
    generateAudio: true,
    defaultAspectRatio: "16:9",
    defaultResolution: "720p",
    defaultDuration: 8,
    defaultGenerateAudio: true,
  },
  {
    id: "bytedance/seedance-2.5",
    company: "ByteDance",
    name: "Seedance 2.5",
    iconColor: "#3B82F6",
    aspectRatios: seedance25Aspects,
    resolutions: ["480p", "720p"],
    durations: durationRange(4, 30),
    generateAudio: true,
    defaultAspectRatio: "16:9",
    defaultResolution: "720p",
    defaultDuration: 8,
    defaultGenerateAudio: true,
  },
  {
    id: "google/veo-3.1-lite",
    company: "Google",
    name: "Veo 3.1 Lite",
    iconColor: "#4285F4",
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p"],
    durations: [4, 6, 8],
    generateAudio: true,
    defaultAspectRatio: "16:9",
    defaultResolution: "720p",
    defaultDuration: 8,
    defaultGenerateAudio: true,
  },
  {
    id: "google/veo-3.1",
    company: "Google",
    name: "Veo 3.1",
    iconColor: "#4285F4",
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p", "4K"],
    durations: [4, 6, 8],
    generateAudio: true,
    defaultAspectRatio: "16:9",
    defaultResolution: "720p",
    defaultDuration: 8,
    defaultGenerateAudio: true,
  },
  {
    id: "x-ai/grok-imagine-video",
    company: "xAI",
    name: "Grok Imagine Video",
    iconColor: "#111111",
    aspectRatios: grokAspects,
    resolutions: ["480p", "720p"],
    durations: durationRange(1, 15),
    defaultAspectRatio: "16:9",
    defaultResolution: "720p",
    defaultDuration: 8,
  },
  {
    id: "alibaba/wan-3.0",
    company: "Alibaba",
    name: "Wan 3.0",
    iconColor: "#FF6A00",
    aspectRatios: wanAspects,
    resolutions: ["480p", "720p", "1080p"],
    durations: durationRange(2, 30),
    generateAudio: true,
    defaultAspectRatio: "16:9",
    defaultResolution: "720p",
    defaultDuration: 8,
    defaultGenerateAudio: true,
  },
  {
    id: "kwaivgi/kling-v3.0-pro",
    company: "Kling",
    name: "Kling 3.0 Pro",
    iconColor: "#111111",
    aspectRatios: ["1:1", "16:9", "9:16"],
    resolutions: ["720p"],
    durations: durationRange(3, 15),
    generateAudio: true,
    defaultAspectRatio: "16:9",
    defaultResolution: "720p",
    defaultDuration: 8,
    defaultGenerateAudio: true,
  },
  {
    id: "openai/sora-2-pro",
    company: "OpenAI",
    name: "Sora 2 Pro",
    iconColor: "#10A37F",
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p"],
    durations: [4, 8, 12, 16, 20],
    generateAudio: true,
    defaultAspectRatio: "16:9",
    defaultResolution: "720p",
    defaultDuration: 8,
    defaultGenerateAudio: true,
  },
];

export const SPEECH_MODELS: ReadonlyArray<SpeechModel> = [
  {
    id: DEFAULT_SPEECH_MODEL_ID,
    company: "Mistral",
    name: "Voxtral Mini TTS",
    iconColor: "#FA520F",
    voices: VOXTRAL_VOICES,
    defaultVoice: "en_paul_neutral",
  },
  {
    id: "google/gemini-3.1-flash-tts-preview",
    company: "Google",
    name: "Gemini 3.1 Flash TTS",
    iconColor: "#4285F4",
    voices: GEMINI_TTS_VOICES,
    defaultVoice: "Kore",
  },
  {
    id: "x-ai/grok-voice-tts-1.0",
    company: "xAI",
    name: "Grok Voice TTS",
    iconColor: "#111111",
    voices: GROK_TTS_VOICES,
    defaultVoice: "eve",
  },
  {
    id: "microsoft/mai-voice-2",
    company: "Microsoft",
    name: "MAI-Voice-2",
    iconColor: "#00A4EF",
    voices: MAI_VOICE_2_VOICES,
    defaultVoice: "en-US-Harper:MAI-Voice-2",
  },
  {
    id: "minimax/speech-2.8-hd",
    company: "MiniMax",
    name: "Speech 2.8 HD",
    iconColor: "#E11D48",
    voices: MINIMAX_SPEECH_VOICES,
    defaultVoice: "English_expressive_narrator",
  },
  {
    id: "qwen/qwen-audio-3.0-tts-flash",
    company: "Qwen",
    name: "Qwen Audio TTS Flash",
    iconColor: "#7C3AED",
    voices: QWEN_TTS_VOICES,
    defaultVoice: "loongjohn",
  },
  {
    id: "fish-audio/s2.1-pro",
    company: "Fish Audio",
    name: "S2.1 Pro",
    iconColor: "#0EA5E9",
  },
  {
    id: "deepgram/aura-2",
    company: "Deepgram",
    name: "Aura-2",
    iconColor: "#13B08A",
    voices: AURA_2_VOICES,
    defaultVoice: "aura-2-thalia-en",
  },
];

export const AUDIO_MODELS: ReadonlyArray<MediaModel> = [
  {
    id: DEFAULT_AUDIO_MODEL_ID,
    company: "Google",
    name: "Lyria 3 Clip",
    iconColor: "#4285F4",
  },
  {
    id: "google/lyria-3-pro-preview",
    company: "Google",
    name: "Lyria 3 Pro",
    iconColor: "#4285F4",
  },
  {
    id: "openai/gpt-audio",
    company: "OpenAI",
    name: "GPT Audio",
    iconColor: "#10A37F",
  },
  {
    id: "openai/gpt-audio-mini",
    company: "OpenAI",
    name: "GPT Audio Mini",
    iconColor: "#10A37F",
  },
];

const resolver = <T extends MediaModel>(
  models: ReadonlyArray<T>,
  label: string,
) => {
  const modelsById = new Map(models.map((model) => [model.id, model]));
  const defaultModel = models[0];
  if (defaultModel === undefined) {
    throw new Error(`${label} must not be empty`);
  }
  return (id: string | undefined): T =>
    (id === undefined ? undefined : modelsById.get(id)) ?? defaultModel;
};

const videoById = new Map(VIDEO_MODELS.map((model) => [model.id, model]));
const defaultVideoModel = VIDEO_MODELS[0];

if (defaultVideoModel === undefined) {
  throw new Error("VIDEO_MODELS must not be empty");
}

export const resolveVideoModel = (id: string | undefined): VideoModel => {
  if (id === undefined || id.length === 0) {
    return defaultVideoModel;
  }
  return videoById.get(id) ?? unknownModelIdentity(id);
};

export const videoModelFromPicker = (identity: ModelIdentity): VideoModel => {
  const curated = videoById.get(identity.id);
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

const speechById = new Map(SPEECH_MODELS.map((model) => [model.id, model]));

export const resolveSpeechModel = resolver(SPEECH_MODELS, "SPEECH_MODELS");

const audioById = new Map(AUDIO_MODELS.map((model) => [model.id, model]));
const defaultAudioModel = AUDIO_MODELS[0];

if (defaultAudioModel === undefined) {
  throw new Error("AUDIO_MODELS must not be empty");
}

export const resolveAudioModel = (id: string | undefined): MediaModel => {
  if (id === undefined || id.length === 0) {
    return defaultAudioModel;
  }
  return audioById.get(id) ?? unknownModelIdentity(id);
};

export const speechModelFromPicker = (identity: ModelIdentity): SpeechModel => {
  const curated = speechById.get(identity.id);
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

export const videoModelHasOptions = (model: VideoModel): boolean =>
  (model.aspectRatios?.length ?? 0) > 0 ||
  (model.resolutions?.length ?? 0) > 0 ||
  (model.durations?.length ?? 0) > 1 ||
  model.generateAudio === true;

export const speechModelHasOptions = (model: SpeechModel): boolean =>
  (model.voices?.length ?? 0) > 1;

const pickSupported = <T extends string | number>(
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

export const resolveVideoOptions = (
  model: VideoModel,
  current: VideoModelOptions,
): VideoModelOptions => {
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
  const duration = pickSupported(
    model.durations,
    current.duration,
    model.defaultDuration,
  );
  const generateAudio =
    model.generateAudio === true
      ? (current.generateAudio ?? model.defaultGenerateAudio ?? true)
      : undefined;
  return {
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
    ...(resolution === undefined ? {} : { resolution }),
    ...(duration === undefined ? {} : { duration }),
    ...(generateAudio === undefined ? {} : { generateAudio }),
  };
};

export const resolveSpeechOptions = (
  model: SpeechModel,
  current: SpeechModelOptions,
): SpeechModelOptions => {
  const voice = pickSupported(model.voices, current.voice, model.defaultVoice);
  return {
    ...(voice === undefined ? {} : { voice }),
  };
};

const catalogs: Record<
  MediaModelKind,
  {
    readonly models: ReadonlyArray<MediaModel>;
    readonly resolve: (id: string | undefined) => MediaModel;
  }
> = {
  video: { models: VIDEO_MODELS, resolve: resolveVideoModel },
  speech: { models: SPEECH_MODELS, resolve: resolveSpeechModel },
  audio: { models: AUDIO_MODELS, resolve: resolveAudioModel },
};

export const mediaModelsFor = (
  kind: MediaModelKind,
): ReadonlyArray<MediaModel> => catalogs[kind].models;

export const resolveMediaModel = (
  kind: MediaModelKind,
  id: string | undefined,
): MediaModel => catalogs[kind].resolve(id);
