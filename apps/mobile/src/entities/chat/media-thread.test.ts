import { expect, test } from "bun:test";
import {
  type ChatId,
  ChatJobEvent,
  GenerationJob,
  type GenerationJobId,
  type UserId,
} from "@openrouter-mobile/domain";
import { DateTime } from "effect";
import {
  appendTurn,
  applyChatJobEvent,
  applyJobEvent,
  bindJob,
  failTurn,
  hydrateJobs,
  mergeOlderMessages,
  toMediaThreadItem,
} from "./media-thread";

const createdAt = DateTime.fromDateUnsafe(new Date("2026-01-01T00:00:00.000Z"));

const queuedJob = new GenerationJob({
  id: "job-1" as GenerationJobId,
  userId: "user-1" as UserId,
  chatId: "chat-1" as ChatId,
  kind: "video",
  status: "queued",
  prompt: "a clip",
  createdAt,
});

test("appendTurn adds a user prompt and a pending assistant reply", () => {
  expect(appendTurn([], { prompt: "a clip", localId: "t1" })).toEqual([
    { id: "local-t1", role: "user", content: "a clip" },
    {
      id: "local-t1-assistant",
      role: "assistant",
      status: "queued",
    },
  ]);
});

test("bindJob then applyJobEvent completes the assistant with a result url", () => {
  const pending = appendTurn([], { prompt: "a clip", localId: "t1" });
  const bound = bindJob(pending, "t1", "job-1");
  const done = applyJobEvent(bound, "job-1", {
    status: "completed",
    url: "https://cdn.example/clip.mp4",
  });
  expect(done[1]).toEqual({
    id: "local-t1-assistant",
    role: "assistant",
    jobId: "job-1",
    status: "completed",
    url: "https://cdn.example/clip.mp4",
  });
});

test("failTurn marks the pending assistant as failed", () => {
  const pending = appendTurn([], { prompt: "a clip", localId: "t1" });
  expect(failTurn(pending, "t1", "OPENROUTER: no key")[1]).toEqual({
    id: "local-t1-assistant",
    role: "assistant",
    status: "failed",
    error: "OPENROUTER: no key",
  });
});

test("toMediaThreadItem maps a stored assistant url into a completed result", () => {
  expect(
    toMediaThreadItem({
      id: "m2",
      role: "assistant",
      content: "https://cdn.example/clip.mp4",
    }),
  ).toEqual({
    id: "m2",
    role: "assistant",
    status: "completed",
    url: "https://cdn.example/clip.mp4",
  });
});

test("mergeOlderMessages prepends unseen media turns", () => {
  const current = [
    { id: "b", role: "user" as const, content: "b" },
    {
      id: "c",
      role: "assistant" as const,
      status: "completed" as const,
      url: "https://cdn.example/c.mp4",
    },
  ];
  const older = [toMediaThreadItem({ id: "a", role: "user", content: "a" })];
  expect(mergeOlderMessages(current, older)[0]?.id).toBe("a");
  expect(mergeOlderMessages(current, older)).toHaveLength(3);
});

test("hydrateJobs appends a pending assistant bound to jobId without duplicating the user prompt", () => {
  const items = [{ id: "m1", role: "user" as const, content: "a clip" }];
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
  const pending = appendTurn([], { prompt: "a clip", localId: "t1" });
  const bound = bindJob(pending, "t1", "job-1");
  expect(hydrateJobs(bound, [queuedJob])).toHaveLength(2);
});

test("applyChatJobEvent updates the assistant by jobId", () => {
  const pending = appendTurn([], { prompt: "a clip", localId: "t1" });
  const bound = bindJob(pending, "t1", "job-1");
  const done = applyChatJobEvent(
    bound,
    new ChatJobEvent({
      _tag: "job",
      seq: 2,
      jobId: "job-1" as GenerationJobId,
      status: "completed",
      url: "https://cdn.example/clip.mp4",
    }),
  );
  expect(done[1]).toEqual({
    id: "local-t1-assistant",
    role: "assistant",
    jobId: "job-1",
    status: "completed",
    url: "https://cdn.example/clip.mp4",
  });
});
