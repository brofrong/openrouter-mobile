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
  decodeStoredContent,
  encodeStoredContent,
  type GenerationJobId,
  Message,
  type MessageId,
  StoredChatFile,
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
  toThreadItem,
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

test("hydrateFromPage keeps encoded file chips in message content", () => {
  const content = encodeStoredContent(
    "report ready",
    [],
    [
      new StoredChatFile({
        url: "http://localhost/media/u/a.xlsx",
        name: "a.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 12,
      }),
    ],
  );
  const state = hydrateFromPage(
    new ChatMessagePage({
      messages: [
        new Message({
          id: "asst-file-1" as MessageId,
          chatId,
          role: "assistant",
          content,
          createdAt,
        }),
      ],
      hasMore: false,
      headSeq: 1,
      generating: false,
      jobs: [],
    }),
  );
  expect(state.messages[0]?.content).toBe(content);
  expect(decodeStoredContent(state.messages[0]?.content ?? "").files).toEqual([
    {
      url: "http://localhost/media/u/a.xlsx",
      name: "a.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 12,
    },
  ]);
});

test("applyChatStreamEvent records error and ignores title", () => {
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
  expect(afterTitle).toEqual(state);
});

test("applyChatStreamEvent appends video job events", () => {
  let state = applyChatStreamEvent(emptyThread(), userEvent);
  state = applyChatStreamEvent(
    state,
    new ChatJobEvent({
      _tag: "job",
      seq: 2,
      jobId: "job-1" as GenerationJobId,
      status: "queued",
    }),
  );
  expect(state.messages.at(-1)).toMatchObject({
    jobId: "job-1",
    status: "queued",
    role: "assistant",
  });
  state = applyChatStreamEvent(
    state,
    new ChatJobEvent({
      _tag: "job",
      seq: 3,
      jobId: "job-1" as GenerationJobId,
      status: "completed",
      url: "https://example.com/clip.mp4",
    }),
  );
  expect(state.messages.at(-1)).toMatchObject({
    jobId: "job-1",
    status: "completed",
    url: "https://example.com/clip.mp4",
  });
});

test("applyChatStreamEvent ignores empty done messages", () => {
  let state = applyChatStreamEvent(emptyThread(), userEvent);
  state = applyChatStreamEvent(
    state,
    new ChatDoneEvent({
      _tag: "done",
      seq: 2,
      message: new Message({
        id: "empty-1" as MessageId,
        chatId,
        role: "assistant",
        content: "",
        createdAt,
      }),
    }),
  );
  expect(state.generating).toBe(false);
  expect(state.messages).toEqual([toThreadItem(userMessage)]);
});

test("applyChatStreamEvent clears draft on error and error on the next user turn", () => {
  const nextUser = new ChatUserEvent({
    _tag: "user",
    seq: 4,
    message: new Message({
      id: "user-2" as MessageId,
      chatId,
      role: "user",
      content: "again",
      createdAt,
    }),
  });
  let state = emptyThread();
  state = applyChatStreamEvent(state, userEvent);
  state = applyChatStreamEvent(state, tokenEvent("Hel"));
  state = applyChatStreamEvent(
    state,
    new ChatErrorEvent({
      _tag: "error",
      seq: 3,
      error: "OPENROUTER: no key",
      code: "OPENROUTER",
    }),
  );
  expect(state.draft).toBe("");
  expect(state.error).toBe("OPENROUTER: no key");
  state = applyChatStreamEvent(state, nextUser);
  expect(state.error).toBeUndefined();
  state = applyChatStreamEvent(state, tokenEvent("lo", 5));
  expect(state.draft).toBe("lo");
  expect(state.error).toBeUndefined();
});

test("applyChatStreamEvent sets generating on a new user and ignores a duplicate after done", () => {
  let state = applyChatStreamEvent(emptyThread(), userEvent);
  expect(state.generating).toBe(true);
  expect(state.draft).toBe("");
  state = applyChatStreamEvent(state, doneEvent);
  expect(state.generating).toBe(false);
  state = applyChatStreamEvent(state, userEvent);
  expect(state.generating).toBe(false);
});
