import { expect, test } from "bun:test";
import { nextMarkdownSessionOp } from "./markdown-session-op";

test("nextMarkdownSessionOp is a noop when content is unchanged", () => {
  expect(nextMarkdownSessionOp("Hello", "Hello")).toEqual({ type: "noop" });
});

test("nextMarkdownSessionOp appends when the next string only grows the previous", () => {
  expect(nextMarkdownSessionOp("Hello", "Hello **world**")).toEqual({
    type: "append",
    text: " **world**",
  });
});

test("nextMarkdownSessionOp resets on the first chunk and on a non-prefix change", () => {
  expect(nextMarkdownSessionOp("", "# Hi")).toEqual({
    type: "reset",
    text: "# Hi",
  });
  expect(nextMarkdownSessionOp("Hello", "Hi")).toEqual({
    type: "reset",
    text: "Hi",
  });
});
