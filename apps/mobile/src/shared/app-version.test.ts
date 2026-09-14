import { expect, test } from "bun:test";
import { formatAppVersion } from "./app-version";

test("formatAppVersion uses the given semver", () => {
  expect(formatAppVersion("1.4.0")).toBe("Version 1.4.0");
});

test("formatAppVersion falls back when version is missing", () => {
  expect(formatAppVersion(undefined)).toBe("Version 0.0.0");
  expect(formatAppVersion("")).toBe("Version 0.0.0");
  expect(formatAppVersion("   ")).toBe("Version 0.0.0");
});
