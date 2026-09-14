import { expect, test } from "bun:test";
import { nextVersion, parseArgs, parseSemver } from "./bump-version";

test("parseSemver splits X.Y.Z", () => {
  expect(parseSemver("1.4.9")).toEqual({ major: 1, minor: 4, patch: 9 });
});

test("nextVersion bumps patch by default via spec", () => {
  expect(nextVersion("0.0.0", "patch")).toBe("0.0.1");
  expect(nextVersion("1.2.3", "minor")).toBe("1.3.0");
  expect(nextVersion("1.2.3", "major")).toBe("2.0.0");
});

test("nextVersion accepts an explicit greater semver", () => {
  expect(nextVersion("0.1.0", "0.2.0")).toBe("0.2.0");
});

test("nextVersion rejects unknown spec and non-increasing versions", () => {
  expect(() => nextVersion("1.0.0", "alpha")).toThrow(/Unknown bump spec/);
  expect(() => nextVersion("1.0.0", "1.0.0")).toThrow(/must be greater/);
  expect(() => nextVersion("1.2.0", "1.1.9")).toThrow(/must be greater/);
});

test("parseArgs reads bump spec and --push", () => {
  expect(parseArgs([])).toEqual({ spec: "patch", push: false });
  expect(parseArgs(["minor"])).toEqual({ spec: "minor", push: false });
  expect(parseArgs(["--push", "major"])).toEqual({
    spec: "major",
    push: true,
  });
  expect(parseArgs(["--", "1.4.0", "--push"])).toEqual({
    spec: "1.4.0",
    push: true,
  });
});
