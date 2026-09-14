import { useEffect, useState } from "react";
import type { ModelIdentity } from "./identity";
import {
  type MediaModel,
  type MediaModelKind,
  resolveMediaModel,
  resolveSpeechOptions,
  resolveVideoOptions,
  type SpeechModelOptions,
  speechModelFromPicker,
  type VideoModelOptions,
  videoModelFromPicker,
} from "./media-catalog";

export type MediaModelOptions = VideoModelOptions & SpeechModelOptions;

export const useSelectedMediaModel = (
  kind: MediaModelKind,
  defaultModelId?: string,
  chatId?: string,
) => {
  const [model, setModel] = useState(() =>
    resolveMediaModel(kind, defaultModelId),
  );
  const [options, setOptions] = useState<MediaModelOptions>({});

  useEffect(() => {
    if (chatId !== undefined) {
      return;
    }
    const next = resolveMediaModel(kind, defaultModelId);
    setModel(next);
    if (kind === "video") {
      setOptions(resolveVideoOptions(videoModelFromPicker(next), {}));
    } else if (kind === "speech") {
      setOptions(resolveSpeechOptions(speechModelFromPicker(next), {}));
    }
  }, [chatId, defaultModelId, kind]);
  const videoModel = kind === "video" ? videoModelFromPicker(model) : undefined;
  const speechModel =
    kind === "speech" ? speechModelFromPicker(model) : undefined;
  const videoResolved =
    videoModel === undefined ? {} : resolveVideoOptions(videoModel, options);
  const speechResolved =
    speechModel === undefined ? {} : resolveSpeechOptions(speechModel, options);
  const resolved: MediaModelOptions = {
    ...videoResolved,
    ...speechResolved,
  };

  const selectModel = (next: MediaModel | ModelIdentity | string) => {
    const selected =
      typeof next === "string"
        ? resolveMediaModel(kind, next)
        : kind === "video"
          ? videoModelFromPicker(next)
          : kind === "speech"
            ? speechModelFromPicker(next)
            : next;
    setModel(selected);
    if (kind === "video") {
      setOptions(resolveVideoOptions(videoModelFromPicker(selected), options));
    } else if (kind === "speech") {
      setOptions(
        resolveSpeechOptions(speechModelFromPicker(selected), options),
      );
    }
  };

  const restoreFromChat = (chat?: { readonly model?: string }) => {
    selectModel(resolveMediaModel(kind, chat?.model));
  };

  const patchOptions = (patch: VideoModelOptions | SpeechModelOptions) => {
    if (videoModel !== undefined) {
      setOptions(
        resolveVideoOptions(videoModel, { ...videoResolved, ...patch }),
      );
      return;
    }
    if (speechModel !== undefined) {
      setOptions(
        resolveSpeechOptions(speechModel, { ...speechResolved, ...patch }),
      );
    }
  };

  return {
    model,
    voice: speechResolved.voice,
    options: resolved,
    selectModel,
    restoreFromChat,
    patchOptions,
  };
};

export type SelectedMediaModelState = ReturnType<typeof useSelectedMediaModel>;
