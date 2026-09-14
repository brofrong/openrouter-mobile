import { kv } from "@openrouter-mobile/db";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { AppDb } from "./db";

const kvFailed = (error: unknown) =>
  new Error(
    error instanceof Error ? error.message : "Failed to read key-value store",
  );

export const getOrCreateKv = (
  key: string,
  create: () => string,
): Effect.Effect<string, Error, AppDb> =>
  Effect.gen(function* () {
    const db = yield* AppDb;
    const existing = yield* db
      .select({ value: kv.value })
      .from(kv)
      .where(eq(kv.key, key))
      .pipe(Effect.mapError(kvFailed));
    const found = existing[0];
    if (found !== undefined) {
      return found.value;
    }

    const value = create();
    const inserted = yield* db
      .insert(kv)
      .values({ key, value })
      .onConflictDoNothing({ target: kv.key })
      .returning({ value: kv.value })
      .pipe(Effect.mapError(kvFailed));
    const created = inserted[0];
    if (created !== undefined) {
      return created.value;
    }

    const raced = yield* db
      .select({ value: kv.value })
      .from(kv)
      .where(eq(kv.key, key))
      .pipe(Effect.mapError(kvFailed));
    const winner = raced[0];
    if (winner === undefined) {
      return yield* Effect.fail(new Error(`Missing kv value for ${key}`));
    }
    return winner.value;
  });
