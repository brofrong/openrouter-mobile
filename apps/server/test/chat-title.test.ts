import { expect, test } from "bun:test";
import { CHAT_TITLE_MAX_LENGTH } from "@openrouter-mobile/domain";
import {
  sanitizeChatTitle,
  titleSummaryMessages,
} from "../src/shared/chatTitle";

test("sanitizeChatTitle trims quotes, newlines, and length", () => {
  expect(sanitizeChatTitle("  Hello world  ")).toBe("Hello world");
  expect(sanitizeChatTitle('"Quoted title"')).toBe("Quoted title");
  expect(sanitizeChatTitle("«Кавычки»")).toBe("Кавычки");
  expect(sanitizeChatTitle("line\nbreak")).toBe("line break");
  expect(sanitizeChatTitle("   ")).toBeUndefined();
  expect(sanitizeChatTitle("")).toBeUndefined();
  const long = "a".repeat(CHAT_TITLE_MAX_LENGTH + 10);
  expect(sanitizeChatTitle(long)).toBe("a".repeat(CHAT_TITLE_MAX_LENGTH));
});

test("titleSummaryMessages puts the first user message into a summary prompt", () => {
  const messages = titleSummaryMessages("How do I fry eggs?");
  expect(messages[0]?.role).toBe("system");
  expect(messages[0]?.content).toContain("50 characters");
  expect(messages[1]).toEqual({
    role: "user",
    content: "How do I fry eggs?",
  });
});
