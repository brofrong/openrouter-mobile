import { expect, test } from "bun:test";
import {
  chats,
  generationJobs,
  messages,
  streamEvents,
  usageEvents,
  user,
} from "@openrouter-mobile/db";
import {
  AppError,
  type ChatStreamEvent,
  type GenerationJobId,
} from "@openrouter-mobile/domain";
import { eq } from "drizzle-orm";
import { Effect, Layer, Result, type Scope, Stream } from "effect";
import {
  createChat,
  listMessages,
  subscribeTokens,
} from "../src/features/chat/ChatLive";
import type { DurableStream } from "../src/features/durable-stream/DurableStream";
import { DurableStreamLive } from "../src/features/durable-stream/DurableStreamLive";
import {
  generateAudio,
  generateImage,
  generateVideo,
  getJob,
  subscribeJob,
  synthesizeSpeech,
} from "../src/features/generation/GenerationLive";
import {
  type MediaGenerateInput,
  OpenRouterMedia,
  OpenRouterMediaStubLive,
} from "../src/features/generation/OpenRouterMedia";
import {
  AuthMiddleware,
  AuthMiddlewareLive,
  CurrentSession,
} from "../src/shared/AuthMiddleware";
import { Auth, createAuth, type Session } from "../src/shared/auth";
import { AppDb, DbLive } from "../src/shared/db";

if (process.env.DATABASE_URL === undefined) {
  process.env.DATABASE_URL =
    "postgres://openrouter:openrouter@localhost:5432/openrouter";
}

const AuthTestLive = Layer.succeed(
  Auth,
  createAuth("test-secret-that-is-at-least-32-chars-long"),
);

const TestLive = Layer.mergeAll(
  DurableStreamLive,
  OpenRouterMediaStubLive,
).pipe(Layer.provideMerge(DbLive));

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

const OpenRouterDieLive = Layer.succeed(OpenRouterMedia, {
  generate: () => Effect.die(new Error("media fiber died")),
});

const DieLive = Layer.mergeAll(DurableStreamLive, OpenRouterDieLive).pipe(
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

const runDie = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    AppDb | DurableStream | OpenRouterMedia | Scope.Scope
  >,
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(DieLive)));

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
          const ownedJobs = yield* db.query.generationJobs.findMany({
            where: { userId },
          });
          for (const job of ownedJobs) {
            yield* db
              .delete(streamEvents)
              .where(eq(streamEvents.streamId, job.id));
          }
          yield* db
            .delete(generationJobs)
            .where(eq(generationJobs.userId, userId));
          const ownedChats = yield* db.query.chats.findMany({
            where: { userId },
          });
          for (const chat of ownedChats) {
            yield* db.delete(messages).where(eq(messages.chatId, chat.id));
            yield* db
              .delete(streamEvents)
              .where(eq(streamEvents.streamId, chat.id));
          }
          yield* db.delete(chats).where(eq(chats.userId, userId));
          yield* db.delete(usageEvents).where(eq(usageEvents.userId, userId));
          yield* db.delete(user).where(eq(user.id, userId));
        }),
      ),
    );
    return session;
  });

const asUser = <A, E, R>(session: Session, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(CurrentSession, session));

const startImage = (
  session: Session,
  payload: {
    readonly prompt: string;
    readonly model?: string;
    readonly aspectRatio?: string;
    readonly quality?: string;
    readonly background?: string;
    readonly n?: number;
  },
) =>
  Effect.gen(function* () {
    const chat = yield* asUser(session, createChat({ kind: "image" }));
    const job = yield* asUser(
      session,
      generateImage({ chatId: chat.id, ...payload }),
    );
    return { chat, job };
  });

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

test("generateImage forwards model and image options to OpenRouterMedia", async () => {
  let seen: MediaGenerateInput | undefined;
  const CaptureLive = Layer.mergeAll(
    DurableStreamLive,
    Layer.succeed(OpenRouterMedia, {
      generate: (input) => {
        seen = input;
        return Effect.succeed({
          url: `https://example.invalid/openrouter-stub/image/${input.jobId}`,
        });
      },
    }),
  ).pipe(Layer.provideMerge(DbLive));

  await Effect.runPromise(
    Effect.gen(function* () {
      const session = yield* insertUser("image-options");
      const { job } = yield* startImage(session, {
        prompt: "a fox",
        model: "openai/gpt-image-2",
        aspectRatio: "16:9",
        quality: "high",
        background: "opaque",
        n: 2,
      });
      yield* asUser(
        session,
        subscribeJob(job.id, 0).pipe(
          Stream.filter(
            (event) =>
              event.status === "completed" || event.status === "failed",
          ),
          Stream.take(1),
          Stream.runCollect,
        ),
      );
    }).pipe(Effect.scoped, Effect.provide(CaptureLive)),
  );

  expect(seen?.prompt).toBe("a fox");
  expect(seen?.kind).toBe("image");
  expect(seen?.model).toBe("openai/gpt-image-2");
  expect(seen?.aspectRatio).toBe("16:9");
  expect(seen?.quality).toBe("high");
  expect(seen?.background).toBe("opaque");
  expect(seen?.n).toBe(2);
});

test("generateImage records usage for the current user", async () => {
  const CaptureLive = Layer.mergeAll(
    DurableStreamLive,
    Layer.succeed(OpenRouterMedia, {
      generate: (input) =>
        Effect.succeed({
          url: `https://example.invalid/openrouter-stub/image/${input.jobId}`,
          usage: {
            promptTokens: 8,
            completionTokens: 0,
            totalTokens: 8,
            costUsd: 0.02,
          },
        }),
    }),
  ).pipe(Layer.provideMerge(DbLive));

  const rows = await Effect.runPromise(
    Effect.gen(function* () {
      const session = yield* insertUser("image-usage");
      const { job } = yield* startImage(session, { prompt: "a fox" });
      yield* asUser(
        session,
        subscribeJob(job.id, 0).pipe(
          Stream.filter(
            (event) =>
              event.status === "completed" || event.status === "failed",
          ),
          Stream.take(1),
          Stream.runCollect,
        ),
      );
      const db = yield* AppDb;
      return yield* db.query.usageEvents.findMany({
        where: { userId: session.user.id },
      });
    }).pipe(Effect.scoped, Effect.provide(CaptureLive)),
  );

  expect(rows).toHaveLength(1);
  expect(rows[0]?.source).toBe("image");
  expect(rows[0]?.costUsd).toBeCloseTo(0.02);
  expect(rows[0]?.promptTokens).toBe(8);
});

test("synthesizeSpeech forwards text and voice to OpenRouterMedia", async () => {
  let seen: MediaGenerateInput | undefined;
  const CaptureLive = Layer.mergeAll(
    DurableStreamLive,
    Layer.succeed(OpenRouterMedia, {
      generate: (input) => {
        seen = input;
        return Effect.succeed({
          url: `data:audio/mpeg;base64,${Buffer.from("mp3").toString("base64")}`,
        });
      },
    }),
  ).pipe(Layer.provideMerge(DbLive));

  await Effect.runPromise(
    Effect.gen(function* () {
      const session = yield* insertUser("speech-options");
      const chat = yield* asUser(session, createChat({ kind: "speech" }));
      const job = yield* asUser(
        session,
        synthesizeSpeech({
          chatId: chat.id,
          text: "hello",
          voice: "eve",
        }),
      );
      yield* asUser(
        session,
        subscribeJob(job.id, 0).pipe(
          Stream.filter(
            (event) =>
              event.status === "completed" || event.status === "failed",
          ),
          Stream.take(1),
          Stream.runCollect,
        ),
      );
    }).pipe(Effect.scoped, Effect.provide(CaptureLive)),
  );

  expect(seen?.kind).toBe("speech");
  expect(seen?.prompt).toBe("hello");
  expect(seen?.voice).toBe("eve");
});

test("generateVideo records usage for the current user", async () => {
  const CaptureLive = Layer.mergeAll(
    DurableStreamLive,
    Layer.succeed(OpenRouterMedia, {
      generate: (input) =>
        Effect.succeed({
          url: `https://example.invalid/openrouter-stub/video/${input.jobId}`,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            costUsd: 0.25,
          },
        }),
    }),
  ).pipe(Layer.provideMerge(DbLive));

  const rows = await Effect.runPromise(
    Effect.gen(function* () {
      const session = yield* insertUser("video-usage");
      const chat = yield* asUser(session, createChat({ kind: "video" }));
      const job = yield* asUser(
        session,
        generateVideo({ chatId: chat.id, prompt: "a wave" }),
      );
      yield* asUser(
        session,
        subscribeJob(job.id, 0).pipe(
          Stream.filter(
            (event) =>
              event.status === "completed" || event.status === "failed",
          ),
          Stream.take(1),
          Stream.runCollect,
        ),
      );
      const db = yield* AppDb;
      return yield* db.query.usageEvents.findMany({
        where: { userId: session.user.id },
      });
    }).pipe(Effect.scoped, Effect.provide(CaptureLive)),
  );

  expect(rows).toHaveLength(1);
  expect(rows[0]?.source).toBe("video");
  expect(rows[0]?.costUsd).toBeCloseTo(0.25);
});

test("generateVideo forwards model and video options to OpenRouterMedia", async () => {
  let seen: MediaGenerateInput | undefined;
  const CaptureLive = Layer.mergeAll(
    DurableStreamLive,
    Layer.succeed(OpenRouterMedia, {
      generate: (input) => {
        seen = input;
        return Effect.succeed({
          url: `https://example.invalid/openrouter-stub/video/${input.jobId}`,
        });
      },
    }),
  ).pipe(Layer.provideMerge(DbLive));

  await Effect.runPromise(
    Effect.gen(function* () {
      const session = yield* insertUser("video-options");
      const chat = yield* asUser(session, createChat({ kind: "video" }));
      const job = yield* asUser(
        session,
        generateVideo({
          chatId: chat.id,
          prompt: "a wave",
          model: "google/veo-3.1",
          aspectRatio: "9:16",
          resolution: "1080p",
          duration: 8,
          generateAudio: false,
        }),
      );
      yield* asUser(
        session,
        subscribeJob(job.id, 0).pipe(
          Stream.filter(
            (event) =>
              event.status === "completed" || event.status === "failed",
          ),
          Stream.take(1),
          Stream.runCollect,
        ),
      );
    }).pipe(Effect.scoped, Effect.provide(CaptureLive)),
  );

  expect(seen?.prompt).toBe("a wave");
  expect(seen?.kind).toBe("video");
  expect(seen?.model).toBe("google/veo-3.1");
  expect(seen?.aspectRatio).toBe("9:16");
  expect(seen?.resolution).toBe("1080p");
  expect(seen?.duration).toBe(8);
  expect(seen?.generateAudio).toBe(false);
});

test("video, speech, and audio jobs forward the selected model", async () => {
  const seen: Array<MediaGenerateInput> = [];
  const CaptureLive = Layer.mergeAll(
    DurableStreamLive,
    Layer.succeed(OpenRouterMedia, {
      generate: (input) => {
        seen.push(input);
        return Effect.succeed({
          url: `https://example.invalid/openrouter-stub/${input.kind}/${input.jobId}`,
        });
      },
    }),
  ).pipe(Layer.provideMerge(DbLive));

  await Effect.runPromise(
    Effect.gen(function* () {
      const session = yield* insertUser("media-models");
      const videoChat = yield* asUser(session, createChat({ kind: "video" }));
      const speechChat = yield* asUser(session, createChat({ kind: "speech" }));
      const audioChat = yield* asUser(session, createChat({ kind: "audio" }));
      const videoJob = yield* asUser(
        session,
        generateVideo({
          chatId: videoChat.id,
          prompt: "a wave",
          model: "google/veo-3.1",
        }),
      );
      const speechJob = yield* asUser(
        session,
        synthesizeSpeech({
          chatId: speechChat.id,
          text: "hello",
          model: "x-ai/grok-voice-tts-1.0",
          voice: "eve",
        }),
      );
      const audioJob = yield* asUser(
        session,
        generateAudio({
          chatId: audioChat.id,
          prompt: "a lo-fi beat",
          model: "google/lyria-3-clip-preview",
        }),
      );
      for (const job of [videoJob, speechJob, audioJob]) {
        yield* asUser(
          session,
          subscribeJob(job.id, 0).pipe(
            Stream.filter(
              (event) =>
                event.status === "completed" || event.status === "failed",
            ),
            Stream.take(1),
            Stream.runCollect,
          ),
        );
      }
    }).pipe(Effect.scoped, Effect.provide(CaptureLive)),
  );

  expect(seen.map((input) => [input.kind, input.model])).toEqual([
    ["video", "google/veo-3.1"],
    ["speech", "x-ai/grok-voice-tts-1.0"],
    ["audio", "google/lyria-3-clip-preview"],
  ]);
});

test("ImageGenerate returns a job id owned by the session user", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("image-owner");
      const { job } = yield* startImage(session, { prompt: "a cat" });
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
      const { job } = yield* startImage(session, { prompt: "a sunset" });
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
      const { job } = yield* startImage(session, { prompt: "a mountain" });
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
      const { job } = yield* startImage(owner, { prompt: "secret" });
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
    }).pipe(
      Effect.scoped,
      Effect.provide(AuthMiddlewareLive.pipe(Layer.provide(AuthTestLive))),
    ),
  );

  expect(isCode(result, "UNAUTHORIZED")).toBe(true);
});

test("JobSubscribe receives failed when generation errors", async () => {
  const result = await runFail(
    Effect.gen(function* () {
      const session = yield* insertUser("openrouter-error");
      const { job } = yield* startImage(session, { prompt: "nope" });
      const events = yield* asUser(
        session,
        subscribeJob(job.id, 0).pipe(Stream.take(3), Stream.runCollect),
      );
      const db = yield* AppDb;
      const ledger = yield* db.query.streamEvents.findMany({
        where: { streamId: job.id },
        orderBy: { seq: "asc" },
      });
      const stored = yield* asUser(session, getJob(job.id));
      return { events, ledger, stored };
    }),
  );

  expect(result.events.map((event) => event.status)).toEqual([
    "queued",
    "running",
    "failed",
  ]);
  expect(result.events[2]?.error).toBe("upstream failed");
  expect(result.stored.status).toBe("failed");
  expect(result.stored.error).toBe("upstream failed");
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

test("JobSubscribe receives failed when media.generate dies", async () => {
  const result = await runDie(
    Effect.gen(function* () {
      const session = yield* insertUser("openrouter-die");
      const { job } = yield* startImage(session, { prompt: "boom" });
      const events = yield* asUser(
        session,
        subscribeJob(job.id, 0).pipe(Stream.take(3), Stream.runCollect),
      );
      const stored = yield* asUser(session, getJob(job.id));
      return { events, stored };
    }),
  );

  expect(result.events.map((event) => event.status)).toEqual([
    "queued",
    "running",
    "failed",
  ]);
  expect(result.events[2]?.error).toBe("media fiber died");
  expect(result.stored.status).toBe("failed");
  expect(result.stored.error).toBe("media fiber died");
});

test("ImageGenerate ChatMessages includes the running job and ChatSubscribe emits job events", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("image-chat-bus");
      const { chat, job } = yield* startImage(session, { prompt: "a canyon" });
      const db = yield* AppDb;
      const row = yield* db.query.generationJobs.findFirst({
        where: { id: job.id },
      });
      const during = yield* asUser(session, listMessages({ chatId: chat.id }));
      const jobEvents = yield* asUser(
        session,
        subscribeTokens(chat.id, 0).pipe(
          Stream.filter(
            (event): event is Extract<ChatStreamEvent, { _tag: "job" }> =>
              event._tag === "job",
          ),
          Stream.takeUntil(
            (event) =>
              event.status === "completed" || event.status === "failed",
          ),
          Stream.timeout("2 seconds"),
          Stream.runCollect,
        ),
      );
      const after = yield* asUser(session, listMessages({ chatId: chat.id }));
      return { chat, job, row, during, jobEvents, after };
    }),
  );

  expect(result.row?.chatId).toBe(result.chat.id);
  expect(result.job.chatId).toBe(result.chat.id);
  expect(result.during.jobs[0]?.id).toBe(result.job.id);
  expect(result.during.generating).toBe(true);
  expect(result.jobEvents.map((event) => event.status)).toEqual([
    "queued",
    "running",
    "completed",
  ]);
  expect(result.after.jobs).toEqual([]);
  expect(
    result.after.messages.some(
      (message) =>
        message.role === "assistant" && message.content.includes(result.job.id),
    ),
  ).toBe(true);
});

test("ImageGenerate persists the prompt and completed image as chat messages", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("image-messages");
      const { chat, job } = yield* startImage(session, { prompt: "a lake" });
      yield* asUser(
        session,
        subscribeJob(job.id, 0).pipe(
          Stream.filter((event) => event.status === "completed"),
          Stream.take(1),
          Stream.runCollect,
        ),
      );
      const db = yield* AppDb;
      const stored = yield* db.query.chats.findFirst({
        where: { id: chat.id },
      });
      const rows = yield* db.query.messages.findMany({
        where: { chatId: chat.id },
        orderBy: { createdAt: "asc" },
      });
      return { stored, job, rows };
    }),
  );

  expect(result.stored?.title).toBe("a lake");
  expect(result.rows.map((row) => row.role)).toEqual(["user", "assistant"]);
  expect(result.rows[0]?.content).toBe("a lake");
  expect(result.rows[1]?.content.includes(result.job.id)).toBe(true);
});

test("ImageGenerate on a text chat is VALIDATION", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("image-on-text");
      const chat = yield* asUser(session, createChat());
      return yield* asUser(
        session,
        generateImage({ chatId: chat.id, prompt: "nope" }),
      ).pipe(Effect.result);
    }),
  );

  expect(isCode(result, "VALIDATION")).toBe(true);
});

test("VideoGenerate persists the prompt and completed video as chat messages", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("video-messages");
      const chat = yield* asUser(session, createChat({ kind: "video" }));
      const job = yield* asUser(
        session,
        generateVideo({ chatId: chat.id, prompt: "a wave" }),
      );
      yield* asUser(
        session,
        subscribeJob(job.id, 0).pipe(
          Stream.filter((event) => event.status === "completed"),
          Stream.take(1),
          Stream.runCollect,
        ),
      );
      const db = yield* AppDb;
      const stored = yield* db.query.chats.findFirst({
        where: { id: chat.id },
      });
      const rows = yield* db.query.messages.findMany({
        where: { chatId: chat.id },
        orderBy: { createdAt: "asc" },
      });
      return { stored, job, rows };
    }),
  );

  expect(result.stored?.title).toBe("a wave");
  expect(result.rows.map((row) => row.role)).toEqual(["user", "assistant"]);
  expect(result.rows[0]?.content).toBe("a wave");
  expect(result.rows[1]?.content.includes(result.job.id)).toBe(true);
});

test("media jobs on the wrong chat kind are VALIDATION", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("media-kind");
      const text = yield* asUser(session, createChat());
      const image = yield* asUser(session, createChat({ kind: "image" }));
      const video = yield* asUser(
        session,
        generateVideo({ chatId: text.id, prompt: "nope" }),
      ).pipe(Effect.result);
      const speech = yield* asUser(
        session,
        synthesizeSpeech({ chatId: image.id, text: "nope" }),
      ).pipe(Effect.result);
      const audio = yield* asUser(
        session,
        generateAudio({ chatId: text.id, prompt: "a lo-fi beat" }),
      ).pipe(Effect.result);
      return { video, speech, audio };
    }),
  );

  expect(isCode(result.video, "VALIDATION")).toBe(true);
  expect(isCode(result.speech, "VALIDATION")).toBe(true);
  expect(isCode(result.audio, "VALIDATION")).toBe(true);
});
