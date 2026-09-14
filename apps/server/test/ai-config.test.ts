import { expect, test } from "bun:test";
import { user, userAiConfigs } from "@openrouter-mobile/db";
import { eq } from "drizzle-orm";
import { Effect, type Scope } from "effect";
import {
  getAiConfig,
  setAiConfigModel,
} from "../src/features/ai-config/AiConfigLive";
import { CurrentSession } from "../src/shared/AuthMiddleware";
import type { Session } from "../src/shared/auth";
import { AppDb, DbLive } from "../src/shared/db";

if (process.env.DATABASE_URL === undefined) {
  process.env.DATABASE_URL =
    "postgres://openrouter:openrouter@localhost:5432/openrouter";
}

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
  effect: Effect.Effect<A, E, AppDb | Scope.Scope>,
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(DbLive)));

const insertUser = (label: string) =>
  Effect.gen(function* () {
    const db = yield* AppDb;
    const userId = crypto.randomUUID();
    const email = `${label}-${userId}@ai-config.test`;
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
          yield* db
            .delete(userAiConfigs)
            .where(eq(userAiConfigs.userId, userId));
          yield* db.delete(user).where(eq(user.id, userId));
        }),
      ),
    );
    return session;
  });

const asUser = <A, E, R>(session: Session, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(CurrentSession, session));

test("AiConfigGet is empty for a new user", async () => {
  const config = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("empty-ai-config");
      return yield* asUser(session, getAiConfig());
    }),
  );

  expect(config.text).toBeUndefined();
  expect(config.image).toBeUndefined();
  expect(config.video).toBeUndefined();
  expect(config.speech).toBeUndefined();
  expect(config.audio).toBeUndefined();
});

test("AiConfigSet stores a default per category", async () => {
  const config = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("set-ai-config");
      yield* asUser(
        session,
        setAiConfigModel("text", "anthropic/claude-sonnet-4.6"),
      );
      yield* asUser(
        session,
        setAiConfigModel("image", "google/gemini-3.1-flash-image"),
      );
      return yield* asUser(session, getAiConfig());
    }),
  );

  expect(config.text).toBe("anthropic/claude-sonnet-4.6");
  expect(config.image).toBe("google/gemini-3.1-flash-image");
  expect(config.video).toBeUndefined();
});

test("AiConfigSet rejects an empty model", async () => {
  const result = await run(
    Effect.gen(function* () {
      const session = yield* insertUser("empty-model");
      return yield* asUser(
        session,
        setAiConfigModel("video", "   ").pipe(Effect.flip),
      );
    }),
  );

  expect(result._tag).toBe("AppError");
  expect(result.code).toBe("VALIDATION");
});
