import { expect, test } from "bun:test";
import {
  nextThinkingIndex,
  THINKING_PHRASES,
  THINKING_ROTATE_MS,
} from "./thinking-phrases";

test("thinking phrases has 50 unique lines", () => {
  expect(THINKING_PHRASES).toHaveLength(50);
  expect(new Set(THINKING_PHRASES).size).toBe(50);
});

test("phrases rotate every five seconds", () => {
  expect(THINKING_ROTATE_MS).toBe(5000);
});

test("nextThinkingIndex always leaves the current phrase", () => {
  expect(nextThinkingIndex(7, () => 0)).toBe(8);
  expect(nextThinkingIndex(49, () => 0)).toBe(0);
  expect(nextThinkingIndex(0, () => 0.999)).toBe(49);
  expect(nextThinkingIndex(12, () => 0.999)).not.toBe(12);
});
