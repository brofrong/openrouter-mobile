import { expect, test } from "bun:test";
import { Schema } from "effect";
import { ChatStreamEvent } from "./ChatStreamEvent";

test("ChatStreamEvent decodes tagged token payloads", () => {
  const tagged = Schema.decodeUnknownSync(ChatStreamEvent)({
    _tag: "token",
    seq: 1,
    text: "Hi",
  });
  expect(tagged._tag).toBe("token");
  if (tagged._tag === "token") {
    expect(tagged.text).toBe("Hi");
  }
});
