import { expect, test } from "bun:test";
import { chats, messages, streamEvents, user } from "@openrouter-mobile/db";
import { AppError } from "@openrouter-mobile/domain";
import { eq } from "drizzle-orm";
import { Effect, Fiber, Layer, Result, type Scope, Stream } from "effect";
import {
  createChat,
  listChats,
  listMessages,
  sendMessage,
  subscribeTokens,
} from "../src/features/chat/ChatLive";
import {
  OpenRouterChat,
  OpenRouterChatLive,
} from "../src/features/chat/OpenRouterChat";
import type { DurableStream } from "../src/features/durable-stream/DurableStream";
import { DurableStreamLive } from "../src/features/durable-stream/DurableStreamLive";
import {
  AuthMiddleware,
  AuthMiddlewareLive,
  CurrentSession,
} from "../src/shared/AuthMiddleware";
import type { Session } from "../src/shared/auth";
import { AppDb, DbLive } from "../src/shared/db";
import { isUsableOpenRouterKeyValue } from "../src/shared/openrouter";

if (process.env.DATABASE_URL === undefined) {
  process.env.DATABASE_URL =
    "postgres://openrouter:openrouter@localhost:5432/openrouter";
}
if (process.env.BETTER_AUTH_SECRET === undefined) {
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-chars-long";
}

const MOCK_TOKENS = ["Hel", "lo", " ", "from", " ", "mock"] as const;
const hasRealOpenRouterKey = isUsableOpenRouterKeyValue(
  process.env.OPENROUTER_API_KEY ?? "",
);

const OpenRouterMockLive = Layer.succeed(OpenRouterChat, {
  complete: () =>
    Effect.succeed(
      Stream.fromIterable(MOCK_TOKENS).pipe(
        Stream.mapEffect(
          (text) => Effect.sleep("25 millis").pipe(Effect.as(text)),
          { concurrency: 1 },
        ),
      ),
    ),
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
      Stream.make("Hel").pipe(
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
      return yield* asUser(session, listChats);
    }),
  );
  expect(listed).toEqual([]);
});

test("ChatCreate + ChatSend + ChatSubscribe receive mocked tokens", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("send-subscribe");
      const chat = yield* asUser(session, createChat);
      const listed = yield* asUser(session, listChats);
      const userMessage = yield* asUser(
        session,
        sendMessage({ chatId: chat.id, content: "hi" }),
      );
      const chunks = yield* asUser(
        session,
        subscribeTokens(chat.id, 0).pipe(
          Stream.take(MOCK_TOKENS.length),
          Stream.runCollect,
        ),
      );
      const history = yield* asUser(session, listMessages({ chatId: chat.id }));
      const db = yield* AppDb;
      const events = yield* db.query.streamEvents.findMany({
        where: { streamId: chat.id },
        orderBy: { seq: "asc" },
      });
      return { chat, listed, userMessage, chunks, history, events };
    }),
  );

  expect(result.listed.map((chat) => chat.id)).toEqual([result.chat.id]);
  expect(result.userMessage.role).toBe("user");
  expect(result.userMessage.content).toBe("hi");
  expect(result.chunks.map((chunk) => chunk.text)).toEqual([...MOCK_TOKENS]);
  expect(result.history.some((message) => message.content === "hi")).toBe(true);
  expect(result.events.length).toBeGreaterThanOrEqual(MOCK_TOKENS.length);
});

test("ChatSubscribe(afterSeq=n) resumes from the ledger after disconnect", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("resume");
      const chat = yield* asUser(session, createChat);
      const first = yield* asUser(
        session,
        subscribeTokens(chat.id, 0).pipe(
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
      const chat = yield* asUser(owner, createChat);
      const list = yield* asUser(stranger, listChats);
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
        listChats as never,
        {
          headers: {},
        } as never,
      ).pipe(Effect.result);
    }).pipe(Effect.scoped, Effect.provide(AuthMiddlewareLive)),
  );

  expect(isCode(result, "UNAUTHORIZED")).toBe(true);
});

test("ChatSubscribe fails with OPENROUTER when generation errors", async () => {
  const result = await runFail(
    Effect.gen(function* () {
      const session = yield* insertUser("openrouter-error");
      const chat = yield* asUser(session, createChat);
      const userMessage = yield* asUser(
        session,
        sendMessage({ chatId: chat.id, content: "hi" }),
      );
      const seen: Array<string> = [];
      const subscribeResult = yield* asUser(
        session,
        subscribeTokens(chat.id, 0).pipe(
          Stream.tap((chunk) => Effect.sync(() => seen.push(chunk.text))),
          Stream.runCollect,
        ),
      ).pipe(Effect.timeout("2 seconds"), Effect.result);
      const db = yield* AppDb;
      const events = yield* db.query.streamEvents.findMany({
        where: { streamId: chat.id },
        orderBy: { seq: "asc" },
      });
      return { userMessage, seen, subscribeResult, events };
    }),
  );

  expect(result.userMessage.content).toBe("hi");
  expect(result.seen).toEqual(["Hel"]);
  expect(isCode(result.subscribeResult, "OPENROUTER")).toBe(true);
  expect(
    result.events.some(
      (event) =>
        event.payload !== null &&
        typeof event.payload === "object" &&
        "error" in event.payload,
    ),
  ).toBe(true);
});

(hasRealOpenRouterKey ? test : test.skip)(
  "ChatSend + ChatSubscribe receive at least one real OpenRouter token",
  async () => {
    const chunks = await runReal(
      Effect.gen(function* () {
        const session = yield* insertUser("real-openrouter");
        const chat = yield* asUser(session, createChat);
        yield* asUser(
          session,
          sendMessage({ chatId: chat.id, content: "Reply with the word hi." }),
        );
        return yield* asUser(
          session,
          subscribeTokens(chat.id, 0).pipe(Stream.take(1), Stream.runCollect),
        );
      }),
    );
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.text.length).toBeGreaterThan(0);
  },
  30_000,
);
