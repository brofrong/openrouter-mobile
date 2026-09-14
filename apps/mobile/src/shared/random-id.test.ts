import { expect, mock, test } from "bun:test";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

mock.module("expo-crypto", () => ({
  randomUUID: () => globalThis.crypto.randomUUID(),
}));

test("randomLocalId returns a UUID v4 from expo-crypto", async () => {
  const { randomLocalId } = await import("./random-id");
  expect(randomLocalId()).toMatch(UUID_V4);
});

test("randomLocalId returns distinct ids", async () => {
  const { randomLocalId } = await import("./random-id");
  const ids = new Set(Array.from({ length: 50 }, () => randomLocalId()));
  expect(ids.size).toBe(50);
});
