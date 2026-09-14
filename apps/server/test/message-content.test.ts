import { expect, test } from "bun:test";
import {
  decodeStoredContent,
  encodeStoredContent,
} from "@openrouter-mobile/domain";

test("encodeStoredContent keeps plain text when there are no images", () => {
  expect(encodeStoredContent("hello", [])).toBe("hello");
});

test("decodeStoredContent reads encoded images and leaves old messages as text", () => {
  expect(decodeStoredContent("hello")).toEqual({ text: "hello", images: [] });
  expect(
    decodeStoredContent(
      encodeStoredContent("edit this", ["data:image/png;base64,abc"]),
    ),
  ).toEqual({
    text: "edit this",
    images: ["data:image/png;base64,abc"],
  });
});
