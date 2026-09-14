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
  CatalogModelPage,
  type ChatStreamEvent,
  type MessageId,
  StreamEvent,
} from "@openrouter-mobile/domain";
import { eq } from "drizzle-orm";
import {
  Effect,
  Fiber,
  Layer,
  Result,
  Schema,
  type Scope,
  Stream,
} from "effect";
import {
  createChat,
  listChats,
  listMessages,
  listModels,
  pageIsGenerating,
  renameChat,
  sendMessage,
  setChatModel,
  subscribeTokens,
} from "../src/features/chat/ChatLive";
import {
  OpenRouterChat,
  OpenRouterChatLive,
} from "../src/features/chat/OpenRouterChat";
import { DurableStream } from "../src/features/durable-stream/DurableStream";
import { DurableStreamLive } from "../src/features/durable-stream/DurableStreamLive";
import {
  AuthMiddleware,
  AuthMiddlewareLive,
  CurrentSession,
} from "../src/shared/AuthMiddleware";
import { Auth, createAuth, type Session } from "../src/shared/auth";
import { AppDb, DbLive } from "../src/shared/db";
import { isUsableOpenRouterKeyValue } from "../src/shared/openrouter";

if (process.env.DATABASE_URL === undefined) {
  process.env.DATABASE_URL =
    "postgres://openrouter:openrouter@localhost:5432/openrouter";
}

const AuthTestLive = Layer.succeed(
  Auth,
  createAuth("test-secret-that-is-at-least-32-chars-long"),
);

const MOCK_TOKENS = ["Hel", "lo", " ", "from", " ", "mock"] as const;
const hasRealOpenRouterKey = isUsableOpenRouterKeyValue(
  process.env.OPENROUTER_API_KEY ?? "",
);

const tokens = (events: ReadonlyArray<ChatStreamEvent>) =>
  events.filter(
    (event): event is Extract<ChatStreamEvent, { _tag: "token" }> =>
      event._tag === "token",
  );

const untilTerminal = (
  chatId: Parameters<typeof subscribeTokens>[0],
  afterSeq?: number,
) =>
  subscribeTokens(chatId, afterSeq).pipe(
    Stream.takeUntil(
      (event) => event._tag === "done" || event._tag === "error",
    ),
    Stream.runCollect,
  );

const waitUntilIdle = (chatId: Parameters<typeof listMessages>[0]["chatId"]) =>
  Effect.gen(function* () {
    const db = yield* AppDb;
    for (let attempt = 0; attempt < 50; attempt++) {
      const row = yield* db.query.chats.findFirst({
        where: { id: chatId },
      });
      if (row !== undefined && row !== null && !row.generating) {
        return;
      }
      yield* Effect.sleep("20 millis");
    }
  });

const textPart = (text: string) => ({ _tag: "text" as const, text }) as const;

const emptyCatalogPage = new CatalogModelPage({
  models: [],
  hasMore: false,
  total: 0,
});

const OpenRouterMockLive = Layer.succeed(OpenRouterChat, {
  complete: () =>
    Effect.succeed(
      Stream.fromIterable(MOCK_TOKENS).pipe(
        Stream.mapEffect(
          (text) => Effect.sleep("25 millis").pipe(Effect.as(textPart(text))),
          { concurrency: 1 },
        ),
      ),
    ),
  listModels: () => Effect.succeed(emptyCatalogPage),
});

const TestLive = Layer.mergeAll(DurableStreamLive, OpenRouterMockLive).pipe(
  Layer.provideMerge(DbLive),
);

const RealOpenRouterLive = Layer.mergeAll(
  DurableStreamLive,
  OpenRouterChatLive,
).pipe(Layer.provideMerge(DbLive));

const waitUntilLive = Effect.sleep("150 millis");

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
    AppDb | DurableStream | OpenRouterChat | Scope.Scope
  >,
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(TestLive)));

const runReal = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    AppDb | DurableStream | OpenRouterChat | Scope.Scope
  >,
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.scoped, Effect.provide(RealOpenRouterLive)),
  );

const insertUser = (label: string) =>
  Effect.gen(function* () {
    const db = yield* AppDb;
    const userId = crypto.randomUUID();
    const email = `${label}-${userId}@chat.test`;
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
          const owned = yield* db.query.chats.findMany({
            where: { userId },
          });
          for (const chat of owned) {
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

const OpenRouterFailLive = Layer.succeed(OpenRouterChat, {
  complete: () =>
    Effect.succeed(
      Stream.make(textPart("Hel")).pipe(
        Stream.concat(
          Stream.fail(
            new AppError({
              code: "OPENROUTER",
              message: "upstream failed",
            }),
          ),
        ),
      ),
    ),
  listModels: () => Effect.succeed(emptyCatalogPage),
});

const FailLive = Layer.mergeAll(DurableStreamLive, OpenRouterFailLive).pipe(
  Layer.provideMerge(DbLive),
);

const runFail = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    AppDb | DurableStream | OpenRouterChat | Scope.Scope
  >,
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(FailLive)));

test("ChatList is empty for a new user", async () => {
  const listed = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("empty-list");
      return yield* asUser(session, listChats());
    }),
  );
  expect(listed).toEqual([]);
});

test("listModels returns a catalog page from OpenRouterChat", async () => {
  const page = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("models-list");
      return yield* asUser(
        session,
        listModels({ query: "  claude  ", offset: 0, outputModality: "text" }),
      );
    }),
  );
  expect(page.models).toEqual([]);
  expect(page.hasMore).toBe(false);
  expect(page.total).toBe(0);
});

test("listModels forwards outputModality to OpenRouterChat", async () => {
  const seen: Array<unknown> = [];
  const page = await Effect.runPromise(
    Effect.gen(function* () {
      const session = yield* insertUser("models-image");
      return yield* asUser(
        session,
        listModels({ outputModality: "image", offset: 0 }),
      );
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(
          DurableStreamLive,
          Layer.succeed(OpenRouterChat, {
            complete: () => Effect.succeed(Stream.empty),
            listModels: (options) => {
              seen.push(options);
              return Effect.succeed(emptyCatalogPage);
            },
          }),
        ).pipe(Layer.provideMerge(DbLive)),
      ),
    ),
  );

  expect(page.models).toEqual([]);
  expect(seen).toEqual([{ offset: 0, limit: 30, outputModality: "image" }]);
});

test("ChatCreate + ChatSend + ChatSubscribe receive mocked tokens", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("send-subscribe");
      const chat = yield* asUser(session, createChat());
      const listed = yield* asUser(session, listChats());
      const userMessage = yield* asUser(
        session,
        sendMessage({ chatId: chat.id, content: "hi" }),
      );
      const chunks = yield* asUser(
        session,
        subscribeTokens(chat.id, 0).pipe(
          Stream.filter((event) => event._tag === "token"),
          Stream.take(MOCK_TOKENS.length),
          Stream.runCollect,
        ),
      );
      const history = yield* asUser(session, listMessages({ chatId: chat.id }));
      const historyMessages = history.messages;
      const db = yield* AppDb;
      const events = yield* db.query.streamEvents.findMany({
        where: { streamId: chat.id },
        orderBy: { seq: "asc" },
      });
      return {
        chat,
        listed,
        userMessage,
        chunks,
        history: historyMessages,
        events,
      };
    }),
  );

  expect(result.listed.map((chat) => chat.id)).toEqual([result.chat.id]);
  expect(result.userMessage.role).toBe("user");
  expect(result.userMessage.content).toBe("hi");
  expect(result.chunks.map((chunk) => chunk.text)).toEqual([...MOCK_TOKENS]);
  expect(result.history.some((message) => message.content === "hi")).toBe(true);
  expect(result.events.length).toBeGreaterThanOrEqual(MOCK_TOKENS.length);
});

test("ChatSend broadcasts user, tokens, and done to two subscribers", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("two-subscribers");
      const chat = yield* asUser(session, createChat());
      const first = yield* asUser(
        session,
        untilTerminal(chat.id).pipe(Effect.forkChild),
      );
      const second = yield* asUser(
        session,
        untilTerminal(chat.id).pipe(Effect.forkChild),
      );
      yield* waitUntilLive;
      yield* asUser(session, sendMessage({ chatId: chat.id, content: "hi" }));
      const a = yield* Fiber.join(first);
      const b = yield* Fiber.join(second);
      return { a, b };
    }),
  );

  expect(result.a[0]?._tag).toBe("user");
  expect(result.b[0]?._tag).toBe("user");
  expect(tokens(result.a).map((event) => event.text)).toEqual([...MOCK_TOKENS]);
  expect(tokens(result.b).map((event) => event.text)).toEqual([...MOCK_TOKENS]);
  expect(result.a[result.a.length - 1]?._tag).toBe("done");
  expect(result.b[result.b.length - 1]?._tag).toBe("done");
});

test("mid-stream ChatMessages exposes generating inProgress and later tokens from headSeq", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("mid-stream-page");
      const chat = yield* asUser(session, createChat());
      const first = yield* asUser(
        session,
        subscribeTokens(chat.id, 0).pipe(
          Stream.filter((event) => event._tag === "token"),
          Stream.take(2),
          Stream.runCollect,
          Effect.forkChild,
        ),
      );
      yield* waitUntilLive;
      yield* asUser(session, sendMessage({ chatId: chat.id, content: "hi" }));
      const seen = yield* Fiber.join(first);
      const lastSeen = seen[seen.length - 1];
      if (lastSeen === undefined) {
        return yield* Effect.die("subscriber did not see tokens");
      }
      const page = yield* asUser(session, listMessages({ chatId: chat.id }));
      const laterEvents = yield* asUser(
        session,
        subscribeTokens(chat.id, page.headSeq).pipe(
          Stream.takeUntil(
            (event) => event._tag === "done" || event._tag === "error",
          ),
          Stream.runCollect,
        ),
      );
      return {
        seen,
        page,
        later: tokens(laterEvents),
        lastSeen,
      };
    }),
  );

  expect(result.page.generating).toBe(true);
  expect(result.page.inProgress).toBeDefined();
  expect(result.page.inProgress?.length).toBeGreaterThan(0);
  expect(result.page.headSeq).toBeGreaterThanOrEqual(result.lastSeen.seq);
  expect(result.later.length).toBeGreaterThan(0);
  expect(result.later.every((event) => event.seq > result.page.headSeq)).toBe(
    true,
  );
});

test("pageIsGenerating follows the open turn on the stream, not only chats.generating", () => {
  expect(
    pageIsGenerating({
      chatGenerating: true,
      hasJobs: false,
      eventsDesc: [
        { payload: { _tag: "title", title: "Hello from mock" } },
        { payload: { _tag: "done", message: {} } },
        { payload: { _tag: "token", text: "mock" } },
      ],
    }),
  ).toBe(false);
  expect(
    pageIsGenerating({
      chatGenerating: false,
      hasJobs: false,
      eventsDesc: [{ payload: { _tag: "token", text: "Hel" } }],
    }),
  ).toBe(true);
  expect(
    pageIsGenerating({
      chatGenerating: true,
      hasJobs: false,
      eventsDesc: [],
    }),
  ).toBe(true);
  expect(
    pageIsGenerating({
      chatGenerating: true,
      hasJobs: false,
      eventsDesc: [{ payload: { error: "upstream failed" } }],
    }),
  ).toBe(false);
});

test("after generation ChatMessages has the assistant and is idle", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("after-generation");
      const chat = yield* asUser(session, createChat());
      yield* asUser(session, sendMessage({ chatId: chat.id, content: "hi" }));
      const events = yield* asUser(session, untilTerminal(chat.id));
      const page = yield* asUser(session, listMessages({ chatId: chat.id }));
      return { events, page };
    }),
  );

  expect(result.events.some((event) => event._tag === "done")).toBe(true);
  expect(
    result.page.messages.some((message) => message.role === "assistant"),
  ).toBe(true);
  expect(result.page.generating).toBe(false);
  expect(result.page.inProgress).toBeUndefined();
});

test("second ChatSend while generating is VALIDATION", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("one-in-flight");
      const chat = yield* asUser(session, createChat());
      yield* asUser(
        session,
        sendMessage({ chatId: chat.id, content: "first" }),
      );
      return yield* asUser(
        session,
        sendMessage({ chatId: chat.id, content: "second" }),
      ).pipe(Effect.result);
    }),
  );

  expect(isCode(result, "VALIDATION")).toBe(true);
  expect(
    Result.isFailure(result) &&
      result.failure instanceof AppError &&
      result.failure.message,
  ).toBe("Already generating");
});

test("ChatSend unlocks generating if the user event cannot be appended", async () => {
  const FailAppendLive = Layer.succeed(DurableStream, {
    append: () => Schema.decodeUnknownEffect(StreamEvent)({}),
    subscribe: () => Stream.empty,
    runInto: () => Stream.empty,
  });
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const session = yield* insertUser("cas-unlock");
      const chat = yield* asUser(session, createChat());
      const sendResult = yield* asUser(
        session,
        sendMessage({ chatId: chat.id, content: "hi" }),
      ).pipe(Effect.result);
      const db = yield* AppDb;
      const row = yield* db.query.chats.findFirst({
        where: { id: chat.id },
      });
      return { sendResult, generating: row?.generating };
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(FailAppendLive, OpenRouterMockLive).pipe(
          Layer.provideMerge(DbLive),
        ),
      ),
    ),
  );

  expect(isCode(result.sendResult, "STREAM_GONE")).toBe(true);
  expect(result.generating).toBe(false);
});

test("ChatSubscribe(afterSeq=n) resumes from the ledger after disconnect", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("resume");
      const chat = yield* asUser(session, createChat());
      const first = yield* asUser(
        session,
        subscribeTokens(chat.id, 0).pipe(
          Stream.filter((event) => event._tag === "token"),
          Stream.take(2),
          Stream.runCollect,
          Effect.forkChild,
        ),
      );
      yield* waitUntilLive;
      yield* asUser(session, sendMessage({ chatId: chat.id, content: "hi" }));
      const seen = yield* Fiber.join(first);
      const afterSeq = seen[1]?.seq;
      if (afterSeq === undefined) {
        return yield* Effect.die("subscriber did not see 2 tokens");
      }
      const rest = yield* asUser(
        session,
        subscribeTokens(chat.id, afterSeq).pipe(
          Stream.filter((event) => event._tag === "token"),
          Stream.take(MOCK_TOKENS.length - 2),
          Stream.runCollect,
        ),
      );
      return { seen, rest };
    }),
  );

  expect(result.seen.map((chunk) => chunk.text)).toEqual([
    MOCK_TOKENS[0],
    MOCK_TOKENS[1],
  ]);
  expect(result.rest.map((chunk) => chunk.text)).toEqual([
    MOCK_TOKENS[2],
    MOCK_TOKENS[3],
    MOCK_TOKENS[4],
    MOCK_TOKENS[5],
  ]);
});

test("another user's chatId is NOT_FOUND", async () => {
  const result = await run(
    Effect.gen(function* () {
      const owner = yield* insertUser("owner");
      const stranger = yield* insertUser("stranger");
      const chat = yield* asUser(owner, createChat());
      const list = yield* asUser(stranger, listChats());
      const messagesResult = yield* asUser(
        stranger,
        listMessages({ chatId: chat.id }),
      ).pipe(Effect.result);
      const sendResult = yield* asUser(
        stranger,
        sendMessage({ chatId: chat.id, content: "nope" }),
      ).pipe(Effect.result);
      const subscribeResult = yield* asUser(
        stranger,
        subscribeTokens(chat.id).pipe(Stream.take(1), Stream.runCollect),
      ).pipe(Effect.result);
      return { list, messagesResult, sendResult, subscribeResult };
    }),
  );

  expect(result.list).toEqual([]);
  expect(isNotFound(result.messagesResult)).toBe(true);
  expect(isNotFound(result.sendResult)).toBe(true);
  expect(isNotFound(result.subscribeResult)).toBe(true);
});

test("ChatList without a session cookie is UNAUTHORIZED", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const middleware = yield* AuthMiddleware;
      return yield* middleware(
        listChats() as never,
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

test("ChatSubscribe emits an OPENROUTER error chunk when generation errors", async () => {
  const result = await runFail(
    Effect.gen(function* () {
      const session = yield* insertUser("openrouter-error");
      const chat = yield* asUser(session, createChat());
      const userMessage = yield* asUser(
        session,
        sendMessage({ chatId: chat.id, content: "hi" }),
      );
      const chunks = yield* asUser(session, untilTerminal(chat.id));
      const db = yield* AppDb;
      const events = yield* db.query.streamEvents.findMany({
        where: { streamId: chat.id },
        orderBy: { seq: "asc" },
      });
      return { userMessage, chunks, events };
    }),
  );

  expect(result.userMessage.content).toBe("hi");
  const tokenOrError = result.chunks.filter(
    (event) => event._tag === "token" || event._tag === "error",
  );
  expect(tokenOrError[0]?._tag).toBe("token");
  expect(
    tokenOrError[0]?._tag === "token" ? tokenOrError[0].text : undefined,
  ).toBe("Hel");
  expect(tokenOrError[1]?._tag).toBe("error");
  expect(
    tokenOrError[1]?._tag === "error" ? tokenOrError[1].error : undefined,
  ).toBe("upstream failed");
  expect(
    tokenOrError[1]?._tag === "error" ? tokenOrError[1].code : undefined,
  ).toBe("OPENROUTER");
  expect(result.chunks.some((event) => event._tag === "error")).toBe(true);
  expect(result.chunks.some((event) => event._tag === "done")).toBe(false);
  expect(
    result.events.some(
      (event) =>
        event.payload !== null &&
        typeof event.payload === "object" &&
        "error" in event.payload,
    ),
  ).toBe(true);
});

test("ChatMessages returns newest pages and older pages before a cursor", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("message-pages");
      const chat = yield* asUser(session, createChat());
      const db = yield* AppDb;
      const started = Date.UTC(2026, 0, 1, 0, 0, 0);
      for (let index = 0; index < 25; index++) {
        yield* db.insert(messages).values({
          chatId: chat.id,
          role: "user",
          content: `m-${index}`,
          createdAt: new Date(started + index * 60_000),
        });
      }
      const newest = yield* asUser(
        session,
        listMessages({ chatId: chat.id, limit: 10 }),
      );
      const oldestOnPage = newest.messages[0];
      if (oldestOnPage === undefined) {
        return yield* Effect.die("newest page was empty");
      }
      const older = yield* asUser(
        session,
        listMessages({
          chatId: chat.id,
          limit: 10,
          before: oldestOnPage.id,
        }),
      );
      const oldestOnOlder = older.messages[0];
      if (oldestOnOlder === undefined) {
        return yield* Effect.die("older page was empty");
      }
      const oldest = yield* asUser(
        session,
        listMessages({
          chatId: chat.id,
          limit: 10,
          before: oldestOnOlder.id,
        }),
      );
      const missing = yield* asUser(
        session,
        listMessages({
          chatId: chat.id,
          limit: 10,
          before: "00000000-0000-0000-0000-000000000000" as MessageId,
        }),
      );
      return { newest, older, oldest, missing };
    }),
  );

  expect(result.newest.messages.map((message) => message.content)).toEqual(
    Array.from({ length: 10 }, (_, index) => `m-${15 + index}`),
  );
  expect(result.newest.hasMore).toBe(true);
  expect(result.older.messages.map((message) => message.content)).toEqual(
    Array.from({ length: 10 }, (_, index) => `m-${5 + index}`),
  );
  expect(result.older.hasMore).toBe(true);
  expect(result.oldest.messages.map((message) => message.content)).toEqual(
    Array.from({ length: 5 }, (_, index) => `m-${index}`),
  );
  expect(result.oldest.hasMore).toBe(false);
  expect(result.missing.messages).toEqual([]);
  expect(result.missing.hasMore).toBe(false);
});

test("ChatSubscribe still delivers later tokens after a persisted OPENROUTER error", async () => {
  const texts = await runFail(
    Effect.gen(function* () {
      const session = yield* insertUser("openrouter-resume");
      const chat = yield* asUser(session, createChat());
      yield* asUser(session, sendMessage({ chatId: chat.id, content: "hi" }));
      yield* Effect.sleep("200 millis");
      const durable = yield* DurableStream;
      yield* durable.append(chat.id, "token", { text: "later" });
      const chunks = yield* asUser(
        session,
        subscribeTokens(chat.id, 0).pipe(
          Stream.filter((event) => event._tag === "token"),
          Stream.take(2),
          Stream.runCollect,
        ),
      );
      return tokens(chunks).map((event) => event.text);
    }),
  );

  expect(texts).toEqual(["Hel", "later"]);
});

test("first ChatSend names the chat from a summary and later sends do not", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("auto-title");
      const chat = yield* asUser(session, createChat());
      const titles = yield* asUser(
        session,
        subscribeTokens(chat.id, 0).pipe(
          Stream.filter((event) => event._tag === "title"),
          Stream.take(1),
          Stream.runCollect,
          Effect.forkChild,
        ),
      );
      yield* waitUntilLive;
      yield* asUser(session, sendMessage({ chatId: chat.id, content: "hi" }));
      const titleChunks = yield* Fiber.join(titles);
      const named = yield* asUser(session, listChats());
      yield* asUser(session, untilTerminal(chat.id));
      yield* asUser(session, waitUntilIdle(chat.id));
      yield* asUser(
        session,
        sendMessage({ chatId: chat.id, content: "second" }),
      );
      yield* Effect.sleep("250 millis");
      const afterSecond = yield* asUser(session, listChats());
      return { chat, named, titleChunks, afterSecond };
    }),
  );

  expect(result.chat.title).toBe("New chat");
  expect(result.chat.titleLocked).toBe(false);
  expect(result.named[0]?.title).toBe("Hello from mock");
  expect(result.named[0]?.titleLocked).toBe(false);
  expect(result.titleChunks[0]?.title).toBe("Hello from mock");
  expect(result.afterSecond[0]?.title).toBe("Hello from mock");
}, 15_000);

test("ChatRename locks the title so the first message cannot overwrite it", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("manual-title");
      const chat = yield* asUser(session, createChat());
      const renamed = yield* asUser(
        session,
        renameChat({ chatId: chat.id, title: "  My notes  " }),
      );
      yield* asUser(
        session,
        sendMessage({ chatId: chat.id, content: "please ignore this" }),
      );
      yield* Effect.sleep("250 millis");
      const listed = yield* asUser(session, listChats());
      const empty = yield* asUser(
        session,
        renameChat({ chatId: chat.id, title: "   " }),
      ).pipe(Effect.result);
      const stranger = yield* insertUser("rename-stranger");
      const stolen = yield* asUser(
        stranger,
        renameChat({ chatId: chat.id, title: "Nope" }),
      ).pipe(Effect.result);
      return { renamed, listed, empty, stolen };
    }),
  );

  expect(result.renamed.title).toBe("My notes");
  expect(result.renamed.titleLocked).toBe(true);
  expect(result.listed[0]?.title).toBe("My notes");
  expect(result.listed[0]?.titleLocked).toBe(true);
  expect(isCode(result.empty, "VALIDATION")).toBe(true);
  expect(isNotFound(result.stolen)).toBe(true);
});

test("ChatSend and ChatSetModel remember the selected model on the chat", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("remember-model");
      const created = yield* asUser(
        session,
        createChat({
          model: "openai/gpt-5.6-luna",
          effort: "high",
        }),
      );
      yield* asUser(
        session,
        sendMessage({
          chatId: created.id,
          content: "hi",
          model: "anthropic/claude-sonnet-4.6",
          effort: "low",
        }),
      );
      const afterSend = yield* asUser(session, listChats());
      const updated = yield* asUser(
        session,
        setChatModel({
          chatId: created.id,
          model: "google/gemini-2.5-pro",
          effort: "medium",
        }),
      );
      const afterSet = yield* asUser(session, listChats());
      const cleared = yield* asUser(
        session,
        setChatModel({
          chatId: created.id,
          model: "openai/gpt-4o-mini",
        }),
      );
      const empty = yield* asUser(
        session,
        setChatModel({ chatId: created.id, model: "   " }),
      ).pipe(Effect.result);
      const stranger = yield* insertUser("model-stranger");
      const stolen = yield* asUser(
        stranger,
        setChatModel({
          chatId: created.id,
          model: "openai/gpt-4o-mini",
        }),
      ).pipe(Effect.result);
      return {
        created,
        afterSend: afterSend[0],
        updated,
        afterSet: afterSet[0],
        cleared,
        empty,
        stolen,
      };
    }),
  );

  expect(result.created.model).toBe("openai/gpt-5.6-luna");
  expect(result.created.effort).toBe("high");
  expect(result.afterSend?.model).toBe("anthropic/claude-sonnet-4.6");
  expect(result.afterSend?.effort).toBe("low");
  expect(result.updated.model).toBe("google/gemini-2.5-pro");
  expect(result.updated.effort).toBe("medium");
  expect(result.afterSet?.model).toBe("google/gemini-2.5-pro");
  expect(result.cleared.model).toBe("openai/gpt-4o-mini");
  expect(result.cleared.effort).toBeUndefined();
  expect(isCode(result.empty, "VALIDATION")).toBe(true);
  expect(isNotFound(result.stolen)).toBe(true);
});

test("ChatList({ kind }) keeps chat kinds separate", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("chat-kind");
      const textChat = yield* asUser(session, createChat());
      const imageChat = yield* asUser(session, createChat({ kind: "image" }));
      const videoChat = yield* asUser(session, createChat({ kind: "video" }));
      const speechChat = yield* asUser(session, createChat({ kind: "speech" }));
      const audioChat = yield* asUser(session, createChat({ kind: "audio" }));
      const text = yield* asUser(session, listChats({ kind: "text" }));
      const images = yield* asUser(session, listChats({ kind: "image" }));
      const videos = yield* asUser(session, listChats({ kind: "video" }));
      const speech = yield* asUser(session, listChats({ kind: "speech" }));
      const audio = yield* asUser(session, listChats({ kind: "audio" }));
      return {
        textChat,
        imageChat,
        videoChat,
        speechChat,
        audioChat,
        text,
        images,
        videos,
        speech,
        audio,
      };
    }),
  );

  expect(result.textChat.kind).toBe("text");
  expect(result.imageChat.kind).toBe("image");
  expect(result.videoChat.kind).toBe("video");
  expect(result.speechChat.kind).toBe("speech");
  expect(result.audioChat.kind).toBe("audio");
  expect(result.text.map((chat) => chat.id)).toEqual([result.textChat.id]);
  expect(result.images.map((chat) => chat.id)).toEqual([result.imageChat.id]);
  expect(result.videos.map((chat) => chat.id)).toEqual([result.videoChat.id]);
  expect(result.speech.map((chat) => chat.id)).toEqual([result.speechChat.id]);
  expect(result.audio.map((chat) => chat.id)).toEqual([result.audioChat.id]);
});

(hasRealOpenRouterKey ? test : test.skip)(
  "ChatSend + ChatSubscribe receive at least one real OpenRouter token",
  async () => {
    const chunks = await runReal(
      Effect.gen(function* () {
        const session = yield* insertUser("real-openrouter");
        const chat = yield* asUser(session, createChat());
        yield* asUser(
          session,
          sendMessage({ chatId: chat.id, content: "Reply with the word hi." }),
        );
        return yield* asUser(
          session,
          subscribeTokens(chat.id, 0).pipe(
            Stream.filter((event) => event._tag === "token"),
            Stream.take(1),
            Stream.runCollect,
          ),
        );
      }),
    );
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.text.length).toBeGreaterThan(0);
  },
  30_000,
);
