import { expect, test } from "bun:test";
import { chatHref, chatIdFromPathname, parseRouteChatId } from "./chat-route";

test("chatHref builds a unique path per kind and id", () => {
  expect(chatHref("text")).toBe("/");
  expect(chatHref("text", "abc" as never)).toBe("/abc");
  expect(chatHref("images")).toBe("/images");
  expect(chatHref("images", "abc" as never)).toBe("/images/abc");
  expect(chatHref("video", "abc" as never)).toBe("/video/abc");
  expect(chatHref("speech", "abc" as never)).toBe("/speech/abc");
  expect(chatHref("audio", "abc" as never)).toBe("/audio/abc");
});

test("parseRouteChatId reads a single segment from Expo params", () => {
  expect(parseRouteChatId(undefined)).toBeUndefined();
  expect(parseRouteChatId("")).toBeUndefined();
  expect(parseRouteChatId("chat-1")).toBe("chat-1");
  expect(parseRouteChatId(["chat-1"])).toBe("chat-1");
  expect(parseRouteChatId([])).toBeUndefined();
  expect(parseRouteChatId("images")).toBeUndefined();
  expect(parseRouteChatId("images", "images")).toBe("images");
});

test("chatIdFromPathname only reads ids on the matching kind path", () => {
  expect(chatIdFromPathname("text", "/")).toBeUndefined();
  expect(chatIdFromPathname("text", "/chat-1")).toBe("chat-1");
  expect(chatIdFromPathname("text", "/images")).toBeUndefined();
  expect(chatIdFromPathname("images", "/images")).toBeUndefined();
  expect(chatIdFromPathname("images", "/images/chat-1")).toBe("chat-1");
  expect(chatIdFromPathname("images", "/chat-1")).toBeUndefined();
  expect(chatIdFromPathname("video", "/video/chat-1")).toBe("chat-1");
});
