import { expect, test } from "bun:test";
import {
  type ChatId,
  ChatJobEvent,
  ChatUserEvent,
  GenerationJob,
  type GenerationJobId,
  Message,
  type MessageId,
  type UserId,
} from "@openrouter-mobile/domain";
import { DateTime } from "effect";
import {
  appendTurn,
  applyChatJobEvent,
  applyChatUserEvent,
  applyJobEvent,
  aspectRatioValue,
  bindJob,
  failTurn,
  hydrateJobs,
  mergeOlderMessages,
  splitImageUrls,
  toImageThreadItem,
} from "./thread";

const createdAt = DateTime.fromDateUnsafe(new Date("2026-01-01T00:00:00.000Z"));

const queuedJob = new GenerationJob({
  id: "job-1" as GenerationJobId,
  userId: "user-1" as UserId,
  chatId: "chat-1" as ChatId,
  kind: "image",
  status: "queued",
  prompt: "a cat",
  createdAt,
});

test("appendTurn adds a user prompt and a pending assistant reply", () => {
  expect(
    appendTurn([], { prompt: "a cat", localId: "t1", aspectRatio: "16:9" }),
  ).toEqual([
    { id: "local-t1", role: "user", content: "a cat" },
    {
      id: "local-t1-assistant",
      role: "assistant",
      status: "queued",
      aspectRatio: "16:9",
    },
  ]);
});

test("bindJob then applyJobEvent completes the assistant with an image url", () => {
  const pending = appendTurn([], { prompt: "a cat", localId: "t1" });
  const bound = bindJob(pending, "t1", "job-1");
  const done = applyJobEvent(bound, "job-1", {
    status: "completed",
    url: "https://cdn.example/cat.png",
  });
  expect(done[1]).toEqual({
    id: "local-t1-assistant",
    role: "assistant",
    jobId: "job-1",
    status: "completed",
    url: "https://cdn.example/cat.png",
  });
});

test("failTurn marks the pending assistant as failed", () => {
  const pending = appendTurn([], { prompt: "a cat", localId: "t1" });
  expect(failTurn(pending, "t1", "OPENROUTER: no key")[1]).toEqual({
    id: "local-t1-assistant",
    role: "assistant",
    status: "failed",
    error: "OPENROUTER: no key",
  });
});

test("toImageThreadItem maps a stored assistant url into a completed image", () => {
  expect(
    toImageThreadItem({
      id: "m2",
      role: "assistant",
      content: "https://cdn.example/cat.png",
    }),
  ).toEqual({
    id: "m2",
    role: "assistant",
    status: "completed",
    url: "https://cdn.example/cat.png",
  });
});

test("mergeOlderMessages prepends unseen image turns", () => {
  const current = [
    { id: "b", role: "user" as const, content: "b" },
    {
      id: "c",
      role: "assistant" as const,
      status: "completed" as const,
      url: "https://cdn.example/c.png",
    },
  ];
  const older = [toImageThreadItem({ id: "a", role: "user", content: "a" })];
  expect(mergeOlderMessages(current, older)[0]?.id).toBe("a");
  expect(mergeOlderMessages(current, older)).toHaveLength(3);
});

test("splitImageUrls splits joined assistant content into tiles", () => {
  expect(splitImageUrls("https://cdn.example/a.png")).toEqual([
    "https://cdn.example/a.png",
  ]);
  expect(
    splitImageUrls("https://cdn.example/a.png\nhttps://cdn.example/b.png"),
  ).toEqual(["https://cdn.example/a.png", "https://cdn.example/b.png"]);
  expect(splitImageUrls(undefined)).toEqual([]);
});

test("aspectRatioValue parses width:height and defaults to square", () => {
  expect(aspectRatioValue("16:9")).toBeCloseTo(16 / 9);
  expect(aspectRatioValue("1:1")).toBe(1);
  expect(aspectRatioValue("auto")).toBe(1);
  expect(aspectRatioValue(undefined)).toBe(1);
});

test("hydrateJobs appends a pending assistant bound to jobId without duplicating the user prompt", () => {
  const items = [{ id: "m1", role: "user" as const, content: "a cat" }];
  const hydrated = hydrateJobs(items, [queuedJob]);
  expect(hydrated).toHaveLength(2);
  expect(hydrated[0]).toEqual(items[0]);
  expect(hydrated[1]).toMatchObject({
    role: "assistant",
    jobId: "job-1",
    status: "queued",
  });
});

test("hydrateJobs does not duplicate an assistant already bound to the job", () => {
  const pending = appendTurn([], { prompt: "a cat", localId: "t1" });
  const bound = bindJob(pending, "t1", "job-1");
  expect(hydrateJobs(bound, [queuedJob])).toHaveLength(2);
});

test("applyChatJobEvent updates the assistant by jobId", () => {
  const pending = appendTurn([], { prompt: "a cat", localId: "t1" });
  const bound = bindJob(pending, "t1", "job-1");
  const done = applyChatJobEvent(
    bound,
    new ChatJobEvent({
      _tag: "job",
      seq: 2,
      jobId: "job-1" as GenerationJobId,
      status: "completed",
      url: "https://cdn.example/cat.png",
    }),
  );
  expect(done[1]).toEqual({
    id: "local-t1-assistant",
    role: "assistant",
    jobId: "job-1",
    status: "completed",
    url: "https://cdn.example/cat.png",
  });
});

const userMessage = new Message({
  id: "m1" as MessageId,
  chatId: "chat-1" as ChatId,
  role: "user",
  content: "a cat",
  createdAt,
});

const userEvent = new ChatUserEvent({
  _tag: "user",
  seq: 1,
  message: userMessage,
});

test("applyChatUserEvent appends an unseen user message", () => {
  expect(applyChatUserEvent([], userEvent)).toEqual([
    { id: "m1", role: "user", content: "a cat" },
  ]);
});

test("applyChatUserEvent does not duplicate a known user id", () => {
  const items = [{ id: "m1", role: "user" as const, content: "a cat" }];
  expect(applyChatUserEvent(items, userEvent)).toEqual(items);
});

test("applyChatUserEvent replaces a local user with the same content", () => {
  const pending = appendTurn([], { prompt: "a cat", localId: "t1" });
  const next = applyChatUserEvent(pending, userEvent);
  expect(next[0]).toEqual({ id: "m1", role: "user", content: "a cat" });
  expect(next[1]).toEqual(pending[1]);
});

test("applyChatJobEvent appends a pending assistant when jobId is missing", () => {
  const items = [{ id: "m1", role: "user" as const, content: "a cat" }];
  const next = applyChatJobEvent(
    items,
    new ChatJobEvent({
      _tag: "job",
      seq: 2,
      jobId: "job-1" as GenerationJobId,
      status: "queued",
    }),
  );
  expect(next).toHaveLength(2);
  expect(next[1]).toMatchObject({
    role: "assistant",
    jobId: "job-1",
    status: "queued",
  });
});

test("applyChatJobEvent binds an unbound local assistant instead of duplicating", () => {
  const pending = appendTurn([], { prompt: "a cat", localId: "t1" });
  const next = applyChatJobEvent(
    pending,
    new ChatJobEvent({
      _tag: "job",
      seq: 2,
      jobId: "job-1" as GenerationJobId,
      status: "queued",
    }),
  );
  expect(next).toHaveLength(2);
  expect(next[1]).toMatchObject({
    id: "local-t1-assistant",
    role: "assistant",
    jobId: "job-1",
    status: "queued",
  });
});
