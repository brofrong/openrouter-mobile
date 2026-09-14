import { expect, test } from "bun:test";
import { randomLocalId } from "./random-id";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("randomLocalId returns a UUID v4", () => {
  expect(randomLocalId()).toMatch(UUID_V4);
});

test("randomLocalId returns distinct ids", () => {
  const ids = new Set(Array.from({ length: 50 }, () => randomLocalId()));
  expect(ids.size).toBe(50);
});

test("randomLocalId works when global crypto is missing", () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: undefined,
  });
  try {
    expect(randomLocalId()).toMatch(UUID_V4);
  } finally {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: original,
    });
  }
});
