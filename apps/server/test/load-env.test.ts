import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  fillMissingEnv,
  findRepoRoot,
  loadRepoEnv,
  parseEnvFile,
} from "../src/shared/loadEnv";

test("parseEnvFile skips comments, blanks, and quoted values", () => {
  expect(
    parseEnvFile(`
# comment
BASE_URL=http://localhost:3000
OIDC_ISSUER="https://sso.example.com"
EMPTY=
`),
  ).toEqual({
    BASE_URL: "http://localhost:3000",
    OIDC_ISSUER: "https://sso.example.com",
    EMPTY: "",
  });
});

test("fillMissingEnv does not override keys that are already set", () => {
  const env: Record<string, string | undefined> = {
    BASE_URL: "http://localhost:3000",
  };
  fillMissingEnv(env, {
    BASE_URL: "http://localhost:3030",
    OIDC_ISSUER: "https://sso.example.com",
  });
  expect(env).toEqual({
    BASE_URL: "http://localhost:3000",
    OIDC_ISSUER: "https://sso.example.com",
  });
});

test("findRepoRoot walks up to the workspace package.json", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openrouter-env-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "openrouter-mobile" }),
  );
  const nested = path.join(root, "apps", "server", "src");
  mkdirSync(nested, { recursive: true });
  expect(findRepoRoot(nested)).toBe(root);
});

test("loadRepoEnv fills OIDC from the repo-root .env without overriding local keys", () => {
  const root = mkdtempSync(path.join(tmpdir(), "openrouter-env-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "openrouter-mobile" }),
  );
  writeFileSync(
    path.join(root, ".env"),
    "BASE_URL=http://localhost:3030\nOIDC_ISSUER=https://sso.example.com\n",
  );
  const nested = path.join(root, "apps", "server", "src");
  mkdirSync(nested, { recursive: true });
  const env: Record<string, string | undefined> = {
    BASE_URL: "http://localhost:3000",
  };
  loadRepoEnv(env, [nested]);
  expect(env.BASE_URL).toBe("http://localhost:3000");
  expect(env.OIDC_ISSUER).toBe("https://sso.example.com");
});
