import { expect, test } from "bun:test";
import { AppError } from "@openrouter-mobile/domain";
import { Effect, Schedule, Stream } from "effect";
import { getAfterSeq, resetAfterSeq, withAfterSeq } from "./afterSeq";
import { resumeRpcStream } from "./resume-rpc-stream";

type Chunk = {
  readonly seq: number;
  readonly text: string;
};

const immediate = Schedule.spaced(0);

test("ChatSubscribe / JobSubscribe payloads include afterSeq after the first chunk", async () => {
  resetAfterSeq();
  const payloads: Array<{
    readonly chatId: string;
    readonly afterSeq?: number;
  }> = [];
  const texts: Array<string> = [];
  let attempt = 0;

  await Effect.runPromise(
    resumeRpcStream({
      streamId: "chat-resume",
      schedule: immediate,
      make: (afterSeq) => {
        const payload = withAfterSeq({ chatId: "chat-resume" }, afterSeq);
        payloads.push(payload);
        attempt += 1;
        if (attempt === 1) {
          return Effect.succeed(
            Stream.fromIterable<Chunk>([
              { seq: 1, text: "Hel" },
              { seq: 2, text: "lo" },
            ]).pipe(Stream.concat(Stream.fail("disconnect"))),
          );
        }
        return Effect.succeed(
          Stream.fromIterable<Chunk>([{ seq: 3, text: "!" }]),
        );
      },
      onChunk: (chunk) => {
        texts.push(chunk.text);
      },
      onError: () => undefined,
    }),
  );

  expect(payloads[0]).toEqual({ chatId: "chat-resume" });
  expect(payloads[1]).toEqual({ chatId: "chat-resume", afterSeq: 2 });
  expect(getAfterSeq("chat-resume")).toBe(3);
  expect(texts).toEqual(["Hel", "lo", "!"]);
});

test("duplicate seqs are not appended", async () => {
  resetAfterSeq();
  const texts: Array<string> = [];
  let attempt = 0;

  await Effect.runPromise(
    resumeRpcStream({
      streamId: "chat-dedup",
      schedule: immediate,
      make: () => {
        attempt += 1;
        if (attempt === 1) {
          return Effect.succeed(
            Stream.fromIterable<Chunk>([
              { seq: 1, text: "a" },
              { seq: 2, text: "b" },
            ]).pipe(Stream.concat(Stream.fail("disconnect"))),
          );
        }
        return Effect.succeed(
          Stream.fromIterable<Chunk>([
            { seq: 2, text: "b" },
            { seq: 3, text: "c" },
          ]),
        );
      },
      onChunk: (chunk) => {
        texts.push(chunk.text);
      },
      onError: () => undefined,
    }),
  );

  expect(texts).toEqual(["a", "b", "c"]);
});

test("STREAM_GONE stops retry", async () => {
  resetAfterSeq();
  let attempts = 0;
  const errors: Array<string> = [];

  await Effect.runPromise(
    resumeRpcStream({
      streamId: "chat-gone",
      schedule: immediate,
      make: () => {
        attempts += 1;
        return Effect.succeed(
          Stream.fail(
            new AppError({
              code: "STREAM_GONE",
              message: "Stream unavailable",
            }),
          ),
        );
      },
      onChunk: () => undefined,
      onError: (message) => {
        errors.push(message);
      },
    }),
  );

  expect(attempts).toBe(1);
  expect(errors).toEqual(["Stream unavailable"]);
});
