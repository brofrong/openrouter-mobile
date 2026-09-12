import { expect, test } from "bun:test";
import { generationJobs, streamEvents, user } from "@openrouter-mobile/db";
import { AppError, type GenerationJobId } from "@openrouter-mobile/domain";
import { eq } from "drizzle-orm";
import { Effect, Layer, Result, type Scope, Stream } from "effect";
import type { DurableStream } from "../src/features/durable-stream/DurableStream";
import { DurableStreamLive } from "../src/features/durable-stream/DurableStreamLive";
import {
  generateImage,
  getJob,
  subscribeJob,
} from "../src/features/generation/GenerationLive";
import {
  OpenRouterMedia,
  OpenRouterMediaLive,
} from "../src/features/generation/OpenRouterMedia";
import {
  AuthMiddleware,
  AuthMiddlewareLive,
  CurrentSession,
} from "../src/shared/AuthMiddleware";
import type { Session } from "../src/shared/auth";
import { AppDb, DbLive } from "../src/shared/db";

if (process.env.DATABASE_URL === undefined) {
  process.env.DATABASE_URL =
    "postgres://openrouter:openrouter@localhost:5432/openrouter";
}
if (process.env.BETTER_AUTH_SECRET === undefined) {
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-chars-long";
}

const TestLive = Layer.mergeAll(DurableStreamLive, OpenRouterMediaLive).pipe(
  Layer.provideMerge(DbLive),
);

const OpenRouterFailLive = Layer.succeed(OpenRouterMedia, {
  generate: () =>
    Effect.fail(
      new AppError({
        code: "OPENROUTER",
        message: "upstream failed",
      }),
    ),
});

const FailLive = Layer.mergeAll(DurableStreamLive, OpenRouterFailLive).pipe(
  Layer.provideMerge(DbLive),
);

const makeSession = (userId: string, email: string): Session =>
  ({
    session: {
      id: `session-${userId}`,
      token: `token-${userId}`,
      userId,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: userId,
      name: email,
      email,
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }) as Session;

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    AppDb | DurableStream | OpenRouterMedia | Scope.Scope
  >,
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(TestLive)));

const runFail = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    AppDb | DurableStream | OpenRouterMedia | Scope.Scope
  >,
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(FailLive)));

const insertUser = (label: string) =>
  Effect.gen(function* () {
    const db = yield* AppDb;
    const userId = crypto.randomUUID();
    const email = `${label}-${userId}@generation.test`;
    yield* db.insert(user).values({
      id: userId,
      name: label,
      email,
      emailVerified: false,
    });
    const session = makeSession(userId, email);
    yield* Effect.addFinalizer(() =>
      Effect.ignore(
        Effect.gen(function* () {
          const owned = yield* db.query.generationJobs.findMany({
            where: { userId },
          });
          for (const job of owned) {
            yield* db
              .delete(streamEvents)
              .where(eq(streamEvents.streamId, job.id));
          }
          yield* db
            .delete(generationJobs)
            .where(eq(generationJobs.userId, userId));
          yield* db.delete(user).where(eq(user.id, userId));
        }),
      ),
    );
    return session;
  });

const asUser = <A, E, R>(session: Session, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(CurrentSession, session));

const isNotFound = (result: Result.Result<unknown, AppError>) =>
  Result.isFailure(result) &&
  result.failure._tag === "AppError" &&
  result.failure.code === "NOT_FOUND";

const isCode = (
  result: Result.Result<unknown, unknown>,
  code: AppError["code"],
) =>
  Result.isFailure(result) &&
  result.failure instanceof AppError &&
  result.failure.code === code;

const fakeJobId = crypto.randomUUID() as GenerationJobId;

test("ImageGenerate returns a job id owned by the session user", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("image-owner");
      const job = yield* asUser(session, generateImage({ prompt: "a cat" }));
      return { job, userId: session.user.id };
    }),
  );

  expect(result.job.id.length).toBeGreaterThan(0);
  expect(String(result.job.userId)).toBe(result.userId);
  expect(result.job.kind).toBe("image");
  expect(result.job.status).toBe("queued");
  expect(result.job.prompt).toBe("a cat");
});

test("JobSubscribe gets queued → running → completed in order", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("subscribe-order");
      const job = yield* asUser(session, generateImage({ prompt: "a sunset" }));
      const events = yield* asUser(
        session,
        subscribeJob(job.id, 0).pipe(Stream.take(3), Stream.runCollect),
      );
      return { job, events };
    }),
  );

  expect(result.job.userId).toBeDefined();
  expect(result.events.map((event) => event.status)).toEqual([
    "queued",
    "running",
    "completed",
  ]);
  expect(result.events[2]?.url?.includes(result.job.id)).toBe(true);
});

test("JobSubscribe(afterSeq=n) still receives completed", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("reconnect");
      const job = yield* asUser(
        session,
        generateImage({ prompt: "a mountain" }),
      );
      const first = yield* asUser(
        session,
        subscribeJob(job.id, 0).pipe(Stream.take(2), Stream.runCollect),
      );
      const afterSeq = first[1]?.seq;
      if (afterSeq === undefined) {
        return yield* Effect.die("subscriber did not see 2 job events");
      }
      const rest = yield* asUser(
        session,
        subscribeJob(job.id, afterSeq).pipe(
          Stream.filter((event) => event.status === "completed"),
          Stream.take(1),
          Stream.runCollect,
        ),
      );
      return { first, rest };
    }),
  );

  expect(result.first.map((event) => event.status)).toEqual([
    "queued",
    "running",
  ]);
  expect(result.rest.map((event) => event.status)).toEqual(["completed"]);
});

test("another user's jobId is NOT_FOUND on JobGet and JobSubscribe", async () => {
  const result = await run(
    Effect.gen(function* () {
      const owner = yield* insertUser("job-owner");
      const stranger = yield* insertUser("job-stranger");
      const job = yield* asUser(owner, generateImage({ prompt: "secret" }));
      const getResult = yield* asUser(stranger, getJob(job.id)).pipe(
        Effect.result,
      );
      const subscribeResult = yield* asUser(
        stranger,
        subscribeJob(job.id).pipe(Stream.take(1), Stream.runCollect),
      ).pipe(Effect.result);
      return { getResult, subscribeResult };
    }),
  );

  expect(isNotFound(result.getResult)).toBe(true);
  expect(isNotFound(result.subscribeResult)).toBe(true);
});

test("JobGet without a session cookie is UNAUTHORIZED", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const middleware = yield* AuthMiddleware;
      return yield* middleware(
        getJob(fakeJobId) as never,
        {
          headers: {},
        } as never,
      ).pipe(Effect.result);
    }).pipe(Effect.scoped, Effect.provide(AuthMiddlewareLive)),
  );

  expect(isCode(result, "UNAUTHORIZED")).toBe(true);
});

test("JobSubscribe receives failed when generation errors", async () => {
  const result = await runFail(
    Effect.gen(function* () {
      const session = yield* insertUser("openrouter-error");
      const job = yield* asUser(session, generateImage({ prompt: "nope" }));
      const events = yield* asUser(
        session,
        subscribeJob(job.id, 0).pipe(Stream.take(3), Stream.runCollect),
      );
      const db = yield* AppDb;
      const ledger = yield* db.query.streamEvents.findMany({
        where: { streamId: job.id },
        orderBy: { seq: "asc" },
      });
      return { events, ledger };
    }),
  );

  expect(result.events.map((event) => event.status)).toEqual([
    "queued",
    "running",
    "failed",
  ]);
  expect(result.events[2]?.error).toBe("upstream failed");
  expect(
    result.ledger.some(
      (event) =>
        event.kind === "job" &&
        event.payload !== null &&
        typeof event.payload === "object" &&
        "status" in event.payload &&
        event.payload.status === "failed",
    ),
  ).toBe(true);
});
