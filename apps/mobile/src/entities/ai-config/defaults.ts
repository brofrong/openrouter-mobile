import type { AiConfig, ChatKind } from "@openrouter-mobile/domain";
import { aiConfigModel } from "@openrouter-mobile/domain";
import { DEFAULT_CHAT_MODEL_ID, resolveChatModel } from "../model/catalog";
import type { ModelIdentity } from "../model/identity";
import {
  DEFAULT_IMAGE_MODEL_ID,
  resolveImageModel,
} from "../model/image-catalog";
import {
  DEFAULT_AUDIO_MODEL_ID,
  DEFAULT_SPEECH_MODEL_ID,
  DEFAULT_VIDEO_MODEL_ID,
  resolveAudioModel,
  resolveSpeechModel,
  resolveVideoModel,
} from "../model/media-catalog";

export const AI_CONFIG_CATEGORIES = [
  { kind: "text", label: "Chat" },
  { kind: "image", label: "Images" },
  { kind: "video", label: "Video" },
  { kind: "speech", label: "Speech" },
  { kind: "audio", label: "Audio" },
] as const satisfies ReadonlyArray<{
  readonly kind: ChatKind;
  readonly label: string;
}>;

export const fallbackModelId = (kind: ChatKind): string => {
  switch (kind) {
    case "text":
      return DEFAULT_CHAT_MODEL_ID;
    case "image":
      return DEFAULT_IMAGE_MODEL_ID;
    case "video":
      return DEFAULT_VIDEO_MODEL_ID;
    case "speech":
      return DEFAULT_SPEECH_MODEL_ID;
    case "audio":
      return DEFAULT_AUDIO_MODEL_ID;
  }
};

export const modelIdForKind = (kind: ChatKind, config?: AiConfig): string =>
  aiConfigModel(config, kind) ?? fallbackModelId(kind);

export const resolveCategoryModel = (
  kind: ChatKind,
  id: string | undefined,
): ModelIdentity => {
  switch (kind) {
    case "text":
      return resolveChatModel(id);
    case "image":
      return resolveImageModel(id);
    case "video":
      return resolveVideoModel(id);
    case "speech":
      return resolveSpeechModel(id);
    case "audio":
      return resolveAudioModel(id);
  }
};
