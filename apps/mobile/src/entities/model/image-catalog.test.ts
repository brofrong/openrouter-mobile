import { expect, test } from "bun:test";
import {
  DEFAULT_IMAGE_MODEL_ID,
  imageModelFromPicker,
  imageModelHasOptions,
  resolveImageModel,
  resolveImageOptions,
} from "./image-catalog";

test("resolveImageModel returns the catalog entry for a known id", () => {
  const model = resolveImageModel("google/gemini-3.1-flash-image");
  expect(model.id).toBe("google/gemini-3.1-flash-image");
  expect(model.company).toBe("Google");
  expect(model.name).toBe("Nano Banana 2");
});

test("resolveImageModel keeps a stored id that is not in the local catalog", () => {
  const model = resolveImageModel("unknown-lab/painter-1");
  expect(model.id).toBe("unknown-lab/painter-1");
  expect(model.company).toBe("unknown-lab");
  expect(model.name).toBe("painter-1");
  expect(resolveImageModel(undefined).id).toBe(DEFAULT_IMAGE_MODEL_ID);
  expect(resolveImageModel("").id).toBe(DEFAULT_IMAGE_MODEL_ID);
});

test("imageModelFromPicker keeps OpenRouter identity and curated options", () => {
  const unknown = imageModelFromPicker({
    id: "unknown-lab/painter-1",
    company: "Unknown Lab",
    name: "Painter 1",
    iconColor: "#123456",
  });
  expect(unknown).toEqual({
    id: "unknown-lab/painter-1",
    company: "Unknown Lab",
    name: "Painter 1",
    iconColor: "#123456",
  });
  expect(imageModelHasOptions(unknown)).toBe(false);

  const gemini = imageModelFromPicker({
    id: "google/gemini-3.1-flash-image",
    company: "Google",
    name: "Nano Banana 2",
    iconColor: "#4285F4",
  });
  expect(gemini.resolutions).toEqual(["512", "1K", "2K", "4K"]);
});

test("imageModelHasOptions is true when the model lists aspect, resolution, or quality", () => {
  expect(
    imageModelHasOptions(resolveImageModel("google/gemini-3.1-flash-image")),
  ).toBe(true);
  expect(imageModelHasOptions(resolveImageModel("openai/gpt-image-2"))).toBe(
    true,
  );
  expect(
    imageModelHasOptions(resolveImageModel("black-forest-labs/flux.2-pro")),
  ).toBe(true);
});

test("resolveImageOptions keeps supported values and replaces ones the next model cannot use", () => {
  const gemini = resolveImageModel("google/gemini-3.1-flash-image");
  const gpt = resolveImageModel("openai/gpt-image-2");
  const flux = resolveImageModel("black-forest-labs/flux.2-pro");

  expect(
    resolveImageOptions(gemini, {
      aspectRatio: "16:9",
      resolution: "2K",
      quality: "high",
    }),
  ).toEqual({
    aspectRatio: "16:9",
    resolution: "2K",
  });

  expect(
    resolveImageOptions(gpt, {
      aspectRatio: "16:9",
      resolution: "2K",
      quality: "high",
    }),
  ).toEqual({
    aspectRatio: "16:9",
    quality: "high",
    background: "auto",
    n: 1,
  });

  expect(resolveImageOptions(flux, {})).toEqual({
    aspectRatio: "1:1",
  });
});

test("resolveImageOptions clamps n and drops unsupported backgrounds", () => {
  const gpt = resolveImageModel("openai/gpt-image-2");
  expect(resolveImageOptions(gpt, { n: 4 }).n).toBe(4);
  expect(resolveImageOptions(gpt, { n: 99 }).n).toBe(1);
  expect(
    resolveImageOptions(gpt, { background: "transparent" }).background,
  ).toBe("auto");
});
