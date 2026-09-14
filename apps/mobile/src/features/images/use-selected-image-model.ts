import { useEffect, useState } from "react";
import type { ModelIdentity } from "../../entities/model/identity";
import {
  DEFAULT_IMAGE_MODEL_ID,
  type ImageModel,
  type ImageModelOptions,
  imageModelFromPicker,
  resolveImageModel,
  resolveImageOptions,
} from "../../entities/model/image-catalog";

export const useSelectedImageModel = (
  defaultModelId = DEFAULT_IMAGE_MODEL_ID,
  chatId?: string,
) => {
  const [model, setModel] = useState(() => resolveImageModel(defaultModelId));
  const [options, setOptions] = useState<ImageModelOptions>({});
  const resolved = resolveImageOptions(model, options);

  useEffect(() => {
    if (chatId !== undefined) {
      return;
    }
    const next = resolveImageModel(defaultModelId);
    setModel(next);
    setOptions(resolveImageOptions(next, {}));
  }, [chatId, defaultModelId]);

  const selectModel = (next: ImageModel | ModelIdentity | string) => {
    const selected =
      typeof next === "string"
        ? resolveImageModel(next)
        : imageModelFromPicker(next);
    setModel(selected);
    setOptions(resolveImageOptions(selected, options));
  };

  const restoreFromChat = (chat?: { readonly model?: string }) => {
    selectModel(resolveImageModel(chat?.model));
  };

  const patchOptions = (patch: ImageModelOptions) => {
    setOptions(resolveImageOptions(model, { ...resolved, ...patch }));
  };

  return {
    model,
    options: resolved,
    selectModel,
    restoreFromChat,
    patchOptions,
  };
};

export type SelectedImageModelState = ReturnType<typeof useSelectedImageModel>;
