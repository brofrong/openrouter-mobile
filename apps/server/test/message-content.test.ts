import { expect, test } from "bun:test";
import {
  decodeStoredContent,
  encodeStoredContent,
  isVideoUrl,
} from "@openrouter-mobile/domain";

test("encodeStoredContent keeps plain text when there are no images", () => {
  expect(encodeStoredContent("hello", [])).toBe("hello");
});

test("decodeStoredContent reads encoded images and leaves old messages as text", () => {
  expect(decodeStoredContent("hello")).toEqual({
    text: "hello",
    images: [],
    files: [],
  });
  expect(
    decodeStoredContent(
      encodeStoredContent("edit this", ["data:image/png;base64,abc"]),
    ),
  ).toEqual({
    text: "edit this",
    images: ["data:image/png;base64,abc"],
    files: [],
  });
});

test("isVideoUrl detects video data URLs and file extensions", () => {
  expect(isVideoUrl("data:video/mp4;base64,aaa")).toBe(true);
  expect(isVideoUrl("http://localhost:3000/media/u/clip.mp4")).toBe(true);
  expect(isVideoUrl("hello")).toBe(false);
  expect(isVideoUrl("http://localhost:3000/media/u/pic.png")).toBe(false);
});

test("encodeStoredContent keeps files on the message JSON", () => {
  const encoded = encodeStoredContent(
    "here",
    [],
    [
      {
        url: "http://localhost:3000/media/u/a.xlsx",
        name: "a.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 12,
      },
    ],
  );
  expect(decodeStoredContent(encoded)).toEqual({
    text: "here",
    images: [],
    files: [
      {
        url: "http://localhost:3000/media/u/a.xlsx",
        name: "a.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 12,
      },
    ],
  });
});
