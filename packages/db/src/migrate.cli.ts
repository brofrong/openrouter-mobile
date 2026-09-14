import { migrateWithUrl } from "./migrate";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://openrouter:openrouter@localhost:5432/openrouter";

await migrateWithUrl(databaseUrl);
