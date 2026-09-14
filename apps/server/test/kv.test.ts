import { expect, test } from "bun:test";
import { kv } from "@openrouter-mobile/db";
import { eq } from "drizzle-orm";
import { Effect, type Scope } from "effect";
import { AppDb, DbLive } from "../src/shared/db";
import { getOrCreateKv } from "../src/shared/kv";

if (process.env.DATABASE_URL === undefined) {
  process.env.DATABASE_URL =
    "postgres://openrouter:openrouter@localhost:5432/openrouter";
}

const run = <A, E>(
  effect: Effect.Effect<A, E, AppDb | Scope.Scope>,
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(DbLive)));

test("getOrCreateKv generates once and reuses the stored value", async () => {
  const key = `test:kv:${crypto.randomUUID()}`;
  const created = await run(
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          const db = yield* AppDb;
          yield* db.delete(kv).where(eq(kv.key, key));
        }).pipe(Effect.ignore),
      );
      const first = yield* getOrCreateKv(
        key,
        () => "first-value-at-least-32-chars-ok",
      );
      const second = yield* getOrCreateKv(
        key,
        () => "second-value-should-not-be-used",
      );
      return { first, second };
    }),
  );

  expect(created.first).toBe("first-value-at-least-32-chars-ok");
  expect(created.second).toBe("first-value-at-least-32-chars-ok");
});
