import { expect, test } from "bun:test";
import {
  ChatDoneEvent,
  ChatErrorEvent,
  type ChatId,
  ChatJobEvent,
  ChatMessagePage,
  ChatTitleEvent,
  ChatTokenEvent,
  ChatUserEvent,
  type GenerationJobId,
  Message,
  type MessageId,
} from "@openrouter-mobile/domain";
import { DateTime } from "effect";
import {
  applyChatStreamEvent,
  commitDraft,
  emptyThread,
  hydrateFromPage,
  isServerMessageId,
  mergeOlderMessages,
  oldestServerMessageId,
} from "./thread";

const chatId = "chat-1" as ChatId;
const createdAt = DateTime.fromDateUnsafe(new Date("2026-01-01T00:00:00.000Z"));

const userMessage = new Message({
  id: "user-1" as MessageId,
  chatId,
  role: "user",
  content: "Hi",
  createdAt,
});

const assistantMessage = new Message({
  id: "asst-1" as MessageId,
  chatId,
  role: "assistant",
  content: "Hello",
  createdAt,
});

const userEvent = new ChatUserEvent({
  _tag: "user",
  seq: 1,
  message: userMessage,
});

const tokenEvent = (text: string, seq = 2) =>
  new ChatTokenEvent({ _tag: "token", seq, text });

const doneEvent = new ChatDoneEvent({
  _tag: "done",
  seq: 3,
  message: assistantMessage,
});

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

test("applyChatStreamEvent merges user/done by id and ignores token after done", () => {
  let state = emptyThread();
  state = applyChatStreamEvent(state, userEvent);
  state = applyChatStreamEvent(state, userEvent); // no dup
  state = applyChatStreamEvent(state, tokenEvent("Hel"));
  state = applyChatStreamEvent(state, doneEvent);
  state = applyChatStreamEvent(state, tokenEvent("nope"));
  expect(state.messages.filter((m) => m.role === "user")).toHaveLength(1);
  expect(state.draft).toBe("");
  expect(state.generating).toBe(false);
});

test("hydrateFromPage maps messages and seeds draft from inProgress", () => {
  const withDraft = hydrateFromPage(
    new ChatMessagePage({
      messages: [userMessage, assistantMessage],
      hasMore: false,
      headSeq: 9,
      generating: true,
      inProgress: "Hel",
      jobs: [],
    }),
  );
  expect(withDraft.messages).toEqual([
    { id: "user-1", role: "user", content: "Hi" },
    { id: "asst-1", role: "assistant", content: "Hello" },
  ]);
  expect(withDraft.draft).toBe("Hel");
  expect(withDraft.generating).toBe(true);

  const idle = hydrateFromPage(
    new ChatMessagePage({
      messages: [userMessage],
      hasMore: false,
      headSeq: 1,
      generating: false,
      jobs: [],
    }),
  );
  expect(idle.draft).toBe("");
  expect(idle.generating).toBe(false);
});

test("applyChatStreamEvent records error and ignores title and job", () => {
  let state = applyChatStreamEvent(emptyThread(), userEvent);
  state = applyChatStreamEvent(
    state,
    new ChatErrorEvent({
      _tag: "error",
      seq: 2,
      error: "OPENROUTER: no key",
      code: "OPENROUTER",
    }),
  );
  expect(state.error).toBe("OPENROUTER: no key");
  expect(state.generating).toBe(false);

  const afterTitle = applyChatStreamEvent(
    state,
    new ChatTitleEvent({ _tag: "title", seq: 3, title: "Hello" }),
  );
  const afterJob = applyChatStreamEvent(
    afterTitle,
    new ChatJobEvent({
      _tag: "job",
      seq: 4,
      jobId: "job-1" as GenerationJobId,
      status: "queued",
    }),
  );
  expect(afterJob).toEqual(state);
});
