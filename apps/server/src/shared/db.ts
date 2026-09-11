import { PgClient } from "@effect/sql-pg";
import { relations } from "@openrouter-mobile/db";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { Context, Effect, Layer } from "effect";
import { AppConfig } from "./config";

export class AppDb extends Context.Service<
  AppDb,
  PgDrizzle.EffectPgDatabase<typeof relations> & { $client: PgClient.PgClient }
>()("@openrouter-mobile/server/AppDb") {}

const PgLive = Layer.unwrap(
  Effect.map(AppConfig, ({ databaseUrl }) =>
    PgClient.layer({ url: databaseUrl }),
  ),
);

export const DbLive = Layer.effect(
  AppDb,
  PgDrizzle.makeWithDefaults({ relations }),
).pipe(Layer.provide(PgLive));
