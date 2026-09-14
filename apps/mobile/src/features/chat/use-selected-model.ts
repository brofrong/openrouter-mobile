import type { ReasoningEffort } from "@openrouter-mobile/domain";
import { useEffect, useState } from "react";
import {
  type ChatModel,
  DEFAULT_CHAT_MODEL_ID,
  resolveChatModel,
  resolveEffort,
  selectionFromChat,
} from "../../entities/model/catalog";

export const useSelectedModel = (
  defaultModelId = DEFAULT_CHAT_MODEL_ID,
  chatId?: string,
) => {
  const [model, setModel] = useState(() => resolveChatModel(defaultModelId));
  const [effort, setEffortState] = useState<ReasoningEffort | undefined>();

  useEffect(() => {
    if (chatId !== undefined) {
      return;
    }
    const next = resolveChatModel(defaultModelId);
    setModel(next);
    setEffortState(resolveEffort(next, undefined));
  }, [chatId, defaultModelId]);

  const selectModel = (next: ChatModel) => {
    setModel(next);
    setEffortState(resolveEffort(next, effort));
  };

  const setEffort = (value?: ReasoningEffort) => {
    setEffortState(value);
  };

  const restoreFromChat = (chat?: {
    readonly model?: string;
    readonly effort?: ReasoningEffort;
  }) => {
    const next = selectionFromChat(chat);
    setModel(next.model);
    setEffortState(next.effort);
  };

  return {
    model,
    effort: resolveEffort(model, effort),
    selectModel,
    setEffort,
    restoreFromChat,
  };
};

export type SelectedModelState = ReturnType<typeof useSelectedModel>;
