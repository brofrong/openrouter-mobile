import { expect, test } from "bun:test";
import { ConfigProvider, Effect } from "effect";
import { trimTrailingSlash } from "../src/shared/baseUrl";
import { AppConfig } from "../src/shared/config";
import { corsAllowedOrigins, makeTrustedOrigins } from "../src/shared/origins";

const parseConfig = (env: Record<string, string>) =>
  Effect.runSync(
    AppConfig.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown(env),
      ),
    ),
  );

test("trims trailing slashes from BASE_URL", () => {
  expect(trimTrailingSlash("https://openrouter.brofrong.ru/")).toBe(
    "https://openrouter.brofrong.ru",
  );
});

test("AppConfig.baseUrl prefers BASE_URL over legacy BETTER_AUTH_URL", () => {
  expect(
    parseConfig({
      BASE_URL: "https://openrouter.brofrong.ru/",
      BETTER_AUTH_URL: "http://localhost:3000",
    }).baseUrl,
  ).toBe("https://openrouter.brofrong.ru");
});

test("AppConfig.baseUrl falls back to BETTER_AUTH_URL", () => {
  expect(
    parseConfig({
      BETTER_AUTH_URL: "https://legacy.example/",
    }).baseUrl,
  ).toBe("https://legacy.example");
});

test("trustedOrigins include the public BASE_URL", () => {
  const origins = makeTrustedOrigins("https://openrouter.brofrong.ru/");
  expect(origins).toContain("https://openrouter.brofrong.ru");
  expect(origins).toContain("openrouter-mobile://");
});

test("corsAllowedOrigins include extra localhost Expo ports", () => {
  expect(corsAllowedOrigins).toContain("http://localhost:8081");
  expect(corsAllowedOrigins).toContain("http://localhost:8086");
});
