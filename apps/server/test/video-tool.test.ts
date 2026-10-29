import { expect, test } from "bun:test";

import { VideoToolOptions } from "@openrouter-mobile/domain";

import {
  GENERATE_VIDEO_TOOL,
  GENERATE_VIDEO_TOOL_NAME,
  mergeVideoToolArgs,
  parseVideoToolArgs,
  parseVideoToolArgumentsJson,
  videoToolArgsFromOptions,
} from "../src/shared/video-tool";

test("generate_video tool exposes OpenRouter video parameters", () => {
  expect(GENERATE_VIDEO_TOOL.function.name).toBe(GENERATE_VIDEO_TOOL_NAME);
  const keys = Object.keys(
    GENERATE_VIDEO_TOOL.function.parameters.properties,
  ).sort();
  expect(keys).toEqual(
    [
      "aspect_ratio",
      "duration",
      "frame_images",
      "generate_audio",
      "input_references",
      "prompt",
      "resolution",
      "seed",
      "size",
    ].sort(),
  );
  expect(GENERATE_VIDEO_TOOL.function.parameters.required).toEqual(["prompt"]);
});

test("parseVideoToolArgs reads snake_case OpenRouter fields", () => {
  expect(
    parseVideoToolArgs({
      prompt: "a wave",
      model: "google/veo-3.1",
      duration: 8,
      resolution: "1080p",
      aspect_ratio: "9:16",
      generate_audio: false,
      size: "1280x720",
      seed: 7,
      input_references: ["https://example.com/a.png"],
      frame_images: [
        {
          url: "https://example.com/first.png",
          frame_type: "first_frame",
        },
      ],
    }),
  ).toEqual({
    prompt: "a wave",
    model: "google/veo-3.1",
    duration: 8,
    resolution: "1080p",
    aspectRatio: "9:16",
    generateAudio: false,
    size: "1280x720",
    seed: 7,
    inputReferences: ["https://example.com/a.png"],
    frameImages: [
      { url: "https://example.com/first.png", frameType: "first_frame" },
    ],
  });
});

test("parseVideoToolArgumentsJson ignores invalid JSON", () => {
  expect(parseVideoToolArgumentsJson("{")).toBeUndefined();
  expect(parseVideoToolArgumentsJson("{}")).toBeUndefined();
  expect(parseVideoToolArgumentsJson('{"prompt":"cats","duration":4}')).toEqual(
    {
      prompt: "cats",
      duration: 4,
    },
  );
});

test("mergeVideoToolArgs lets user options override the tool call and fills defaults", () => {
  const parsed = parseVideoToolArgs({
    prompt: "from the model",
    duration: 4,
    resolution: "480p",
  });
  expect(
    mergeVideoToolArgs(
      parsed,
      videoToolArgsFromOptions(
        new VideoToolOptions({
          duration: 8,
          resolution: "720p",
          aspectRatio: "16:9",
          generateAudio: true,
        }),
      ),
      { model: "bytedance/seedance-2.0-mini", prompt: "fallback" },
    ),
  ).toEqual({
    prompt: "from the model",
    model: "bytedance/seedance-2.0-mini",
    duration: 8,
    resolution: "720p",
    aspectRatio: "16:9",
    generateAudio: true,
  });
});

test("mergeVideoToolArgs prefers the settings video model over a tool-call model", () => {
  expect(
    mergeVideoToolArgs(
      parseVideoToolArgs({
        prompt: "a wave",
        model: "google/veo-3.1",
      }),
      videoToolArgsFromOptions(
        new VideoToolOptions({ model: "ignored/model" }),
      ),
      { model: "bytedance/seedance-2.0-mini" },
    ),
  ).toEqual({
    prompt: "a wave",
    model: "bytedance/seedance-2.0-mini",
  });
});
