import { expect, test } from "bun:test";
import { AiConfig } from "@openrouter-mobile/domain";
import { DEFAULT_CHAT_MODEL_ID } from "../model/catalog";
import { DEFAULT_IMAGE_MODEL_ID } from "../model/image-catalog";
import {
  fallbackModelId,
  modelIdForKind,
  resolveCategoryModel,
} from "./defaults";

test("modelIdForKind falls back to catalog defaults", () => {
  expect(modelIdForKind("text")).toBe(DEFAULT_CHAT_MODEL_ID);
  expect(modelIdForKind("image")).toBe(DEFAULT_IMAGE_MODEL_ID);
  expect(modelIdForKind("video")).toBe(fallbackModelId("video"));
});

test("modelIdForKind prefers a stored default", () => {
  const config = new AiConfig({
    text: "anthropic/claude-sonnet-4.6",
    image: "",
  });
  expect(modelIdForKind("text", config)).toBe("anthropic/claude-sonnet-4.6");
  expect(modelIdForKind("image", config)).toBe(DEFAULT_IMAGE_MODEL_ID);
});

test("resolveCategoryModel keeps a stored catalog id", () => {
  const model = resolveCategoryModel("text", "openai/gpt-5.6-luna");
  expect(model.id).toBe("openai/gpt-5.6-luna");
  expect(model.company).toBe("OpenAI");
});
