import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("mobile depends on expo-web-browser for native SSO", () => {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dir, "../../package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  expect(pkg.dependencies?.["expo-web-browser"]).toBeDefined();
});
