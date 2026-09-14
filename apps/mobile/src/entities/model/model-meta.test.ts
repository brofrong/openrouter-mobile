import { expect, test } from "bun:test";
import {
  formatContextLength,
  formatPromptPrice,
  modelRowMeta,
} from "./model-meta";

test("formatContextLength uses K and M suffixes", () => {
  expect(formatContextLength(8192)).toBe("8.2K");
  expect(formatContextLength(128000)).toBe("128K");
  expect(formatContextLength(200000)).toBe("200K");
  expect(formatContextLength(1_000_000)).toBe("1M");
  expect(formatContextLength(1_050_000)).toBe("1.05M");
});

test("formatPromptPrice shows Free or dollars per million tokens", () => {
  expect(formatPromptPrice(0)).toBe("Free");
  expect(formatPromptPrice(0.15)).toBe("$0.15/M");
  expect(formatPromptPrice(3)).toBe("$3/M");
  expect(formatPromptPrice(3.5)).toBe("$3.5/M");
});

test("modelRowMeta omits missing catalog fields", () => {
  expect(modelRowMeta({})).toEqual({});
  expect(
    modelRowMeta({ contextLength: 200000, promptUsdPerMillion: 0 }),
  ).toEqual({
    context: "200K",
    price: "Free",
  });
});
