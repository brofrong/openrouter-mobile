import { expect, test } from "bun:test";
import { streamEvents } from "@openrouter-mobile/db";
import { eq } from "drizzle-orm";
import { Effect, Fiber, Layer, type Scope, Stream } from "effect";
import { DurableStream } from "../src/features/durable-stream/DurableStream";
import { DurableStreamLive } from "../src/features/durable-stream/DurableStreamLive";
import { AppDb, DbLive } from "../src/shared/db";

if (process.env.DATABASE_URL === undefined) {
  process.env.DATABASE_URL =
    "postgres://openrouter:openrouter@localhost:5432/openrouter";
}
if (process.env.BETTER_AUTH_SECRET === undefined) {
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-chars-long";
}

const TestLive = DurableStreamLive.pipe(Layer.provideMerge(DbLive));

const waitUntilLive = Effect.sleep("150 millis");

const run = <A, E>(
  effect: Effect.Effect<A, E, DurableStream | AppDb | Scope.Scope>,
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(TestLive)));

const withStream = Effect.fn("withStream")(function* () {
  const streamId = crypto.randomUUID();
  const db = yield* AppDb;
  yield* Effect.addFinalizer(() =>
    Effect.ignore(
      db.delete(streamEvents).where(eq(streamEvents.streamId, streamId)),
    ),
  );
  const durable = yield* DurableStream;
  return { streamId, durable };
});

test("append writes monotonic seq per streamId", async () => {
  const seqs = await run(
    Effect.gen(function* () {
      const { streamId, durable } = yield* withStream();
      const first = yield* durable.append(streamId, "token", { n: 1 });
      const second = yield* durable.append(streamId, "token", { n: 2 });
      const third = yield* durable.append(streamId, "token", { n: 3 });
      return [first.seq, second.seq, third.seq];
    }),
  );

  expect(seqs).toHaveLength(3);
  expect(
    seqs.slice(1).every((seq, index) => {
      const previous = seqs[index];
      return previous !== undefined && seq > previous;
    }),
  ).toBe(true);
});

test("two subscribers both receive the same event", async () => {
  const payloads = await run(
    Effect.gen(function* () {
      const { streamId, durable } = yield* withStream();
      const takeOne = durable
        .subscribe(streamId, 0)
        .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild);
      const first = yield* takeOne;
      const second = yield* takeOne;
      yield* waitUntilLive;
      const event = yield* durable.append(streamId, "token", { n: 1 });
      const [left, right] = yield* Effect.all([
        Fiber.join(first),
        Fiber.join(second),
      ]);
      return {
        eventSeq: event.seq,
        left: left.map((chunk) => ({ seq: chunk.seq, payload: chunk.payload })),
        right: right.map((chunk) => ({
          seq: chunk.seq,
          payload: chunk.payload,
        })),
      };
    }),
  );

  expect(payloads.left).toEqual([
    { seq: payloads.eventSeq, payload: { n: 1 } },
  ]);
  expect(payloads.right).toEqual([
    { seq: payloads.eventSeq, payload: { n: 1 } },
  ]);
});

test("reconnect: subscribe(afterSeq=3) yields 4,5 then live 6", async () => {
  const result = await run(
    Effect.gen(function* () {
      const { streamId, durable } = yield* withStream();
      const live = yield* durable
        .subscribe(streamId, 0)
        .pipe(Stream.take(3), Stream.runCollect, Effect.forkChild);
      yield* waitUntilLive;

      const appended = [];
      for (let n = 1; n <= 5; n++) {
        appended.push(yield* durable.append(streamId, "token", { n }));
      }
      const seen = yield* Fiber.join(live);
      yield* Fiber.interrupt(live);

      const afterSeq = seen[2]?.seq;
      if (afterSeq === undefined) {
        return yield* Effect.die("subscriber did not see 3 events");
      }

      const resumed = yield* durable
        .subscribe(streamId, afterSeq)
        .pipe(Stream.take(3), Stream.runCollect, Effect.forkChild);
      yield* waitUntilLive;
      const sixth = yield* durable.append(streamId, "token", { n: 6 });
      const rest = yield* Fiber.join(resumed);

      return {
        seen: seen.map((event) => event.payload),
        rest: rest.map((event) => event.payload),
        expectedTail: [
          appended[3]?.payload,
          appended[4]?.payload,
          sixth.payload,
        ],
      };
    }),
  );

  expect(result.seen).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  expect(result.rest).toEqual(result.expectedTail);
});

test("gap: subscribe(afterSeq=0) yields 1..10 in order with no prior subscriber", async () => {
  const payloads = await run(
    Effect.gen(function* () {
      const { streamId, durable } = yield* withStream();
      for (let n = 1; n <= 10; n++) {
        yield* durable.append(streamId, "token", { n });
      }
      const events = yield* durable
        .subscribe(streamId, 0)
        .pipe(Stream.take(10), Stream.runCollect);
      return events.map((event) => event.payload);
    }),
  );

  expect(payloads).toEqual(
    Array.from({ length: 10 }, (_, index) => ({ n: index + 1 })),
  );
});

test("dedup: overlapping replay and live does not double-emit a seq", async () => {
  const seqs = await run(
    Effect.gen(function* () {
      const { streamId, durable } = yield* withStream();
      for (let n = 1; n <= 5; n++) {
        yield* durable.append(streamId, "token", { n });
      }

      const collecting = yield* durable
        .subscribe(streamId, 0)
        .pipe(Stream.take(10), Stream.runCollect, Effect.forkChild);

      for (let n = 6; n <= 10; n++) {
        yield* durable.append(streamId, "token", { n });
      }

      const events = yield* Fiber.join(collecting);
      return events.map((event) => event.seq);
    }),
  );

  expect(seqs).toHaveLength(10);
  expect(new Set(seqs).size).toBe(10);
  expect(seqs).toEqual([...seqs].sort((left, right) => left - right));
});
