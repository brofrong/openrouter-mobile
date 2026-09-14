import { expect, test } from "bun:test";
import {
  chatModelFromPicker,
  DEFAULT_CHAT_MODEL_ID,
  modelHasEffort,
  resolveChatModel,
  resolveEffort,
  selectionFromChat,
} from "./catalog";

test("resolveChatModel returns the catalog entry for a known id", () => {
  const model = resolveChatModel("openai/gpt-5.6-luna");
  expect(model.id).toBe("openai/gpt-5.6-luna");
  expect(model.company).toBe("OpenAI");
  expect(model.name).toBe("GPT-5.6 Luna");
});

test("resolveChatModel keeps a stored id that is not in the local catalog", () => {
  const model = resolveChatModel("unknown-lab/reasoner-1");
  expect(model.id).toBe("unknown-lab/reasoner-1");
  expect(model.company).toBe("unknown-lab");
  expect(model.name).toBe("reasoner-1");
  expect(resolveChatModel(undefined).id).toBe(DEFAULT_CHAT_MODEL_ID);
  expect(resolveChatModel("").id).toBe(DEFAULT_CHAT_MODEL_ID);
});

test("modelHasEffort is only true when the model lists effort values", () => {
  expect(modelHasEffort(resolveChatModel("openai/gpt-4o-mini"))).toBe(false);
  expect(modelHasEffort(resolveChatModel("deepseek/deepseek-chat"))).toBe(
    false,
  );
  expect(modelHasEffort(resolveChatModel("openai/gpt-5.6-luna"))).toBe(true);
});

test("chatModelFromPicker keeps identity and optional effort fields", () => {
  expect(
    chatModelFromPicker({
      id: "unknown-lab/reasoner-1",
      company: "Unknown-lab",
      name: "Reasoner 1",
      iconColor: "#6B7280",
      efforts: ["none", "low", "medium", "high"],
      defaultEffort: "medium",
    }),
  ).toEqual({
    id: "unknown-lab/reasoner-1",
    company: "Unknown-lab",
    name: "Reasoner 1",
    iconColor: "#6B7280",
    efforts: ["none", "low", "medium", "high"],
    defaultEffort: "medium",
  });
});

test("selectionFromChat restores a stored model and effort", () => {
  const selected = selectionFromChat({
    model: "openai/gpt-5.6-luna",
    effort: "high",
  });
  expect(selected.model.id).toBe("openai/gpt-5.6-luna");
  expect(selected.effort).toBe("high");
  expect(selectionFromChat(undefined).model.id).toBe(DEFAULT_CHAT_MODEL_ID);
  expect(
    selectionFromChat({ model: "openai/gpt-4o-mini", effort: "high" }).effort,
  ).toBeUndefined();
});

test("resolveEffort keeps a supported value and otherwise uses the model default", () => {
  const luna = resolveChatModel("openai/gpt-5.6-luna");
  expect(resolveEffort(luna, "high")).toBe("high");
  expect(resolveEffort(luna, undefined)).toBe("medium");
  expect(resolveEffort(luna, "minimal")).toBe("medium");
  expect(resolveEffort(resolveChatModel("openai/gpt-4o-mini"), "high")).toBe(
    undefined,
  );
  expect(resolveEffort(resolveChatModel("x-ai/grok-4.6"), undefined)).toBe(
    "high",
  );
});
