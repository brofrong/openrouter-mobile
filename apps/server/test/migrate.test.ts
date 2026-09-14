import { expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { migrationsFolder } from "@openrouter-mobile/db/migrate";

test("drizzle SQL migrations exist for runtime migrate()", () => {
  expect(existsSync(migrationsFolder)).toBe(true);
  const sqlFiles = readdirSync(migrationsFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsFolder, entry.name, "migration.sql"))
    .filter((path) => existsSync(path));
  expect(sqlFiles.length).toBeGreaterThan(0);
});
