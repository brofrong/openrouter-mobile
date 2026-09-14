import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_PACKAGE_NAME = "openrouter-mobile";

export const parseEnvFile = (source: string): Record<string, string> => {
  const parsed: Record<string, string> = {};
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
};

export const fillMissingEnv = (
  env: Record<string, string | undefined>,
  parsed: Record<string, string>,
): void => {
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
};

export const findRepoRoot = (startDir: string): string | undefined => {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const parsed = JSON.parse(readFileSync(pkgPath, "utf8")) as {
          name?: string;
        };
        if (parsed.name === REPO_PACKAGE_NAME) {
          return dir;
        }
      } catch {
        // keep walking if package.json is unreadable
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
};

const loadEnvFile = (
  filePath: string,
  env: Record<string, string | undefined>,
): void => {
  if (!existsSync(filePath)) {
    return;
  }
  fillMissingEnv(env, parseEnvFile(readFileSync(filePath, "utf8")));
};

export const loadRepoEnv = (
  env: Record<string, string | undefined> = process.env,
  startDirs: readonly string[] = [
    process.cwd(),
    path.dirname(fileURLToPath(import.meta.url)),
  ],
): void => {
  const seen = new Set<string>();
  for (const start of startDirs) {
    const root = findRepoRoot(start);
    if (root === undefined || seen.has(root)) {
      continue;
    }
    seen.add(root);
    loadEnvFile(path.join(root, ".env"), env);
  }
};
