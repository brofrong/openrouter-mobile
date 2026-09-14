import { expect, test } from "bun:test";
import { userInitials } from "./initials";

test("userInitials uses the first letters of two name words", () => {
  expect(userInitials("Ada Lovelace", "ada@example.com")).toBe("AL");
});

test("userInitials uses the first two letters of a single name", () => {
  expect(userInitials("Ada", "ada@example.com")).toBe("AD");
});

test("userInitials falls back to the email when the name is empty", () => {
  expect(userInitials("  ", "ada@example.com")).toBe("AD");
  expect(userInitials("", "")).toBe("?");
});
