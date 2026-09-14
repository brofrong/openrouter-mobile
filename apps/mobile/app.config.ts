import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ConfigContext, ExpoConfig } from "expo/config";

const DEFAULT_BASE_URL = "http://localhost:3000";

const loadEnvFile = (filePath: string) => {
  if (!existsSync(filePath)) {
    return;
  }
  const source = readFileSync(filePath, "utf8");
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
    if (process.env[key] !== undefined) {
      continue;
    }
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
};

const cwd = process.cwd();
loadEnvFile(path.resolve(cwd, ".env"));
loadEnvFile(path.resolve(cwd, "../../.env"));

const readRootVersion = (): string | undefined => {
  const candidates = [
    path.resolve(cwd, "package.json"),
    path.resolve(cwd, "../../package.json"),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    const parsed = JSON.parse(readFileSync(candidate, "utf8")) as {
      name?: string;
      version?: string;
    };
    if (parsed.name === "openrouter-mobile" && parsed.version) {
      return parsed.version;
    }
  }
  return undefined;
};

const toAndroidVersionCode = (version: string): number => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return 1;
  }
  return Number(match[1]) * 10_000 + Number(match[2]) * 100 + Number(match[3]);
};

const baseUrl = (
  process.env.EXPO_PUBLIC_BASE_URL ??
  process.env.BASE_URL ??
  DEFAULT_BASE_URL
).replace(/\/+$/, "");

process.env.EXPO_PUBLIC_BASE_URL = baseUrl;

const appVersion = readRootVersion() ?? "0.0.0";

export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    version: appVersion,
    android: {
      ...config.android,
      versionCode: toAndroidVersionCode(appVersion),
    },
    extra: {
      ...config.extra,
      baseUrl,
    },
  }) as ExpoConfig;
