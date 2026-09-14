import { join } from "node:path";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as migratePostgresJs } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const migrationsFolder = join(import.meta.dir, "../drizzle");

export const migrateEffect = (
  db: Parameters<typeof migrate>[0],
): ReturnType<typeof migrate> => migrate(db, { migrationsFolder });

export const migrateWithUrl = async (url: string): Promise<void> => {
  const client = postgres(url, { max: 1 });
  try {
    await migratePostgresJs(drizzle({ client }), { migrationsFolder });
  } finally {
    await client.end({ timeout: 5 });
  }
};
