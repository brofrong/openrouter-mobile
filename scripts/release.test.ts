import { expect, test } from "bun:test";
import {
  formatBumpMenu,
  nextVersion,
  parseReleaseArg,
  parseSemver,
  promptBumpKind,
  resolveBumpKind,
} from "./release";

test("parseSemver splits X.Y.Z", () => {
  expect(parseSemver("1.4.9")).toEqual({ major: 1, minor: 4, patch: 9 });
});

test("nextVersion bumps major, minor, and bugfix", () => {
  expect(nextVersion("1.2.3", "bugfix")).toBe("1.2.4");
  expect(nextVersion("1.2.3", "minor")).toBe("1.3.0");
  expect(nextVersion("1.2.3", "major")).toBe("2.0.0");
});

test("parseReleaseArg takes the first bump kind", () => {
  expect(parseReleaseArg([])).toBeUndefined();
  expect(parseReleaseArg(["minor"])).toBe("minor");
  expect(parseReleaseArg(["--", "bugfix"])).toBe("bugfix");
});

test("resolveBumpKind accepts names, numbers, and patch alias", () => {
  expect(resolveBumpKind("major")).toBe("major");
  expect(resolveBumpKind("1")).toBe("major");
  expect(resolveBumpKind("minor")).toBe("minor");
  expect(resolveBumpKind("2")).toBe("minor");
  expect(resolveBumpKind("bugfix")).toBe("bugfix");
  expect(resolveBumpKind("3")).toBe("bugfix");
  expect(resolveBumpKind("patch")).toBe("bugfix");
  expect(() => resolveBumpKind("alpha")).toThrow(/Unknown bump/);
});

test("promptBumpKind maps menu answers", () => {
  expect(promptBumpKind("0.1.0", () => "2")).toBe("minor");
  expect(promptBumpKind("0.1.0", () => "bugfix")).toBe("bugfix");
  expect(() => promptBumpKind("0.1.0", () => null)).toThrow(/cancelled/);
  expect(() => promptBumpKind("0.1.0", () => "  ")).toThrow(/cancelled/);
});

test("formatBumpMenu lists the three choices", () => {
  const menu = formatBumpMenu("0.1.0");
  expect(menu).toContain("1) major");
  expect(menu).toContain("0.1.0 → 1.0.0");
  expect(menu).toContain("2) minor");
  expect(menu).toContain("0.1.0 → 0.2.0");
  expect(menu).toContain("3) bugfix");
  expect(menu).toContain("0.1.0 → 0.1.1");
});
