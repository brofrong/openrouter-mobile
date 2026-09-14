import { expect, test } from "bun:test";
import {
  chats,
  messages,
  streamEvents,
  usageEvents,
  user,
} from "@openrouter-mobile/db";
import { CatalogModelPage } from "@openrouter-mobile/domain";
import { eq } from "drizzle-orm";
import { Effect, Layer, type Scope, Stream } from "effect";
import { createChat, sendMessage } from "../src/features/chat/ChatLive";
import { OpenRouterChat } from "../src/features/chat/OpenRouterChat";
import type { DurableStream } from "../src/features/durable-stream/DurableStream";
import { DurableStreamLive } from "../src/features/durable-stream/DurableStreamLive";
import { summarizeUsage } from "../src/features/usage/UsageLive";
import { CurrentSession } from "../src/shared/AuthMiddleware";
import type { Session } from "../src/shared/auth";
import { AppDb, DbLive } from "../src/shared/db";

if (process.env.DATABASE_URL === undefined) {
  process.env.DATABASE_URL =
    "postgres://openrouter:openrouter@localhost:5432/openrouter";
}

const OpenRouterUsageMockLive = Layer.succeed(OpenRouterChat, {
  complete: () =>
    Effect.succeed(
      Stream.fromIterable([
        { _tag: "text" as const, text: "Hi" },
        {
          _tag: "usage" as const,
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
            costUsd: 0.0012,
          },
        },
      ]),
    ),
  listModels: () =>
    Effect.succeed(
      new CatalogModelPage({ models: [], hasMore: false, total: 0 }),
    ),
});

const TestLive = Layer.mergeAll(
  DurableStreamLive,
  OpenRouterUsageMockLive,
).pipe(Layer.provideMerge(DbLive));

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

const insertUser = (label: string) =>
  Effect.gen(function* () {
    const db = yield* AppDb;
    const userId = crypto.randomUUID();
    const email = `${label}-${userId}@usage.test`;
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
          yield* db.delete(usageEvents).where(eq(usageEvents.userId, userId));
          yield* db.delete(user).where(eq(user.id, userId));
        }),
      ),
    );
    return session;
  });

const asUser = <A, E, R>(session: Session, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(CurrentSession, session));

test("UsageSummary is zero for a new user", async () => {
  const summary = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("empty-usage");
      return yield* asUser(session, summarizeUsage("30d"));
    }),
  );

  expect(summary.current.promptTokens).toBe(0);
  expect(summary.current.completionTokens).toBe(0);
  expect(summary.current.totalTokens).toBe(0);
  expect(summary.current.costUsd).toBe(0);
  expect(summary.bySource).toHaveLength(5);
});

test("ChatSend records OpenRouter usage for the current user", async () => {
  const summary = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("chat-usage");
      const chat = yield* asUser(session, createChat());
      yield* asUser(session, sendMessage({ chatId: chat.id, content: "hi" }));
      yield* Effect.sleep("200 millis");
      return yield* asUser(session, summarizeUsage("all"));
    }),
  );

  expect(summary.current.promptTokens).toBe(20);
  expect(summary.current.completionTokens).toBe(10);
  expect(summary.current.totalTokens).toBe(30);
  expect(summary.current.costUsd).toBeCloseTo(0.0024);
  expect(summary.current.requestCount).toBe(2);
});
