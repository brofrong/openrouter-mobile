import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { relations } from "./relations";

/**
 * Classic Drizzle Postgres client for Better Auth.
 * The Effect `PgDrizzle` service is not accepted by `@better-auth/drizzle-adapter`.
 * postgres.js is used instead of `drizzle-orm/bun-sql` so `bun x auth generate`
 * can load this module under Node.
 */
export const createAuthDb = (url: string) => {
  const client = postgres(url);
  return drizzle({ client, relations });
};
