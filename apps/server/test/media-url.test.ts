import { expect, test } from "bun:test";
import {
  extensionForMime,
  isObjectKey,
  isOurMediaUrl,
  makeObjectKey,
  objectKeyFromPathname,
  objectKeyFromUrl,
  parseByteRange,
  parseDataUrl,
  publicMediaUrl,
  sanitizeUserSegment,
  toDataUrl,
} from "../src/shared/media-url";

test("parseDataUrl reads mime and bytes", () => {
  const parsed = parseDataUrl("data:image/png;base64,cGl4");
  expect(parsed?.mime).toBe("image/png");
  expect(Buffer.from(parsed?.bytes ?? []).toString()).toBe("pix");
});

test("toDataUrl round-trips bytes", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const url = toDataUrl(bytes, "audio/mpeg");
  expect(parseDataUrl(url)).toEqual({ mime: "audio/mpeg", bytes });
});

test("object keys stay inside /media", () => {
  expect(isObjectKey("user/abc.png")).toBe(true);
  expect(isObjectKey("../secret")).toBe(false);
  expect(isObjectKey("user/../abc.png")).toBe(false);
  expect(objectKeyFromPathname("/media/user/abc.png")).toBe("user/abc.png");
  expect(objectKeyFromPathname("/media/../abc.png")).toBeUndefined();
  expect(
    objectKeyFromUrl(
      "http://localhost:3000/media/user/abc.png",
      "http://localhost:3000",
    ),
  ).toBe("user/abc.png");
  expect(
    isOurMediaUrl("https://cdn.example/media/abc.png", "http://localhost:3000"),
  ).toBe(false);
  expect(publicMediaUrl("http://localhost:3000/", "user/abc.png")).toBe(
    "http://localhost:3000/media/user/abc.png",
  );
});

test("makeObjectKey uses a safe user prefix and mime extension", () => {
  expect(sanitizeUserSegment("user/../id")).toBe("userid");
  expect(makeObjectKey("user-1", "image/webp", "id")).toBe("user-1/id.webp");
  expect(extensionForMime("video/webm")).toBe("webm");
});

test("parseByteRange handles suffix and closed ranges", () => {
  expect(parseByteRange("bytes=0-3", 10)).toEqual({ start: 0, end: 3 });
  expect(parseByteRange("bytes=8-", 10)).toEqual({ start: 8, end: 9 });
  expect(parseByteRange("bytes=-2", 10)).toEqual({ start: 8, end: 9 });
  expect(parseByteRange("bytes=0-99", 10)).toBeUndefined();
});
