import { expect, test } from "bun:test";
import {
  commitDraft,
  isServerMessageId,
  mergeOlderMessages,
  oldestServerMessageId,
} from "./thread";

test("mergeOlderMessages prepends unseen items and keeps current order", () => {
  const current = [
    { id: "b", role: "user" as const, content: "b" },
    { id: "c", role: "assistant" as const, content: "c" },
  ];
  const older = [
    { id: "a", role: "user" as const, content: "a" },
    { id: "b", role: "user" as const, content: "b-dup" },
  ];
  expect(mergeOlderMessages(current, older)).toEqual([
    { id: "a", role: "user", content: "a" },
    { id: "b", role: "user", content: "b" },
    { id: "c", role: "assistant", content: "c" },
  ]);
});

test("oldestServerMessageId skips local and draft ids", () => {
  expect(
    oldestServerMessageId([
      { id: "local-assistant-0-1", role: "assistant", content: "x" },
      { id: "draft", role: "assistant", content: "y" },
      { id: "real-1", role: "user", content: "z" },
    ]),
  ).toBe("real-1");
  expect(isServerMessageId("draft")).toBe(false);
});

test("commitDraft appends a local assistant only when draft has text", () => {
  const current = [{ id: "u1", role: "user" as const, content: "hi" }];
  expect(commitDraft(current, "")).toEqual(current);
  expect(commitDraft(current, "ok")[1]?.role).toBe("assistant");
});
