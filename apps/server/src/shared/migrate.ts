import { migrateEffect } from "@openrouter-mobile/db/migrate";
import { Effect } from "effect";
import { AppDb } from "./db";

export const applyMigrations = Effect.gen(function* () {
  const db = yield* AppDb;
  yield* Effect.log("Applying database migrations");
  yield* migrateEffect(db);
  yield* Effect.log("Database migrations applied");
});
