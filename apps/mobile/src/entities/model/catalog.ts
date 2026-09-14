import type { ReasoningEffort } from "@openrouter-mobile/domain";
import { type ModelIdentity, unknownModelIdentity } from "./identity";

export type ChatModel = ModelIdentity & {
  readonly efforts?: ReadonlyArray<ReasoningEffort>;
  readonly defaultEffort?: ReasoningEffort;
};

export const DEFAULT_CHAT_MODEL_ID = "openai/gpt-4o-mini";

export const CHAT_MODELS: ReadonlyArray<ChatModel> = [
  {
    id: DEFAULT_CHAT_MODEL_ID,
    company: "OpenAI",
    name: "GPT-4o mini",
    iconColor: "#10A37F",
  },
  {
    id: "openai/gpt-5.6-luna",
    company: "OpenAI",
    name: "GPT-5.6 Luna",
    iconColor: "#10A37F",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
  },
  {
    id: "openai/gpt-5.4-mini",
    company: "OpenAI",
    name: "GPT-5.4 Mini",
    iconColor: "#10A37F",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    company: "Anthropic",
    name: "Claude Sonnet 4.6",
    iconColor: "#D97757",
    efforts: ["low", "medium", "high", "max"],
    defaultEffort: "medium",
  },
  {
    id: "anthropic/claude-opus-4.8",
    company: "Anthropic",
    name: "Claude Opus 4.8",
    iconColor: "#D97757",
    efforts: ["low", "medium", "high", "max"],
    defaultEffort: "medium",
  },
  {
    id: "google/gemini-2.5-flash",
    company: "Google",
    name: "Gemini 2.5 Flash",
    iconColor: "#4285F4",
    efforts: ["low", "medium", "high"],
    defaultEffort: "medium",
  },
  {
    id: "google/gemini-2.5-pro",
    company: "Google",
    name: "Gemini 2.5 Pro",
    iconColor: "#4285F4",
    efforts: ["low", "medium", "high"],
    defaultEffort: "medium",
  },
  {
    id: "x-ai/grok-4.6",
    company: "xAI",
    name: "Grok 4.6",
    iconColor: "#111111",
    efforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
  },
  {
    id: "deepseek/deepseek-chat",
    company: "DeepSeek",
    name: "DeepSeek V3",
    iconColor: "#4D6BFE",
  },
];

const modelsById = new Map(CHAT_MODELS.map((model) => [model.id, model]));

const defaultModel = CHAT_MODELS[0];

if (defaultModel === undefined) {
  throw new Error("CHAT_MODELS must not be empty");
}

export const resolveChatModel = (id: string | undefined): ChatModel => {
  if (id === undefined || id.length === 0) {
    return defaultModel;
  }
  return modelsById.get(id) ?? unknownModelIdentity(id);
};

export const modelHasEffort = (model: ChatModel): boolean =>
  model.efforts !== undefined && model.efforts.length > 0;

export const chatModelFromPicker = (
  model: ModelIdentity & {
    readonly efforts?: ReadonlyArray<ReasoningEffort>;
    readonly defaultEffort?: ReasoningEffort;
  },
): ChatModel => ({
  id: model.id,
  company: model.company,
  name: model.name,
  iconColor: model.iconColor,
  ...(model.efforts === undefined ? {} : { efforts: model.efforts }),
  ...(model.defaultEffort === undefined
    ? {}
    : { defaultEffort: model.defaultEffort }),
});

export const selectionFromChat = (chat?: {
  readonly model?: string;
  readonly effort?: ReasoningEffort;
}): { readonly model: ChatModel; readonly effort?: ReasoningEffort } => {
  const model = resolveChatModel(chat?.model);
  const effort = resolveEffort(model, chat?.effort);
  return effort === undefined ? { model } : { model, effort };
};

export const resolveEffort = (
  model: ChatModel,
  current?: ReasoningEffort,
): ReasoningEffort | undefined => {
  if (!modelHasEffort(model) || model.efforts === undefined) {
    return undefined;
  }
  if (current !== undefined && model.efforts.includes(current)) {
    return current;
  }
  if (
    model.defaultEffort !== undefined &&
    model.efforts.includes(model.defaultEffort)
  ) {
    return model.defaultEffort;
  }
  return model.efforts[0];
};
